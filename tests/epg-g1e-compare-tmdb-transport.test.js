import { describe, expect, it, vi } from 'vitest'
import { matchWaipuProgram, WaipuTmdbSearchClient, WaipuMatchDecisionStore } from
  '../scripts/waipu-tmdb-matcher.mjs'
import { compareOptionalSharedEpgIndexAb } from
  '../scripts/epg-g1e-compare-tmdb-transport.mjs'

const NOW = Date.parse('2026-11-12T09:30:00.000Z')
const CHECKED = '2026-11-12T09:30:00.000Z'
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
  responseSnapshot = {},
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
    // A/B session states are independently cloned from the SAME original
    // decision and TMDB response caches; no shared mutable cache objects.
    const initialCacheState = {
      matchDecisions: JSON.parse(JSON.stringify(cacheSnapshot)),
      tmdbResponses: JSON.parse(JSON.stringify(responseSnapshot)),
    }
    const decisions = new WaipuMatchDecisionStore(
      JSON.parse(JSON.stringify(initialCacheState.matchDecisions)),
    )
    const responseEntries = JSON.parse(JSON.stringify(initialCacheState.tmdbResponses))
    const responseCache = {
      get: key => Object.prototype.hasOwnProperty.call(responseEntries, key)
        ? responseEntries[key] : null,
      set: (key, value) => { responseEntries[key] = value },
    }
    const client = new WaipuTmdbSearchClient({
      token: 'nonfunctional-test-token',
      fetchImpl, responseCache, maxRequests: 100, paceMs: 0, maxRetries: 0,
    })
    const session = {
      mode, decisions, client, initialCacheState,
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
        nonEmptyReplay: true,
        verifiedPositiveEvidenceRecords: 1,
        observedTrustedReuse: true,
        transportRequestsNonIncreasing: true,
        measuredReplayHttpReduction: true,
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
    expect(report.gate).toMatchObject({
      observedTrustedReuse: true,
      measuredReplayHttpReduction: false,
      safeToConsiderFurtherPilot: true,
      measuredProductionSavings: null,
    })
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

  it('never admits an empty replay or a replay without verified positive evidence', async () => {
    const factory = sessionFactory()
    const empty = await compareOptionalSharedEpgIndexAb({
      inputs: [], createSession: factory.createSession,
      approvedEvidence: approved, now: NOW,
    })
    expect(empty.gate).toMatchObject({
      nonEmptyReplay: false, observedTrustedReuse: false,
      safeToConsiderFurtherPilot: false, measuredProductionSavings: null,
    })
    const none = await compareOptionalSharedEpgIndexAb({
      inputs: [first], createSession: sessionFactory().createSession,
      approvedEvidence: [], now: NOW,
    })
    expect(none.gate).toMatchObject({
      nonEmptyReplay: true, verifiedPositiveEvidenceRecords: 0,
      observedTrustedReuse: false, safeToConsiderFurtherPilot: false,
    })
    const invalid = await compareOptionalSharedEpgIndexAb({
      inputs: [first], createSession: sessionFactory().createSession,
      approvedEvidence: [{ ...approved[0], matchStatus: 'unmatched' }], now: NOW,
    })
    expect(invalid.gate.verifiedPositiveEvidenceRecords).toBe(0)
    expect(invalid.gate.safeToConsiderFurtherPilot).toBe(false)
  })

  it('does not admit hand-written index hits, even when their TMDB IDs happen to agree', async () => {
    const report = await compareOptionalSharedEpgIndexAb({
      inputs: [first], createSession: sessionFactory().createSession,
      approvedEvidence: approved, now: NOW,
      sharedIndex: {
        lookup: () => ({
          status: 'hit', scope: 'mock', identity: { type: 'movie', tmdbId: 329865 },
          sourceIds: ['untrusted'],
        }),
      },
    })
    expect(report.counts.indexReuses).toBe(1)
    expect(report.counts.identityMismatches).toBe(0)
    expect(report.gate).toMatchObject({
      verifiedPositiveEvidenceRecords: 0, observedTrustedReuse: false,
      safeToConsiderFurtherPilot: false, measuredProductionSavings: null,
    })
  })

  it('rejects an indexed replay that starts extra TMDB transports despite identical identities', async () => {
    const factory = sessionFactory()
    const report = await compareOptionalSharedEpgIndexAb({
      inputs: [first, second], approvedEvidence: approved, now: NOW,
      createSession: mode => {
        const session = factory.createSession(mode)
        if (mode === 'indexed') {
          const original = session.matchIndependently
          session.matchIndependently = async input => {
            await session.client.search({ type: 'movie', title: 'unrelated QA search A' })
            await session.client.search({ type: 'movie', title: 'unrelated QA search B' })
            return original(input)
          }
        }
        return session
      },
    })
    expect(report.counts).toMatchObject({
      indexReuses: 1, identityMismatches: 0,
      baselineTmdbHttpRequests: 2, indexedTmdbHttpRequests: 3,
      measuredReplayHttpRequestDifference: -1,
    })
    expect(report.gate).toMatchObject({
      originalMatcherIdentityPreserved: true, observedTrustedReuse: true,
      transportRequestsNonIncreasing: false, measuredReplayHttpReduction: false,
      safeToConsiderFurtherPilot: false, measuredProductionSavings: null,
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
      createSession: mode => sessionFactory({
        cacheSnapshot: mode === 'baseline'
          ? { firstGeneration: { checkedAt: CHECKED } }
          : { secondGeneration: { checkedAt: CHECKED } },
      }).createSession(mode),
    })).rejects.toThrow(/IDENTICAL/)
  })

  it('does not accept a caller-written fake matching fingerprint when actual caches differ', async () => {
    await expect(compareOptionalSharedEpgIndexAb({
      inputs: [first], approvedEvidence: approved, now: NOW,
      createSession: mode => {
        const session = sessionFactory({
          cacheSnapshot: mode === 'baseline' ? { a: 1 } : { b: 1 },
        }).createSession(mode)
        session.startingCacheFingerprint = 'same-untrusted-label'
        return session
      },
    })).rejects.toThrow(/IDENTICAL/)
  })

  it('canonically compares identical JSON caches regardless of object key order', async () => {
    const report = await compareOptionalSharedEpgIndexAb({
      inputs: [first], approvedEvidence: approved, now: NOW,
      createSession: mode => sessionFactory({
        cacheSnapshot: mode === 'baseline'
          ? { extra: { x: true, y: false } }
          : { extra: { y: false, x: true } },
      }).createSession(mode),
    })
    expect(report.gate.verifiedFromCanonicalCacheSnapshots).toBe(true)
  })

  it('refuses to compare sessions sharing a mutable matcher-cache object', async () => {
    const factory = sessionFactory()
    const original = factory.createSession('baseline')
    const indexed = factory.createSession('indexed')
    indexed.initialCacheState.matchDecisions = original.initialCacheState.matchDecisions
    await expect(compareOptionalSharedEpgIndexAb({
      inputs: [first], approvedEvidence: approved, now: NOW,
      createSession: mode => mode === 'baseline' ? original : indexed,
    })).rejects.toThrow(/DISTINCT/)
  })

  it('rejects fake, missing or regressing HTTP counters instead of estimating savings', async () => {
    await expect(compareOptionalSharedEpgIndexAb({
      inputs: [first], now: NOW,
      createSession: mode => ({
        initialCacheState: { matchDecisions: {}, tmdbResponses: {} },
        matchIndependently: () => ({ status: 'unmatched' }),
        startedTmdbHttpRequests: () => mode === 'baseline' ? -1 : 0,
      }),
    })).rejects.toThrow(/HTTP transports/)
    await expect(compareOptionalSharedEpgIndexAb({
      inputs: Array(10_001).fill(first), createSession: sessionFactory().createSession,
    })).rejects.toThrow(/bounded/)
  })
})
