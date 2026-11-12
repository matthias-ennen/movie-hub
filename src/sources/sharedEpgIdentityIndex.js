/**
 * MovieHub #336 G1d: optional, adapter-agnostic positive identity evidence.
 *
 * This is NOT an adapter, a TMDB matcher, a source of EPG or a player/offer
 * provider. Every adapter can run unchanged with an absent/broken index.
 *
 * Only confirmed source decisions may be recorded. Reuse requires a compatible
 * exact title plus the same canonical station and closely matching airtime, OR
 * a verified year+title+type identity without a slot conflict. Different
 * programme titles occupying the same slot block reuse (schedule updates).
 *
 * Never store or infer playback links or TMDB watch-provider availability.
 */
import {
  TV_AIRING_MATCH_MAX_START_DELTA_MS,
  TV_AIRING_MATCH_MIN_OVERLAP_RATIO,
} from './mergeTvAirings.js'

export const SHARED_EPG_IDENTITY_INDEX_VERSION = 1
export const SHARED_EPG_POSITIVE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const SHARED_EPG_MAX_ENTRIES = 50_000
const MAX_SLOT_DURATION_MS = 36 * 60 * 60 * 1000

function clean(value) { return String(value ?? '').trim() }

export function epgIdentityTitleKey(value) {
  return clean(value).normalize('NFKC').toLocaleLowerCase('de')
    .replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function mediaType(value) {
  if (value === 'movie') return 'movie'
  if (value === 'series' || value === 'tv') return 'series'
  return null
}

function integerId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function year(value) {
  const n = Number(value)
  return value != null && Number.isSafeInteger(n) && n >= 1888 && n <= 2100 ? n : null
}

function timestamp(value) {
  const n = Date.parse(value)
  return Number.isFinite(n) ? n : null
}

function validInterval(startTime, endTime) {
  const start = timestamp(startTime)
  const end = timestamp(endTime)
  return start !== null && end !== null && end > start &&
    end - start <= MAX_SLOT_DURATION_MS ? { start, end } : null
}

function episode(value) {
  const season = Number(value?.seasonNumber)
  const number = Number(value?.episodeNumber)
  return Number.isSafeInteger(season) && season > 0 &&
    Number.isSafeInteger(number) && number > 0
    ? { seasonNumber: season, episodeNumber: number } : null
}

function compatibleYear(left, right) {
  return left === null || right === null || Math.abs(left - right) <= 1
}

function compatibleEpisode(left, right) {
  if (!left || !right) return true
  return left.seasonNumber === right.seasonNumber &&
    left.episodeNumber === right.episodeNumber
}

function overlapRatio(a, b) {
  const shared = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))
  return shared / Math.max(a.end - a.start, b.end - b.start)
}

function sameSlot(query, evidence) {
  const a = validInterval(query.startTime, query.endTime)
  const b = validInterval(evidence.startTime, evidence.endTime)
  return Boolean(a && b &&
    Math.abs(a.start - b.start) <= TV_AIRING_MATCH_MAX_START_DELTA_MS &&
    overlapRatio(a, b) >= TV_AIRING_MATCH_MIN_OVERLAP_RATIO)
}

function normalEvidence(raw, now, maxAgeMs) {
  if (!raw || raw.matchStatus !== 'matched' || raw.approved !== true) return null
  const sourceId = clean(raw.sourceId)
  const stationId = clean(raw.stationId)
  const title = epgIdentityTitleKey(raw.title)
  const type = mediaType(raw.type)
  const tmdbId = integerId(raw.tmdbId)
  const slot = validInterval(raw.startTime, raw.endTime)
  const checkedAt = timestamp(raw.checkedAt)
  const matchMethod = clean(raw.matchMethod)
  if (!sourceId || sourceId.length > 128 || !stationId || stationId.length > 128 ||
      !type || !tmdbId || !title || title.length > 300 || !slot ||
      !matchMethod || matchMethod.length > 128 || checkedAt === null ||
      checkedAt > now + 5 * 60_000 || now - checkedAt < 0 ||
      now - checkedAt > maxAgeMs) return null
  return Object.freeze({
    matchStatus: 'matched', approved: true,
    sourceId, stationId, title, type, tmdbId,
    productionYear: year(raw.productionYear),
    episode: type === 'series' ? episode(raw.episode) : null,
    startTime: new Date(slot.start).toISOString(),
    endTime: new Date(slot.end).toISOString(),
    checkedAt: new Date(checkedAt).toISOString(),
    matchMethod,
  })
}

