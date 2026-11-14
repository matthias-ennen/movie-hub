/**
 * #336 G2j - PRIVATE, read-only EPG source -> matcher -> shared-airing merge.
 *
 * This is a technical integration rehearsal only. Original XMLTV candidates
 * and merged sourceRefs (whose externalId includes a title) NEVER leave this
 * function. Only an allowlisted numerical report is returned. No files,
 * Firebase, TMDB HTTP, playback routes, Nightly or cloud checkpoints here.
 *
 * The same original G2d full-generation validator is authoritative for
 * station-specific current/LKG selection. A shorter current horizon is kept;
 * an older generation may fill only a station with no current coverage.
 */
import { XMLTV_REVIEWED_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'
import {
  replayXmltvPrivateLkg, isSafeXmltvG2dReplayReport,
} from '../src/sources/xmltv/xmltvPrivateLkgReplay.js'
import {
  matchXmltvLocalCandidates, mergeConfirmedXmltvAirings,
} from './xmltv-g1b-match-preview.mjs'

const DAY = 86_400_000
const MATCH_BATCH_SIZE = 2_000
const MAX_PRIVATE_QA_CANDIDATES = 20_000
const MAX_EXISTING_AIRINGS = 50_000

/**
 * Returns anonymous QA counts, never candidates, titles or merged broadcasts.
 * An explicit local resolver is required; the original matcher receives
 * searchTmdb=null and loadTmdbDetails=null, so this module initiates no API.
 */
export async function runXmltvG2jPrivateIntegrationPreview(sources, {
  now = Date.now(),
  localCandidatesFor,
  waipuAirings = [],
  joynAirings = [],
  maxCandidates = MAX_PRIVATE_QA_CANDIDATES,
} = {}) {
  if (!Number.isFinite(now) || typeof localCandidatesFor !== 'function' ||
      !Number.isSafeInteger(maxCandidates) || maxCandidates < 1 ||
      maxCandidates > MAX_PRIVATE_QA_CANDIDATES ||
      !Array.isArray(waipuAirings) || !Array.isArray(joynAirings) ||
      waipuAirings.length > MAX_EXISTING_AIRINGS ||
      joynAirings.length > MAX_EXISTING_AIRINGS) {
    throw new TypeError('Invalid bounded private XMLTV integration input')
  }

  // Mandatory source, generation, provenance, clock and chronology validation.
  // Do not infer a valid source from a matching title or an old coverage label.
  const replay = replayXmltvPrivateLkg(sources, { now })
  if (!isSafeXmltvG2dReplayReport(replay)) {
    throw new TypeError('Unsafe private XMLTV source selection')
  }

  const allConfirmedEvents = []
  const sourceCounts = []
  let totalSelected = 0
  let totalMatched = 0
  let totalRejected = 0

  for (const status of replay.sources) {
    const input = sources.find(item => item.sourceId === status.sourceId)
    const selected = []
    let selectedCurrent = 0
    let selectedLkg = 0
    for (const { stationId } of XMLTV_REVIEWED_STATIONS) {
      const mode = status.byStation[stationId].mode
      const generation = mode === 'current' ? input.current
        : mode === 'last-known-good' ? input.lastKnownGood : null
      if (!generation) continue

      // G2d has fully validated all fields of the selected generation.
      // Keep the raw start/end/provenance intact for the original matcher.
      // Recompute future eligibility at this run's clock, no stale airing.
      for (const row of generation.records) {
        if (row.canonicalStationId !== stationId ||
            Date.parse(row.endAt) <= now ||
            Date.parse(row.startAt) >= now + 14 * DAY) continue
        if (++totalSelected > maxCandidates) {
          throw new RangeError('Private XMLTV integration candidate budget exceeded')
        }
        selected.push(row)
        if (mode === 'current') selectedCurrent++
        else selectedLkg++
      }
    }

    let matched = 0
    let rejected = 0
    for (let offset = 0; offset < selected.length; offset += MATCH_BATCH_SIZE) {
      const batch = await matchXmltvLocalCandidates(
        selected.slice(offset, offset + MATCH_BATCH_SIZE), {
          localCandidatesFor, maxCandidates: MATCH_BATCH_SIZE,
        },
      )
      matched += batch.counts.accepted
      rejected += batch.counts.rejected
      // Do not serialize raw candidates or matched events into any report.
      allConfirmedEvents.push(...batch.confirmedEvents)
    }
    totalMatched += matched
    totalRejected += rejected
    sourceCounts.push({
      sourceId: status.sourceId,
      selectedCurrent,
      selectedLastKnownGood: selectedLkg,
      locallyMatched: matched,
      locallyUnmatched: rejected,
      currentStations: status.currentStations,
      restoredStations: status.restoredStations,
      unavailableStations: status.unavailableStations,
    })
  }

  // Exercise the actual MovieHub Waipu/Joyn/XMLTV deduplicator, but only in
  // memory. Existing providers/routes can be preserved by that merge; XMLTV
  // creates none, and the merged records are never returned or persisted.
  const baseline = mergeConfirmedXmltvAirings(waipuAirings, joynAirings, [])
  const merged = mergeConfirmedXmltvAirings(
    waipuAirings, joynAirings, allConfirmedEvents,
  )
  return {
    kind: 'xmltv-g2j-private-integration-aggregate',
    schemaVersion: 1,
    mode: 'offline-ephemeral-no-publication',
    sources: sourceCounts,
    selectedOriginalCandidates: totalSelected,
    locallyMatched: totalMatched,
    locallyUnmatched: totalRejected,
    baselineMergedAirings: baseline.length,
    mergedAiringsWithXmltvPreview: merged.length,
    independentFamiliesWithFutureCoverage: replay.availableIndependentFamilies,
    stationsWithIndependentOverlap: replay.stationsWithIndependentOverlap,
    fiveDaysRequiredToKeepSource: false,
    durableOriginalCheckpointVerified: false,
    publishApproved: false,
    tmdbIdentityApproved: false,
    playbackRoutesApproved: false,
  }
}
