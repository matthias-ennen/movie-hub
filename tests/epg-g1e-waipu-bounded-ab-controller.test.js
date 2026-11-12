import { describe, expect, it, vi } from 'vitest'
import {
  matchWaipuProgram, WAIPU_MATCHER_VERSION, WaipuMatchDecisionStore,
} from '../scripts/waipu-tmdb-matcher.mjs'
import { compareBoundedWaipuWithJoynEvidence } from
  '../scripts/epg-g1e-waipu-bounded-ab-controller.mjs'

const NOW = Date.parse('2026-11-12T09:30:00.000Z')
const START = '2026-11-14T08:00:00.000Z'
const END = '2026-11-14T10:00:00.000Z'
const original = {
  sourceId: 'waipu-epg',
  sourceGenerationId: 'waipu:2026-11-12T09:10:00.000Z',
  candidate: {
    stationId: 'ard', title: 'Arrival', type: 'movie',
    productionYear: 2016, startTime: START, endTime: END,
  },
  matcherInput: {
    type: 'movie', title: 'Arrival', originalTitle: 'Arrival',
    productionYear: 2016,
  },
  localCandidates: [],
}
const second = {
  ...original,
  candidate: {
    stationId: 'zdf', title: 'The Man from Toronto', type: 'movie',
    productionYear: 2022, startTime: START, endTime: END,
  },
  matcherInput: {
    type: 'movie', title: 'The Man from Toronto',
    originalTitle: 'The Man from Toronto', productionYear: 2022,
  },
}
const approvedJoyn = {
  status: 'complete',
  sourceGenerationId: 'joyn-catalog:2026-11-12T09:20:00.000Z',
  counts: { examined: 1, accepted: 1, rejected: 0 },
  approvedEvidence: [{
    matchStatus: 'matched', approved: true,
    sourceId: 'joyn-epg', stationId: 'ard', type: 'movie',
    tmdbId: 329865, title: 'Arrival', productionYear: 2016,
    startTime: START, endTime: END,
    checkedAt: '2026-11-12T09:00:00.000Z',
    matchMethod: 'joyn-v5:exact-title-evidence',
  }],
}
const snapshot = () => ({
  schemaVersion: 1, kind: 'waipu-tmdb-match-decisions',
  matcherVersion: WAIPU_MATCHER_VERSION, decisions: {},
})
const movies = {
  Arrival: { id: 329865, title: 'Arrival', release_date: '2016-11-10' },
  'The Man from Toronto': {
    id: 667739, title: 'The Man from Toronto', release_date: '2022-06-24',
  },
}
const makeFetch = () => vi.fn(async url => {
  const item = movies[new URL(String(url)).searchParams.get('query')]
  return {
    status: 200, ok: true, headers: new Headers(),
    json: async () => ({ results: item ? [item] : [] }),
    text: async () => '',
  }
})
const args = (overrides = {}) => ({
  waipuInputs: [original, second],
  joynEvidenceCapture: approvedJoyn,
  waipuDecisionSnapshot: snapshot(),
  fetchImpl: makeFetch(), token: 'not-a-live-test-token',
  now: NOW, maxRequestsPerArm: 10, paceMs: 0,
  ...overrides,
})

