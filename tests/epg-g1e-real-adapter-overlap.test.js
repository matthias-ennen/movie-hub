import { describe, expect, it } from 'vitest'
import { analyzeRealEpgOverlap } from '../scripts/epg-g1e-real-adapter-overlap.mjs'

function event({
  source = 'waipu', stationId = 'ard',
  startAt = '2026-11-13T08:00:00.000Z',
  endAt = '2026-11-13T10:00:00.000Z',
  id = 777, type = 'movie', originalTitle = null,
} = {}) {
  const extensions = source === 'joyn'
    ? { joyn: { rawTitle: originalTitle || 'Echte Sendung' } }
    : { waipu: originalTitle ? { rawTitle: originalTitle } : { programId: 'not-a-title' } }
  return {
    kind: 'broadcast', channelId: stationId, startAt, endAt,
    titleRef: { mediaType: type, tmdbId: id }, extensions,
    playbackRoutes: [{ providerId: source, target: 'https://private.example/secret' }],
  }
}
function envelope(sourceId, records, sourceStatus = 'healthy') {
  return {
    sourceId, sourceStatus,
    sourceGenerationId: sourceId + '-2026-11-12',
    generatedAt: '2026-11-12T06:00:00.000Z',
    records,
  }
}

describe('G1e reproducible real SourceAdapter schedule overlap', () => {
  it('separates same-work slots, changed-work conflicts and no-time-match stations', () => {
    const w = envelope('waipu', [
      event(), event({ stationId: 'zdf', id: 444 }),
      event({ stationId: 'sat1', id: 222 }),
    ])
    const j = envelope('joyn', [
      event({ source: 'joyn', startAt: '2026-11-13T08:04:00.000Z',
        endAt: '2026-11-13T10:04:00.000Z' }),
      event({ source: 'joyn', stationId: 'zdf', id: 445 }),
      event({ source: 'joyn', stationId: 'sat1', id: 222,
        startAt: '2026-11-13T12:00:00.000Z',
        endAt: '2026-11-13T14:00:00.000Z' }),
      event({ source: 'joyn', stationId: 'n3', id: 12 }),
    ])
    const result = analyzeRealEpgOverlap(w, j, {
      waipuIndex: { runtime: { tmdbRequests: 1677 } },
      joynIndex: { runtime: {
        tmdbSearchRequests: 1597, matchCacheHits: 48750,
      } },
    })
    expect(result.counts).toMatchObject({
      waipuBroadcasts: 3, joynBroadcasts: 4, commonStations: 3,
      joynAiringsOnCommonStations: 3, joynAiringsWithSameTimeSlot: 2,
      sameTimeAndSameWork: 1, sameTimeButDifferentWork: 1,
      waipuEventsWithOriginalSourceTitle: 0,
      joynEventsWithOriginalSourceTitle: 4,
    })
    expect(result.priorMatcherTraffic).toEqual({
      waipuTmdbRequests: 1677, joynTmdbSearchRequests: 1597,
      joynOwnMatchCacheHits: 48750,
    })
    expect(result.measuredAvoidedTmdbRequests).toBeNull()
    expect(result.safety.canAutomaticallySeedSharedIndex).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private.example')
    expect(JSON.stringify(result)).not.toContain('Echte Sendung')
  })

  it('uses the same five-minute and 80%-overlap rules as the real TV merger', () => {
    const waipu = envelope('waipu', [event()])
    const joyn = envelope('joyn', [
      event({ source: 'joyn', startAt: '2026-11-13T08:05:00.000Z',
        endAt: '2026-11-13T10:05:00.000Z' }),
      event({ source: 'joyn', startAt: '2026-11-13T08:06:00.000Z',
        endAt: '2026-11-13T10:06:00.000Z' }),
      event({ source: 'joyn', startAt: '2026-11-13T08:00:00.000Z',
        endAt: '2026-11-13T09:00:00.000Z' }),
    ])
    const report = analyzeRealEpgOverlap(waipu, joyn)
    expect(report.counts.joynAiringsWithSameTimeSlot).toBe(1)
    expect(report.counts.sameTimeAndSameWork).toBe(1)
  })

  it('marks competing Waipu events in one slot and does not silently choose a first winner', () => {
    const waipu = envelope('waipu', [event({ id: 444 }), event({ id: 777 })])
    const joyn = envelope('joyn', [event({ source: 'joyn', id: 777 })])
    const report = analyzeRealEpgOverlap(waipu, joyn)
    expect(report.counts).toMatchObject({
      joynAiringsWithSameTimeSlot: 1,
      sameTimeButDifferentWork: 1, multipleWaipuMatchesInSlot: 1,
    })
  })

  it('rejects failed/stale source generations rather than treating them as approved', () => {
    const approved = envelope('joyn', [event({ source: 'joyn' })])
    expect(() => analyzeRealEpgOverlap(envelope('waipu', [], 'failed'), approved))
      .toThrow(/healthy/)
    expect(() => analyzeRealEpgOverlap(envelope('waipu', [], 'stale'), approved))
      .toThrow(/healthy/)
    expect(() => analyzeRealEpgOverlap(envelope('waipu', []),
      envelope('other', []))).toThrow(/healthy/)
  })

  it('filters invalid, very long and inconsistent schedule intervals safely', () => {
    const waipu = envelope('waipu', [
      event(), event({ startAt: 'invalid' }),
      event({ startAt: '2026-11-13T10:00:00.000Z',
        endAt: '2026-11-13T08:00:00.000Z' }),
      event({ startAt: '2026-11-12T00:00:00.000Z',
        endAt: '2026-11-15T00:00:00.000Z' }),
      event({ id: 0 }),
    ])
    const joyn = envelope('joyn', [event({ source: 'joyn' })])
    const report = analyzeRealEpgOverlap(waipu, joyn)
    expect(report.counts.waipuBroadcasts).toBe(1)
    expect(report.counts.invalidWaipuRecords).toBe(4)
    expect(report.counts.sameTimeAndSameWork).toBe(1)
  })

  it('rejects oversized source records and never confuses cache hits with TMDB savings', () => {
    expect(() => analyzeRealEpgOverlap(
      envelope('waipu', new Array(125_001).fill(null)),
      envelope('joyn', []))).toThrow(/bounded/)
    const result = analyzeRealEpgOverlap(envelope('waipu', []),
      envelope('joyn', []), {
        waipuIndex: { runtime: { tmdbRequests: -17 } },
        joynIndex: { runtime: { tmdbSearchRequests: '1597' } },
      })
    expect(result.priorMatcherTraffic).toEqual({
      waipuTmdbRequests: null, joynTmdbSearchRequests: null,
      joynOwnMatchCacheHits: null,
    })
    expect(result.measuredAvoidedTmdbRequests).toBeNull()
  })
})
