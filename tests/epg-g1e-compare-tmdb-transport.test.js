import { describe, expect, it, vi } from 'vitest'
import { matchWaipuProgram, WaipuTmdbSearchClient, WaipuMatchDecisionStore } from
  '../scripts/waipu-tmdb-matcher.mjs'
import { compareOptionalSharedEpgIndexAb } from
  '../scripts/epg-g1e-compare-tmdb-transport.mjs'

const NOW = Date.parse('2026-11-12T09:30:00.000Z')
const START = '2026-11-14T08:00:00.000Z'
const END = '2026-11-14T10:00:00.000Z'
const movies = {
  Arrival: { id: 329865, release_date: '2016-11-10', title: 'Arrival' },
  'The Man from Toronto': { id: 667739, release_date: '2022-06-24', title: 'The Man from Toronto' },
}
const first = {
  candidate: {
    stationId: 'ard', title: 'Arrival', type: 'movie',
    productionYear: 2016, startTime: START, endTime: END,
  },
  matcherInput: { type: 'movie', title: 'Arrival', productionYear: 2016 },
}
const second = {
  candidate: {
    stationId: 'zdf', title: 'The Man from Toronto', type: 'movie',
    productionYear: 2022, startTime: START, endTime: END,
  },
  matcherInput: {
    type: 'movie', title: 'The Man from Toronto', productionYear: 2022,
  },
}
const approved = [{
  matchStatus: 'matched', approved: true,
  sourceId: 'joyn-epg', stationId: 'ard', type: 'movie',
  tmdbId: 329865, title: 'Arrival', productionYear: 2016,
  startTime: START, endTime: END,
  checkedAt: '2026-11-12T09:00:00.000Z',
  matchMethod: 'joyn-v5:exact-title-evidence',
}]

/**
 * Uses the REAL Waipu TMDB matcher and its real transport client. The HTTP
 * endpoint is a deterministic stub; no real TMDB HTTP calls are made here.
 * The client requestsStarted value counts fetch attempts (not cache hits).
 */
function sessionFactory({
  cacheSnapshot = {},
  fingerprint = 'original-empty-matcher-cache',
  fetchImpl = vi.fn(async url => {
    const query = new URL(String(url)).searchParams.get('query')
    const item = movies[query]
    return {
      status: 200, ok: true, headers: new Headers(),
      json: async () => ({ results: item ? [item] : [] }),
      text: async () => '',
    }
  }),
} = {}) {
  const sessions = []
  const createSession = mode => {
    const decisions = new WaipuMatchDecisionStore(
      JSON.parse(JSON.stringify(cacheSnapshot)),
    )
    const client = new WaipuTmdbSearchClient({
      token: 'nonfunctional-test-token',
      fetchImpl, maxRequests: 100, paceMs: 0, maxRetries: 0,
    })
    const session = {
      mode, decisions, client,
      startingCacheFingerprint: fingerprint,
      matchIndependently: input => matchWaipuProgram(input.matcherInput, {
        localCandidates: [],
        decisions,
        searchTmdb: term => client.search(term),
        now: () => NOW,
      }),
      startedTmdbHttpRequests: () => client.requestsStarted,
    }
    sessions.push(session)
    return session
  }
  return { createSession, sessions, fetchImpl }
}

