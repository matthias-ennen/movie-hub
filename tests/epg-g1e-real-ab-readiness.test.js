import { describe, expect, it } from 'vitest'
import { evaluateRealEpgAbReadiness } from
  '../scripts/epg-g1e-real-ab-readiness.mjs'

const startAt = '2026-11-14T08:00:00.000Z'
const endAt = '2026-11-14T10:00:00.000Z'
const programme = ({
  sourceId = 'waipu', tmdbId = 777,
  originalTitle = sourceId === 'joyn' ? 'Belegter EPG-Titel' : null,
} = {}) => ({
  kind: 'broadcast',
  channelId: 'ard',
  startAt, endAt,
  titleRef: { mediaType: 'movie', tmdbId },
  matchConfidence: 1,
  matchReason: 'already published downstream TMDB mapping',
  playbackRoutes: [{
    providerId: sourceId, target: 'https://example.com/private-link',
  }],
  extensions: {
    [sourceId]: {
      ...(originalTitle ? { rawTitle: originalTitle } : {}),
    },
  },
  sourceRefs: [{
    sourceId: sourceId + '-epg', externalId: sourceId + '-programme-1',
    observedAt: '2026-11-12T06:35:00.000Z',
  }],
})
const envelope = (sourceId, records = [programme({ sourceId })],
  sourceStatus = 'healthy') => ({
  contractVersion: 1, sourceId,
  sourceGenerationId: sourceId + ':2026-11-12T06:30:00.000Z',
  sourceStatus, records,
})

describe('G1e real Nightly artifact suitability is fail-closed and aggregate-only', () => {
  it('recognizes existing healthy output but never mistakes published TMDB identity for matcher approval', () => {
    const report = evaluateRealEpgAbReadiness({
      waipuEnvelope: envelope('waipu'),
      joynEnvelope: envelope('joyn'),
    })
    expect(report.sources).toMatchObject({
      waipu: {
        sourceHealthy: true, events: 1, positiveTmdbIdentities: 1,
        externalSourceReferences: 1, originalTitlesInEnvelope: 0,
        explicitApprovedMatcherReceipts: 0,
      },
      joyn: {
        sourceHealthy: true, events: 1, positiveTmdbIdentities: 1,
        externalSourceReferences: 1, originalTitlesInEnvelope: 1,
        explicitApprovedMatcherReceipts: 0,
      },
    })
    expect(report.disposition).toMatchObject({
      canReplayPublishedEpgOverlap: true,
      canPerformComparableOriginalMatcherAb: false,
      canClaimActualAvoidedTmdbRequests: false,
      missing: expect.arrayContaining([
        'original_waipu_epg_title_provenance',
        'matcher_approved_receipts',
        'independent_starting_cache_snapshots',
        'original_source_programme_inputs',
      ]),
    })
    expect(report.measurements.actualAvoidedTmdbRequests).toBeNull()
    const body = JSON.stringify(report)
    expect(body).not.toContain('Belegter EPG-Titel')
    expect(body).not.toContain('777')
    expect(body).not.toContain('private-link')
    expect(body).not.toContain('programme-1')
  })

  it('does not release A/B simply because private cache files happen to be present', () => {
    const assets = {
      waipuDecisions: true, joynDecisions: true, joynResponseCache: true,
      waipuGrid: true, joynSource: true,
    }
    const report = evaluateRealEpgAbReadiness({
      waipuEnvelope: envelope('waipu'),
      joynEnvelope: envelope('joyn'),
      archiveAssets: assets,
    })
    expect(report.prerequisites.identicalInitialAdapterCacheSnapshotsInArtifact).toBe(true)
    expect(report.prerequisites.fullRawProgrammeInputsInArtifact).toBe(true)
    expect(report.disposition.canPerformComparableOriginalMatcherAb).toBe(false)
    expect(report.disposition.missing).toContain('matcher_approved_receipts')
  })

  it('does not treat a downstream matchConfidence of 1 as original approval', () => {
    const waipu = envelope('waipu', [
      programme({ sourceId: 'waipu', originalTitle: 'Quellbeweis' }),
    ])
    const report = evaluateRealEpgAbReadiness({
      waipuEnvelope: waipu,
      joynEnvelope: envelope('joyn'),
    })
    expect(report.sources.waipu.originalTitlesInEnvelope).toBe(1)
    expect(report.sources.waipu.explicitApprovedMatcherReceipts).toBe(0)
    expect(report.disposition.missing).toContain('matcher_approved_receipts')
    expect(report.disposition.canClaimActualAvoidedTmdbRequests).toBe(false)
  })

  it('rejects failed, expired or incomplete provenance and does not report healthy generations', () => {
    const report = evaluateRealEpgAbReadiness({
      waipuEnvelope: envelope('waipu', [], 'failed'),
      joynEnvelope: envelope('joyn', [], 'stale'),
    })
    expect(report.disposition.canReplayPublishedEpgOverlap).toBe(false)
    expect(report.disposition.missing).toContain('healthy_source_generations')
    expect(report.measurements.actualAvoidedTmdbRequests).toBeNull()
  })

  it('rejects a different source ID or too many records before any audit result', () => {
    expect(() => evaluateRealEpgAbReadiness({
      waipuEnvelope: envelope('joyn'),
      joynEnvelope: envelope('joyn'),
    })).toThrow(/exact bounded waipu/)
    expect(() => evaluateRealEpgAbReadiness({
      waipuEnvelope: envelope('waipu', Array(125_001).fill(null)),
      joynEnvelope: envelope('joyn'),
    })).toThrow(/exact bounded waipu/)
  })

  it('does not count missing or malformed source references as original IDs', () => {
    const waipu = envelope('waipu', [{
      ...programme(),
      sourceRefs: [{ sourceId: 'waipu-epg', externalId: '' }],
    }])
    const report = evaluateRealEpgAbReadiness({
      waipuEnvelope: waipu, joynEnvelope: envelope('joyn'),
    })
    expect(report.sources.waipu.externalSourceReferences).toBe(0)
  })
})
