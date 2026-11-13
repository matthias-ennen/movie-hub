/**
 * #336 XMLTV source readiness – read-only, source-independent diagnostics.
 *
 * A fetch succeeding does not prove five days of actual EPG coverage. Count
 * the UNION of real candidate intervals on each explicitly reviewed station.
 * A source family is an evidence-based CONTENT family, not a count of hosts.
 * Do not publish programme titles, URLs, identities or playback routes here.
 */
import { XMLTV_REVIEWED_STATIONS } from './xmltvStationMappings.js'

export const XMLTV_FIVE_DAY_HOURS = 120
const HOUR = 3_600_000
const MINUTE = 60_000
const DAY = 24 * HOUR
const MAX_AGE = 36 * HOUR

// G1c real-feed sample: FreeEPG and IPTV-EPG.org shared the exact same 854
// six-station programme intervals. Until independently disproven, counting
// them as two independent fallback sources would mislead the G2 gate.
export const XMLTV_VERIFIED_SOURCE_FAMILIES = Object.freeze({
  epgshare01: 'epgshare01',
  freeepg: 'de-shared-schedule',
  'iptv-epg-org': 'de-shared-schedule',
})
const STATIONS = Object.freeze(XMLTV_REVIEWED_STATIONS.map(s => s.stationId))
const safeId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
const instant = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export function measureXmltvFiveDayCoverage(candidates, {
  sourceId, now = Date.now(),
} = {}) {
  if (!safeId(sourceId) || !Object.hasOwn(XMLTV_VERIFIED_SOURCE_FAMILIES, sourceId)) {
    throw new TypeError('Unknown reviewed XMLTV source')
  }
  if (!Array.isArray(candidates) || candidates.length > 250_000 ||
      !Number.isFinite(now)) throw new TypeError('Unbounded source coverage input')

  const until = now + XMLTV_FIVE_DAY_HOURS * HOUR
  const windows = new Map(STATIONS.map(id => [id, []]))
  let rejectedUnzoned = 0
  let ignoredInvalid = 0
  for (const candidate of candidates) {
    // The source is selected by the trusted download runner, not a title,
    // display name, fuzzy station match or a user-controlled provider label.
    if (candidate?.sourceId !== sourceId || !windows.has(candidate?.canonicalStationId)) {
      ignoredInvalid++
      continue
    }
    if (candidate.timestampsExplicitlyZoned !== true) {
      rejectedUnzoned++
      continue
    }
    const start = instant(candidate.startAt)
    const end = instant(candidate.endAt)
    if (start === null || end === null || end <= start || end - start > 36 * HOUR ||
        end <= now || start >= until) {
      ignoredInvalid++
      continue
    }
    windows.get(candidate.canonicalStationId).push([
      Math.max(now, start), Math.min(until, end),
    ])
  }

  const perStation = {}
  for (const stationId of STATIONS) {
    const intervals = windows.get(stationId).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let covered = 0
    let cursor = now
    let longestGap = 0
    for (const [start, end] of intervals) {
      if (start > cursor) longestGap = Math.max(longestGap, start - cursor)
      if (end > cursor) {
        covered += end - Math.max(cursor, start)
        cursor = end
      }
    }
    longestGap = Math.max(longestGap, until - cursor)
    perStation[stationId] = {
      programmeIntervals: intervals.length,
      coveredMinutes: Math.floor(covered / MINUTE),
      missingMinutes: Math.ceil((until - now - covered) / MINUTE),
      longestGapMinutes: Math.ceil(longestGap / MINUTE),
      complete120h: covered === until - now,
    }
  }
  const completeStations = STATIONS.filter(id => perStation[id].complete120h).length
  return {
    sourceId, contentFamily: XMLTV_VERIFIED_SOURCE_FAMILIES[sourceId],
    horizonHours: XMLTV_FIVE_DAY_HOURS,
    reviewedStations: STATIONS.length,
    completeStations,
    allReviewedStationsComplete: completeStations === STATIONS.length,
    rejectedUnzoned, ignoredInvalid,
    stations: perStation,
  }
}

/**
 * Combine READ-ONLY coverage summaries. Deliberately require two separate
 * content families with complete coverage, not merely two HTTP endpoints.
 * This is one instant of coverage, never a long-term SLA or a G2 approval.
 */
export function assessXmltvIndependentCoverage(sourceReports, {
  now = Date.now(),
} = {}) {
  if (!Array.isArray(sourceReports) || sourceReports.length > 16 ||
      !Number.isFinite(now)) throw new TypeError('Invalid source readiness reports')

  const healthyFamilies = new Set()
  const sources = []
  const seen = new Set()
  for (const report of sourceReports) {
    const id = report?.source
    if (!safeId(id) || !Object.hasOwn(XMLTV_VERIFIED_SOURCE_FAMILIES, id) ||
        seen.has(id)) throw new TypeError('Duplicate or unreviewed source')
    seen.add(id)
    const family = XMLTV_VERIFIED_SOURCE_FAMILIES[id]
    const observed = instant(report?.observedAt)
    const freshObservation = observed !== null && observed <= now &&
      now - observed <= MAX_AGE
    const coverage = report?.coverage
    const complete = report.status === 'ok' && freshObservation &&
      coverage?.sourceId === id && coverage?.contentFamily === family &&
      coverage?.horizonHours === XMLTV_FIVE_DAY_HOURS &&
      coverage?.reviewedStations === STATIONS.length &&
      coverage?.completeStations === STATIONS.length &&
      coverage?.allReviewedStationsComplete === true &&
      STATIONS.every(stationId => coverage?.stations?.[stationId]?.complete120h === true &&
        coverage.stations[stationId].coveredMinutes === XMLTV_FIVE_DAY_HOURS * 60 &&
        coverage.stations[stationId].missingMinutes === 0)
    if (complete) healthyFamilies.add(family)
    sources.push({ sourceId: id, contentFamily: family,
      observedWithin36h: freshObservation, completeFiveDayCoverage: complete })
  }
  return {
    requiredIndependentFamilies: 2,
    completeIndependentFamilies: healthyFamilies.size,
    sufficientIndependentCoverageSnapshot: healthyFamilies.size >= 2,
    sourceStatuses: sources,
    caveat: 'Single read-only point-in-time snapshot; not uptime, legal reuse, TMDB coverage, playable channel routes or a production release approval.',
  }
}
