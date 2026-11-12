import { describe, expect, it } from 'vitest'
import { validatedSharedEpgEvidence, previewSharedEpgReuse } from
  '../src/sources/sharedEpgEvidencePreview.js'

const NOW = Date.parse('2026-11-12T07:00:00Z')
const START = '2026-11-14T08:00:00.000Z'
const END = '2026-11-14T10:00:00.000Z'
const OBSERVED = '2026-11-12T06:30:00.000Z'

function event({
  tmdbId = 777, sourceId = 'waipu-epg', externalId = 'waipu-program-9',
  episode = null,
} = {}) {
  return {
    kind: 'broadcast',
    eventId: 'epg:ard:' + externalId,
    titleRef: { mediaType: episode ? 'series' : 'movie', tmdbId },
    channelId: 'ard', channelName: 'Das Erste',
    startAt: START, endAt: END,
    episode,
    sourceRefs: [{ sourceId, externalId, observedAt: OBSERVED, expiresAt: END }],
    playbackRoutes: [{ providerId: 'waipu', mode: 'WEB_LINK',
      target: 'https://example.com/not-to-copy' }],
  }
}

function proof({
  tmdbId = 777, sourceId = 'waipu-epg', externalId = 'waipu-program-9',
  title = 'Der Film', status = 'matched', approved = true,
  mediaType = 'movie', productionYear = 2022,
} = {}) {
  return {
    sourceId, externalId, status, approved,
    originalProgrammeTitle: title,
    mediaType, tmdbId,
    startAt: START, endAt: END,
    productionYear, checkedAt: '2026-11-12T06:35:00.000Z',
    matcherVersion: 'waipu-matcher-v5',
  }
}

const item = (ev, decision, sourceStatus = 'healthy') => ({
  event: ev, approval: decision, sourceStatus,
})

describe('G1e trusted source approval -> shared EPG preview', () => {
  it('requires a trusted match proof and retains only identity, never provider/player URLs', () => {
    const result = validatedSharedEpgEvidence(event(), proof(), {
      sourceStatus: 'healthy',
    })
    expect(result.accepted).toBe(true)
    expect(result.evidence).toMatchObject({
      approved: true, matchStatus: 'matched', stationId: 'ard',
      sourceId: 'waipu-epg', tmdbId: 777, title: 'Der Film',
      productionYear: 2022, startTime: START, endTime: END,
    })
    expect(result.evidence).not.toHaveProperty('playbackRoutes')
    expect(result.evidence).not.toHaveProperty('providerIds')
    expect(JSON.stringify(result.evidence)).not.toContain('example.com')
  })

  it('never reconstructs Waipu original EPG programme title from TMDB metadata', () => {
    const result = validatedSharedEpgEvidence(event(), proof({ title: '' }), {
      sourceStatus: 'healthy',
    })
    expect(result).toEqual({ accepted: false, reason: 'approval_event_mismatch' })
  })

  it('rejects stale/degraded feed or mismatched source and title identity', () => {
    expect(validatedSharedEpgEvidence(event(), proof(), {
      sourceStatus: 'degraded',
    })).toEqual({ accepted: false, reason: 'source_not_healthy' })
    expect(validatedSharedEpgEvidence(event(), proof({ approved: false }), {
      sourceStatus: 'healthy',
    })).toEqual({ accepted: false, reason: 'not_explicitly_confirmed' })
    expect(validatedSharedEpgEvidence(event(), proof({ sourceId: 'joyn-epg' }), {
      sourceStatus: 'healthy',
    })).toEqual({ accepted: false, reason: 'source_ref_missing' })
    expect(validatedSharedEpgEvidence(event(), proof({ tmdbId: 778 }), {
      sourceStatus: 'healthy',
    })).toEqual({ accepted: false, reason: 'approval_event_mismatch' })
    expect(validatedSharedEpgEvidence(event(), proof({ mediaType: 'series' }), {
      sourceStatus: 'healthy',
    })).toEqual({ accepted: false, reason: 'approval_event_mismatch' })
    expect(validatedSharedEpgEvidence(event(), proof({ productionYear: 2200 }), {
      sourceStatus: 'healthy',
    })).toEqual({ accepted: false, reason: 'invalid_production_year' })
    expect(validatedSharedEpgEvidence(event({ episode: { conflict: true } }),
      proof({ mediaType: 'series' }), { sourceStatus: 'healthy' }))
      .toEqual({ accepted: false, reason: 'episode_conflict' })
  })

  it('finds potential cross-adapter reuse only from explicit positive decisions', () => {
    const report = previewSharedEpgReuse([
      item(event(), proof()),
      item(event({ sourceId: 'joyn-epg', externalId: 'joyn-123' }),
        proof({ sourceId: 'joyn-epg', externalId: 'joyn-123' })),
      item(event({ sourceId: 'xmltv:iptv-epg-org', externalId: 'zdf-epg-99' }),
        proof({ sourceId: 'xmltv:iptv-epg-org', externalId: 'zdf-epg-99' })),
    ], { now: NOW })
    expect(report.counts).toEqual({
      inspected: 3, eligibleReuse: 2, independentRequired: 1,
      conflicts: 0, rejectedEvidence: 0, seeded: 3,
    })
    expect(report.limitations).toContain('NOT measured TMDB request savings')
    expect(JSON.stringify(report)).not.toContain('Der Film')
    expect(JSON.stringify(report)).not.toContain('example.com')
  })

  it('reports conflicting match decisions and does not claim saved TMDB requests', () => {
    const report = previewSharedEpgReuse([
      item(event(), proof()),
      item(event({ tmdbId: 123, sourceId: 'joyn-epg', externalId: 'joyn-different' }),
        proof({ tmdbId: 123, sourceId: 'joyn-epg', externalId: 'joyn-different' })),
    ], { now: NOW })
    expect(report.counts.conflicts).toBe(1)
    expect(report.counts.eligibleReuse).toBe(0)
    expect(report.counts.independentRequired).toBe(1)
  })

  it('does not seed the cache from an unavailable original source title', () => {
    const report = previewSharedEpgReuse([
      item(event(), proof({ title: '' })),
      item(event({ sourceId: 'joyn-epg', externalId: 'joyn-1' }),
        proof({ sourceId: 'joyn-epg', externalId: 'joyn-1' })),
    ], { now: NOW })
    expect(report.counts.rejectedEvidence).toBe(1)
    expect(report.counts.eligibleReuse).toBe(0)
    expect(report.counts.independentRequired).toBe(1)
  })

  it('rejects invalid EPG events and unbounded inputs safely', () => {
    expect(validatedSharedEpgEvidence({
      ...event(), startAt: 'wrong',
    }, proof(), { sourceStatus: 'healthy' })).toEqual({
      accepted: false, reason: 'invalid_broadcast',
    })
    expect(() => previewSharedEpgReuse(Array(50_001).fill(item(event(), proof())),
      { now: NOW })).toThrow(/bounded/)
  })
})