function normalCandidate(raw) {
  const stationId = clean(raw?.stationId || raw?.canonicalStationId)
  const title = epgIdentityTitleKey(raw?.title)
  const type = mediaType(raw?.type)
  const startTime = raw?.startTime ?? raw?.startAt ?? null
  const endTime = raw?.endTime ?? raw?.endAt ?? null
  const slot = validInterval(startTime, endTime)
  // Do not turn an invalid EPG interval into a generic title/year hit.
  if (!type || !title || !stationId || !slot) return null
  const knownYear = year(raw?.productionYear)
  if (raw?.productionYear != null && knownYear === null) return null
  return {
    stationId, title, type,
    productionYear: knownYear,
    episode: type === 'series' ? episode(raw?.episode) : null,
    startTime: new Date(slot.start).toISOString(),
    endTime: new Date(slot.end).toISOString(),
  }
}

function sameIdentity(entries) {
  const ids = new Set(entries.map(e => e.type + ':' + e.tmdbId))
  return ids.size === 1
}

function hit(entries, scope) {
  return Object.freeze({
    status: 'hit',
    scope,
    identity: Object.freeze({
      type: entries[0].type,
      tmdbId: entries[0].tmdbId,
      productionYear: entries[0].productionYear,
    }),
    sourceIds: Object.freeze([...new Set(entries.map(e => e.sourceId))].sort()),
    // Never return a playback route, provider ID or a recommendation to play.
  })
}

/**
 * Positive, source-independent cache. A snapshot is optional infrastructure.
 * It must NOT become a dependency of Waipu/Joyn/XMLTV source ingestion.
 */
