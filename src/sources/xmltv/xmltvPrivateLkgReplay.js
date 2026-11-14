/**
 * #336 G2d: source/station-specific, PRIVATE, read-only replay of actual G2c
 * original XMLTV staging generations. This is NOT a durable checkpoint store.
 *
 * Preserve each source's original programme provenance. A missing/partial
 * current source may use a verified <=36h old source-specific generation,
 * independently by station, with coverage always recalculated at replay time.
 * No TMDB matching, rights approval, AIR links, publishing or network access.
 */
import { XMLTV_REVIEWED_STATIONS, reviewedXmltvStation } from './xmltvStationMappings.js'
import { XMLTV_VERIFIED_SOURCE_FAMILIES } from './xmltvSourceReadiness.js'
import { measureXmltvAvailableHorizon } from './xmltvAvailableHorizon.js'
import { XMLTV_LKG_MAX_AGE_MS } from './xmltvLastKnownGoodPreview.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const MAX_RECORDS = 250_000
const STATIONS = Object.freeze(XMLTV_REVIEWED_STATIONS.map(s => s.stationId))
const SOURCES = Object.freeze(Object.keys(XMLTV_VERIFIED_SOURCE_FAMILIES))
const MODES = new Set(['current', 'last-known-good', 'unavailable'])
const RECORD_KEYS = [
  'kind', 'sourceId', 'sourceStationId', 'canonicalStationId', 'stationName',
  'stationMappingStatus', 'title', 'titleLanguage', 'subtitle', 'description',
  'categories', 'episode', 'episodeEvidence', 'productionYearEvidence',
  'startAt', 'endAt', 'timestampsExplicitlyZoned', 'previewStartAt',
  'previewEndAt', 'sourceRef',
]
const REF_KEYS = ['sourceId', 'externalId', 'observedAt', 'expiresAt']
const keysEqual = (obj, names) =>
  obj !== null && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).sort().join('|') === [...names].sort().join('|')
