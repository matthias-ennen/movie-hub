import { describe, expect, it, vi } from 'vitest'
import {
  SharedEpgIdentityIndex, SHARED_EPG_IDENTITY_INDEX_VERSION,
  matchWithOptionalSharedEpgIndex, epgIdentityTitleKey,
} from '../src/sources/sharedEpgIdentityIndex.js'

const NOW = Date.parse('2026-11-11T20:00:00Z')
const record = ({
  sourceId = 'waipu', stationId = 'ard', title = 'Der Film',
  type = 'movie', tmdbId = 777, productionYear = 2022,
  startTime = '2026-11-14T08:00:00.000Z',
  endTime = '2026-11-14T10:00:00.000Z',
  checkedAt = '2026-11-11T19:00:00.000Z',
  episode = null, approved = true, matchStatus = 'matched',
  matchMethod = 'waipu-matcher-v5:verified',
} = {}) => ({
  sourceId, stationId, title, type, tmdbId, productionYear,
  startTime, endTime, checkedAt, episode, approved, matchStatus, matchMethod,
})

const query = (override = {}) => ({
  stationId: 'ard', title: 'Der Film', type: 'movie',
  startTime: '2026-11-14T08:00:00.000Z',
  endTime: '2026-11-14T10:00:00.000Z',
  ...override,
})

