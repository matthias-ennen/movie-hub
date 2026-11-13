/**
 * MovieHub #336 G2b – bounded, read-only XMLTV coverage beyond the 120h
 * QUALITY target. A shorter fresh feed remains useful; do not discard a
 * source just because it lacks five (or fourteen) full days.
 *
 * This module never publishes programmes, approves identities or creates
 * channel playback routes. It reads already parsed, size-bounded candidates.
 *
 * Separate these three concepts:
 *  - coveredMinutes: union of real programme intervals inside the horizon
 *  - continuousFromNowMinutes: no gap from NOW (strict quality observation)
 *  - latestProgrammeEndMinutes: the farthest future end (NOT gap-free)
 */
import { XMLTV_REVIEWED_STATIONS } from './xmltvStationMappings.js'
import { XMLTV_VERIFIED_SOURCE_FAMILIES } from './xmltvSourceReadiness.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MAX_PROGRAMMES = 250_000
const MAX_EVENT_LENGTH = 36 * HOUR
export const XMLTV_MAX_PREVIEW_DAYS = 14

const STATIONS = Object.freeze(XMLTV_REVIEWED_STATIONS.map(s => s.stationId))
const utcInstant = input => {
  if (typeof input !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input)) return null
  const ms = Date.parse(input)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Diagnostics only: inspect up to fourteen available days, even if the source
 * offers only 2, 3, 5 or 7. Keep a partially available source visible rather
 * than inventing a five-day minimum for adapter eligibility.
 */
export function measureXmltvAvailableHorizon(candidates, {
  sourceId, now = Date.now(), maxDays = XMLTV_MAX_PREVIEW_DAYS,
} = {}) {
  if (!Object.hasOwn(XMLTV_VERIFIED_SOURCE_FAMILIES, sourceId) ||
      !Array.isArray(candidates) || candidates.length > MAX_PROGRAMMES ||
      !Number.isFinite(now) || !Number.isInteger(maxDays) ||
      maxDays < 1 || maxDays > XMLTV_MAX_PREVIEW_DAYS) {
    throw new TypeError('Invalid bounded reviewed XMLTV horizon')
  }

  const horizonEnd = now + maxDays * DAY
  const windows = new Map(STATIONS.map(id => [id, []]))
  let rejectedUnzoned = 0
  let ignoredInvalid = 0

  for (const entry of candidates) {
    if (entry?.sourceId !== sourceId ||
        !windows.has(entry?.canonicalStationId)) {
      ignoredInvalid++
      continue
    }
    if (entry.timestampsExplicitlyZoned !== true) {
      rejectedUnzoned++
      continue
    }
    const begin = utcInstant(entry.startAt)
    const end = utcInstant(entry.endAt)
    if (begin === null || end === null || end <= begin ||
        end - begin > MAX_EVENT_LENGTH || end <= now || begin >= horizonEnd) {
      ignoredInvalid++
      continue
    }
    windows.get(entry.canonicalStationId).push([
      Math.max(now, begin), Math.min(horizonEnd, end),
    ])
  }

  const stations = {}
  for (const stationId of STATIONS) {
    const intervals = windows.get(stationId)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let covered = 0
    let cursor = now
    let latest = now
    let longestGap = 0
    for (const [start, end] of intervals) {
      if (start > cursor) longestGap = Math.max(longestGap, start - cursor)
      if (end > cursor) {
        covered += end - Math.max(cursor, start)
        cursor = end
      }
      latest = Math.max(latest, end)
    }
    longestGap = Math.max(longestGap, horizonEnd - cursor)

    let continuousEnd = now
    for (const [start, end] of intervals) {
      if (start > continuousEnd) break
      continuousEnd = Math.max(continuousEnd, end)
    }
    stations[stationId] = {
      programmeIntervals: intervals.length,
      coveredMinutes: Math.floor(covered / MINUTE),
      continuousFromNowMinutes: Math.floor((continuousEnd - now) / MINUTE),
      latestProgrammeEndMinutes: Math.floor((latest - now) / MINUTE),
      longestGapMinutes: Math.ceil(longestGap / MINUTE),
      hasFutureProgramme: intervals.length > 0,
      // Quality observations only; NEVER eligibility prerequisites.
      completeFiveDaysFromNow: continuousEnd - now >= 5 * DAY,
      completeFourteenDaysFromNow: continuousEnd - now >= 14 * DAY,
    }
  }

  const usableStations = STATIONS.filter(id => stations[id].hasFutureProgramme).length
  return {
    kind: 'xmltv-available-horizon-preview',
    sourceId, contentFamily: XMLTV_VERIFIED_SOURCE_FAMILIES[sourceId],
    maxDays, reviewedStations: STATIONS.length, usableStations,
    hasAnyFutureProgramme: usableStations > 0,
    allStationsHaveFutureProgrammes: usableStations === STATIONS.length,
    fiveDaysIsQualityTargetNotEligibility: true,
    rejectedUnzoned, ignoredInvalid, stations,
    publishApproved: false,
    tmdbIdentityApproved: false,
    playbackRoutesApproved: false,
  }
}
