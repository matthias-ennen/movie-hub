/**
 * MovieHub #336 G1m: opt-in handoff from the EXISTING isolated G1e original
 * Joyn source pilot to the G1i response-only private snapshot.
 *
 * No new HTTP call is introduced: this recorder is supplied only to the
 * already-instantiated original Joyn TMDB client as a write-only observer.
 * Original Joyn lookup-cache HIT behavior is unchanged. Successful source
 * matching still does not mean a TMDB identity or a provider AIR route can be
 * approved from a raw API search response.
 *
 * The durable private snapshot is never uploaded or published by this module.
 */
import {
  SHARED_TMDB_CAPTURE_OPT_IN,
  openOptionalSharedTmdbCapture,
} from './shared-tmdb-adapter-capture-stage.mjs'

const RESULTS = new Set([
  'saved', 'no_new_responses', 'not_complete', 'already_finalized',
  'unavailable', 'invalid_input', 'too_large', 'revision_conflict',
])
const MAX_CAPTURE_RESPONSES_PER_RUN = 450

/** No implicit activation from the normal Nightly, workflow or PR CI. */
export async function openIsolatedJoynTmdbCapture({
  explicitOptIn = null, isPrivatePilot = false, projectRoot, now = Date.now(),
} = {}) {
  if (explicitOptIn !== SHARED_TMDB_CAPTURE_OPT_IN || isPrivatePilot !== true) {
    return null
  }
  return openOptionalSharedTmdbCapture({
    sourceId: 'joyn', enabled: true, projectRoot, now,
  })
}

/**
 * Single completion point AFTER the G1e original Joyn evidence AND original
 * Waipu rehydration both succeed. A failed pilot never commits a partial
 * shared cache, although the original Joyn cache may already have progressed.
 */
export async function finishIsolatedJoynTmdbCapture({
  capture = null, pilotReport = null,
} = {}) {
  if (capture === null) return null
  if (!capture || typeof capture.complete !== 'function' ||
      capture.sourceId !== 'joyn') throw new TypeError('Invalid isolated Joyn capture')

  const complete = pilotReport?.kind === 'g1e-isolated-private-original-source-capture' &&
    pilotReport.schemaVersion === 1 &&
    ['capture', 'ab'].includes(pilotReport.mode) &&
    pilotReport.source?.joynOriginalGenerationHealthy === true &&
    pilotReport.source?.waipuOriginalGenerationHealthy === true &&
    pilotReport.gate?.sourceReceiptsCapturedPrivately === true &&
    pilotReport.gate?.measuredProductionSavings === null

  const result = await capture.complete({ sourceGenerationComplete: complete })
  if (!RESULTS.has(result?.status) ||
      !Number.isSafeInteger(result?.stored) ||
      result.stored < 0 || result.stored > MAX_CAPTURE_RESPONSES_PER_RUN) {
    // No raw payload, filename, request key or stack trace may be exposed.
    throw new TypeError('Invalid private capture summary')
  }
  return Object.freeze({
    kind: 'g1i-private-joyn-tmdb-response-capture',
    schemaVersion: 1,
    status: result.status,
    newlyObservedHttpResponses: result.stored,
    // None of these can be inferred from "successfully captured a search".
    crossAdapterOverlapMeasured: false,
    liveNightlyRequestsAvoided: null,
    sharedSearchReadEnabled: false,
    originalMatcherIdentitiesApprovedByCache: false,
    xmltvPublicationApproved: false,
  })
}

/** Reject accidental addition of source data or false approvals to logs. */
export function isSafeIsolatedJoynCaptureSummary(value) {
  const keys = (obj, allowed) => obj && typeof obj === 'object' &&
    !Array.isArray(obj) &&
    Object.keys(obj).sort().join('|') === [...allowed].sort().join('|')
  return keys(value, [
    'kind', 'schemaVersion', 'status', 'newlyObservedHttpResponses',
    'crossAdapterOverlapMeasured', 'liveNightlyRequestsAvoided',
    'sharedSearchReadEnabled', 'originalMatcherIdentitiesApprovedByCache',
    'xmltvPublicationApproved',
  ]) &&
    value.kind === 'g1i-private-joyn-tmdb-response-capture' &&
    value.schemaVersion === 1 && RESULTS.has(value.status) &&
    Number.isSafeInteger(value.newlyObservedHttpResponses) &&
    value.newlyObservedHttpResponses >= 0 &&
    value.newlyObservedHttpResponses <= MAX_CAPTURE_RESPONSES_PER_RUN &&
    value.crossAdapterOverlapMeasured === false &&
    value.liveNightlyRequestsAvoided === null &&
    value.sharedSearchReadEnabled === false &&
    value.originalMatcherIdentitiesApprovedByCache === false &&
    value.xmltvPublicationApproved === false &&
    JSON.stringify(value).length < 460
}