const utc = s => {
  if (typeof s !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(s)) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

/** Strictly revalidate actual serialized G2c source records before replay. */
function inspect(sourceId, generation, now) {
  const observed = utc(generation?.observedAt)
  const from = utc(generation?.previewFrom)
  const until = utc(generation?.previewUntil)
  if (generation?.kind !== 'xmltv-private-source-staging' ||
      generation.schemaVersion !== 1 ||
      generation.sourceId !== sourceId ||
      generation.contentFamily !== XMLTV_VERIFIED_SOURCE_FAMILIES[sourceId] ||
      generation.originalProvenancePreserved !== true ||
      generation.publishApproved !== false ||
      generation.tmdbIdentityApproved !== false ||
      generation.playbackRoutesApproved !== false ||
      generation.reuseRightsApproved !== false ||
      !Number.isInteger(generation.maxDays) ||
      generation.maxDays < 1 || generation.maxDays > 14 ||
      observed === null || from === null || until === null ||
      observed > now || now - observed > XMLTV_LKG_MAX_AGE_MS ||
      from < observed || from - observed > HOUR ||
      until - from !== generation.maxDays * DAY ||
      generation.sourceGenerationId !== 'xmltv:' + sourceId + ':' + generation.observedAt ||
      !Array.isArray(generation.records) ||
      generation.records.length === 0 ||
      generation.records.length > MAX_RECORDS ||
      generation.stagedProgrammes !== generation.records.length ||
      !keysEqual(generation.stationCounts, STATIONS)) return null

  const counts = Object.fromEntries(STATIONS.map(id => [id, 0]))
  for (const row of generation.records) {
    if (!keysEqual(row, RECORD_KEYS) ||
        !keysEqual(row.sourceRef, REF_KEYS) ||
        row.kind !== 'xmltv-candidate' || row.sourceId !== sourceId ||
        row.stationMappingStatus !== 'mapped' ||
        row.timestampsExplicitlyZoned !== true ||
        typeof row.title !== 'string' || !row.title.trim() ||
        row.title.length > 12_000 ||
        typeof row.sourceStationId !== 'string' ||
        row.sourceStationId.length < 1 || row.sourceStationId.length > 200 ||
        !STATIONS.includes(row.canonicalStationId)) return null
    const mapped = reviewedXmltvStation(sourceId, row.sourceStationId)
    const start = utc(row.startAt)
    const end = utc(row.endAt)
    const previewStart = utc(row.previewStartAt)
    const previewEnd = utc(row.previewEndAt)
    if (!mapped || mapped.stationId !== row.canonicalStationId ||
        mapped.stationName !== row.stationName ||
        start === null || end === null || end <= start ||
        end - start > 36 * HOUR ||
        previewStart === null || previewEnd === null ||
        previewStart !== Math.max(from, start) ||
        previewEnd !== Math.min(until, end) ||
        previewStart >= previewEnd ||
        row.sourceRef.sourceId !== 'xmltv:' + sourceId ||
        row.sourceRef.observedAt !== generation.observedAt ||
        row.sourceRef.expiresAt !== row.endAt ||
        row.sourceRef.externalId !== [
          row.sourceStationId, row.startAt, row.endAt, row.title,
        ].join('|')) return null
    counts[row.canonicalStationId]++
  }
  if (STATIONS.some(id => generation.stationCounts[id] !== counts[id])) return null
  try {
    // Do NOT use generation.coverage: it describes a historical clock.
    return measureXmltvAvailableHorizon(generation.records, { sourceId, now })
  } catch {
    return null
  }
}

// Backup minutes must overlap IN TIME across different programme families.
// Merely having two feeds somewhere in the next 120h is not a live failover.
const OVERLAP_HORIZON_MS = 120 * HOUR
const MINUTE = 60_000
function independentOverlapMinutes(detailed, stationId, now) {
  const windowsByFamily = new Map()
  for (const { status, windowsByStation } of detailed) {
    const windows = windowsByStation[stationId]
    if (!windows.length) continue
    if (!windowsByFamily.has(status.contentFamily)) {
      windowsByFamily.set(status.contentFamily, [])
    }
    windowsByFamily.get(status.contentFamily).push(...windows)
  }
  const changes = new Map()
  const change = (time, count) => changes.set(time, (changes.get(time) || 0) + count)
  for (const windows of windowsByFamily.values()) {
    // Each content family contributes at most one vote per instant, even
    // when two hosts carry the same schedule or programme intervals overlap.
    windows.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let start = null
    let end = null
    const flush = () => {
      if (start !== null) { change(start, 1); change(end, -1) }
    }
    for (const [a, b] of windows) {
      if (start === null) { start = a; end = b }
      else if (a <= end) end = Math.max(end, b)
      else { flush(); start = a; end = b }
    }
    flush()
  }
  let activeFamilies = 0
  let prev = now
  let overlapMs = 0
  for (const [time, delta] of [...changes].sort((a, b) => a[0] - b[0])) {
    if (activeFamilies >= 2) overlapMs += time - prev
    activeFamilies += delta
    prev = time
  }
  return Math.floor(overlapMs / MINUTE)
}

// G2h: report, but DO NOT automatically publish, old same-source intervals
// that are absent from a shorter current generation. This audit covers the
// full 14-day permissible horizon; it is NOT a licence or a fallback approval.
const AUDIT_HORIZON_MS = 14 * DAY
function mergedStationIntervals(generation, stationId, now) {
  const intervals = []
  if (!generation) return intervals
  for (const row of generation.records) {
    if (row.canonicalStationId !== stationId) continue
    const a = Math.max(now, Date.parse(row.startAt))
    const b = Math.min(now + AUDIT_HORIZON_MS, Date.parse(row.endAt))
    if (b > a) intervals.push([a, b])
  }
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const union = []
  for (const [start, end] of intervals) {
    const last = union.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else union.push([start, end])
  }
  return union
}

function unpublishedLkgOnlyMinutes(currentGeneration, lkgGeneration, stationId, now) {
  const live = mergedStationIntervals(currentGeneration, stationId, now)
  const prior = mergedStationIntervals(lkgGeneration, stationId, now)
  let uncoveredMs = 0
  let j = 0
  for (const [from, until] of prior) {
    let cursor = from
    while (j < live.length && live[j][1] <= cursor) j++
    let k = j
    while (k < live.length && live[k][0] < until) {
      if (live[k][0] > cursor) uncoveredMs += live[k][0] - cursor
      cursor = Math.max(cursor, live[k][1])
      if (cursor >= until) break
      k++
    }
    if (cursor < until) uncoveredMs += until - cursor
  }
  return Math.floor(uncoveredMs / MINUTE)
}

function replayOne(source, now) {
  const sourceId = source?.sourceId
  if (!SOURCES.includes(sourceId)) throw new TypeError('Unreviewed XMLTV replay source')
  const current = inspect(sourceId, source.current, now)
  const previous = inspect(sourceId, source.lastKnownGood, now)
  const byStation = {}
  const windowsByStation = Object.fromEntries(STATIONS.map(id => [id, []]))
  for (const id of STATIONS) {
    const live = current?.stations[id]
    const lkg = previous?.stations[id]
    const useLive = Boolean(live?.coveredMinutes > 0)
    const useLkg = !useLive && Boolean(lkg?.coveredMinutes > 0)
    const selected = useLive ? live : useLkg ? lkg : null
    byStation[id] = {
      mode: useLive ? 'current' : useLkg ? 'last-known-good' : 'unavailable',
      coveredMinutes: selected?.coveredMinutes ?? 0,
      completeFiveDaysFromNow: selected?.completeFiveDaysFromNow ?? false,
      // Potential extra LKG time never selected or published when a current
      // partial feed exists. Old programmes might have been withdrawn.
      unpublishedLkgOnlyMinutes: useLive && lkg?.coveredMinutes > 0
        ? unpublishedLkgOnlyMinutes(source.current, source.lastKnownGood, id, now)
        : 0,
    }
    // inspect() has already revalidated the ENTIRE generation, its station
    // mapping, timestamps and original provenance before it can be selected.
    const generation = useLive ? source.current : useLkg ? source.lastKnownGood : null
    if (generation) {
      for (const row of generation.records) {
        if (row.canonicalStationId !== id) continue
        const start = Math.max(now, Date.parse(row.startAt))
        const end = Math.min(now + OVERLAP_HORIZON_MS, Date.parse(row.endAt))
        if (end > start) windowsByStation[id].push([start, end])
      }
    }
  }
  const decisions = Object.values(byStation)
  return { windowsByStation, status: {
    sourceId, contentFamily: XMLTV_VERIFIED_SOURCE_FAMILIES[sourceId],
    currentStations: decisions.filter(s => s.mode === 'current').length,
    restoredStations: decisions.filter(s => s.mode === 'last-known-good').length,
    unavailableStations: decisions.filter(s => s.mode === 'unavailable').length,
    stationsWithUnpublishedLkgOnlyMinutes:
      decisions.filter(s => s.unpublishedLkgOnlyMinutes > 0).length,
    byStation,
  } }
}

/**
 * Exposes ONLY verified source IDs and bounded numerical QA, never programme
 * titles, external IDs, original URLs or private snapshot fields.
 */
export function replayXmltvPrivateLkg(sources, { now = Date.now() } = {}) {
  if (!Array.isArray(sources) || sources.length < 1 ||
      sources.length > SOURCES.length || !Number.isFinite(now)) {
    throw new TypeError('Invalid bounded XMLTV replay')
  }
  const seen = new Set()
  const detailed = sources.map(source => {
    if (seen.has(source?.sourceId)) throw new TypeError('Duplicate XMLTV replay source')
    seen.add(source?.sourceId)
    return replayOne(source, now)
  })
  const statuses = detailed.map(item => item.status)
  const independentOverlapMinutesByStation = Object.fromEntries(
    STATIONS.map(id => [id, independentOverlapMinutes(detailed, id, now)]))
  const independentFamiliesByStation = Object.fromEntries(STATIONS.map(id => [
    id, new Set(statuses.filter(s => s.byStation[id].coveredMinutes > 0)
      .map(s => s.contentFamily)).size,
  ]))
  const availableFamilies = new Set(statuses.flatMap(s =>
    Object.values(s.byStation).some(x => x.coveredMinutes > 0)
      ? [s.contentFamily] : []))
  const report = {
    kind: 'xmltv-g2d-private-lkg-replay-aggregate',
    schemaVersion: 1,
    mode: 'same-run-offline-no-publication',
    sources: statuses,
    independentFamiliesByStation,
    availableIndependentFamilies: availableFamilies.size,
    stationsWithIndependentFallback:
      STATIONS.filter(id => independentFamiliesByStation[id] >= 2).length,
    // Distinct from "two sources exist": actual overlapping future minutes
    // only, from validated original programme intervals, in a 120h window.
    independentOverlapMinutesByStation,
    stationsWithIndependentOverlap: STATIONS.filter(id =>
      independentOverlapMinutesByStation[id] > 0).length,
    restoredStationDecisions:
      statuses.reduce((sum, s) => sum + s.restoredStations, 0),
    fiveDaysRequiredToKeepSource: false,
    durableCheckpointVerified: false,
    publishApproved: false,
    tmdbIdentityApproved: false,
    playbackRoutesApproved: false,
    reuseRightsApproved: false,
  }
  if (!isSafeXmltvG2dReplayReport(report)) throw new TypeError('Unsafe replay report')
  return report
}

export function isSafeXmltvG2dReplayReport(report) {
  if (!keysEqual(report, [
    'kind', 'schemaVersion', 'mode', 'sources',
    'independentFamiliesByStation', 'availableIndependentFamilies',
    'stationsWithIndependentFallback', 'restoredStationDecisions',
    'independentOverlapMinutesByStation', 'stationsWithIndependentOverlap',
    'fiveDaysRequiredToKeepSource', 'durableCheckpointVerified',
    'publishApproved', 'tmdbIdentityApproved',
    'playbackRoutesApproved', 'reuseRightsApproved',
  ]) || report.kind !== 'xmltv-g2d-private-lkg-replay-aggregate' ||
      report.schemaVersion !== 1 || report.mode !== 'same-run-offline-no-publication' ||
      report.fiveDaysRequiredToKeepSource !== false ||
      report.durableCheckpointVerified !== false ||
      report.publishApproved !== false ||
      report.tmdbIdentityApproved !== false ||
      report.playbackRoutesApproved !== false ||
      report.reuseRightsApproved !== false ||
      !Array.isArray(report.sources) || report.sources.length < 1 ||
      report.sources.length > SOURCES.length ||
      !keysEqual(report.independentFamiliesByStation, STATIONS) ||
      !keysEqual(report.independentOverlapMinutesByStation, STATIONS)) return false

  const seen = new Set()
  let restored = 0
  for (const source of report.sources) {
    if (!keysEqual(source, [
      'sourceId', 'contentFamily', 'currentStations', 'restoredStations',
      'unavailableStations', 'stationsWithUnpublishedLkgOnlyMinutes', 'byStation',
    ]) || !SOURCES.includes(source.sourceId) || seen.has(source.sourceId) ||
        source.contentFamily !== XMLTV_VERIFIED_SOURCE_FAMILIES[source.sourceId] ||
        !keysEqual(source.byStation, STATIONS)) return false
    seen.add(source.sourceId)
    for (const id of STATIONS) {
      const station = source.byStation[id]
      if (!keysEqual(station, [
        'mode', 'coveredMinutes', 'completeFiveDaysFromNow',
        'unpublishedLkgOnlyMinutes',
      ]) ||
          !MODES.has(station.mode) ||
          !Number.isSafeInteger(station.coveredMinutes) ||
          station.coveredMinutes < 0 || station.coveredMinutes > 14 * 24 * 60 ||
          !Number.isSafeInteger(station.unpublishedLkgOnlyMinutes) ||
          station.unpublishedLkgOnlyMinutes < 0 ||
          station.unpublishedLkgOnlyMinutes > 14 * 24 * 60 ||
          (station.mode !== 'current' && station.unpublishedLkgOnlyMinutes !== 0) ||
          typeof station.completeFiveDaysFromNow !== 'boolean' ||
          (station.mode === 'unavailable' &&
            (station.coveredMinutes !== 0 || station.completeFiveDaysFromNow)) ||
          (station.mode !== 'unavailable' && station.coveredMinutes === 0) ||
          (station.completeFiveDaysFromNow && station.coveredMinutes < 5 * 24 * 60)) {
        return false
      }
    }
    const modes = Object.values(source.byStation).map(x => x.mode)
    const count = mode => modes.filter(x => x === mode).length
    if (source.currentStations !== count('current') ||
        source.restoredStations !== count('last-known-good') ||
        source.unavailableStations !== count('unavailable') ||
        source.stationsWithUnpublishedLkgOnlyMinutes !==
          Object.values(source.byStation).filter(x =>
            x.unpublishedLkgOnlyMinutes > 0).length) return false
    restored += source.restoredStations
  }
  const counts = STATIONS.map(id =>
    new Set(report.sources.filter(s => s.byStation[id].coveredMinutes > 0)
      .map(s => s.contentFamily)).size)
  if (STATIONS.some((id, i) => report.independentFamiliesByStation[id] !== counts[i])) return false
  const families = new Set(report.sources.filter(s =>
    Object.values(s.byStation).some(x => x.coveredMinutes > 0))
    .map(s => s.contentFamily))
  if (STATIONS.some(id =>
    !Number.isSafeInteger(report.independentOverlapMinutesByStation[id]) ||
    report.independentOverlapMinutesByStation[id] < 0 ||
    report.independentOverlapMinutesByStation[id] > 120 * 60 ||
    (report.independentFamiliesByStation[id] < 2 &&
      report.independentOverlapMinutesByStation[id] !== 0))) return false
  return report.availableIndependentFamilies === families.size &&
    report.stationsWithIndependentFallback === counts.filter(n => n >= 2).length &&
    report.stationsWithIndependentOverlap === STATIONS.filter(id =>
      report.independentOverlapMinutesByStation[id] > 0).length &&
    report.stationsWithIndependentOverlap <= report.stationsWithIndependentFallback &&
    report.restoredStationDecisions === restored &&
    JSON.stringify(report).length < 4800
}
