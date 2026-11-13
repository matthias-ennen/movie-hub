/**
 * MovieHub #336: opt-in, SINGLE-WRITER persistent TMDB search response cache.
 *
 * A separate versioned store is necessary: legacy JoynLookupCache persists
 * HASHED namespace+query keys. Their raw request parameters cannot be
 * reconstructed, so silently merging legacy cache files would be unsafe.
 *
 * The store implements JoynLookupCache's get(namespace,key)/set(namespace,key)
 * interface and works with createSharedTmdbSearchResponseCache(). It stores
 * raw *exact* TMDB request keys plus response bodies, NOT matcher decisions.
 * Nothing imports this from the productive Nightly/adapter pipeline.
 *
 * A failed/corrupt/missing read returns an EMPTY store; an existing corrupt
 * file is NEVER silently overwritten. A lock and revision comparison protect
 * against cooperating concurrent writers and stale snapshot overwrites.
 * No network or secrets. Snapshot file contents are private EPG queries.
 */
import { lstat, readFile, mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, basename, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  SHARED_TMDB_SEARCH_NAMESPACE,
  sharedTmdbRequestPath, copySafeTmdbResponse,
} from './shared-tmdb-search-response-cache.mjs'

export const SHARED_TMDB_RESPONSE_STORE_VERSION = 1
export const SHARED_TMDB_RESPONSE_STORE_TTL_MS = 7 * 86_400_000
export const SHARED_TMDB_RESPONSE_STORE_MAX_ENTRIES = 2_000
export const SHARED_TMDB_RESPONSE_STORE_MAX_BYTES = 16 * 1024 * 1024
const FILE_NAME = 'shared-tmdb-response-cache.json'
const KIND = 'shared-tmdb-response-cache'

function validFile(file) {
  return typeof file === 'string' && isAbsolute(file) &&
    basename(file) === FILE_NAME && !file.includes('\0')
}

function dateMs(text) {
  if (typeof text !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(text)) return null
  const n = Date.parse(text)
  return Number.isFinite(n) && new Date(n).toISOString() === text ? n : null
}

function usableEntry(raw, now) {
  const key = raw?.requestKey
  const path = sharedTmdbRequestPath(key)
  const time = dateMs(raw?.checkedAt)
  if (!path || time === null || time > now) return null
  const age = now - time
  if (age >= SHARED_TMDB_RESPONSE_STORE_TTL_MS) return { expired: true }
  const value = copySafeTmdbResponse(raw?.value, path)
  if (value === null) return null
  return { requestKey: key, checkedAt: raw.checkedAt, value }
}

export class SharedTmdbResponseStore {
  constructor({ now = Date.now(), revision = null, entries = [] } = {}) {
    if (!Number.isFinite(now) || (revision !== null &&
        (typeof revision !== 'string' || !/^[0-9a-f-]{36}$/.test(revision))) ||
        !Array.isArray(entries) || entries.length > SHARED_TMDB_RESPONSE_STORE_MAX_ENTRIES) {
      throw new TypeError('Invalid bounded shared TMDB cache')
    }
    this.now = now
    this.revision = revision
    this.values = new Map()
    for (const raw of entries) {
      const item = usableEntry(raw, now)
      if (!item) throw new TypeError('Invalid persisted TMDB response')
      if (item.expired) continue
      if (this.values.has(item.requestKey)) throw new TypeError('Duplicate TMDB request key')
      this.values.set(item.requestKey, {
        checkedAt: item.checkedAt, value: item.value,
      })
    }
  }

  get(namespace, key) {
    if (namespace !== SHARED_TMDB_SEARCH_NAMESPACE) return null
    const path = sharedTmdbRequestPath(key)
    const entry = path ? this.values.get(key) : null
    if (!entry) return null
    const time = dateMs(entry.checkedAt)
    if (time === null || time > this.now ||
        this.now - time >= SHARED_TMDB_RESPONSE_STORE_TTL_MS) return null
    return copySafeTmdbResponse(entry.value, path)
  }

