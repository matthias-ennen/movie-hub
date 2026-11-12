/**
 * MovieHub #336 G1e – fail-closed, read-only approval bridge.
 *
 * SourceAdapter BroadcastEvents carry TMDB identities but (especially Waipu)
 * do not necessarily carry the original EPG programme title. Never reconstruct
 * that title from TMDB metadata. A trusted *source-matcher decision* must
 * supply it, accompanied by the exact sourceRef and airing interval.
 *
 * No fetch, Firebase writes, Nightly hooks, badges or playback links.
 */
import { normalizeBroadcastEvent } from './sourceAdapterContract.js'
import { SharedEpgIdentityIndex } from './sharedEpgIdentityIndex.js'

const string = (value) => String(value ?? '').trim()
const iso = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null
  const n = Date.parse(value)
  return Number.isFinite(n) ? new Date(n).toISOString() : null
}
const matchingId = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null

function eventAndProof(rawEvent, proof) {
  let event
  try { event = normalizeBroadcastEvent(rawEvent) } catch { return { reason: 'invalid_broadcast' } }
  if (!proof || proof.status !== 'matched' || proof.approved !== true) {
    return { reason: 'not_explicitly_confirmed' }
  }
  const sourceId = string(proof.sourceId)
  const externalId = string(proof.externalId)
  const approvedTitle = string(proof.originalProgrammeTitle)
  const time = iso(proof.checkedAt)
  const startAt = iso(proof.startAt)
  const endAt = iso(proof.endAt)
  const type = proof.mediaType === 'tv' ? 'series' : proof.mediaType
  const workId = matchingId(proof.tmdbId)

  if (!sourceId || !externalId || !approvedTitle || !time ||
      !startAt || !endAt || startAt !== event.startAt || endAt !== event.endAt ||
      !string(proof.matcherVersion) || type !== event.titleRef.mediaType ||
      workId !== event.titleRef.tmdbId) {
    return { reason: 'approval_event_mismatch' }
  }
  if (!event.sourceRefs.some(ref =>
    ref.sourceId === sourceId && ref.externalId === externalId &&
    Date.parse(ref.observedAt) <= Date.parse(time) + 5 * 60_000)) {
    return { reason: 'source_ref_missing' }
  }
  if (event.episode?.conflict) return { reason: 'episode_conflict' }
  const yearValue = proof.productionYear
  const productionYear = yearValue == null ? null : Number(yearValue)
  if (yearValue != null && (!Number.isSafeInteger(productionYear) ||
      productionYear < 1888 || productionYear > 2100)) {
    return { reason: 'invalid_production_year' }
  }
  return {
    evidence: {
      approved: true, matchStatus: 'matched',
      sourceId, stationId: event.channelId,
      title: approvedTitle,
      type: event.titleRef.mediaType, tmdbId: event.titleRef.tmdbId,
      startTime: event.startAt, endTime: event.endAt,
      productionYear,
      episode: event.titleRef.mediaType === 'series' ? event.episode : null,
      checkedAt: time, matchMethod: string(proof.matcherVersion),
    },
  }
}

/**
 * @returns {{accepted:true,evidence:object}|{accepted:false,reason:string}}
 */
export function validatedSharedEpgEvidence(rawEvent, proof, {
  sourceStatus = null,
} = {}) {
  if (sourceStatus !== 'healthy') return { accepted: false, reason: 'source_not_healthy' }
  const result = eventAndProof(rawEvent, proof)
  if (!result.evidence) return { accepted: false, reason: result.reason }
  return { accepted: true, evidence: result.evidence }
}

/**
 * Inspect sequentially validated source decisions. The result is a DRY-RUN
 * opportunity count, not a claim of real avoided TMDB requests. Existing
 * per-adapter caches may already have avoided some remote calls.
 */
export function previewSharedEpgReuse(decisions, {
  now = Date.now(), maxEntries = 50_000,
} = {}) {
  if (!Array.isArray(decisions) || decisions.length > maxEntries ||
      !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 50_000) {
    throw new RangeError('Invalid bounded G1e input')
  }
  const index = new SharedEpgIdentityIndex({ now, maxEntries })
  const counts = {
    inspected: 0, eligibleReuse: 0, independentRequired: 0,
    conflicts: 0, rejectedEvidence: 0, seeded: 0,
  }
  const rejects = Object.create(null)
  for (const item of decisions) {
    counts.inspected++
    const check = validatedSharedEpgEvidence(item?.event, item?.approval, {
      sourceStatus: item?.sourceStatus,
    })
    if (!check.accepted) {
      counts.rejectedEvidence++
      rejects[check.reason] = (rejects[check.reason] || 0) + 1
      continue
    }
    const e = check.evidence
    const lookup = index.lookup({
      stationId: e.stationId, title: e.title, type: e.type,
      startTime: e.startTime, endTime: e.endTime,
      productionYear: e.productionYear, episode: e.episode,
    })
    if (lookup.status === 'hit') {
      // A positive reuse should never override a contradictory approved source
      // matcher decision from the current generation.
      if (lookup.identity.tmdbId === e.tmdbId &&
          lookup.identity.type === e.type) counts.eligibleReuse++
      else counts.conflicts++
    } else if (lookup.status === 'conflict') counts.conflicts++
    else counts.independentRequired++
    if (index.addConfirmed(e)) counts.seeded++
  }
  return {
    kind: 'shared-epg-reuse-dry-run',
    sourceMode: 'read-only',
    evaluatedAt: new Date(now).toISOString(),
    counts, rejectedReasons: { ...rejects },
    limitations: 'Eligibility only, NOT measured TMDB request savings; no production adapter hook.',
  }
}
