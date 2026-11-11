/**
 * #336 G1b – strictly offline, reviewable XMLTV matching and merge preparation.
 *
 * Reuses the production Joyn/TMDB matcher decision logic. There is no remote
 * search, no unbounded API work, no provider/stream-link inference and no
 * publication. The caller supplies a local catalog candidate resolver.
 */
import { matchJoynProgram } from './joyn-tmdb-matcher.mjs'
import { projectConfirmedXmltvBroadcastEvent } from '../src/sources/xmltv/xmltvCandidates.js'
import { normalizeSourceEnvelope, SOURCE_ADAPTER_CONTRACT_VERSION } from '../src/sources/sourceAdapterContract.js'
import { mergeTvAirings } from '../src/sources/mergeTvAirings.js'

const text = (value) => String(value ?? '').trim()
const FILM_CATEGORIES = new Set(['film', 'spielfilm', 'fernsehfilm', 'movie', 'feature film', 'kinofilm'])
const SERIES_CATEGORIES = new Set(['serie', 'serien', 'series', 'tv-serie', 'fernsehserie', 'tv series'])
const MAX_PROBE_CANDIDATES = 2_000

export function inferXmltvMediaType(candidate) {
  const categories = new Set((Array.isArray(candidate?.categories) ? candidate.categories : [])
    .map((value) => text(value).toLocaleLowerCase('de')))
  const movie = [...categories].some((category) => FILM_CATEGORIES.has(category))
  const series = Boolean(candidate?.episode) ||
    [...categories].some((category) => SERIES_CATEGORIES.has(category))
  if (movie && series) return null
  if (movie) return 'movie'
  if (series) return 'series'
  return null
}

function basicDiagnostic(candidate, reason) {
  return {
    sourceId: candidate?.sourceId || null,
    sourceStationId: candidate?.sourceStationId || null,
    canonicalStationId: candidate?.canonicalStationId || null,
    title: candidate?.title || null,
    reason,
  }
}

/**
 * Run the EXISTING Joyn matcher on a bounded set of locally known TMDB candidates.
 * Do not call external TMDB search from this stage. Unclear/fuzzy matches stay
 * as diagnostics and are not accepted as events.
 */
export async function matchXmltvLocalCandidates(candidates, {
  localCandidatesFor,
  maxCandidates = MAX_PROBE_CANDIDATES,
  matchProgram = matchJoynProgram,
} = {}) {
  if (typeof localCandidatesFor !== 'function') {
    throw new TypeError('G1b requires an explicit local TMDB candidate resolver')
  }
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 ||
      maxCandidates > MAX_PROBE_CANDIDATES) throw new RangeError('Invalid G1b candidate limit')
  if (typeof matchProgram !== 'function') throw new TypeError('Invalid existing TMDB matcher')
  const input = Array.isArray(candidates) ? candidates : []
  if (input.length > maxCandidates) throw new RangeError('G1b input exceeds bounded candidate limit')
  const decisions = []
  const confirmedEvents = []
  for (const candidate of input) {
    if (candidate?.kind !== 'xmltv-candidate') {
      decisions.push(basicDiagnostic(candidate, 'invalid_candidate'))
      continue
    }
    if (candidate.stationMappingStatus !== 'mapped' || !candidate.canonicalStationId) {
      decisions.push(basicDiagnostic(candidate, 'unmapped_station'))
      continue
    }
    if (candidate.timestampsExplicitlyZoned !== true) {
      decisions.push(basicDiagnostic(candidate, 'ambiguous_timezone'))
      continue
    }
    const type = inferXmltvMediaType(candidate)
    if (!type) {
      decisions.push(basicDiagnostic(candidate, 'unclassified_media'))
      continue
    }
    const local = await localCandidatesFor(candidate, type)
    const library = Array.isArray(local) ? local : []
    if (!library.length) {
      decisions.push(basicDiagnostic(candidate, 'no_local_tmdb_candidates'))
      continue
    }
    const durationMinutes = (Date.parse(candidate.endAt) - Date.parse(candidate.startAt)) / 60_000
    const match = await matchProgram({
      title: candidate.title, type,
      description: candidate.description,
      seasonNumber: candidate.episode?.seasonNumber ?? null,
      episodeNumber: candidate.episode?.episodeNumber ?? null,
      broadcastDurationMinutes: durationMinutes,
    }, { localCandidates: library, searchTmdb: null, loadTmdbDetails: null })

    if (match?.status !== 'matched' || !match.match) {
      decisions.push({
        ...basicDiagnostic(candidate, match?.reason || 'tmdb_unmatched'),
        matcherStatus: match?.status || null,
      })
      continue
    }
    // Joyn's normal fuzzy threshold is valid for its verified inputs. For an
    // unclassified-community XMLTV feed, G1b publishes ONLY an exact, unique
    // typed local-title match. Soft matches remain candidates for human review.
    if (match.match.score !== 100 || match.match.type !== type) {
      decisions.push(basicDiagnostic(candidate, 'nonexact_match_requires_review'))
      continue
    }
    const event = projectConfirmedXmltvBroadcastEvent(candidate, {
      accepted: true, mediaType: type, tmdbId: match.match.tmdbId,
      // An exact title match is not a measured probability of work identity.
      confidence: null, reason: 'joyn-matcher-v' + match.matcherVersion + ':local-exact',
    })
    if (!event) {
      decisions.push(basicDiagnostic(candidate, 'projection_rejected'))
      continue
    }
    confirmedEvents.push(event)
    decisions.push({ ...basicDiagnostic(candidate, 'accepted'), tmdbId: event.titleRef.tmdbId,
      mediaType: type })
  }
  return {
    decisions, confirmedEvents,
    counts: {
      received: input.length, accepted: confirmedEvents.length,
      rejected: decisions.filter((decision) => decision.reason !== 'accepted').length,
      reasons: Object.fromEntries([...new Set(decisions.map((decision) => decision.reason))]
        .map((reason) => [reason, decisions.filter((item) => item.reason === reason).length])),
    },
  }
}

