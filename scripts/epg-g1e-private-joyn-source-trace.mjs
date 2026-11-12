/**
 * #336: Aggregate-only diagnosis for a failed, private original Joyn pilot.
 *
 * ORIGINAL artefacts stay on the ephemeral runner. Only strictly numeric
 * counters and fixed, code-reviewed status labels are ever returned.
 * This function never reads, returns or logs raw EPG records, matcher
 * decisions, tokens, source titles, IDs, window timestamps or URLs.
 *
 * It is intentionally independent of the productive Joyn adapter: the
 * original sync already writes status.json and the original matcher
 * writes matching-progress.json. Do not add a production observation hook.
 */
const MAX_AGE_MS = 40 * 60_000
const MAX_WINDOWS = 56
const MAX_MATCHER_PROGRAMS = 50_000
const MATCH_CODES = new Set([
  'JOYN_TMDB_REQUEST_BUDGET',
  'JOYN_CLASSIFICATION_BUDGET',
  'JOYN_CLASSIFICATION_UNAVAILABLE',
])
const validInt = (x, max) => Number.isSafeInteger(x) && x >= 0 && x <= max
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x)

function generatedThisRun(value, { startedAt, now }) {
  const generated = Date.parse(value?.generatedAt)
  return Number.isFinite(startedAt) && Number.isFinite(now) &&
    now >= startedAt && now - startedAt <= MAX_AGE_MS &&
    Number.isFinite(generated) && generated >= startedAt - 5_000 &&
    generated <= now && now - generated <= MAX_AGE_MS
}

function safeEpgSync(value, clock, maxEpgRequests) {
  if (!generatedThisRun(value, clock) || value?.kind !== 'joyn-sync-status' ||
      value?.schemaVersion !== 1 ||
      !['complete', 'failed'].includes(value?.status) ||
      !validInt(value.metrics?.requestsStarted, maxEpgRequests) ||
      !validInt(value.metrics?.windowsProcessed, MAX_WINDOWS) ||
      !validInt(value.metrics?.cacheHits, MAX_WINDOWS) ||
      value.metrics.cacheHits > value.metrics.windowsProcessed ||
      !validInt(value.metrics?.splitWindows, maxEpgRequests) ||
      !validInt(value.metrics?.retries, maxEpgRequests) ||
      (value.status === 'complete' && value.metrics.windowsProcessed !== MAX_WINDOWS)) {
    return null
  }
  const { requestsStarted, windowsProcessed, cacheHits, splitWindows, retries } =
    value.metrics
  return {
    status: value.status,
    processedBaseWindows: windowsProcessed,
    expectedBaseWindows: MAX_WINDOWS,
    cachedBaseWindows: cacheHits,
    recursiveWindowSplits: splitWindows,
    retryStarts: retries,
    startedEpgRequests: requestsStarted,
    epgBudget: maxEpgRequests,
    failureClass: value.status === 'failed'
      ? value.failure?.code === 'JOYN_EPG_REQUEST_BUDGET'
        ? 'JOYN_EPG_REQUEST_BUDGET' : 'OTHER_EPG_SOURCE_ERROR'
      : null,
  }
}

function safeMatcher(value, clock) {
  if (!generatedThisRun(value, clock) ||
      value.kind !== 'joyn-matching-progress' ||
      !['running', 'failed', 'complete'].includes(value.status) ||
      !validInt(value.processed, MAX_MATCHER_PROGRAMS) ||
      !validInt(value.total, MAX_MATCHER_PROGRAMS) ||
      value.processed > value.total ||
      !validInt(value.matchCacheHits, MAX_MATCHER_PROGRAMS) ||
      !validInt(value.tmdbRequests, 30) ||
      !validInt(value.algoliaRequests, 90) ||
      !validInt(value.seriesDetailRequests, 20)) return null
  return {
    status: value.status,
    processedOriginalPrograms: value.processed,
    totalOriginalPrograms: value.total,
    originalMatchCacheHits: value.matchCacheHits,
    startedTmdbSearches: value.tmdbRequests,
    startedAlgoliaRequests: value.algoliaRequests,
    startedSeriesDetailRequests: value.seriesDetailRequests,
    failureClass: value.status === 'failed'
      ? MATCH_CODES.has(value.failure?.code)
        ? value.failure.code : 'OTHER_MATCHER_ERROR'
      : null,
  }
}

