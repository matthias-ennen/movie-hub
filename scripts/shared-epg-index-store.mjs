/**
 * Optional persistent snapshot for the shared EPG identity evidence.
 *
 * No network access, no TMDB calls. Failure to read/write the auxiliary
 * snapshot NEVER prevents an adapter from doing its original matching work.
 *
 * Consumers must pass a restricted local artifacts path; no consumer here is
 * enabled in the production nightly pipeline.
 */
import { readFile, mkdir, writeFile, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SharedEpgIdentityIndex } from '../src/sources/sharedEpgIdentityIndex.js'

const MAX_SNAPSHOT_BYTES = 24 * 1024 * 1024

export async function loadOptionalSharedEpgIndex(path, {
  now = Date.now(),
  maxEntries,
} = {}) {
  try {
    if (typeof path !== 'string' || !path.trim()) throw new TypeError('Invalid snapshot path')
    const details = await stat(path)
    if (!details.isFile() || details.size > MAX_SNAPSHOT_BYTES) {
      throw new Error('Shared index snapshot is not a bounded file')
    }
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    const index = SharedEpgIdentityIndex.fromSnapshot(parsed, { now, maxEntries })
    return { index, status: 'loaded', recordCount: index.records.length }
  } catch (error) {
    const status = error?.code === 'ENOENT' ? 'missing' : 'unavailable'
    return {
      index: new SharedEpgIdentityIndex({ now, ...(maxEntries ? { maxEntries } : {}) }),
      status,
      recordCount: 0,
      // Never expose arbitrary OS error paths or serialized cache content.
    }
  }
}

export async function saveOptionalSharedEpgIndex(path, index) {
  if (typeof path !== 'string' || !path.trim() || !(index instanceof SharedEpgIdentityIndex)) {
    return { status: 'invalid_input' }
  }
  const temp = path + '.staging-' + randomUUID()
  try {
    const payload = JSON.stringify(index.snapshot(), null, 2) + '\n'
    if (Buffer.byteLength(payload, 'utf8') > MAX_SNAPSHOT_BYTES) {
      return { status: 'too_large' }
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(temp, payload, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temp, path)
    return { status: 'saved', recordCount: index.records.length }
  } catch {
    return { status: 'unavailable' }
  } finally {
    await rm(temp, { force: true }).catch(() => {})
  }
}
