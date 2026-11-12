/**
 * #336 G1e-2b – opt-in receipt builder for a *verified Waipu matcher decision*.
 *
 * The original EPG title is sourced ONLY from the Waipu grid broadcast,
 * never from an output TMDB title. The production Waipu import is unchanged:
 * no hooks, no snapshot writer, no cross-adapter dependency, no API calls.
 */
import {
  WAIPU_MATCHER_VERSION, WAIPU_MATCH_THRESHOLDS,
} from './waipu-tmdb-matcher.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { validatedSharedEpgEvidence } from '../src/sources/sharedEpgEvidencePreview.js'

const text = value => String(value ?? '').trim()
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0
  ? Number(value) : null
const productionYear = value => value == null ? null : Number(value)

function authorizedTitle(sourceTitle, input) {
  const title = normalizeWaipuText(sourceTitle)
  if (!title) return false
  return [input?.title, input?.originalTitle,
    ...(Array.isArray(input?.aliases) ? input.aliases : [])]
    .some(value => normalizeWaipuText(value) === title)
}

function episodeConflict(event, input) {
  const episode = event?.episode
  if (episode?.conflict) return true
  for (const field of ['seasonNumber', 'episodeNumber']) {
    const source = input?.[field]
    const projected = episode?.[field]
    if (source != null && projected != null && Number(source) !== Number(projected)) {
      return true
    }
  }
  return false
}

/**
 * @returns {{accepted:true,evidence:object}|{accepted:false,reason:string}}
 *
 * Inputs must be passed by the trusted Waipu match pipeline, not accepted from
 * a public SourceEnvelope alone. A cached old decision is not silently re-dated:
 * G1e's sourceRef time check rejects it until genuinely revalidated.
 */
export function buildWaipuApprovedEpgReceipt({
  sourceBroadcast, normalizedInput, matcherDecision, broadcastEvent,
  sourceStatus = 'healthy',
} = {}) {
  if (sourceStatus !== 'healthy') {
    return { accepted: false, reason: 'source_not_healthy' }
  }
  const d = matcherDecision
  const ref = d?.match
  if (d?.status !== 'matched' || !ref ||
      d.matcherVersion !== WAIPU_MATCHER_VERSION ||
      ref.tmdbId == null || !positiveId(ref.tmdbId) ||
      !['movie', 'series'].includes(ref.type)) {
    return { accepted: false, reason: 'unconfirmed_waipu_match' }
  }
  // Only explicit, strong, exact-title matcher evidence can be shared across
  // adapters; weaker match scores continue to work in Waipu alone.
  const score = Number(ref.score)
  const margin = Number(ref.margin)
  const minimum = ref.type === 'movie' ? WAIPU_MATCH_THRESHOLDS.movie + 10
    : WAIPU_MATCH_THRESHOLDS.series + 8
  if (!Number.isFinite(score) || score < minimum ||
      !Number.isFinite(margin) || margin < WAIPU_MATCH_THRESHOLDS.minimumMargin ||
      !Array.isArray(ref.signals) || !ref.signals.includes('title:70')) {
    return { accepted: false, reason: 'waipu_match_not_strong_enough_for_cross_source' }
  }
  if (!text(sourceBroadcast?.programId) ||
      !authorizedTitle(sourceBroadcast?.title, normalizedInput) ||
      normalizedInput?.type !== ref.type ||
      episodeConflict(broadcastEvent, normalizedInput)) {
    return { accepted: false, reason: 'original_epg_title_or_episode_unverified' }
  }
  const srcYear = productionYear(normalizedInput?.productionYear)
  const tmdbYear = productionYear(ref.year)
  if ((srcYear !== null && (!Number.isSafeInteger(srcYear) ||
      srcYear < 1888 || srcYear > 2100)) ||
      (tmdbYear !== null && Number.isSafeInteger(tmdbYear) &&
      Math.abs((srcYear ?? tmdbYear) - tmdbYear) > 1)) {
    return { accepted: false, reason: 'source_tmdb_year_conflict' }
  }
  return validatedSharedEpgEvidence(broadcastEvent, {
    status: 'matched', approved: true,
    sourceId: 'waipu-epg', externalId: text(sourceBroadcast.programId),
    originalProgrammeTitle: text(sourceBroadcast.title),
    startAt: sourceBroadcast.startTime, endAt: sourceBroadcast.stopTime,
    tmdbId: positiveId(ref.tmdbId), mediaType: ref.type,
    productionYear: srcYear, checkedAt: d.checkedAt,
    matcherVersion: 'waipu-v' + String(d.matcherVersion) + ':exact-title-evidence',
  }, { sourceStatus })
}
