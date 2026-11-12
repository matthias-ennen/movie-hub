/**
 * MovieHub #336 G1e-2d – explicitly invoked offline A/B harness.
 *
 * Both arms use the ORIGINAL independent adapter matcher and two separate
 * sessions initialized from the SAME snapshot of local matching caches.
 * Only the indexed arm may skip its original matcher on a trusted index hit.
 *
 * No TMDB tokens, network client, production flag, Firebase, or Nightly hooks
 * exist here. The caller owns the two independent matcher sessions and MUST
 * instrument requests at the real TMDB HTTP transport boundary (e.g. the
 * existing WaipuTmdbSearchClient.requestsStarted counter).
 *
 * Do not interpret simulated/stubbed transport calls as real API savings.
 */
import {
  SharedEpgIdentityIndex,
  matchWithOptionalSharedEpgIndex,
} from '../src/sources/sharedEpgIdentityIndex.js'

const MAX_INPUTS = 10_000

function requireCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(label + ' must count actual started TMDB HTTP transports')
  }
  return value
}

function identityFromOriginal(decision) {
  const value = decision?.status === 'matched' ? decision.match : null
  const id = Number(value?.tmdbId)
  const type = value?.type === 'tv' ? 'series' : value?.type
  if (!['movie', 'series'].includes(type) ||
      !Number.isSafeInteger(id) || id < 1) return null
  return { type, tmdbId: id }
}

function sameIdentity(left, right) {
  if (!left && !right) return true
  return Boolean(left && right &&
    left.type === right.type && left.tmdbId === right.tmdbId)
}

function normalizeSession(session, expectedMode) {
  if (!session || typeof session.matchIndependently !== 'function' ||
      typeof session.startedTmdbHttpRequests !== 'function' ||
      typeof session.startingCacheFingerprint !== 'string' ||
      !session.startingCacheFingerprint.trim()) {
    throw new TypeError(expectedMode + ' requires original matcher, real transport counter and initial-cache fingerprint')
  }
  return session
}

/**
 * @param {object[]} inputs Original source matcher + airing inputs. Each item
 *   has {candidate} for shared-index lookup; independent matcher handles its
 *   own normalized matcher input, source-identity and caches.
 * @param {(mode:'baseline'|'indexed') => Promise<object>|object} createSession
 *   Creates TWO DISTINCT original-adapter matcher instances with identically
 *   initialized and immutable initial local cache snapshots; no shared mutable
 *   decision/response caches between the arms.
 * @param {object[]} approvedEvidence Only already-verified positive receipts,
 *   e.g. the results of G1e Waipu/Joyn strict opt-in capture. This is NOT a
 *   live source import and the source evidence is not returned in the report.
 * @param {object|null} sharedIndex Alternative testing stub (errors fall back).
 *
 * Returns aggregated measured transport counts for this explicitly provided
 * replay, NOT extrapolated live-nightly savings.
 */
export async function compareOptionalSharedEpgIndexAb({
  inputs = [],
  createSession,
  approvedEvidence = [],
  sharedIndex = null,
  now = Date.now(),
} = {}) {
  if (!Array.isArray(inputs) || !Array.isArray(approvedEvidence) ||
      inputs.length > MAX_INPUTS || approvedEvidence.length > MAX_INPUTS ||
      !Number.isFinite(now) || typeof createSession !== 'function') {
    throw new TypeError('G1e A/B requires bounded candidate/evidence arrays and an explicit factory')
  }
  for (const record of inputs) {
    if (!record || !record.candidate || typeof record.candidate !== 'object') {
      throw new TypeError('Every replay input needs its original candidate metadata')
    }
  }
  const baseline = normalizeSession(await createSession('baseline'), 'baseline')
  const indexed = normalizeSession(await createSession('indexed'), 'indexed')
  if (baseline === indexed ||
      baseline.startingCacheFingerprint !== indexed.startingCacheFingerprint) {
    throw new TypeError('A/B arms must use DISTINCT matcher sessions from IDENTICAL initial cache states')
  }
  const beforeBaseline = requireCount(await baseline.startedTmdbHttpRequests(), 'baseline starting counter')
  const beforeIndexed = requireCount(await indexed.startedTmdbHttpRequests(), 'indexed starting counter')
  if (beforeBaseline !== beforeIndexed) {
    throw new TypeError('A/B arms must start with identical TMDB HTTP counter values')
  }

  const index = sharedIndex || new SharedEpgIdentityIndex({
    now, maxEntries: Math.max(1, approvedEvidence.length),
    records: approvedEvidence,
  })
  const originalDecisions = []
  let baselineMatched = 0
  for (const input of inputs) {
    const decision = await baseline.matchIndependently(input)
    const identity = identityFromOriginal(decision)
    if (identity) baselineMatched++
    originalDecisions.push(identity)
  }

  let reused = 0
  let fallback = 0
  let indexConflicts = 0
  let identityMismatches = 0
  let indexedMatched = 0
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]
    const result = await matchWithOptionalSharedEpgIndex(input.candidate, {
      index,
      matchIndependently: () => indexed.matchIndependently(input),
    })
    let identity
    if (result.reuse) {
      reused++
      identity = result.identity
    } else {
      fallback++
      if (result.indexStatus === 'conflict') indexConflicts++
      identity = identityFromOriginal(result.result)
    }
    if (identity) indexedMatched++
    if (!sameIdentity(originalDecisions[i], identity)) identityMismatches++
  }

  const baselineAfter = requireCount(await baseline.startedTmdbHttpRequests(), 'baseline final counter')
  const indexedAfter = requireCount(await indexed.startedTmdbHttpRequests(), 'indexed final counter')
  if (baselineAfter < beforeBaseline || indexedAfter < beforeIndexed) {
    throw new Error('TMDB HTTP counter regressed during A/B replay')
  }
  const baselineHttpRequests = baselineAfter - beforeBaseline
  const indexedHttpRequests = indexedAfter - beforeIndexed
  const admissibleComparison = identityMismatches === 0
  return {
    kind: 'g1e-shared-epg-isolated-ab',
    mode: 'explicit-test-only',
    schemaVersion: 1,
    counts: {
      programs: inputs.length,
      baselineMatched, indexedMatched,
      indexReuses: reused,
      originalMatcherFallbacks: fallback,
      indexConflicts, identityMismatches,
      baselineTmdbHttpRequests: baselineHttpRequests,
      indexedTmdbHttpRequests: indexedHttpRequests,
      // These are transport requests OBSERVED in the replay, not inferred
      // from repeated broadcasts or already existing local cache hits.
      measuredReplayHttpRequestDifference: baselineHttpRequests - indexedHttpRequests,
    },
    gate: {
      identicalStartingCacheFingerprint: true,
      originalMatcherIdentityPreserved: admissibleComparison,
      safeToConsiderFurtherPilot: admissibleComparison,
      measuredProductionSavings: null,
    },
    limitations: 'Isolated replay only; transport may be stubbed. Real-source end-to-end TMDB savings still unverified.',
  }
}
