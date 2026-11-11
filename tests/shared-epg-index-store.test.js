import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SharedEpgIdentityIndex, matchWithOptionalSharedEpgIndex } from
  '../src/sources/sharedEpgIdentityIndex.js'
import { loadOptionalSharedEpgIndex, saveOptionalSharedEpgIndex } from
  '../scripts/shared-epg-index-store.mjs'

const now = Date.parse('2026-11-11T20:00:00Z')
const evidence = {
  sourceId: 'waipu', stationId: 'ard', type: 'movie', tmdbId: 544,
  title: 'Ein bestätigter Film', productionYear: 2023,
  startTime: '2026-11-14T08:00:00.000Z',
  endTime: '2026-11-14T10:00:00.000Z',
  checkedAt: '2026-11-11T19:00:00.000Z',
  matchMethod: 'waipu-confirmed-v5', matchStatus: 'matched', approved: true,
}
const query = {
  stationId: 'ard', type: 'movie', title: evidence.title,
  startTime: evidence.startTime, endTime: evidence.endTime,
}

describe('optional on-disk shared EPG index snapshot', () => {
  it('writes an atomic versioned snapshot and restores it independently for another adapter', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'moviehub-shared-epg-test-'))
    const path = join(dir, 'cache', 'identity.json')
    try {
      const index = new SharedEpgIdentityIndex({ now })
      expect(index.addConfirmed(evidence)).toBe(true)
      const saved = await saveOptionalSharedEpgIndex(path, index)
      expect(saved).toEqual({ status: 'saved', recordCount: 1 })
      const loaded = await loadOptionalSharedEpgIndex(path, { now })
      expect(loaded.status).toBe('loaded')
      expect(loaded.index.lookup(query)).toMatchObject({
        status: 'hit', sourceIds: ['waipu'],
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not fail ingestion when the file is missing, corrupt or too large', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'moviehub-shared-epg-test-'))
    const path = join(dir, 'cache.json')
    try {
      const missing = await loadOptionalSharedEpgIndex(path, { now })
      expect(missing.status).toBe('missing')
      await writeFile(path, '{"unexpected":true}')
      const invalid = await loadOptionalSharedEpgIndex(path, { now })
      expect(invalid.status).toBe('unavailable')
      const matched = await matchWithOptionalSharedEpgIndex(query, {
        index: invalid.index,
        matchIndependently: async () => ({ status: 'matched', tmdbId: 544 }),
      })
      expect(matched).toMatchObject({ reuse: false, source: 'independent-matcher' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not claim a save on unwritable destinations or invalid arguments', async () => {
    expect(await saveOptionalSharedEpgIndex('', null))
      .toEqual({ status: 'invalid_input' })
  })
})
