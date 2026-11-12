import { describe, expect, it, vi } from 'vitest'
import { buildWaipuLiveCatalog } from '../scripts/waipu-live-catalog.mjs'
import { selectBoundedWaipuReplayInputs } from
  '../scripts/epg-g1e-waipu-replay-input-selection.mjs'
import { compareBoundedWaipuWithJoynEvidence } from
  '../scripts/epg-g1e-waipu-bounded-ab-controller.mjs'
import { WAIPU_MATCHER_VERSION } from '../scripts/waipu-tmdb-matcher.mjs'

const NOW = Date.parse('2026-11-12T12:00:00.000Z')
const START = '2026-11-14T18:00:00.000Z'
const END = '2026-11-14T20:00:00.000Z'

const source = {
  programId: 'waipu-program-1', stationId: 'zdf',
  title: 'The Man from Toronto', startTime: START, stopTime: END,
}
const localMovie = {
  type: 'movie', tmdbId: 667739, title: 'The Man from Toronto',
  originalTitle: 'The Man from Toronto', year: 2022,
}
const approvedJoyn = {
  status: 'complete',
  sourceGenerationId: 'joyn-catalog:2026-11-12T11:30:00.000Z',
  counts: { accepted: 1, examined: 1, rejected: 0 },
  approvedEvidence: [{
    matchStatus: 'matched', approved: true,
    sourceId: 'joyn-epg', stationId: 'zdf',
    title: 'The Man from Toronto', type: 'movie', tmdbId: 667739,
    productionYear: 2022, startTime: START, endTime: END,
    checkedAt: '2026-11-12T11:30:00.000Z',
    matchMethod: 'joyn-v5:exact-title-evidence',
  }],
}

function fixture(callback = null) {
  return {
    gridRecords: [{
      kind: 'grid', key: 'zdf|2026-11-14T16:00:00.000Z',
      value: [{
        id: source.programId, title: source.title, genre: 'Filme',
        startTime: START, stopTime: END,
      }],
    }],
    stations: [{ id: 'zdf', displayName: 'ZDF', logoTemplateUrl: null }],
    horizon: {
      start: '2026-11-12T00:00:00.000Z',
      endExclusive: '2026-11-16T00:00:00.000Z',
    },
    loadProgramDetail: vi.fn(async () => ({
      id: source.programId, title: source.title,
      originalTitle: source.title, productionYear: 2022,
      productionCountries: ['Vereinigte Staaten'],
      mainGenre: 'Filme', subGenres: ['Action', 'Komödie'],
      seriesId: null, seasonNumber: null, episodeNumber: null,
      episodeTitle: null, imageUrls: [],
    })),
    candidates: [localMovie],
    now: () => NOW,
    onCompletedEvidence: callback,
  }
}

async function privateSourceData() {
  let privatePayload
  const result = await buildWaipuLiveCatalog(fixture(
    async (capture, capabilities) => {
      privatePayload = { capture, capabilities }
    },
  ))
  expect(privatePayload?.capture.status).toBe('complete')
  expect(result.sourceEvidenceCapture).toMatchObject({
    status: 'complete',
  })
  return { ...privatePayload, published: result }
}

