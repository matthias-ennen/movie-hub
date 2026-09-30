import { describe, expect, it } from 'vitest'
import {
  advanceLiveAvailabilityEntries,
  buildLiveAvailabilityIndex,
  getItemLiveProviderDestination,
  getLiveProviderDestination,
  mergeLiveAvailability,
  normalizeLiveAvailabilityIndex,
} from '../src/sources/liveAvailabilityIndex.js'

const now = Date.parse('2026-09-30T12:00:00.000Z')

function airing(stationName, startTime, stopTime, providerId, target) {
  return {
    stationId: stationName.toLowerCase(),
    stationName,
    startTime,
    stopTime,
    playbackRoutes: target ? [{ providerId, mode: 'APP_DEEP_LINK', target }] : [],
  }
}

describe('generic live availability index', () => {
  it('merges an arbitrary number of adapter sources by canonical TMDB title', () => {
    const publication = buildLiveAvailabilityIndex([
      {
        providerId: 'waipu',
        entries: [{
          type: 'movie', tmdbId: 11,
          airings: [airing('ProSieben', '2026-09-30T18:00:00.000Z', '2026-09-30T20:00:00.000Z', 'waipu', 'https://app.waipu.tv/a')],
        }],
      },
      {
        providerId: 'joyn',
        entries: [{
          type: 'movie', tmdbId: 11,
          airings: [airing('ProSieben', '2026-09-30T18:00:00.000Z', '2026-09-30T20:00:00.000Z', 'joyn', 'https://www.joyn.de/a')],
        }],
      },
      {
        providerId: 'future-adapter',
        entries: [{
          type: 'movie', tmdbId: 11,
          airings: [airing('ProSieben', '2026-09-30T18:00:00.000Z', '2026-09-30T20:00:00.000Z', 'future-adapter', 'https://example.invalid/a')],
        }],
      },
    ], { now })

    expect(publication.sourceCount).toBe(3)
    expect(publication.entries).toHaveLength(1)
    expect(publication.entries[0].providerIds).toEqual(['future-adapter', 'joyn', 'waipu'])
  })

  it('caps each provider independently and merges availability into titles', () => {
    const raw = buildLiveAvailabilityIndex([{
      providerId: 'joyn',
      entries: [{
        type: 'series',
        tmdbId: 1399,
        airings: [
          airing('SAT.1', '2026-09-30T13:00:00.000Z', '2026-09-30T14:00:00.000Z', 'joyn', 'https://www.joyn.de/1'),
          airing('SAT.1', '2026-09-30T14:00:00.000Z', '2026-09-30T15:00:00.000Z', 'joyn', 'https://www.joyn.de/2'),
          airing('SAT.1', '2026-09-30T15:00:00.000Z', '2026-09-30T16:00:00.000Z', 'joyn', 'https://www.joyn.de/3'),
          airing('SAT.1', '2026-09-30T16:00:00.000Z', '2026-09-30T17:00:00.000Z', 'joyn', 'https://www.joyn.de/4'),
        ],
      }],
    }], { now, maxAiringsPerProvider: 3 })

    const entries = normalizeLiveAvailabilityIndex(raw, { now })
    expect(entries[0].providers[0].airings).toHaveLength(3)

    const merged = mergeLiveAvailability([{ type: 'series', tmdbId: 1399, providerIds: ['netflix'] }], entries, { now })
    expect(merged[0].providerIds).toEqual(expect.arrayContaining(['netflix', 'joyn']))
    expect(merged[0].liveAvailability.joyn.airings).toHaveLength(3)
    expect(merged[0].joynLive).toBeTruthy()
    expect(getLiveProviderDestination(merged[0].liveAvailability.joyn, { now })).toBe('https://www.joyn.de/1')
  })

  it('selects the playback route for the requested provider on a merged airing', () => {
    const mergedAiring = {
      stationId: 'prosieben',
      startTime: '2026-09-30T13:00:00.000Z',
      stopTime: '2026-09-30T15:00:00.000Z',
      providerIds: ['waipu', 'joyn'],
      playbackRoutes: [
        { providerId: 'waipu', mode: 'APP_DEEP_LINK', target: 'waipu://program/11' },
        { providerId: 'joyn', mode: 'WEB_LINK', target: 'https://www.joyn.de/program/11' },
      ],
    }
    const availability = { airings: [mergedAiring] }

    expect(getLiveProviderDestination(availability, { now, providerId: 'joyn' }))
      .toBe('https://www.joyn.de/program/11')
    expect(getLiveProviderDestination(availability, { now, providerId: 'waipu' }))
      .toBe('waipu://program/11')
    expect(getItemLiveProviderDestination({ tvAiring: mergedAiring }, 'joyn', { now }))
      .toBe('https://www.joyn.de/program/11')
  })

  it('drops expired airings without provider-specific code', () => {
    const entries = normalizeLiveAvailabilityIndex(buildLiveAvailabilityIndex([{
      providerId: 'future-adapter',
      entries: [{
        type: 'movie',
        tmdbId: 22,
        airings: [
          airing('ZDF', '2026-09-30T11:00:00.000Z', '2026-09-30T13:00:00.000Z', 'future-adapter', 'https://example.invalid/1'),
          airing('ZDF', '2026-09-30T14:00:00.000Z', '2026-09-30T15:00:00.000Z', 'future-adapter', 'https://example.invalid/2'),
        ],
      }],
    }], { now }), { now })

    const advanced = advanceLiveAvailabilityEntries(entries, { now: Date.parse('2026-09-30T13:30:00.000Z') })
    expect(advanced[0].providers[0].airings).toHaveLength(1)
    expect(advanced[0].providers[0].nextAiring.startTime).toBe('2026-09-30T14:00:00.000Z')
  })
})

