import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, stat, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JoynTmdbSearchClient } from '../scripts/joyn-tmdb-matcher.mjs'
import { WaipuTmdbSearchClient } from '../scripts/waipu-tmdb-matcher.mjs'
import {
  createSharedTmdbSearchResponseCache, SHARED_TMDB_SEARCH_NAMESPACE,
} from '../scripts/shared-tmdb-search-response-cache.mjs'
import {
  SharedTmdbResponseStore,
  loadOptionalSharedTmdbResponses, saveOptionalSharedTmdbResponses,
  SHARED_TMDB_RESPONSE_STORE_TTL_MS,
} from '../scripts/shared-tmdb-response-store.mjs'

const NOW = Date.parse('2026-11-13T16:00:00Z')
const TITLE = 'FICTIONAL_SOURCE_TITLE_NOT_FOR_LOGS'
const movie = { id: 35001, title: TITLE, release_date: '2020-01-01' }
const fileName = 'shared-tmdb-response-cache.json'
const movieKey = JSON.stringify(['/search/movie', {
  language: 'de-DE', query: TITLE, include_adult: 'false',
}])
const reply = results => ({
  ok: true, status: 200, headers: new Headers(),
  json: async () => ({ page: 1, results, total_pages: 1 }),
  text: async () => '',
})

let dirs = []
async function file() {
  const directory = await mkdtemp(join(tmpdir(), 'moviehub-336-cache-test-'))
  dirs.push(directory)
  return join(directory, fileName)
}
afterEach(async () => {
  await Promise.all(dirs.map(d => rm(d, { recursive: true, force: true })))
  dirs = []
})