describe('G1e private Waipu original replay selection from confirmed Joyn source', () => {
  it('selects REAL original Waipu input and local candidates entirely in memory', async () => {
    const sourceData = await privateSourceData()
    expect(typeof sourceData.capabilities.selectBoundedWaipuReplayInputs)
      .toBe('function')
    const selected = sourceData.capabilities.selectBoundedWaipuReplayInputs(
      approvedJoyn, { now: NOW },
    )
    expect(selected).toMatchObject({
      status: 'ready',
      counts: { selected: 1, joynReceipts: 1 },
      gate: { readyForIsolatedReplay: true, measuredProductionSavings: null },
      waipuInputs: [{
        sourceId: 'waipu-epg',
        sourceGenerationId: 'waipu:2026-11-12T12:00:00.000Z',
        candidate: { title: source.title, stationId: 'zdf', type: 'movie' },
        matcherInput: { title: source.title, type: 'movie', productionYear: 2022 },
        localCandidates: [expect.objectContaining({
          tmdbId: 667739, type: 'movie',
        })],
      }],
      joynEvidenceCapture: {
        sourceGenerationId: approvedJoyn.sourceGenerationId,
        counts: { accepted: 1 },
        approvedEvidence: [expect.objectContaining({ sourceId: 'joyn-epg' })],
      },
    })
    // Never add original titles or original matcher input to the normal
    // Waipu return object or the source adapter's metadata.
    expect(sourceData.published).not.toHaveProperty('waipuInputs')
    expect(sourceData.published).not.toHaveProperty('joynEvidenceCapture')
    expect(JSON.stringify(sourceData.published.sourceEvidenceCapture))
      .not.toContain(source.title)
    expect(sourceData.published.adapterEnvelope.records[0].extensions.waipu)
      .not.toHaveProperty('rawTitle')
  })

  it('supplies both real matcher sessions without any TMDB request for an already locally matched title', async () => {
    const { capabilities } = await privateSourceData()
    const selected = capabilities.selectBoundedWaipuReplayInputs(
      approvedJoyn, { now: NOW })
    const fetchImpl = vi.fn(() => { throw new Error('No simulated HTTP expected') })
    const report = await compareBoundedWaipuWithJoynEvidence({
      ...selected,
      waipuDecisionSnapshot: {
        schemaVersion: 1, kind: 'waipu-tmdb-match-decisions',
        matcherVersion: WAIPU_MATCHER_VERSION, decisions: {},
      },
      token: 'dummy-only', fetchImpl, now: NOW,
      paceMs: 0, maxRequestsPerArm: 2,
    })
    expect(report.counts).toMatchObject({
      programs: 1, indexReuses: 1, identityMismatches: 0,
      baselineTmdbHttpRequests: 0, indexedTmdbHttpRequests: 0,
      measuredReplayHttpRequestDifference: 0,
    })
    expect(report.gate).toMatchObject({
      originalMatcherIdentityPreserved: true,
      measuredReplayHttpReduction: false, measuredProductionSavings: null,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(report)).not.toContain(source.title)
    expect(JSON.stringify(report)).not.toContain('667739')
  })

  it('rejects same-source, old or unapproved Joyn receipts without choosing fake candidates', async () => {
    const { capabilities } = await privateSourceData()
    const selection = capabilities.selectBoundedWaipuReplayInputs
    for (const evidence of [
      { ...approvedJoyn, approvedEvidence: [{ ...approvedJoyn.approvedEvidence[0],
        sourceId: 'waipu-epg' }] },
      { ...approvedJoyn, approvedEvidence: [{ ...approvedJoyn.approvedEvidence[0],
        approved: false }] },
      { ...approvedJoyn, approvedEvidence: [{
        ...approvedJoyn.approvedEvidence[0], checkedAt: '2026-09-01T00:00:00.000Z',
      }] },
      { ...approvedJoyn, counts: { accepted: 2 } },
      { ...approvedJoyn, status: 'failed' },
      { ...approvedJoyn, approvedEvidence: [] },
    ]) {
      const result = selection(evidence, { now: NOW })
      expect(result.waipuInputs).toHaveLength(0)
      expect(result.gate.readyForIsolatedReplay).toBe(false)
      expect(result.gate.measuredProductionSavings).toBeNull()
    }
  })

  it('stays fail-closed on contradictory Joyn proofs for the same slot', async () => {
    const { capabilities } = await privateSourceData()
    const conflicting = {
      ...approvedJoyn,
      approvedEvidence: [
        approvedJoyn.approvedEvidence[0],
        { ...approvedJoyn.approvedEvidence[0], tmdbId: 999999 },
      ],
      counts: { accepted: 2 },
    }
    const result = capabilities.selectBoundedWaipuReplayInputs(conflicting, {
      now: NOW,
    })
    expect(result.status).toBe('no-cross-source-candidates')
    expect(result.waipuInputs).toEqual([])
    expect(result.gate.readyForIsolatedReplay).toBe(false)
  })

  it('never selects a source broadcast with conflicting duplicate original titles', async () => {
    const { published } = await privateSourceData()
    const decisions = new Map([[
      source.programId, {
        input: { title: source.title, originalTitle: source.title,
          aliases: [source.title], type: 'movie', productionYear: 2022 },
        decision: {
          status: 'matched',
          match: { tmdbId: 667739, type: 'movie' },
        },
      },
    ]])
    const result = selectBoundedWaipuReplayInputs({
      adapterEnvelope: published.adapterEnvelope,
      sourceBroadcasts: [
        source,
        { ...source, title: 'A different original EPG title' },
        source,
      ],
      matchesByProgram: decisions,
      localCandidatesFor: () => [localMovie],
      joynEvidenceCapture: approvedJoyn,
      now: NOW,
    })
    expect(result).toMatchObject({
      status: 'no-cross-source-candidates', counts: { selected: 0 },
    })
  })

  it('rejects unhealthy sources, mismatched original titles, large local candidates and overbroad opt-in limits', async () => {
    const { published } = await privateSourceData()
    const base = {
      adapterEnvelope: published.adapterEnvelope,
      sourceBroadcasts: [source],
      matchesByProgram: new Map([[
        source.programId, {
          input: { title: source.title, type: 'movie',
            originalTitle: source.title, aliases: [source.title],
            productionYear: 2022 },
          decision: {
            status: 'matched',
            match: { tmdbId: 667739, type: 'movie' },
          },
        },
      ]]),
      localCandidatesFor: () => [localMovie],
      joynEvidenceCapture: approvedJoyn,
      now: NOW,
    }
    const cases = [
      { adapterEnvelope: { ...base.adapterEnvelope, sourceStatus: 'failed' } },
      { adapterEnvelope: { ...base.adapterEnvelope, sourceGenerationId: 'fake' } },
      { sourceBroadcasts: [{ ...source, title: 'Unrelated original title' }] },
      { localCandidatesFor: () => Array(201).fill(localMovie) },
      { maxPrograms: 21 },
      { maxPrograms: 0 },
      { joynEvidenceCapture: {
        ...approvedJoyn, sourceGenerationId: 'joyn-diagnostic:wrong' },
      },
    ]
    for (const change of cases) {
      const result = selectBoundedWaipuReplayInputs({ ...base, ...change })
      expect(result.waipuInputs).toEqual([])
      expect(result.gate.readyForIsolatedReplay).toBe(false)
    }
  })
})