describe('G1d optional shared EPG identity index – independence and source safety', () => {
  it('reuses the confirmed programme from Waipu for Joyn and XMLTV without querying TMDB', async () => {
    const index = new SharedEpgIdentityIndex({ now: NOW })
    expect(index.addConfirmed(record())).toBe(true)
    const independent = vi.fn(async () => ({ status: 'matched', tmdbId: 123 }))
    for (const sourceId of ['joyn', 'xmltv:iptv-epg-org']) {
      const result = await matchWithOptionalSharedEpgIndex(query(), {
        index, matchIndependently: independent,
      })
      expect(result).toEqual({
        source: 'shared-epg-index',
        reuse: true,
        scope: 'station-time-and-title',
        identity: { type: 'movie', tmdbId: 777, productionYear: 2022 },
        sourceIds: ['waipu'],
      })
    }
    expect(independent).not.toHaveBeenCalled()
  })

  it('honors 5 minute start tolerance and 80 percent time overlap, not loose same-morning scheduling', () => {
    const index = new SharedEpgIdentityIndex({ now: NOW, records: [record()] })
    expect(index.lookup(query({ startTime: '2026-11-14T08:04:00Z',
      endTime: '2026-11-14T10:04:00Z' })).status).toBe('hit')
    expect(index.lookup(query({ startTime: '2026-11-14T08:06:00Z',
      endTime: '2026-11-14T10:06:00Z' })).status).toBe('miss')
    expect(index.lookup(query({ startTime: '2026-11-14T08:00:00Z',
      endTime: '2026-11-14T09:00:00Z' })).status).toBe('miss')
    expect(index.lookup(query({ stationId: 'zdf' })).status).toBe('miss')
  })

  it('blocks changed programmes occupying the same slot and does not fall back to title/year cache', async () => {
    const index = new SharedEpgIdentityIndex({ now: NOW })
    index.addConfirmed(record())
    const matching = vi.fn(async () => ({ status: 'new-independent-result' }))
    const other = query({ title: 'Ersatzprogramm', productionYear: 2022 })
    expect(index.lookup(other)).toEqual({
      status: 'conflict', reason: 'competing_slot_evidence',
    })
    const result = await matchWithOptionalSharedEpgIndex(other, {
      index, matchIndependently: matching,
    })
    expect(result.reuse).toBe(false)
    expect(result.indexStatus).toBe('conflict')
    expect(matching).toHaveBeenCalledOnce()
  })

  it('rejects contradictions from two matched adapters instead of choosing the first', () => {
    const index = new SharedEpgIdentityIndex({ now: NOW })
    index.addConfirmed(record())
    index.addConfirmed(record({ sourceId: 'joyn', tmdbId: 333, matchMethod: 'joyn-matcher-v5' }))
    expect(index.lookup(query())).toEqual({
      status: 'conflict', reason: 'competing_slot_evidence',
    })
  })

  it('combines multiple agreeing source references without adding playback or VOD offers', () => {
    const index = new SharedEpgIdentityIndex({ now: NOW })
    index.addConfirmed(record())
    index.addConfirmed(record({ sourceId: 'xmltv:iptv-epg-org',
      matchMethod: 'xmltv-exact-confirmed' }))
    const result = index.lookup(query({ title: 'der   FILM!' }))
    expect(result.status).toBe('hit')
    expect(result.sourceIds).toEqual(['waipu', 'xmltv:iptv-epg-org'])
    expect(result).not.toHaveProperty('playbackRoutes')
    expect(result).not.toHaveProperty('providerIds')
    expect(result.identity).not.toHaveProperty('watchProvider')
    expect(epgIdentityTitleKey('Der Film!')).toBe('der film')
  })

  it('uses exact title/type/year across different slots only when a production year is explicit', () => {
    const index = new SharedEpgIdentityIndex({ now: NOW, records: [record()] })
    expect(index.lookup(query({ stationId: 'zdf', productionYear: 2022 })).status).toBe('hit')
    expect(index.lookup(query({ stationId: 'zdf', productionYear: 2022 })).scope)
      .toBe('verified-title-and-year')
    expect(index.lookup(query({ stationId: 'zdf' })).status).toBe('miss')
    expect(index.lookup(query({ stationId: 'zdf', productionYear: 1982 })).status).toBe('miss')
    expect(index.lookup(query({ stationId: 'zdf', type: 'series',
      productionYear: 2022 })).status).toBe('miss')
  })

  it('refuses ambiguous same-name movies with different TMDB IDs even with the same approximate year', () => {
    const index = new SharedEpgIdentityIndex({ now: NOW })
    index.addConfirmed(record())
    index.addConfirmed(record({ sourceId: 'joyn', tmdbId: 778, productionYear: 2023,
      stationId: 'zdf', matchMethod: 'joyn-v5' }))
    expect(index.lookup(query({ stationId: 'rtl', productionYear: 2022 })))
      .toEqual({ status: 'conflict', reason: 'ambiguous_title_and_year' })
  })

  it('does not equate episodes with conflicting season/episode evidence in the same slot', () => {
    const index = new SharedEpgIdentityIndex({ now: NOW })
    index.addConfirmed(record({ type: 'series', episode: { seasonNumber: 2, episodeNumber: 3 } }))
    expect(index.lookup(query({ type: 'series', episode: {
      seasonNumber: 2, episodeNumber: 4,
    } })).status).toBe('conflict')
    expect(index.lookup(query({ type: 'series', episode: {
      seasonNumber: 2, episodeNumber: 3,
    } })).status).toBe('hit')
  })

  it('ignores unapproved, stale, invalid or title-free untrusted EPG evidence', () => {
    const index = new SharedEpgIdentityIndex({ now: NOW })
    expect(index.addConfirmed(record({ approved: false }))).toBe(false)
    expect(index.addConfirmed(record({ matchStatus: 'unmatched' }))).toBe(false)
    expect(index.addConfirmed(record({ checkedAt: '2026-09-01T00:00:00Z' }))).toBe(false)
    expect(index.addConfirmed(record({ tmdbId: 0 }))).toBe(false)
    expect(index.addConfirmed(record({ title: '' }))).toBe(false)
    expect(index.addConfirmed(record({ startTime: 'invalid' }))).toBe(false)
    expect(index.records).toHaveLength(0)
  })

  it('loads an optional versioned snapshot and expires old positive evidence', () => {
    const index = new SharedEpgIdentityIndex({ now: NOW })
    index.addConfirmed(record())
    const snap = index.snapshot()
    expect(snap.schemaVersion).toBe(SHARED_EPG_IDENTITY_INDEX_VERSION)
    expect(SharedEpgIdentityIndex.fromSnapshot(snap, { now: NOW })
      .lookup(query()).status).toBe('hit')
    const later = NOW + 31 * 24 * 3600_000
    expect(SharedEpgIdentityIndex.fromSnapshot(snap, { now: later })
      .lookup(query()).status).toBe('miss')
    expect(() => SharedEpgIdentityIndex.fromSnapshot({ ...snap, schemaVersion: 999 }))
      .toThrow(/snapshot/)
  })

  it('cannot extend approved evidence retention beyond 30 days through config', () => {
    expect(() => new SharedEpgIdentityIndex({
      now: NOW,
      maxAgeMs: 31 * 24 * 3600_000,
    })).toThrow(/bounds/)
  })

  it('falls back to each adapter original matcher if the index is missing, corrupt or mismatched', async () => {
    const independent = vi.fn(async () => ({ status: 'matched', tmdbId: 999 }))
    for (const index of [null, { lookup() { throw new Error('offline') } },
      new SharedEpgIdentityIndex({ now: NOW })]) {
      const result = await matchWithOptionalSharedEpgIndex(query(), {
        index, matchIndependently: independent,
      })
      expect(result.source).toBe('independent-matcher')
      expect(result.result).toEqual({ status: 'matched', tmdbId: 999 })
    }
    expect(independent).toHaveBeenCalledTimes(3)
  })

  it('retains per-adapter match ownership; the index never mutates matching state or writes routes', async () => {
    const evidence = record()
    const index = new SharedEpgIdentityIndex({ now: NOW })
    index.addConfirmed(evidence)
    const before = JSON.stringify(evidence)
    const result = await matchWithOptionalSharedEpgIndex(query(), {
      index, matchIndependently: () => { throw new Error('Should not run on strong hit') },
    })
    expect(result.reuse).toBe(true)
    expect(JSON.stringify(evidence)).toBe(before)
    expect(index.snapshot().records[0]).toMatchObject({
      approved: true, matchMethod: 'waipu-matcher-v5:verified', sourceId: 'waipu',
    })
  })
})