describe('MovieHub #336: private, opt-in shared TMDB snapshot and single-writer gate', () => {
  it('loads a missing cache as empty and never claims a positive identity', async () => {
    const path = await file()
    const loaded = await loadOptionalSharedTmdbResponses(path, { now: NOW })
    expect(loaded.status).toBe('missing')
    expect(loaded.entries).toBe(0)
    expect(loaded.store.get(SHARED_TMDB_SEARCH_NAMESPACE, movieKey)).toBeNull()
    expect(loaded).not.toHaveProperty('approved')
    expect(loaded).not.toHaveProperty('tmdbId')
    expect(loaded).not.toHaveProperty('providerIds')
  })

  it('saves and restores an exact TMDB response across separate original Joyn and Waipu clients', async () => {
    const path = await file()
    const first = (await loadOptionalSharedTmdbResponses(path, { now: NOW })).store
    const joynFetch = vi.fn(async () => reply([movie]))
    const joyn = new JoynTmdbSearchClient({
      token: 'test', responseCache: createSharedTmdbSearchResponseCache(first),
      fetchImpl: joynFetch, paceMs: 0, maxRetries: 0,
    })
    expect((await joyn.search({ type: 'movie', title: TITLE }))[0].id).toBe(movie.id)
    expect(joyn.requestsStarted).toBe(1)

    expect(await saveOptionalSharedTmdbResponses(path, first)).toMatchObject({
      status: 'saved', entries: 1,
    })
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    const restored = await loadOptionalSharedTmdbResponses(path, { now: NOW + 1000 })
    expect(restored).toMatchObject({ status: 'loaded', entries: 1 })
    const waipuFetch = vi.fn(async () => { throw new Error('Duplicate network request') })
    const waipu = new WaipuTmdbSearchClient({
      token: 'test', responseCache: createSharedTmdbSearchResponseCache(restored.store),
      fetchImpl: waipuFetch, paceMs: 0, maxRetries: 0,
    })
    expect((await waipu.search({ type: 'movie', title: TITLE }))[0].id).toBe(movie.id)
    expect(waipu.requestsStarted).toBe(0)
    expect(waipuFetch).not.toHaveBeenCalled()
    // File contains private query/response; report returns ONLY bounded counts.
    expect(JSON.stringify(restored).slice(0, 70)).not.toContain(TITLE)
  })

  it('does not silently refresh the original seven-day TTL on restore or read', async () => {
    const path = await file()
    const initial = (await loadOptionalSharedTmdbResponses(path, { now: NOW })).store
    expect(createSharedTmdbSearchResponseCache(initial).set(movieKey, { results: [movie] })).toBe(true)
    expect((await saveOptionalSharedTmdbResponses(path, initial)).status).toBe('saved')
    const justBefore = await loadOptionalSharedTmdbResponses(path, {
      now: NOW + SHARED_TMDB_RESPONSE_STORE_TTL_MS - 1,
    })
    expect(justBefore.entries).toBe(1)
    const tooOld = await loadOptionalSharedTmdbResponses(path, {
      now: NOW + SHARED_TMDB_RESPONSE_STORE_TTL_MS + 1,
    })
    expect(tooOld.status).toBe('loaded')
    expect(tooOld.entries).toBe(0)
    const fetchImpl = vi.fn(async () => reply([movie]))
    const waipu = new WaipuTmdbSearchClient({
      token: 'test', responseCache: createSharedTmdbSearchResponseCache(tooOld.store),
      fetchImpl, paceMs: 0, maxRetries: 0,
    })
    await waipu.search({ type: 'movie', title: TITLE })
    expect(waipu.requestsStarted).toBe(1)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('never overwrites an existing corrupt snapshot (or reports a false hit)', async () => {
    const path = await file()
    await writeFile(path, '{corrupt', 'utf8')
    const read = await loadOptionalSharedTmdbResponses(path, { now: NOW })
    expect(read).toMatchObject({ status: 'unavailable', entries: 0 })
    expect(createSharedTmdbSearchResponseCache(read.store).get(movieKey)).toBeNull()
    const saved = await saveOptionalSharedTmdbResponses(path, read.store)
    expect(saved.status).toBe('unavailable')
    expect(await readFile(path, 'utf8')).toBe('{corrupt')
  })

  it('fails closed for unknown schema and disallowed cache filenames', async () => {
    const path = await file()
    await writeFile(path, JSON.stringify({ kind: 'joyn-lookup-cache', schemaVersion: 1 }), 'utf8')
    expect((await loadOptionalSharedTmdbResponses(path, { now: NOW })).status).toBe('unavailable')
    const wrong = path.replace(fileName, 'joyn-lookup-cache.json')
    expect((await loadOptionalSharedTmdbResponses(wrong, { now: NOW })).status).toBe('invalid_path')
    expect((await saveOptionalSharedTmdbResponses(wrong, new SharedTmdbResponseStore({ now: NOW })))
      .status).toBe('invalid_input')
  })

  it('prevents a stale concurrent writer from replacing a newer complete snapshot', async () => {
    const path = await file()
    const seeded = new SharedTmdbResponseStore({ now: NOW })
    seeded.set(SHARED_TMDB_SEARCH_NAMESPACE, movieKey, { results: [movie] })
    expect((await saveOptionalSharedTmdbResponses(path, seeded)).status).toBe('saved')
    const first = (await loadOptionalSharedTmdbResponses(path, { now: NOW + 1000 })).store
    const second = (await loadOptionalSharedTmdbResponses(path, { now: NOW + 1000 })).store
    const newKey = JSON.stringify(['/search/tv', {
      language: 'de-DE', query: 'Synthetic TV', include_adult: 'false',
    }])
    first.set(SHARED_TMDB_SEARCH_NAMESPACE, newKey, {
      results: [{ id: 4201, name: 'Synthetic TV' }],
    })
    expect((await saveOptionalSharedTmdbResponses(path, first)).status).toBe('saved')
    second.set(SHARED_TMDB_SEARCH_NAMESPACE, newKey, {
      results: [{ id: 4202, name: 'Competing TV' }],
    })
    expect((await saveOptionalSharedTmdbResponses(path, second)).status)
      .toBe('revision_conflict')
    const latest = (await loadOptionalSharedTmdbResponses(path, { now: NOW + 1000 })).store
    expect(latest.get(SHARED_TMDB_SEARCH_NAMESPACE, newKey).results[0].id).toBe(4201)
  })

  it('respects an existing lock and does not try to recover it unsafely', async () => {
    const path = await file()
    await writeFile(path + '.lock', 'ANOTHER_WRITER', 'utf8')
    const store = new SharedTmdbResponseStore({ now: NOW })
    expect((await saveOptionalSharedTmdbResponses(path, store)).status).toBe('unavailable')
    expect(await readFile(path + '.lock', 'utf8')).toBe('ANOTHER_WRITER')
    expect((await loadOptionalSharedTmdbResponses(path, { now: NOW })).status).toBe('missing')
  })

  it('does not follow symlinks or overwrite private target data through a link', async () => {
    const realPath = await file()
    const linkPath = await file()
    await writeFile(realPath, 'PRIVATE_UNRELATED_FILE', 'utf8')
    await symlink(realPath, linkPath)
    expect((await loadOptionalSharedTmdbResponses(linkPath, { now: NOW })).status).toBe('unavailable')
    expect((await saveOptionalSharedTmdbResponses(linkPath,
      new SharedTmdbResponseStore({ now: NOW }))).status).toBe('unavailable')
    expect(await readFile(realPath, 'utf8')).toBe('PRIVATE_UNRELATED_FILE')
  })

  it('rejects invalid requests, invalid bodies and unsupported matcher-decision namespaces', () => {
    const cache = new SharedTmdbResponseStore({ now: NOW })
    expect(cache.set(SHARED_TMDB_SEARCH_NAMESPACE, movieKey, { results: [movie] })).toBe(true)
    expect(cache.set('joyn-matcher-decision', movieKey, { results: [movie] })).toBe(false)
    expect(cache.get('joyn-matcher-decision', movieKey)).toBeNull()
    expect(cache.set(SHARED_TMDB_SEARCH_NAMESPACE, movieKey, { status_code: 34, results: [movie] })).toBe(false)
    expect(cache.set(SHARED_TMDB_SEARCH_NAMESPACE, 'invalid request', { results: [movie] })).toBe(false)
    expect(cache.values.size).toBe(1)
    const copy = cache.get(SHARED_TMDB_SEARCH_NAMESPACE, movieKey)
    copy.results[0].title = 'MUTATION'
    expect(cache.get(SHARED_TMDB_SEARCH_NAMESPACE, movieKey).results[0].title).toBe(TITLE)
  })
})