/** Existing common SourceEnvelope; each XMLTV source retains its own status. */
export function buildXmltvConfirmedEnvelope(sourceId, events, {
  generatedAt = new Date().toISOString(),
  fetchedAt = generatedAt,
} = {}) {
  const records = (Array.isArray(events) ? events : []).filter(Boolean)
  if (!records.every((event) => (event.sourceRefs || [])
    .some((ref) => ref.sourceId === 'xmltv:' + sourceId))) {
    throw new TypeError('XMLTV envelope cannot include another source without provenance')
  }
  const latest = Math.max(0, ...records.map((record) => Date.parse(record.endAt)).filter(Number.isFinite))
  return normalizeSourceEnvelope({
    contractVersion: SOURCE_ADAPTER_CONTRACT_VERSION,
    sourceId: 'xmltv:' + sourceId,
    sourceGenerationId: 'xmltv:' + sourceId + ':' + generatedAt,
    generatedAt, fetchedAt, expiresAt: latest ? new Date(latest).toISOString() : null,
    sourceStatus: records.length ? 'healthy' : 'degraded',
    sourceCoverage: { matchedEventCount: records.length },
    extensions: { xmltv: { sourceId, matchedEventCount: records.length } },
    records,
  })
}

/** No XMLTV station/provider badge yet; only matched EPG programme evidence. */
export function projectXmltvAiring(event) {
  if (event?.kind !== 'broadcast' || !event?.titleRef?.tmdbId ||
      !(event?.sourceRefs || []).some((ref) => text(ref.sourceId).startsWith('xmltv:'))) return null
  return {
    source: 'xmltv',
    type: event.titleRef.mediaType,
    tmdbId: event.titleRef.tmdbId,
    stationId: event.channelId,
    canonicalStationId: event.channelId,
    stationName: event.channelName,
    startTime: event.startAt,
    stopTime: event.endAt,
    episode: event.episode,
    sourceStationId: event.extensions?.xmltv?.sourceStationId || null,
    sourceStationIds: [event.extensions?.xmltv?.sourceStationId].filter(Boolean),
    sourceRefs: event.sourceRefs,
    providerIds: [],
    playbackRoutes: [],
  }
}

export function mergeConfirmedXmltvAirings(existingWaipu = [], existingJoyn = [], xmltvEvents = []) {
  const projected = (Array.isArray(xmltvEvents) ? xmltvEvents : [])
    .map(projectXmltvAiring).filter(Boolean)
  return mergeTvAirings(existingWaipu, existingJoyn, projected)
}
