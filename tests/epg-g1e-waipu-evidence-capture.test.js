import { describe, expect, it, vi } from 'vitest'
import { buildWaipuLiveCatalog } from '../scripts/waipu-live-catalog.mjs'
import { collectApprovedWaipuEvidence } from '../scripts/epg-g1e-waipu-evidence-capture.mjs'

const NOW = Date.parse('2026-09-20T12:00:00.000Z')
const START = '2026-09-20T18:00:00.000Z'
const END = '2026-09-20T20:00:00.000Z'

const fixture = (extra = {}) => ({
  gridRecords: [{
    kind: 'grid',
    key: 'zdf|2026-09-20T16:00:00.000Z',
    value: [{
      id: 'program-1',
      title: 'The Man from Toronto',
      genre: 'Filme', startTime: START, stopTime: END,
    }],
  }],
  stations: [{ id: 'zdf', displayName: 'ZDF', logoTemplateUrl: null }],
  horizon: {
    start: '2026-09-20T00:00:00.000Z',
    endExclusive: '2026-09-21T00:00:00.000Z',
  },
  loadProgramDetail: vi.fn(async () => ({
    id: 'program-1',
    title: 'The Man from Toronto',
    originalTitle: 'The Man from Toronto',
    productionYear: 2022,
    productionCountries: ['Vereinigte Staaten'],
    mainGenre: 'Filme', subGenres: ['Action', 'Komödie'],
    seriesId: null, seasonNumber: null, episodeNumber: null,
    episodeTitle: null, imageUrls: [],
  })),
  candidates: [{
    tmdbId: 667739, type: 'movie',
    title: 'The Man from Toronto',
    originalTitle: 'The Man from Toronto', year: 2022,
  }],
  now: () => NOW,
  ...extra,
})

describe('G1e opt-in post-generation Waipu evidence capture', () => {
  it('keeps the normal Waipu catalog independent of shared EPG evidence by default', async () => {
    const result = await buildWaipuLiveCatalog(fixture())
    expect(result.adapterEnvelope.sourceStatus).toBe('healthy')
    expect(result.adapterEnvelope.records).toHaveLength(1)
    expect(result).not.toHaveProperty('sourceEvidenceCapture')
    expect(result.adapterEnvelope.records[0]?.extensions?.waipu)
      .not.toHaveProperty('rawTitle')
  })

  it('calls an explicit in-memory hook only after success, and keeps source titles out of published data', async () => {
    const onCompletedEvidence = vi.fn(async () => {})
    const result = await buildWaipuLiveCatalog(fixture({ onCompletedEvidence }))
    expect(onCompletedEvidence).toHaveBeenCalledOnce()
    const capture = onCompletedEvidence.mock.calls[0][0]
    expect(capture).toMatchObject({
      status: 'complete',
      counts: { examined: 1, accepted: 1, rejected: 0 },
      approvedEvidence: [expect.objectContaining({
        sourceId: 'waipu-epg', stationId: 'zdf', tmdbId: 667739,
        type: 'movie', title: 'The Man from Toronto',
        startTime: START, endTime: END,
      })],
    })
    expect(result.sourceEvidenceCapture).toEqual({
      status: 'complete',
      counts: { examined: 1, accepted: 1, rejected: 0 },
      rejectedReasons: {},
    })
    expect(result.sourceEvidenceCapture).not.toHaveProperty('approvedEvidence')
    expect(result.adapterEnvelope.records[0].extensions.waipu).not.toHaveProperty('rawTitle')
    expect(result.adapterEnvelope.records[0].playbackRoutes.length).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(capture.approvedEvidence)).not.toContain('app.waipu.tv')
  })

  it('does not fail the original adapter if the optional dry-run sink throws', async () => {
    const result = await buildWaipuLiveCatalog(fixture({
      onCompletedEvidence: () => { throw new Error('Private dry-run sink unavailable') },
    }))
    expect(result.adapterEnvelope.sourceStatus).toBe('healthy')
    expect(result.index.status).toBe('complete')
    expect(result.sourceEvidenceCapture).toEqual({
      status: 'unavailable',
      counts: null,
      rejectedReasons: {},
    })
  })

  it('refuses evidence generation from a failed generation, missing inputs or excessive source records', () => {
    const failed = collectApprovedWaipuEvidence({
      adapterEnvelope: { sourceStatus: 'failed', records: [] },
      sourceBroadcasts: [], matchesByProgram: new Map(),
    })
    expect(failed).toMatchObject({
      status: 'unavailable', counts: { examined: 0, accepted: 0, rejected: 0 },
      approvedEvidence: [],
    })
    const oversized = collectApprovedWaipuEvidence({
      adapterEnvelope: {
        sourceStatus: 'healthy', records: new Array(50_001).fill(null),
      },
      sourceBroadcasts: [], matchesByProgram: new Map(),
    })
    expect(oversized.status).toBe('unavailable')
  })

  it('does not synthesize the original EPG title if grid and sourceRef do not match', async () => {
    const result = await buildWaipuLiveCatalog(fixture())
    const report = collectApprovedWaipuEvidence({
      adapterEnvelope: result.adapterEnvelope,
      sourceBroadcasts: [{ programId: 'different-program',
        stationId: 'zdf', startTime: START, stopTime: END,
        title: 'The Man from Toronto' }],
      matchesByProgram: new Map(),
    })
    expect(report).toMatchObject({
      status: 'complete',
      counts: { examined: 1, accepted: 0, rejected: 1 },
      rejectedReasons: { missing_original_grid_and_match: 1 },
      approvedEvidence: [],
    })
  })
})
