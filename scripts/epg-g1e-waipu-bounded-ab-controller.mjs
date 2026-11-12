/**
 * #336 G1e: explicit, IN-MEMORY Waipu-target A/B pilot controller.
 *
 * Joyn supplies previously approved original EPG matcher receipts; Waipu is
 * always the target. Both arms use the SAME original Waipu matcher and
 * separately initialized original decision caches from the same snapshot.
 *
 * This module does not read checkpoints, launch a workflow, fetch source EPG,
 * save caches, publish anything, or enable a production shared index. Network
 * access is possible ONLY when an explicit caller supplies a TMDB fetchImpl
 * and token. No automatic use from Nightly.
 */
import {
  matchWaipuProgram, WAIPU_MATCHER_VERSION,
  WaipuMatchDecisionStore, WaipuTmdbSearchClient,
} from './waipu-tmdb-matcher.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { compareOptionalSharedEpgIndexAb } from './epg-g1e-compare-tmdb-transport.mjs'

const MAX_REPLAY_PROGRAMS = 20
const MAX_LOCAL_CANDIDATES = 200
const MAX_EVIDENCE_ROWS = 200
const MAX_CACHE_BYTES = 24 * 1024 * 1024
const MAX_HTTP_REQUESTS_PER_ARM = 40

function plain(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
}

function cloneBounded(value) {
  if (!plain(value)) throw new TypeError('Expected bounded original Waipu cache JSON object')
  let encoded
  try { encoded = JSON.stringify(value) } catch { throw new TypeError('Invalid original Waipu cache JSON') }
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > MAX_CACHE_BYTES) {
    throw new RangeError('Original Waipu decision cache exceeds safe replay limit')
  }
  const restored = JSON.parse(encoded)
  if (!plain(restored)) throw new TypeError('Invalid original Waipu cache snapshot')
  return restored
}

function validWaipuInput(input) {
  const c = input?.candidate
  const original = input?.matcherInput
  if (input?.sourceId !== 'waipu-epg' ||
      typeof input?.sourceGenerationId !== 'string' ||
      !input.sourceGenerationId.startsWith('waipu:') ||
      !plain(c) || !plain(original) ||
      !Array.isArray(input.localCandidates) ||
      input.localCandidates.length > MAX_LOCAL_CANDIDATES ||
      !['movie', 'series'].includes(c.type) || original.type !== c.type ||
      typeof c.stationId !== 'string' || !c.stationId.trim() ||
      typeof c.title !== 'string' || !c.title.trim() ||
      !Number.isFinite(Date.parse(c.startTime)) ||
      !Number.isFinite(Date.parse(c.endTime)) ||
      Date.parse(c.endTime) <= Date.parse(c.startTime) ||
      Date.parse(c.endTime) - Date.parse(c.startTime) > 36 * 3_600_000) {
    return false
  }
  // The index lookup MUST refer to the original Waipu programme title, not
  // a substituted TMDB display title. Matcher aliases may be genuine source
  // normalization, but the source title must match one of those originals.
  const sourceTitle = normalizeWaipuText(c.title)
  return Boolean(sourceTitle) &&
    [original.title, original.originalTitle,
      ...(Array.isArray(original.aliases) ? original.aliases.slice(0, 20) : [])]
      .some(value => normalizeWaipuText(value) === sourceTitle)
}

/**
 * An explicitly invoked test-only controller, never a production pipeline.
 * Input data and cache must originate from the SAME approved private
 * original-source pilot, not from a public SourceAdapter envelope.
 *
 * The result is the aggregate-only output of the existing verified A/B
 * matcher/HTTP transport harness. This controller does not prove that the
 * supplied private source data/capture were genuinely authenticated.
 */
export async function compareBoundedWaipuWithJoynEvidence({
  waipuInputs,
  joynEvidenceCapture,
  waipuDecisionSnapshot,
  token,
  fetchImpl,
  now = Date.now(),
  maxRequestsPerArm = 20,
  paceMs = 250,
} = {}) {
  if (!Array.isArray(waipuInputs) || !waipuInputs.length ||
      waipuInputs.length > MAX_REPLAY_PROGRAMS ||
      waipuInputs.some(input => !validWaipuInput(input)) ||
      new Set(waipuInputs.map(input => input.sourceGenerationId)).size !== 1 ||
      !plain(joynEvidenceCapture) ||
      joynEvidenceCapture.status !== 'complete' ||
      typeof joynEvidenceCapture.sourceGenerationId !== 'string' ||
      !joynEvidenceCapture.sourceGenerationId.startsWith('joyn-catalog:') ||
      !Array.isArray(joynEvidenceCapture.approvedEvidence) ||
      joynEvidenceCapture.approvedEvidence.length > MAX_EVIDENCE_ROWS ||
      joynEvidenceCapture.approvedEvidence.length === 0 ||
      joynEvidenceCapture.approvedEvidence.some(row =>
        row?.sourceId !== 'joyn-epg' ||
        row?.approved !== true || row?.matchStatus !== 'matched') ||
      !Number.isSafeInteger(joynEvidenceCapture.counts?.accepted) ||
      joynEvidenceCapture.counts.accepted !== joynEvidenceCapture.approvedEvidence.length ||
      !plain(waipuDecisionSnapshot) ||
      waipuDecisionSnapshot.kind !== 'waipu-tmdb-match-decisions' ||
      waipuDecisionSnapshot.schemaVersion !== 1 ||
      waipuDecisionSnapshot.matcherVersion !== WAIPU_MATCHER_VERSION ||
      !plain(waipuDecisionSnapshot.decisions) ||
      typeof token !== 'string' || !token.trim() ||
      typeof fetchImpl !== 'function' ||
      !Number.isFinite(now) ||
      !Number.isSafeInteger(maxRequestsPerArm) ||
      maxRequestsPerArm < 1 || maxRequestsPerArm > MAX_HTTP_REQUESTS_PER_ARM ||
      !Number.isSafeInteger(paceMs) || paceMs < 0 || paceMs > 5_000) {
    throw new TypeError('G1e pilot requires explicit, bounded, provenance-consistent source and matcher inputs')
  }

  // Snapshot is private and local; the Waipu search client has NO durable
  // response cache in the normal source import. Thus both sessions start
  // with the same empty response cache and their own in-run searchResponses.
  const originalDecisions = cloneBounded(waipuDecisionSnapshot.decisions)
  const createSession = () => {
    const initialCacheState = {
      matchDecisions: cloneBounded(originalDecisions),
      tmdbResponses: {},
    }
    const decisions = new WaipuMatchDecisionStore(
      cloneBounded(initialCacheState.matchDecisions))
    const client = new WaipuTmdbSearchClient({
      token, fetchImpl, paceMs, maxRequests: maxRequestsPerArm,
      maxRetries: 0, now: () => now,
    })
    return {
      initialCacheState,
      matchIndependently: input => matchWaipuProgram(input.matcherInput, {
        localCandidates: input.localCandidates,
        decisions,
        searchTmdb: query => client.search(query),
        now: () => now,
      }),
      startedTmdbHttpRequests: () => client.requestsStarted,
    }
  }
  return compareOptionalSharedEpgIndexAb({
    inputs: waipuInputs,
    approvedEvidence: joynEvidenceCapture.approvedEvidence,
    createSession,
    now,
  })
}