describe('G1e-2d explicitly isolated, real-matcher TMDB HTTP transport A/B', () => {
  it('observes one fewer started HTTP transport on a trusted exact shared hit', async () => {
    const factory = sessionFactory()
    const report = await compareOptionalSharedEpgIndexAb({
      inputs: [first, second], createSession: factory.createSession,
      approvedEvidence: approved, now: NOW,
    })
    expect(report).toMatchObject({
      kind: 'g1e-shared-epg-isolated-ab',
      mode: 'explicit-test-only',
      counts: {
        programs: 2, baselineMatched: 2, indexedMatched: 2,
        indexReuses: 1, originalMatcherFallbacks: 1,
        indexConflicts: 0, identityMismatches: 0,
        baselineTmdbHttpRequests: 2,
        indexedTmdbHttpRequests: 1,
        measuredReplayHttpRequestDifference: 1,
      },
      gate: {
        identicalStartingCacheFingerprint: true,
        originalMatcherIdentityPreserved: true,
        safeToConsiderFurtherPilot: true,
        measuredProductionSavings: null,
      },
    })
    expect(factory.fetchImpl).toHaveBeenCalledTimes(3)
    expect(factory.sessions[0].decisions).not.toBe(factory.sessions[1].decisions)
    expect(report.limitations).toContain('Real-source end-to-end TMDB savings still unverified')
    expect(JSON.stringify(report)).not.toContain('Arrival')
    expect(JSON.stringify(report)).not.toContain('329865')
  })

  it('does not claim savings when independent caches already eliminated every HTTP request', async () => {
    const cached = new WaipuMatchDecisionStore()
    await matchWaipuProgram(first.matcherInput, {
      localCandidates: [{
        type: 'movie', tmdbId: 329865,
        title: 'Arrival', year: 2016,
      }],
      decisions: cached, now: () => NOW,
    })
    const factory = sessionFactory({
      cacheSnapshot: cached.toJSON().decisions,
      fingerprint: 'cached-exact-positive-entry',
    })
    const report = await compareOptionalSharedEpgIndexAb({
      inputs: [first], createSession: factory.createSession,
      approvedEvidence: approved, now: NOW,
    })
    expect(report.counts).toMatchObject({
      programs: 1, indexReuses: 1,
      baselineTmdbHttpRequests: 0, indexedTmdbHttpRequests: 0,
      measuredReplayHttpRequestDifference: 0,
    })
    expect(factory.fetchImpl).not.toHaveBeenCalled()
  })

  it('falls back to original matcher on absent or failed shared index', async () => {
    for (const sharedIndex of [
      { lookup() { throw new Error('Shared cache unavailable') } },
      { lookup() { return { status: 'miss', reason: 'no_verified_identity' } } },
    ]) {
      const factory = sessionFactory()
      const report = await compareOptionalSharedEpgIndexAb({
        inputs: [first],
        createSession: factory.createSession, sharedIndex, now: NOW,
      })
      expect(report.counts).toMatchObject({
        originalMatcherFallbacks: 1, indexReuses: 0,
        identityMismatches: 0,
        baselineTmdbHttpRequests: 1, indexedTmdbHttpRequests: 1,
        measuredReplayHttpRequestDifference: 0,
      })
    }
  })

  it('blocks any seemingly spared request where a shared TMDB ID disagrees with original matcher', async () => {
    const factory = sessionFactory()
    const report = await compareOptionalSharedEpgIndexAb({
      inputs: [first],
      createSession: factory.createSession,
      approvedEvidence: [{ ...approved[0], tmdbId: 999 }],
      now: NOW,
    })
    expect(report.counts).toMatchObject({
      indexReuses: 1, identityMismatches: 1,
      baselineTmdbHttpRequests: 1, indexedTmdbHttpRequests: 0,
    })
    expect(report.gate).toMatchObject({
      originalMatcherIdentityPreserved: false,
      safeToConsiderFurtherPilot: false,
      measuredProductionSavings: null,
    })
  })

  it('refuses to compare an old or different cache snapshot under the guise of valid A/B', async () => {
    const reusedSession = sessionFactory().createSession('baseline')
    await expect(compareOptionalSharedEpgIndexAb({
      inputs: [first], approvedEvidence: approved, now: NOW,
      createSession: () => reusedSession,
    })).rejects.toThrow(/DISTINCT/)
    await expect(compareOptionalSharedEpgIndexAb({
      inputs: [first], approvedEvidence: approved, now: NOW,
      createSession: mode => sessionFactory({ fingerprint: mode }).createSession(mode),
    })).rejects.toThrow(/IDENTICAL/)
  })

  it('rejects fake, missing or regressing HTTP counters instead of estimating savings', async () => {
    await expect(compareOptionalSharedEpgIndexAb({
      inputs: [first], now: NOW,
      createSession: mode => ({
        startingCacheFingerprint: 'same',
        matchIndependently: () => ({ status: 'unmatched' }),
        startedTmdbHttpRequests: () => mode === 'baseline' ? -1 : 0,
      }),
    })).rejects.toThrow(/HTTP transports/)
    await expect(compareOptionalSharedEpgIndexAb({
      inputs: Array(10_001).fill(first), createSession: sessionFactory().createSession,
    })).rejects.toThrow(/bounded/)
  })
})
