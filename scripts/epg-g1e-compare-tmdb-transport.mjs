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
import { createHash } from 'node:crypto'
import {
  SharedEpgIdentityIndex,
  matchWithOptionalSharedEpgIndex,
} from '../src/sources/sharedEpgIdentityIndex.js'

const MAX_INPUTS = 10_000
// This G1e pilot compares independent Waipu/Joyn adapter matchers only.
// Future XMLTV provenance needs its own reviewed receipt contract.
const PILOT_SOURCE_IDS = new Set(['waipu-epg', 'joyn-epg'])

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

const MAX_CACHE_SNAPSHOT_BYTES = 24 * 1024 * 1024

function canonicalCacheJson(input, depth = 0) {
  if (depth > 32) throw new TypeError('Cache snapshots must be bounded JSON data')
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input
  if (typeof input === 'number' && Number.isFinite(input)) return input
  if (Array.isArray(input)) {
    return input.map(item => canonicalCacheJson(item, depth + 1))
  }
  if (input && typeof input === 'object' &&
      (Object.getPrototypeOf(input) === Object.prototype ||
        Object.getPrototypeOf(input) === null)) {
    return Object.fromEntries(
      Object.keys(input).sort().map(k => [k, canonicalCacheJson(input[k], depth + 1)]),
    )
  }
  throw new TypeError('Cache snapshots must be bounded JSON data')
}

function verifiedCacheSnapshot(session, expectedMode) {
  const state = session?.initialCacheState
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      !state.matchDecisions || typeof state.matchDecisions !== 'object' ||
      Array.isArray(state.matchDecisions) ||
      !state.tmdbResponses || typeof state.tmdbResponses !== 'object' ||
      Array.isArray(state.tmdbResponses)) {
    throw new TypeError(expectedMode + ' requires both original matching and TMDB response cache snapshots')
  }
  const encoded = JSON.stringify(canonicalCacheJson(state))
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > MAX_CACHE_SNAPSHOT_BYTES) {
    throw new RangeError('Initial cache snapshots exceed safe size limits')
  }
  return createHash('sha256').update(encoded).digest('hex')
}

function normalizeSession(session, expectedMode) {
  if (!session || typeof session.matchIndependently !== 'function' ||
      typeof session.startedTmdbHttpRequests !== 'function') {
    throw new TypeError(expectedMode + ' requires original matcher and actual HTTP transport counter')
  }
  verifiedCacheSnapshot(session, expectedMode)
  return session
}

/**
 * @param {object[]} inputs Original source matcher + airing inputs. Each item
 *   has {sourceId:'waipu-epg'|'joyn-epg',candidate} for shared-index lookup.
 *   A session processes exactly ONE source; independent matcher handles its
 *   own normalized matcher input, source-identity and caches.
 * @param {(mode:'baseline'|'indexed') => Promise<object>|object} createSession
 *   Creates TWO DISTINCT original-adapter matcher instances with identically
 *   initialized and immutable initial local cache snapshots; no shared mutable
 *   decision/response caches between the arms. Each session MUST expose
 *   initialCacheState = { matchDecisions, tmdbResponses } as separate JSON
 *   copies of the actual initialized matcher/response caches. The harness
 *   derives both SHA-256 digests itself; a caller-supplied string is NOT proof.
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
    if (!record || !record.candidate || typeof record.candidate !== 'object' ||
        !PILOT_SOURCE_IDS.has(record.sourceId)) {
      throw new TypeError('Every replay input needs its original candidate and supported sourceId')
    }
  }
  // One baseline/indexed matcher factory must never silently compare two
  // different adapter implementations under the same cache fingerprint.
  const targetSourceId = inputs[0]?.sourceId ?? null
  if (inputs.some(record => record.sourceId !== targetSourceId)) {
    throw new TypeError('G1e replay requires one source adapter per matcher session')
  }
  const baseline = normalizeSession(await createSession('baseline'), 'baseline')
  const indexed = normalizeSession(await createSession('indexed'), 'indexed')
  if (baseline === indexed || baseline.initialCacheState === indexed.initialCacheState ||
      baseline.initialCacheState.matchDecisions === indexed.initialCacheState.matchDecisions ||
      baseline.initialCacheState.tmdbResponses === indexed.initialCacheState.tmdbResponses) {
    throw new TypeError('A/B arms must use DISTINCT matcher sessions and DISTINCT initial cache objects')
  }
  if (verifiedCacheSnapshot(baseline, 'baseline') !== verifiedCacheSnapshot(indexed, 'indexed')) {
    throw new TypeError('A/B arms require IDENTICAL canonical initial cache snapshots')
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
  // Caller-provided index stubs are useful for fallback and failure tests,
  // but are NOT evidence that a real approved cross-adapter index exists.
  const verifiedPositiveEvidenceRecords = sharedIndex === null &&
    index instanceof SharedEpgIdentityIndex
    ? index.records.filter(record => PILOT_SOURCE_IDS.has(record.sourceId)).length : 0
  const originalDecisions = []
  let baselineMatched = 0
  for (const input of inputs) {
    const decision = await baseline.matchIndependently(input)
    const identity = identityFromOriginal(decision)
    if (identity) baselineMatched++
    originalDecisions.push(identity)
  }

  let reused = 0
  let nonCrossAdapterHitsDiscarded = 0
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
      // A matching own-source cached decision is NOT cross-adapter reuse.
      // If provenance is missing or untrusted, run the original matcher.
      const hasOtherSource = Array.isArray(result.sourceIds) &&
        result.sourceIds.some(sourceId => PILOT_SOURCE_IDS.has(sourceId) &&
          sourceId !== input.sourceId)
      if (hasOtherSource) {
        reused++
        identity = result.identity
      } else {
        nonCrossAdapterHitsDiscarded++
        fallback++
        identity = identityFromOriginal(await indexed.matchIndependently(input))
      }
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
  const transportRequestsNonIncreasing = indexedHttpRequests <= baselineHttpRequests
  const observedTrustedReuse = verifiedPositiveEvidenceRecords > 0 && reused > 0
  // A zero-case comparison or a hand-written test index can be internally
  // consistent but must never be used as authorization for a real pilot.
  const safeToConsiderFurtherPilot = inputs.length > 0 && observedTrustedReuse &&
    admissibleComparison && transportRequestsNonIncreasing
  return {
    kind: 'g1e-shared-epg-isolated-ab',
    mode: 'explicit-test-only',
    schemaVersion: 1,
    counts: {
      programs: inputs.length,
      baselineMatched, indexedMatched,
      // indexReuses counts ONLY verified other-source hits (never self hits).
      indexReuses: reused,
      nonCrossAdapterHitsDiscarded,
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
      verifiedFromCanonicalCacheSnapshots: true,
      originalMatcherIdentityPreserved: admissibleComparison,
      nonEmptyReplay: inputs.length > 0,
      replaySourcePresent: targetSourceId !== null,
      verifiedPositiveEvidenceRecords,
      observedTrustedReuse,
      transportRequestsNonIncreasing,
      measuredReplayHttpReduction: baselineHttpRequests > indexedHttpRequests,
      safeToConsiderFurtherPilot,
      measuredProductionSavings: null,
    },
    limitations: 'Isolated single-adapter replay only; index reuse requires verified provenance from the other adapter. Transport may be stubbed; neither approvedEvidence inputs nor session wiring are independently authenticated here. Real-source end-to-end TMDB savings still unverified.',
  }
}