describe('compact live availability defaults', () => {
  it('keeps the next two airings per provider by default for seamless rollover', () => {
    const publication = buildLiveAvailabilityIndex([{
      providerId: 'waipu',
      entries: [{
        type: 'movie',
        tmdbId: 42,
        airings: [
          airing('ZDF', '2026-09-30T13:00:00.000Z', '2026-09-30T14:00:00.000Z', 'waipu', 'https://example.invalid/1'),
          airing('ZDF', '2026-09-30T15:00:00.000Z', '2026-09-30T16:00:00.000Z', 'waipu', 'https://example.invalid/2'),
        ],
      }],
    }], { now })

    expect(publication.maxAiringsPerProvider).toBe(2)
    expect(publication.entries[0].providers[0].airings).toHaveLength(2)
  })
  it('derives visible badges only from TMDB, live and MovieHub evidence', () => {
    const raw = buildLiveAvailabilityIndex([{
      providerId: 'waipu',
      entries: [{
        type: 'movie',
        tmdbId: 11,
        airings: [airing('ProSieben', '2026-09-30T18:00:00.000Z', '2026-09-30T20:00:00.000Z', 'waipu', 'https://app.waipu.tv/11')],
      }],
    }], { now })
    const live = normalizeLiveAvailabilityIndex(raw, { now })
    const [merged] = mergeLiveAvailability([{
      type: 'movie',
      tmdbId: 11,
      source: 'tmdb',
      providerIds: ['netflix', 'stale-provider'],
      tmdbProviderIds: ['netflix'],
      providerMetadataUpdatedAt: '2026-09-30T10:00:00Z',
      movieHubCatalog: true,
    }], live, { now })

    expect(merged.providerIds).toEqual(['netflix', 'moviehub', 'waipu'])
    expect(merged.providerEvidence.netflix[0].source).toBe('tmdb')
    expect(merged.providerEvidence.moviehub[0].source).toBe('moviehub')
    expect(merged.providerEvidence.waipu[0].source).toBe('live:waipu')
    expect(merged.providerEvidence['stale-provider']).toBeUndefined()
  })

})