  set(namespace, key, response) {
    if (namespace !== SHARED_TMDB_SEARCH_NAMESPACE) return false
    const path = sharedTmdbRequestPath(key)
    const value = path ? copySafeTmdbResponse(response, path) : null
    if (!value || (this.values.size >= SHARED_TMDB_RESPONSE_STORE_MAX_ENTRIES &&
        !this.values.has(key))) return false
    this.values.set(key, { checkedAt: new Date(this.now).toISOString(), value })
    return true
  }

  snapshot(nextRevision = this.revision) {
    return {
      kind: KIND,
      schemaVersion: SHARED_TMDB_RESPONSE_STORE_VERSION,
      revision: nextRevision,
      generatedAt: new Date(this.now).toISOString(),
      entries: [...this.values.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([requestKey, entry]) => ({ requestKey, ...entry })),
    }
  }
}

export async function loadOptionalSharedTmdbResponses(file, { now = Date.now() } = {}) {
  if (!Number.isFinite(now)) throw new TypeError('Invalid shared TMDB cache clock')
  const empty = () => new SharedTmdbResponseStore({ now })
  if (!validFile(file)) return { status: 'invalid_path', store: empty(), entries: 0 }
  try {
    const stats = await lstat(file)
    if (!stats.isFile() || stats.size < 1 ||
        stats.size > SHARED_TMDB_RESPONSE_STORE_MAX_BYTES) throw new TypeError('Invalid cache file')
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    if (parsed?.kind !== KIND ||
        parsed.schemaVersion !== SHARED_TMDB_RESPONSE_STORE_VERSION ||
        dateMs(parsed.generatedAt) === null ||
        typeof parsed.revision !== 'string') throw new TypeError('Unrecognized cache schema')
    const store = new SharedTmdbResponseStore({
      now, revision: parsed.revision, entries: parsed.entries,
    })
    return { status: 'loaded', store, entries: store.values.size }
  } catch (error) {
    return {
      status: error?.code === 'ENOENT' ? 'missing' : 'unavailable',
      store: empty(), entries: 0,
    }
  }
}

/**
 * One coordinated writer only. This lock is deliberately NOT auto-recovered:
 * on process crash, an abandoned lock must be assessed before removal.
 * Changing a file during the current session triggers a revision conflict.
 * Save failures do not affect the original Waipu/Joyn remote TMDB clients.
 */
export async function saveOptionalSharedTmdbResponses(file, store) {
  if (!validFile(file) || !(store instanceof SharedTmdbResponseStore)) {
    return { status: 'invalid_input' }
  }
  const lock = file + '.lock'
  const temp = file + '.staging-' + randomUUID()
  let locked = false
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    const handle = await open(lock, 'wx', 0o600)
    locked = true
    await handle.close()

    const current = await loadOptionalSharedTmdbResponses(file, { now: store.now })
    if (current.status !== 'loaded' && current.status !== 'missing') {
      return { status: 'unavailable' }
    }
    if ((current.store.revision || null) !== store.revision) {
      return { status: 'revision_conflict' }
    }
    const revision = randomUUID()
    const snapshot = store.snapshot(revision)
    const payload = JSON.stringify(snapshot) + '\n'
    if (Buffer.byteLength(payload, 'utf8') > SHARED_TMDB_RESPONSE_STORE_MAX_BYTES) {
      return { status: 'too_large' }
    }
    await open(temp, 'wx', 0o600).then(async handle => {
      try {
        await handle.writeFile(payload, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
    })
    // No partial reader-visible file; persist only after revision verification.
    await rename(temp, file)
    store.revision = revision
    return { status: 'saved', entries: snapshot.entries.length }
  } catch {
    return { status: 'unavailable' }
  } finally {
    await rm(temp, { force: true }).catch(() => {})
    if (locked) await rm(lock, { force: true }).catch(() => {})
  }
}
