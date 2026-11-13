/**
 * #336 G2c: real but NON-PUBLISHING XMLTV source-generation staging.
 *
 * Use the existing reviewed XMLTV parser's ORIGINAL candidate fields; never
 * manufacture a TMDB work identity, programme entitlement or AIR route here.
 * Each source is its own generation, even when two hosts share content.
 * Source-specific horizons of two, three or fewer days remain useful.
 */
import { XMLTV_REVIEWED_STATIONS, reviewedXmltvStation } from './xmltvStationMappings.js'
import { XMLTV_VERIFIED_SOURCE_FAMILIES } from './xmltvSourceReadiness.js'
import { measureXmltvAvailableHorizon } from './xmltvAvailableHorizon.js'

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const MAX_CANDIDATES = 250_000
const MAX_OBSERVATION_AGE_MS = 36 * HOUR
const STATIONS = Object.freeze(XMLTV_REVIEWED_STATIONS.map(s => s.stationId))
const SOURCE_IDS = Object.freeze(Object.keys(XMLTV_VERIFIED_SOURCE_FAMILIES))
const instant = s => {
  if (typeof s !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(s)) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function validProvenance(row, sourceId, observedAt) {
  if (row?.kind !== 'xmltv-candidate' ||
    row.sourceId !== sourceId ||
    row.stationMappingStatus !== 'mapped' ||
    !STATIONS.includes(row.canonicalStationId) ||
    typeof row.sourceStationId !== 'string' ||
    row.sourceStationId.length < 1 || row.sourceStationId.length > 200 ||
    typeof row.stationName !== 'string' || !row.stationName.trim() ||
    typeof row.title !== 'string' || !row.title.trim() ||
    row.title.length > 12_000 ||
    row.timestampsExplicitlyZoned !== true) return false

  // Caller-independent identity check. A forged candidate must not claim
  // ZDF sourceStationId while borrowing ARD's canonical channel identity.
  const mapped = reviewedXmltvStation(sourceId, row.sourceStationId)
  if (!mapped || mapped.stationId !== row.canonicalStationId ||
      mapped.stationName !== row.stationName) return false
  const ref = row.sourceRef
  if (ref?.sourceId !== 'xmltv:' + sourceId ||
    ref.observedAt !== observedAt ||
    ref.expiresAt !== row.endAt ||
    ref.externalId !== [
      row.sourceStationId, row.startAt, row.endAt, row.title,
    ].join('|')) return false
  return true
}

/**
 * PRIVATE snapshot: actual original programmes, not just statistics.
 * A 5-day or 14-day minimum is NEVER imposed. Do not serialize snapshots in
 * public artifacts, logs, Firebase, the app, or the normal Nightly pipeline.
 */
export function buildXmltvPrivateSourceGeneration(parsed, {
  now = Date.now(), maxDays = 14,
} = {}) {
  const sourceId = parsed?.sourceId
  const observed = instant(parsed?.observedAt)
  if (!SOURCE_IDS.includes(sourceId) ||
    !Number.isFinite(now) || !Number.isInteger(maxDays) ||
    maxDays < 1 || maxDays > 14 ||
    observed === null || observed > now ||
    now - observed > MAX_OBSERVATION_AGE_MS ||
    !Array.isArray(parsed?.candidates) ||
    parsed.candidates.length > MAX_CANDIDATES) {
    throw new TypeError('Invalid or stale reviewed XMLTV staging source')
  }

  const until = now + maxDays * DAY
  const records = []
  let rejected = 0
  for (const row of parsed.candidates) {
    const begin = instant(row?.startAt)
    const end = instant(row?.endAt)
    if (!validProvenance(row, sourceId, parsed.observedAt) ||
      begin === null || end === null || end <= begin ||
      end - begin > 36 * HOUR || end <= now || begin >= until) {
      rejected++
      continue
    }
    // Explicit whitelist; any untrusted extra matcher result or playback URL
    // attached to an input candidate is NOT inherited into staging.
    records.push({
      kind: 'xmltv-candidate',
      sourceId,
      sourceStationId: row.sourceStationId,
      canonicalStationId: row.canonicalStationId,
      stationName: row.stationName,
      stationMappingStatus: 'mapped',
      title: row.title,
      titleLanguage: row.titleLanguage ?? null,
      subtitle: row.subtitle ?? null,
      description: row.description ?? null,
      categories: Array.isArray(row.categories) ? row.categories : [],
      episode: row.episode ?? null,
      episodeEvidence: Array.isArray(row.episodeEvidence) ? row.episodeEvidence : [],
      productionYearEvidence: row.productionYearEvidence ?? null,
      startAt: row.startAt,
      endAt: row.endAt,
      timestampsExplicitlyZoned: true,
      // Original times remain untouched for identity/provenance. Only the
      // candidate's possible display interval is clipped to 14 days.
      previewStartAt: new Date(Math.max(now, begin)).toISOString(),
      previewEndAt: new Date(Math.min(until, end)).toISOString(),
      sourceRef: {
        sourceId: refSourceId(sourceId),
        externalId: row.sourceRef.externalId,
        observedAt: parsed.observedAt,
        expiresAt: row.endAt,
      },
    })
  }

  records.sort((a, b) =>
    a.startAt.localeCompare(b.startAt) ||
    a.canonicalStationId.localeCompare(b.canonicalStationId) ||
    a.sourceStationId.localeCompare(b.sourceStationId) ||
    a.title.localeCompare(b.title))
  const stationCounts = Object.fromEntries(STATIONS.map(id => [
    id, records.filter(r => r.canonicalStationId === id).length,
  ]))
  const coverage = measureXmltvAvailableHorizon(records, {
    sourceId, now, maxDays,
  })

  return {
    kind: 'xmltv-private-source-staging',
    schemaVersion: 1,
    sourceId,
    contentFamily: XMLTV_VERIFIED_SOURCE_FAMILIES[sourceId],
    observedAt: parsed.observedAt,
    sourceGenerationId: refSourceId(sourceId) + ':' + parsed.observedAt,
    previewFrom: new Date(now).toISOString(),
    previewUntil: new Date(until).toISOString(),
    maxDays,
    originalProvenancePreserved: true,
    stagedProgrammes: records.length,
    rejectedOrOutsideWindow: rejected,
    stationCounts,
    coverage,
    records,
    // Not a publisher and not a source-health, rights or matcher approval.
    publishApproved: false,
    tmdbIdentityApproved: false,
    playbackRoutesApproved: false,
    reuseRightsApproved: false,
  }
}

function refSourceId(sourceId) { return 'xmltv:' + sourceId }
