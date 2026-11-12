/**
 * #336 G1e-2b Joyn trusted original-EPG-title matcher receipt.
 *
 * This is only an optional pure adapter QA step. The nightly Joyn pipeline
 * does not invoke it and the shared index is not enabled in production.
 *
 * JoynMatchCache.get() returns just the diagnostic; its original timestamp
 * is available exclusively through getWithProvenance(). This constructor
 * MUST NOT turn an old cache hit into a freshly checked decision.
 */
import { JOYN_MATCHER_VERSION } from './joyn-tmdb-matcher.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { validatedSharedEpgEvidence } from '../src/sources/sharedEpgEvidencePreview.js'

const text = value => String(value ?? '').trim()
const validId = value =>
  value !== null && value !== undefined && Number.isSafeInteger(Number(value)) &&
  Number(value) > 0 ? Number(value) : null
const explicitYear = value => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1888 && parsed <= 2100 ? parsed : NaN
}
const time = value => {
  if (typeof value !== 'string' || !value.trim()) return null
  const number = Date.parse(value)
  return Number.isFinite(number) ? new Date(number).toISOString() : null
}

/**
 * Only original Joyn programme data and its verified matcher result qualify.
 * The receipt's date must be supplied by the code that actually performed the
 * match, or taken from the original cache entry. Never manufacture "now".
 */
export function buildJoynApprovedEpgReceipt({
  sourceCandidate,
  matcherDecision,
  broadcastEvent,
  matchCheckedAt = null,
  cachedMatch = null,
  sourceStatus = 'healthy',
} = {}) {
  if (sourceStatus !== 'healthy') {
    return { accepted: false, reason: 'source_not_healthy' }
  }
  const d = matcherDecision
  const match = d?.match
  if (d?.status !== 'matched' || d?.matcherVersion !== JOYN_MATCHER_VERSION ||
      !match || validId(match.tmdbId) === null ||
      !['movie', 'series'].includes(match.type)) {
    return { accepted: false, reason: 'unconfirmed_joyn_match' }
  }
  // Joyn may accept fuzzy titles or description/duration tie breaks for its
  // own publication. Only an unambiguous exact title is shared cross-source.
  if (Number(match.score) !== 100 || !Number.isFinite(Number(match.margin)) ||
      Number(match.margin) < 15 || !text(d.source)) {
    return { accepted: false, reason: 'joyn_match_not_strong_enough_for_cross_source' }
  }
  const name = text(sourceCandidate?.title)
  const programmeId = text(sourceCandidate?.joynProgramId)
  const candidateType = sourceCandidate?.type ?? null
  if (!programmeId || !name || name.length > 300 ||
      (candidateType && candidateType !== match.type) ||
      normalizeWaipuText(broadcastEvent?.extensions?.joyn?.rawTitle) !== normalizeWaipuText(name) ||
      !time(sourceCandidate?.startTime) || !time(sourceCandidate?.endTime)) {
    return { accepted: false, reason: 'joyn_source_title_or_programme_unverified' }
  }
  if (broadcastEvent?.episode?.conflict) {
    return { accepted: false, reason: 'episode_conflict' }
  }
  const candidateYear = explicitYear(sourceCandidate?.productionYear)
  const matchYear = explicitYear(match.year)
  if (Number.isNaN(candidateYear) || Number.isNaN(matchYear) ||
      (candidateYear !== null && matchYear !== null &&
        Math.abs(candidateYear - matchYear) > 1)) {
    return { accepted: false, reason: 'source_tmdb_year_conflict' }
  }
  let checkedAt
  if (cachedMatch !== null) {
    // Never accept a "fresh" timestamp override when the match was cached.
    if (matchCheckedAt !== null ||
        cachedMatch?.origin !== 'cache' ||
        cachedMatch?.diagnostic?.decision !== matcherDecision ||
        !time(cachedMatch?.checkedAt)) {
      return { accepted: false, reason: 'cache_provenance_missing' }
    }
    checkedAt = cachedMatch.checkedAt
  } else {
    if (!time(matchCheckedAt)) return { accepted: false, reason: 'match_time_missing' }
    checkedAt = matchCheckedAt
  }
  return validatedSharedEpgEvidence(broadcastEvent, {
    sourceId: 'joyn-epg',
    externalId: programmeId,
    status: 'matched', approved: true,
    originalProgrammeTitle: name,
    startAt: sourceCandidate.startTime, endAt: sourceCandidate.endTime,
    mediaType: match.type, tmdbId: validId(match.tmdbId),
    productionYear: candidateYear,
    matcherVersion: 'joyn-v' + d.matcherVersion + ':exact-title-evidence',
    checkedAt,
  }, { sourceStatus })
}