export function summarizePrivateJoynCaptureFailureTrace({
  epgStatus, matcherProgress, startedAt, now = Date.now(),
  maxEpgRequests = 250,
} = {}) {
  if (!validInt(maxEpgRequests, 250) || maxEpgRequests < MAX_WINDOWS) return null
  const clock = { startedAt, now }
  const epg = safeEpgSync(epgStatus, clock, maxEpgRequests)
  if (!epg) return null
  // Matching proof may only be considered after a complete current-run EPG.
  const matcher = epg.status === 'complete'
    ? safeMatcher(matcherProgress, clock) : null
  // A missing report differs from an existing but unverified report. In the
  // latter case the original matcher may already have run and failed.
  const matcherReportStatus = epg.status !== 'complete' ? null
    : matcher ? 'validated'
      : matcherProgress == null ? 'absent'
        : !generatedThisRun(matcherProgress, clock) ? 'not-current'
          : 'rejected-by-schema-or-bounds'
  const phase = epg.status === 'failed'
    ? 'epg-sync'
    : !matcher
      ? matcherReportStatus === 'absent'
        ? 'post-epg-before-matcher'
        : 'matcher-progress-unverified'
      : matcher.status === 'complete'
        ? 'post-matcher-publication'
        : 'original-matcher'
  return {
    kind: 'g1e-private-joyn-source-stage',
    phase,
    epg,
    ...(matcherReportStatus ? { matcherReportStatus } : {}),
    ...(matcher ? { matcher } : {}),
  }
}

export function isSafePrivateJoynTrace(value) {
  if (!object(value) || value.kind !== 'g1e-private-joyn-source-stage' ||
      !['epg-sync', 'post-epg-before-matcher',
        'matcher-progress-unverified', 'original-matcher', 'post-matcher-publication'].includes(value.phase) ||
      Object.keys(value).some(k => !['kind', 'phase', 'epg', 'matcher', 'matcherReportStatus'].includes(k))) {
    return false
  }
  // Reuse the exact numeric/type allowlist by round-tripping the original
  // *aggregate only*. Any additional fields reject upload completely.
  const epg = value.epg
  if (!object(epg) ||
      Object.keys(epg).sort().join('|') !== [
        'status', 'processedBaseWindows', 'expectedBaseWindows',
        'cachedBaseWindows', 'recursiveWindowSplits', 'retryStarts',
        'startedEpgRequests', 'epgBudget', 'failureClass',
      ].sort().join('|') ||
      !['complete', 'failed'].includes(epg.status) ||
      epg.expectedBaseWindows !== MAX_WINDOWS ||
      !validInt(epg.processedBaseWindows, MAX_WINDOWS) ||
      !validInt(epg.cachedBaseWindows, epg.processedBaseWindows) ||
      !validInt(epg.epgBudget, 250) ||
      !validInt(epg.startedEpgRequests, epg.epgBudget) ||
      !validInt(epg.recursiveWindowSplits, epg.epgBudget) ||
      !validInt(epg.retryStarts, epg.epgBudget) ||
      (epg.status === 'complete' &&
       (epg.processedBaseWindows !== MAX_WINDOWS || epg.failureClass !== null)) ||
      (epg.status === 'failed' &&
       !['JOYN_EPG_REQUEST_BUDGET', 'OTHER_EPG_SOURCE_ERROR'].includes(epg.failureClass))) return false
  const match = value.matcher
  if (!match) {
    if (Object.hasOwn(value, 'matcher')) return false
    if (epg.status === 'failed') {
      return value.phase === 'epg-sync' && value.matcherReportStatus === undefined
    }
    return (value.phase === 'post-epg-before-matcher' &&
        value.matcherReportStatus === 'absent') ||
      (value.phase === 'matcher-progress-unverified' &&
        ['not-current', 'rejected-by-schema-or-bounds'].includes(value.matcherReportStatus))
  }
  if (epg.status !== 'complete' || value.matcherReportStatus !== 'validated' ||
      !object(match) ||
      Object.keys(match).sort().join('|') !== [
        'status', 'processedOriginalPrograms', 'totalOriginalPrograms',
        'originalMatchCacheHits', 'startedTmdbSearches',
        'startedAlgoliaRequests', 'startedSeriesDetailRequests',
        'failureClass',
      ].sort().join('|') ||
      !['running', 'failed', 'complete'].includes(match.status) ||
      !validInt(match.totalOriginalPrograms, MAX_MATCHER_PROGRAMS) ||
      !validInt(match.processedOriginalPrograms, match.totalOriginalPrograms) ||
      !validInt(match.originalMatchCacheHits, MAX_MATCHER_PROGRAMS) ||
      !validInt(match.startedTmdbSearches, 30) ||
      !validInt(match.startedAlgoliaRequests, 90) ||
      !validInt(match.startedSeriesDetailRequests, 20) ||
      (match.status === 'failed' &&
        ![...MATCH_CODES, 'OTHER_MATCHER_ERROR'].includes(match.failureClass)) ||
      (match.status !== 'failed' && match.failureClass !== null)) return false
  return value.phase === (match.status === 'complete'
    ? 'post-matcher-publication' : 'original-matcher')
}