describe('G1e bounded, explicitly invoked Waipu-target real-matcher A/B controller', () => {
  it('runs two independent ORIGINAL Waipu matchers against verified Joyn other-source evidence', async () => {
    const config = args()
    const result = await compareBoundedWaipuWithJoynEvidence(config)
    expect(result).toMatchObject({
      kind: 'g1e-shared-epg-isolated-ab',
      mode: 'explicit-test-only',
      counts: {
        programs: 2, indexReuses: 1, originalMatcherFallbacks: 1,
        nonCrossAdapterHitsDiscarded: 0, identityMismatches: 0,
        baselineTmdbHttpRequests: 2, indexedTmdbHttpRequests: 1,
        measuredReplayHttpRequestDifference: 1,
      },
      gate: {
        identicalStartingCacheFingerprint: true,
        verifiedFromCanonicalCacheSnapshots: true,
        originalMatcherIdentityPreserved: true,
        observedTrustedReuse: true, safeToConsiderFurtherPilot: true,
        measuredProductionSavings: null,
      },
    })
    expect(config.fetchImpl).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(result)).not.toContain('Arrival')
    expect(JSON.stringify(result)).not.toContain('329865')
    expect(JSON.stringify(result)).not.toContain('not-a-live-test-token')
    expect(config.waipuDecisionSnapshot.decisions).toEqual({})
  })

  it('uses the original persisted Waipu decision cache in BOTH arms and claims no already-avoided API calls', async () => {
    const state = new WaipuMatchDecisionStore()
    const decision = await matchWaipuProgram(original.matcherInput, {
      localCandidates: [{
        type: 'movie', tmdbId: 329865, title: 'Arrival', year: 2016,
      }],
      decisions: state, now: () => NOW,
    })
    expect(decision.status).toBe('matched')
    const config = args({
      waipuInputs: [original],
      waipuDecisionSnapshot: state.toJSON(),
    })
    const result = await compareBoundedWaipuWithJoynEvidence(config)
    expect(result.counts).toMatchObject({
      programs: 1, indexReuses: 1,
      baselineTmdbHttpRequests: 0, indexedTmdbHttpRequests: 0,
      measuredReplayHttpRequestDifference: 0,
    })
    expect(result.gate).toMatchObject({
      measuredReplayHttpReduction: false, measuredProductionSavings: null,
    })
    expect(config.fetchImpl).not.toHaveBeenCalled()
    expect(config.waipuDecisionSnapshot.decisions).toEqual(state.toJSON().decisions)
  })

  it('falls back to original Waipu matcher when approved Joyn evidence is positive but has no matching slot/title', async () => {
    const config = args({
      joynEvidenceCapture: {
        ...approvedJoyn,
        approvedEvidence: [{
          ...approvedJoyn.approvedEvidence[0], title: 'Unrelated source title',
          stationId: 'other-station',
        }],
      },
    })
    const report = await compareBoundedWaipuWithJoynEvidence(config)
    expect(report.counts).toMatchObject({
      indexReuses: 0, originalMatcherFallbacks: 2,
      baselineTmdbHttpRequests: 2, indexedTmdbHttpRequests: 2,
      measuredReplayHttpRequestDifference: 0,
    })
    expect(report.gate.safeToConsiderFurtherPilot).toBe(false)
    expect(config.fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('rejects untrusted or mixed matcher/source generations before any TMDB transport', async () => {
    const cases = [
      { waipuInputs: [{ ...original, sourceId: 'joyn-epg' }] },
      { waipuInputs: [{ ...original, sourceGenerationId: '' }] },
      { waipuInputs: [original, { ...second, sourceGenerationId: 'waipu:other' }] },
      { waipuInputs: [{ ...original, candidate: {
        ...original.candidate, title: 'TMDB-supplied substituted title',
      } }] },
      { waipuInputs: [{ ...original, candidate: {
        ...original.candidate, endTime: original.candidate.startTime,
      } }] },
      { waipuInputs: Array(21).fill(original) },
      { joynEvidenceCapture: {
        ...approvedJoyn, sourceGenerationId: 'joyn-diagnostic:unverified',
      } },
      { joynEvidenceCapture: {
        ...approvedJoyn, approvedEvidence: [{
          ...approvedJoyn.approvedEvidence[0], sourceId: 'waipu-epg',
        }],
      } },
      { joynEvidenceCapture: {
        ...approvedJoyn, counts: { examined: 1, accepted: 2, rejected: 0 },
      } },
      { joynEvidenceCapture: { ...approvedJoyn, approvedEvidence: [] } },
      { waipuDecisionSnapshot: { ...snapshot(), matcherVersion: -1 } },
      { waipuDecisionSnapshot: { ...snapshot(), kind: 'wrong-cache' } },
      { waipuDecisionSnapshot: { ...snapshot(), decisions: null } },
      { token: '' }, { fetchImpl: null },
      { maxRequestsPerArm: 41 }, { maxRequestsPerArm: 0 },
    ]
    for (const overrides of cases) {
      const config = args(overrides)
      await expect(compareBoundedWaipuWithJoynEvidence(config))
        .rejects.toThrow(/G1e pilot requires/)
      if (config.fetchImpl) expect(config.fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('caps each independent real Waipu transport even if a caller requests many uncached programmes', async () => {
    const config = args({ maxRequestsPerArm: 1 })
    await expect(compareBoundedWaipuWithJoynEvidence(config))
      .rejects.toThrow(/budget exhausted/)
    expect(config.fetchImpl).toHaveBeenCalledTimes(1)
    expect(config.waipuDecisionSnapshot.decisions).toEqual({})
  })
})