export class SharedEpgIdentityIndex {
  constructor({
    now = Date.now(),
    maxAgeMs = SHARED_EPG_POSITIVE_MAX_AGE_MS,
    maxEntries = SHARED_EPG_MAX_ENTRIES,
    records = [],
  } = {}) {
    if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 1 ||
        maxAgeMs > SHARED_EPG_POSITIVE_MAX_AGE_MS ||
        !Number.isSafeInteger(maxEntries) || maxEntries < 1 ||
        maxEntries > SHARED_EPG_MAX_ENTRIES) throw new RangeError('Invalid index bounds')
    this.now = now
    this.maxAgeMs = maxAgeMs
    this.maxEntries = maxEntries
    this.records = []
    this.keys = new Set()
    this.byStation = new Map()
    this.byTitle = new Map()
    if (!Array.isArray(records) || records.length > SHARED_EPG_MAX_ENTRIES) {
      throw new RangeError('Invalid index record collection')
    }
    for (const entry of records) this.addConfirmed(entry)
  }

  addConfirmed(raw) {
    const entry = normalEvidence(raw, this.now, this.maxAgeMs)
    if (!entry) return false
    const uniqueKey = [entry.sourceId, entry.stationId, entry.type, entry.tmdbId,
      entry.title, entry.startTime, entry.endTime, entry.checkedAt].join('\u001f')
    if (this.keys.has(uniqueKey) || this.records.length >= this.maxEntries) return false
    this.keys.add(uniqueKey)
    this.records.push(entry)
    if (!this.byStation.has(entry.stationId)) this.byStation.set(entry.stationId, [])
    this.byStation.get(entry.stationId).push(entry)
    const titleKey = entry.type + ':' + entry.title
    if (!this.byTitle.has(titleKey)) this.byTitle.set(titleKey, [])
    this.byTitle.get(titleKey).push(entry)
    return true
  }

  lookup(raw) {
    const candidate = normalCandidate(raw)
    if (!candidate) return { status: 'miss', reason: 'incomplete_candidate' }

    // A competing programme in the same slot MUST block the title/year fallback
    // even if another station or historic slot has a verified title match.
    const slotEntries = (this.byStation.get(candidate.stationId) || [])
      .filter(entry => sameSlot(candidate, entry))
    if (slotEntries.length) {
      const agreeing = slotEntries.filter(entry =>
        entry.type === candidate.type &&
        entry.title === candidate.title &&
        compatibleYear(candidate.productionYear, entry.productionYear) &&
        compatibleEpisode(candidate.episode, entry.episode))
      if (agreeing.length !== slotEntries.length || !sameIdentity(slotEntries)) {
        return { status: 'conflict', reason: 'competing_slot_evidence' }
      }
      return hit(agreeing, 'station-time-and-title')
    }

    // Broader title-only reuse is restricted to an EXPLICIT production year.
    // Without it, titles like "Spiders" may name different films/series.
    if (candidate.productionYear === null) {
      return { status: 'miss', reason: 'missing_year_for_title_reuse' }
    }
    const byName = (this.byTitle.get(candidate.type + ':' + candidate.title) || [])
      .filter(entry => entry.productionYear !== null &&
        compatibleYear(candidate.productionYear, entry.productionYear))
    if (!byName.length) return { status: 'miss', reason: 'no_verified_identity' }
    if (!sameIdentity(byName)) return { status: 'conflict', reason: 'ambiguous_title_and_year' }
    return hit(byName, 'verified-title-and-year')
  }

  snapshot() {
    return {
      kind: 'shared-epg-identity-index',
      schemaVersion: SHARED_EPG_IDENTITY_INDEX_VERSION,
      generatedAt: new Date(this.now).toISOString(),
      maxAgeMs: this.maxAgeMs,
      records: this.records.map(record => ({ ...record })),
    }
  }

  static fromSnapshot(snapshot, { now = Date.now(), maxEntries = SHARED_EPG_MAX_ENTRIES } = {}) {
    if (snapshot?.kind !== 'shared-epg-identity-index' ||
        snapshot.schemaVersion !== SHARED_EPG_IDENTITY_INDEX_VERSION ||
        !Array.isArray(snapshot.records) || snapshot.records.length > maxEntries) {
      throw new TypeError('Invalid shared index snapshot')
    }
    return new SharedEpgIdentityIndex({ now, maxEntries, records: snapshot.records })
  }
}

/**
 * Optional integration point before existing local/TMDB matching. If the
 * shared index is absent, broken, stale, or contradictory, the adapter's
 * ORIGINAL independent match function always runs.
 *
 * This does not automatically modify existing adapters or publish results.
 */
export async function matchWithOptionalSharedEpgIndex(candidate, {
  index = null,
  matchIndependently,
} = {}) {
  if (typeof matchIndependently !== 'function') {
    throw new TypeError('Original adapter matcher is required')
  }
  let assessment = { status: 'miss', reason: 'shared_index_unavailable' }
  try {
    if (index?.lookup) assessment = index.lookup(candidate)
  } catch {
    assessment = { status: 'miss', reason: 'shared_index_error' }
  }
  if (assessment?.status === 'hit') {
    return {
      source: 'shared-epg-index',
      reuse: true,
      identity: assessment.identity,
      scope: assessment.scope,
      sourceIds: assessment.sourceIds,
    }
  }
  const independentResult = await matchIndependently(candidate)
  return {
    source: 'independent-matcher',
    reuse: false,
    indexStatus: assessment?.status || 'miss',
    indexReason: assessment?.reason || null,
    result: independentResult,
  }
}
