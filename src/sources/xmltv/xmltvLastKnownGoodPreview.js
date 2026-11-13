/**
 * #336 G2 preflight ONLY: bounded, offline last-known-good XMLTV diagnosis.
 *
 * Never imports a feed, caches or publishes programmes, asserts TMDB identity,
 * activates a shared index, or creates AIR playback routes. A previously good
 * download is not proof of a complete five-day horizon at a later instant.
 */
import {
  measureXmltvFiveDayCoverage, XMLTV_VERIFIED_SOURCE_FAMILIES,
} from './xmltvSourceReadiness.js'

export const XMLTV_LKG_MAX_AGE_MS = 36 * 60 * 60 * 1000
const KNOWN_SOURCES = Object.keys(XMLTV_VERIFIED_SOURCE_FAMILIES)
const validInstant = value => {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function inspect(sourceId, snapshot, now) {
  if (snapshot?.status !== 'ok' || snapshot?.sourceId !== sourceId ||
      !Array.isArray(snapshot?.candidates)) return null
  const observedAt = validInstant(snapshot.observedAt)
  if (observedAt === null || observedAt > now ||
      now - observedAt > XMLTV_LKG_MAX_AGE_MS) return null
  try {
    // Recompute for NOW; do not recycle a historical coverage percentage.
    const coverage = measureXmltvFiveDayCoverage(snapshot.candidates, { sourceId, now })
    if (!Object.values(coverage.stations).every(station =>
      station.coveredMinutes > 0)) return null
    return {
      coverage,
      ageMinutes: Math.floor((now - observedAt) / 60_000),
    }
  } catch {
    // Corrupt, unbounded or ill-shaped cache inputs are never a fallback.
    return null
  }
}

/**
 * Diagnostic decision only. All data remain with the caller. In particular,
 * no cached XMLTV programme or matcher decision is handed to the app.
 *
 * A fallback with only 96h remaining is explicitly INCOMPLETE, not counted
 * as proof of 120h at the new observation time.
 */
export function previewXmltvLastKnownGood(sourceId, {
  current = null, lastKnownGood = null, now = Date.now(),
} = {}) {
  if (!KNOWN_SOURCES.includes(sourceId) || !Number.isFinite(now)) {
    throw new TypeError('Unreviewed XMLTV source or invalid clock')
  }
  const live = inspect(sourceId, current, now)
  const previous = live ? null : inspect(sourceId, lastKnownGood, now)
  const chosen = live || previous
  return {
    sourceId,
    contentFamily: XMLTV_VERIFIED_SOURCE_FAMILIES[sourceId],
    selected: live ? 'current' : previous ? 'last-known-good' : 'unavailable',
    ageMinutes: chosen?.ageMinutes ?? null,
    hasFutureCoverageOnAllStations: Boolean(chosen),
    fiveDayCompleteNow: chosen?.coverage.allReviewedStationsComplete ?? false,
    completeStationsNow: chosen?.coverage.completeStations ?? 0,
    // Prevent callers from mistaking this preview for an approved fallback.
    publishApproved: false,
    tmdbReuseApproved: false,
  }
}

/** Source-family-level failover PREVIEW; related feed hosts count only once. */
export function previewXmltvMultiSourceLastKnownGood(sources, {
  now = Date.now(),
} = {}) {
  if (!Array.isArray(sources) || sources.length > KNOWN_SOURCES.length ||
      !Number.isFinite(now)) throw new TypeError('Invalid bounded XMLTV snapshot set')
  const seen = new Set()
  const statuses = sources.map(source => {
    const sourceId = source?.sourceId
    if (!KNOWN_SOURCES.includes(sourceId) || seen.has(sourceId)) {
      throw new TypeError('Duplicate or unreviewed XMLTV source')
    }
    seen.add(sourceId)
    return previewXmltvLastKnownGood(sourceId, {
      current: source.current, lastKnownGood: source.lastKnownGood, now,
    })
  })
  const available = new Set(statuses.filter(s => s.hasFutureCoverageOnAllStations)
    .map(s => s.contentFamily))
  const complete = new Set(statuses.filter(s => s.fiveDayCompleteNow)
    .map(s => s.contentFamily))
  return {
    sourceStatuses: statuses,
    availableIndependentFamilies: available.size,
    completeIndependentFamilies: complete.size,
    hasIndependentFallbackPreview: available.size >= 2,
    hasFiveDayPrimaryPreview: complete.size >= 1,
    publishApproved: false,
    tmdbReuseApproved: false,
    caveat: 'Read-only offline failover preview; no rights, production, matching or device approval.',
  }
}
