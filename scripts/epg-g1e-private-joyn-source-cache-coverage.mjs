/**
 * #336 G1e — replay the ORIGINAL Joyn source/cache decision path, READ ONLY.
 *
 * The protected runner restores the PRIVATE Joyn checkpoint and decision cache
 * and the existing PUBLIC TMDB catalog. The ORIGINAL Joyn matcher is replayed
 * only against already local candidates, with its remote callbacks disabled.
 * No Joyn/Algolia/TMDB API calls are made and no raw programme/key/candidate
 * is logged, returned, persisted or uploaded.
 */
import { lstat, readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { joynV2Streams } from './joyn-epg-sync.mjs'
import { JoynMatchCache, JoynLookupCache, joynOriginalCacheKey, sharedJoynTmdbMetadata } from './joyn-match-cache.mjs'
import { JOYN_MATCHER_VERSION, matchJoynProgram } from './joyn-tmdb-matcher.mjs'
import { titleLookup } from './joyn-adapter-diagnostic.mjs'
import { localTmdbCandidates } from './waipu-live-catalog.mjs'
import { normalizeJoynLiveChannelsAndEpg } from '../src/sources/joyn/joynEpgNormalizer.js'
import { enrichJoynCandidatesWithV2 } from '../src/sources/joyn/joynEpgV2Enrichment.js'
import { buildJoynStationMapping } from './joyn-station-mapping.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { classifyJoynAlgoliaHits } from '../src/sources/joyn/joynAlgoliaClassifier.js'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WINDOWS = 56
const MAX_STREAMS = 250
const MAX_RAW_EVENTS = 350_000
const MAX_WINDOW_BYTES = 64 * 1024 * 1024
const MAX_CACHE_BYTES = 600 * 1024 * 1024
const MAX_PUBLIC_BYTES = 256 * 1024 * 1024
const MAX_JSON_COUNT = 250_000
const MAX_SOURCE_AGE = 72 * HOUR
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const integer = (x, max = MAX_JSON_COUNT) => Number.isSafeInteger(x) && x >= 0 && x <= max
const keysExactly = (x, allowed) => object(x) &&
  Object.keys(x).sort().join('|') === [...allowed].sort().join('|')

/**
 * Only the ORIGINAL exact Joyn SearchQ response, validated by its structural
 * evidence, can supply an offline type hint. Cache TTL and technical-failure
 * safeguards are applied separately by JoynLookupCache.get. This returns
 * only a fixed type or null: never an inferred/guessed TMDB identity.
 */
export function trustedCachedJoynSearchType(value, title) {
  const expected = normalizeWaipuText(title)
  if (!object(value) || value.reason !== 'exact_joyn_search' ||
      !['movie', 'series'].includes(value.type) ||
      !Array.isArray(value.exactTypes) || value.exactTypes.length !== 1 ||
      value.exactTypes[0] !== value.type ||
      !integer(value.exactCount, 10) || value.exactCount === 0 ||
      !Array.isArray(value.exactResults) ||
      value.exactResults.length !== value.exactCount || !expected) {
    return null
  }
  for (const hit of value.exactResults) {
    if (!object(hit) || hit.type !== value.type ||
        normalizeWaipuText(hit.title) !== expected ||
        (value.type === 'movie'
          ? hit.joynType !== 'Movie'
          : !['Series', 'Episode'].includes(hit.joynType))) {
      return null
    }
  }
  return value.type
}

/**
 * Diagnostic-only classification of a cached SearchQ result that did NOT
 * establish a single original Joyn type. Never infer a TMDB identity from
 * these buckets. Validate the original title and internal SearchQ consistency
 * before classifying any private cached response.
 */
export function classifyCachedJoynSearchWithoutType(value, title) {
  const expected = normalizeWaipuText(title)
  if (!expected || !object(value) || value.type !== null ||
      !Array.isArray(value.exactTypes) ||
      !Array.isArray(value.exactResults) ||
      !integer(value.exactCount, 10) ||
      value.exactResults.length !== value.exactCount) return 'other_or_invalid'
  const types = new Set()
  for (const hit of value.exactResults) {
    if (!object(hit) || normalizeWaipuText(hit.title) !== expected ||
        !['movie', 'series'].includes(hit.type) ||
        (hit.type === 'movie'
          ? hit.joynType !== 'Movie'
          : !['Series', 'Episode'].includes(hit.joynType))) return 'other_or_invalid'
    types.add(hit.type)
  }
  if (value.reason === 'no_joyn_type' &&
      value.exactCount === 0 && value.exactTypes.length === 0) return 'no_exact_type'
  if (value.reason === 'ambiguous_joyn_search' &&
      types.size === 2 && value.exactTypes.length === 2 &&
      value.exactTypes.includes('movie') && value.exactTypes.includes('series')) {
    return 'both_types'
  }
  return 'other_or_invalid'
}

function sourceHorizon(status, checkpoint, now) {
  if (!object(status) || status.kind !== 'joyn-sync-status' ||
      status.schemaVersion !== 1 || status.status !== 'complete' ||
      status.metrics?.windowsProcessed !== WINDOWS ||
      !object(checkpoint) || checkpoint.kind !== 'joyn-sync-checkpoint' ||
      checkpoint.schemaVersion !== 1 || !object(checkpoint.windows) ||
      Object.keys(checkpoint.windows).length !== WINDOWS ||
      !Array.isArray(status.coverage) || !status.coverage.length ||
      status.coverage.length > MAX_STREAMS) {
    throw new Error('Private source not fully validated')
  }
  const start = Date.parse(status.horizon?.start)
  const end = Date.parse(status.horizon?.endExclusive)
  const generated = Date.parse(status.generatedAt)
  if (![start, end, generated].every(Number.isFinite) ||
      end - start !== 14 * DAY || !Number.isFinite(now)) {
    throw new Error('Private source horizon invalid')
  }
  const unique = new Set()
  const streams = status.coverage.map(row => {
    const id = String(row?.id || '').trim()
    const title = String(row?.title || '').trim()
    if (!id || !title || unique.has(id)) throw new Error('Invalid private source inventory')
    unique.add(id)
    return { id, title }
  })
  const windows = []
  for (let from = start; from < end; from += 6 * HOUR) {
    const to = from + 6 * HOUR
    const key = `${from}_${to}`
    const previous = checkpoint.windows[key]
    if (!object(previous) || typeof previous.fetchedAt !== 'string' ||
        !integer(previous.count, MAX_RAW_EVENTS) ||
        typeof previous.inventory !== 'string') {
      throw new Error('Missing validated original window')
    }
    windows.push({ key, from, to, previous })
  }
  return {
    streams, windows, start, end,
    sourceRecent: generated <= now && now - generated <= MAX_SOURCE_AGE,
    horizonIncludesNow: start <= now && now < end,
  }
}

/**
 * Testable isolated ORIGINAL logic. The caller owns the private objects;
 * the only returned material is a small numeric, fixed-schema summary.
 */
export async function inspectJoynRestoredSourceCacheCoverage({
  status, checkpoint, windowRecords, matchCache, lookupCache = {
    kind: 'joyn-lookup-cache', schemaVersion: 1, entries: {},
  }, catalog, searchIndex,
  previousJoynTitles = { entries: [] }, waipuTitles = { entries: [] },
  now = Date.now(),
} = {}) {
  const horizon = sourceHorizon(status, checkpoint, now)
  if (!Array.isArray(windowRecords) ||
      windowRecords.length !== WINDOWS || !object(matchCache) ||
      matchCache.kind !== 'joyn-match-cache' || matchCache.schemaVersion !== 1 ||
      !object(matchCache.entries) ||
      Object.keys(matchCache.entries).length > MAX_JSON_COUNT ||
      !object(lookupCache) || lookupCache.kind !== 'joyn-lookup-cache' ||
      lookupCache.schemaVersion !== 1 || !object(lookupCache.entries) ||
      Object.keys(lookupCache.entries).length > MAX_JSON_COUNT ||
      !Array.isArray(catalog?.titles) || !Array.isArray(searchIndex?.entries)) {
    throw new Error('Missing or unbounded private original cache inputs')
  }
  const windowsByKey = new Map()
  let rawEvents = 0
  for (const window of windowRecords) {
    if (!object(window) || !integer(window.from, Number.MAX_SAFE_INTEGER) ||
        !integer(window.to, Number.MAX_SAFE_INTEGER) ||
        windowsByKey.has(`${window.from}_${window.to}`) ||
        !Array.isArray(window.items)) {
      throw new Error('Invalid private original source window')
    }
    rawEvents += window.items.length
    if (rawEvents > MAX_RAW_EVENTS) throw new RangeError('Private original source exceeds bounded events')
    windowsByKey.set(`${window.from}_${window.to}`, window)
  }
  const allItems = []
  for (const { key, from, to, previous } of horizon.windows) {
    const window = windowsByKey.get(key)
    if (!window || window.from !== from || window.to !== to ||
        window.fetchedAt !== previous.fetchedAt ||
        window.items.length !== previous.count) {
      throw new Error('Private window data disagree with original checkpoint')
    }
    allItems.push(...window.items)
  }

  // EXACT normalizer + V2 enrichment used by the original source matcher.
  // stationMapping needs only Joyn channel IDs/names, preserved by the
  // original status coverage. No invented or published program metadata.
  const sourceStreams = joynV2Streams(horizon.streams, allItems)
  const base = normalizeJoynLiveChannelsAndEpg({ liveStreams: sourceStreams })
  const enriched = enrichJoynCandidatesWithV2(base, {
    epgEventsV2: { items: allItems },
  }).entries
  const stationByJoynId = new Map(
    buildJoynStationMapping(horizon.streams).entries.map(x => [x.joynId, x]),
  )
  const uniquePrograms = new Map()
  for (const candidate of enriched) {
    const station = stationByJoynId.get(candidate.joynChannelId)
    if (!station || Date.parse(candidate.endTime) <= now) continue
    if (!uniquePrograms.has(candidate.joynProgramId)) {
      uniquePrograms.set(candidate.joynProgramId, candidate)
    }
  }

  const shared = sharedJoynTmdbMetadata([
    ...(Array.isArray(waipuTitles?.entries) ? waipuTitles.entries : []),
    ...(Array.isArray(previousJoynTitles?.entries) ? previousJoynTitles.entries : []),
  ])
  const local = localTmdbCandidates({ catalog, searchIndex, liveTitles: shared })
  const candidatesFor = titleLookup(local)
  const decisions = new JoynMatchCache(matchCache.entries, now)
  const privateSourceLookups = new JoynLookupCache(lookupCache.entries, now)

  let exactSourceKeyPresent = 0
  let exactKeyAbsent = 0
  let exactKeyRejectedByOriginalPolicy = 0
  let reusablePositiveDecisions = 0
  let reusableNegativeDecisions = 0
  // Distinct original cache KEYS measure the size of the unresolved search
  // space. Several programme IDs can share one exact, duration-aware key.
  // Hashes remain private in memory; only fixed aggregate counts are emitted.
  const keyOutcomes = new Map()
  const missingKeyRepresentatives = new Map()
  for (const candidate of uniquePrograms.values()) {
    const key = joynOriginalCacheKey(candidate)
    const hasKey = Object.hasOwn(matchCache.entries, key)
    if (hasKey) exactSourceKeyPresent++
    else exactKeyAbsent++
    const original = decisions.get(candidate, candidatesFor(candidate.title))
    const outcome = !hasKey ? 'absent'
      : !original ? 'rejected'
        : original.decision?.status === 'matched' ? 'positive' : 'negative'
    if (keyOutcomes.has(key) && keyOutcomes.get(key) !== outcome) {
      throw new Error('Inconsistent original cache key classification')
    }
    keyOutcomes.set(key, outcome)
    if (outcome === 'absent' && !missingKeyRepresentatives.has(key)) {
      missingKeyRepresentatives.set(key, candidate)
    }
    if (!original) {
      if (hasKey) exactKeyRejectedByOriginalPolicy++
      continue
    }
    if (outcome === 'positive') reusablePositiveDecisions++
    else reusableNegativeDecisions++
  }
  const unique = { absent: 0, rejected: 0, positive: 0, negative: 0 }
  for (const outcome of keyOutcomes.values()) unique[outcome]++
  const complete = uniquePrograms.size > 0 &&
    exactSourceKeyPresent === reusablePositiveDecisions +
      reusableNegativeDecisions + exactKeyRejectedByOriginalPolicy &&
    uniquePrograms.size === exactSourceKeyPresent + exactKeyAbsent &&
    keyOutcomes.size === unique.absent + unique.rejected + unique.positive + unique.negative &&
    unique.absent <= exactKeyAbsent &&
    unique.rejected <= exactKeyRejectedByOriginalPolicy &&
    unique.positive <= reusablePositiveDecisions &&
    unique.negative <= reusableNegativeDecisions
  if (!complete || decisions.hits !== reusablePositiveDecisions + reusableNegativeDecisions ||
      missingKeyRepresentatives.size !== unique.absent) {
    throw new Error('Original matcher counters inconsistent')
  }
  // Run the same LOCAL matcher call as the productive Joyn adapter, once per
  // distinct missing original hash. Explicitly omit searchTmdb and
  // loadTmdbDetails: no Joyn, TMDB, Algolia or other network operations.
  // Never persist representative programmes, hashes, decisions or TMDB IDs.
  let resolvedLocally = 0
  let unresolvedNoLocalCandidate = 0
  let unresolvedWithLocalCandidates = 0
  // Private normalized titles must never escape; only fixed aggregates may.
  const noLocalTitleCounts = new Map()
  // Per-normalized-title evidence is held only in memory: the source lookup
  // and Algolia cache remain subject to their ORIGINAL seven-day TTL.
  const noLocalCachedTypesByTitle = new Map()
  // A cache-only lower-complexity *first-pass* model. The original
  // WaipuTmdbSearchClient uses this exact year-free query key, but the
  // actual matcher can issue YEAR/FALLBACK/DETAIL/RETRY requests.
  // Never use these counts as a production HTTP budget or savings proof.
  const noLocalTmdbFirstPassCache = {
    uniqueTitleGroupsInspected: 0,
    movieOnlyGroups: 0,
    seriesOnlyGroups: 0,
    unknownOrConflictingGroups: 0,
    modelMovieSearchSlots: 0,
    modelSeriesSearchSlots: 0,
    modelTotalSearchSlots: 0,
    cachedReadySearchResponses: 0,
    cachedNonemptySearchResponses: 0,
    missingSearchResponses: 0,
    invalidCachedSearchResponses: 0,
    externalRequestsStarted: 0,
  }
  const noLocalCachedTypeEvidence = {
    uniqueNormalizedSourceTitlesInspected: 0,
    titleGroupsWithCachedJoynSearch: 0,
    titleGroupsWithCachedAlgoliaHits: 0,
    titleGroupsWithTrustedJoynType: 0,
    titleGroupsWithValidatedAlgoliaType: 0,
    titleGroupsWithOnlyMovieType: 0,
    titleGroupsWithOnlySeriesType: 0,
    titleGroupsWithConflictingTypes: 0,
    titleGroupsWithoutTrustedType: 0,
    externalRequestsStarted: 0,
  }
  const noLocalTitleGrouping = {
    missingOriginalKeysInspected: 0,
    uniqueNormalizedSourceTitles: 0,
    repeatedNormalizedTitleGroups: 0,
    duplicateOriginalKeysWithinTitleGroups: 0,
    originalKeysWithoutNormalizedTitle: 0,
    originalKeysWithSourceDescription: 0,
    originalKeysWithSecondaryTitle: 0,
    externalRequestsStarted: 0,
  }
  // Fixed, allowlisted reason counters only. Raw reason strings are NEVER
  // included in the output; unexpected matcher results fail closed.
  const unresolvedReasons = {
    noCandidateAboveMinimumScore: 0,
    belowAcceptanceScore: 0,
    ambiguousScoreMargin: 0,
    ambiguousExactTitle: 0,
  }
  const unresolvedContext = {
    exactlyOneLocalCandidate: 0,
    multipleLocalCandidates: 0,
    exactAmbiguityWithSourceDescription: 0,
    exactAmbiguityWithoutSourceDescription: 0,
  }
  const cachedAlgoliaReplay = {
    noExactJoynTypeInspected: 0,
    noValidCachedAlgoliaHits: 0,
    cachedAlgoliaInvalidResponse: 0,
    cachedAlgoliaNoValidatedHit: 0,
    cachedAlgoliaConflictingTypes: 0,
    cachedAlgoliaMovieType: 0,
    cachedAlgoliaSeriesType: 0,
    matchedAfterAlgoliaType: 0,
    stillUnresolvedAfterAlgoliaType: 0,
    stillAmbiguousExactTitle: 0,
    otherUnresolvedReasons: 0,
    externalRequestsStarted: 0,
  }
  const trustedTypeReplay = {
    ambiguousKeysInspected: 0,
    noValidCachedJoynSearch: 0,
    cachedSearchWithoutTrustedType: 0,
    cachedBothMovieAndSeries: 0,
    cachedNoExactType: 0,
    cachedOtherOrInvalidType: 0,
    trustedMovieType: 0,
    trustedSeriesType: 0,
    matchedAfterTrustedType: 0,
    stillUnresolvedAfterTrustedType: 0,
    typedNoCandidate: 0,
    typedBelowThreshold: 0,
    typedAmbiguousMargin: 0,
    typedAmbiguousExactTitle: 0,
    externalRequestsStarted: 0,
  }
  for (const candidate of missingKeyRepresentatives.values()) {
    const start = Date.parse(candidate.startTime)
    const end = Date.parse(candidate.endTime)
    const broadcastDurationMinutes = Number.isFinite(start) &&
      Number.isFinite(end) && end > start ? (end - start) / 60_000 : null
    const localCandidates = candidatesFor(candidate.title)
    const result = await matchJoynProgram({
      title: candidate.title,
      description: candidate.description,
      broadcastDurationMinutes,
    }, { localCandidates, searchTmdb: null, loadTmdbDetails: null })
    if (result?.matcherVersion !== JOYN_MATCHER_VERSION ||
        !['matched', 'unmatched'].includes(result.status) ||
        result.source !== 'local') {
      throw new Error('Unexpected original offline Joyn matcher outcome')
    }
    if (result.status === 'matched') {
      resolvedLocally++
    } else if (localCandidates.length === 0) {
      // When there are no candidates, the original matcher must give this
      // stable reason; any different result indicates changed semantics.
      if (result.reason !== 'no_candidate') throw new Error('Unexpected empty local candidate reason')
      unresolvedNoLocalCandidate++
      noLocalTitleGrouping.missingOriginalKeysInspected++
      const normalizedSourceTitle = normalizeWaipuText(candidate.title)
      if (normalizedSourceTitle) {
        noLocalTitleCounts.set(normalizedSourceTitle,
          (noLocalTitleCounts.get(normalizedSourceTitle) || 0) + 1)
        let group = noLocalCachedTypesByTitle.get(normalizedSourceTitle)
        if (!group) {
          group = { joynCached: false, algoliaCached: false,
            joynTyped: false, algoliaTyped: false, types: new Set(),
            // Original representative query string, private in-memory only.
            queryTitle: candidate.title }
          noLocalCachedTypesByTitle.set(normalizedSourceTitle, group)
        }
        const source = privateSourceLookups.get('joyn-title-v1', candidate.title)
        if (source) {
          group.joynCached = true
          const type = trustedCachedJoynSearchType(source, candidate.title)
          if (type) { group.joynTyped = true; group.types.add(type) }
        }
        const algolia = privateSourceLookups.get('algolia-hits-v1', candidate.title)
        if (algolia) {
          group.algoliaCached = true
          if (object(algolia) && algolia.status === 'ready' &&
              Array.isArray(algolia.hits) && algolia.hits.length <= 20) {
            const classified = classifyJoynAlgoliaHits({
              title: candidate.title, secondaryTitle: candidate.secondaryTitle,
            }, algolia.hits)
            if (classified?.reason === 'validated_algolia_search' &&
                ['movie', 'series'].includes(classified.type)) {
              group.algoliaTyped = true
              group.types.add(classified.type)
            }
          }
        }
      } else noLocalTitleGrouping.originalKeysWithoutNormalizedTitle++
      if (String(candidate.description || '').trim()) noLocalTitleGrouping.originalKeysWithSourceDescription++
      if (String(candidate.secondaryTitle || '').trim()) noLocalTitleGrouping.originalKeysWithSecondaryTitle++
    } else {
      unresolvedWithLocalCandidates++
      if (localCandidates.length === 1) unresolvedContext.exactlyOneLocalCandidate++
      else unresolvedContext.multipleLocalCandidates++
      if (result.reason === 'no_candidate') unresolvedReasons.noCandidateAboveMinimumScore++
      else if (result.reason === 'below_threshold') unresolvedReasons.belowAcceptanceScore++
      else if (result.reason === 'ambiguous_margin') unresolvedReasons.ambiguousScoreMargin++
      else if (result.reason === 'ambiguous_exact_title') {
        unresolvedReasons.ambiguousExactTitle++
        if (String(candidate.description || '').trim()) {
          unresolvedContext.exactAmbiguityWithSourceDescription++
        } else {
          unresolvedContext.exactAmbiguityWithoutSourceDescription++
        }
      } else throw new Error('Unexpected original matcher rejection classification')

      // Original Joyn first collects a SearchQ classification AFTER the first
      // local attempt. Inspect the *already cached* exact source evidence,
      // never call SearchQ/Algolia/TMDB. Replay only when the cached SearchQ
      // response proves one unambiguous original movie/series type.
      if (result.reason === 'ambiguous_exact_title') {
        trustedTypeReplay.ambiguousKeysInspected++
        const cachedSource = privateSourceLookups.get('joyn-title-v1', candidate.title)
        if (!cachedSource) {
          trustedTypeReplay.noValidCachedJoynSearch++
        } else {
          const type = trustedCachedJoynSearchType(cachedSource, candidate.title)
          if (!type) {
            trustedTypeReplay.cachedSearchWithoutTrustedType++
            const category = classifyCachedJoynSearchWithoutType(cachedSource, candidate.title)
            if (category === 'both_types') trustedTypeReplay.cachedBothMovieAndSeries++
            else if (category === 'no_exact_type') {
              trustedTypeReplay.cachedNoExactType++
              // Reuse the ORIGINAL cached Algolia-hit response and classifier.
              // The original matcher is replayed only with local candidates;
              // private hits, titles and identities never leave this runner.
              cachedAlgoliaReplay.noExactJoynTypeInspected++
              const cachedHits = privateSourceLookups.get('algolia-hits-v1', candidate.title)
              if (!cachedHits) {
                cachedAlgoliaReplay.noValidCachedAlgoliaHits++
              } else if (!object(cachedHits) || cachedHits.status !== 'ready' ||
                  !Array.isArray(cachedHits.hits) || cachedHits.hits.length > 20) {
                cachedAlgoliaReplay.cachedAlgoliaInvalidResponse++
              } else {
                const classified = classifyJoynAlgoliaHits({
                  title: candidate.title,
                  secondaryTitle: candidate.secondaryTitle,
                }, cachedHits.hits)
                if (classified?.type === null && classified?.reason === 'algolia_no_validated_hit') {
                  cachedAlgoliaReplay.cachedAlgoliaNoValidatedHit++
                } else if (classified?.type === null && classified?.reason === 'algolia_conflicting_types') {
                  cachedAlgoliaReplay.cachedAlgoliaConflictingTypes++
                } else if (['movie', 'series'].includes(classified?.type) &&
                    classified?.reason === 'validated_algolia_search') {
                  if (classified.type === 'movie') cachedAlgoliaReplay.cachedAlgoliaMovieType++
                  else cachedAlgoliaReplay.cachedAlgoliaSeriesType++
                  const typed = await matchJoynProgram({
                    title: candidate.title,
                    type: classified.type,
                    description: candidate.description,
                    broadcastDurationMinutes,
                  }, { localCandidates, searchTmdb: null, loadTmdbDetails: null })
                  if (typed?.matcherVersion !== JOYN_MATCHER_VERSION ||
                      !['matched', 'unmatched'].includes(typed.status) ||
                      !['local', 'local+year', 'local+description'].includes(typed.source)) {
                    throw new Error('Unexpected offline cached Algolia matcher projection')
                  }
                  if (typed.status === 'matched') cachedAlgoliaReplay.matchedAfterAlgoliaType++
                  else {
                    cachedAlgoliaReplay.stillUnresolvedAfterAlgoliaType++
                    if (typed.reason === 'ambiguous_exact_title') cachedAlgoliaReplay.stillAmbiguousExactTitle++
                    else if (['no_candidate', 'below_threshold', 'ambiguous_margin'].includes(typed.reason)) {
                      cachedAlgoliaReplay.otherUnresolvedReasons++
                    } else throw new Error('Unexpected offline cached Algolia matcher rejection')
                  }
                } else cachedAlgoliaReplay.cachedAlgoliaInvalidResponse++
              }
            } else trustedTypeReplay.cachedOtherOrInvalidType++
          } else {
            if (type === 'movie') trustedTypeReplay.trustedMovieType++
            else trustedTypeReplay.trustedSeriesType++
            const typed = await matchJoynProgram({
              title: candidate.title,
              type,
              description: candidate.description,
              broadcastDurationMinutes,
            }, { localCandidates, searchTmdb: null, loadTmdbDetails: null })
            if (typed?.matcherVersion !== JOYN_MATCHER_VERSION ||
                !['matched', 'unmatched'].includes(typed.status) ||
                !['local', 'local+year', 'local+description'].includes(typed.source)) {
              throw new Error('Unexpected offline trusted Joyn type replay')
            }
            if (typed.status === 'matched') trustedTypeReplay.matchedAfterTrustedType++
            else {
              trustedTypeReplay.stillUnresolvedAfterTrustedType++
              if (typed.reason === 'no_candidate') trustedTypeReplay.typedNoCandidate++
              else if (typed.reason === 'below_threshold') trustedTypeReplay.typedBelowThreshold++
              else if (typed.reason === 'ambiguous_margin') trustedTypeReplay.typedAmbiguousMargin++
              else if (typed.reason === 'ambiguous_exact_title') trustedTypeReplay.typedAmbiguousExactTitle++
              else throw new Error('Unexpected offline typed Joyn matcher rejection')
            }
          }
        }
      }
    }
  }
  // Grouping is diagnostic only, not a remote-query budget or identity match.
  // A title group with contradicting trusted types is NEVER treated as typed.
  noLocalCachedTypeEvidence.uniqueNormalizedSourceTitlesInspected = noLocalCachedTypesByTitle.size
  for (const group of noLocalCachedTypesByTitle.values()) {
    if (group.joynCached) noLocalCachedTypeEvidence.titleGroupsWithCachedJoynSearch++
    if (group.algoliaCached) noLocalCachedTypeEvidence.titleGroupsWithCachedAlgoliaHits++
    if (group.joynTyped) noLocalCachedTypeEvidence.titleGroupsWithTrustedJoynType++
    if (group.algoliaTyped) noLocalCachedTypeEvidence.titleGroupsWithValidatedAlgoliaType++
    if (group.types.size === 0) noLocalCachedTypeEvidence.titleGroupsWithoutTrustedType++
    else if (group.types.size > 1) noLocalCachedTypeEvidence.titleGroupsWithConflictingTypes++
    else if (group.types.has('movie')) noLocalCachedTypeEvidence.titleGroupsWithOnlyMovieType++
    else if (group.types.has('series')) noLocalCachedTypeEvidence.titleGroupsWithOnlySeriesType++
    else throw new Error('Unexpected Joyn no-local cached type')
  }
  // Model one representative, year-free first-pass request per reliable
  // type; unknown types need BOTH movie and TV requests. This is diagnostic,
  // never an approval to issue network traffic. Keep the original request
  // cache key shape, including property order and original case of title.
  noLocalTmdbFirstPassCache.uniqueTitleGroupsInspected = noLocalCachedTypesByTitle.size
  for (const group of noLocalCachedTypesByTitle.values()) {
    const kind = group.types.size === 1 ? [...group.types][0] : null
    if (kind === 'movie') noLocalTmdbFirstPassCache.movieOnlyGroups++
    else if (kind === 'series') noLocalTmdbFirstPassCache.seriesOnlyGroups++
    else noLocalTmdbFirstPassCache.unknownOrConflictingGroups++
    const endpoints = kind === 'movie' ? ['/search/movie']
      : kind === 'series' ? ['/search/tv']
        : ['/search/movie', '/search/tv']
    for (const endpoint of endpoints) {
      if (endpoint === '/search/movie') noLocalTmdbFirstPassCache.modelMovieSearchSlots++
      else noLocalTmdbFirstPassCache.modelSeriesSearchSlots++
      noLocalTmdbFirstPassCache.modelTotalSearchSlots++
      const requestKey = JSON.stringify([endpoint, {
        language: 'de-DE', query: group.queryTitle, include_adult: 'false',
      }])
      const cachedResponse = privateSourceLookups.get('tmdb-search-v1', requestKey)
      if (cachedResponse === null) noLocalTmdbFirstPassCache.missingSearchResponses++
      else if (object(cachedResponse) && Array.isArray(cachedResponse.results)) {
        noLocalTmdbFirstPassCache.cachedReadySearchResponses++
        if (cachedResponse.results.length > 0) {
          noLocalTmdbFirstPassCache.cachedNonemptySearchResponses++
        }
      } else noLocalTmdbFirstPassCache.invalidCachedSearchResponses++
    }
  }
  noLocalCachedTypesByTitle.clear()
  noLocalTitleGrouping.uniqueNormalizedSourceTitles = noLocalTitleCounts.size
  noLocalTitleGrouping.repeatedNormalizedTitleGroups =
    [...noLocalTitleCounts.values()].filter(count => count > 1).length
  noLocalTitleGrouping.duplicateOriginalKeysWithinTitleGroups =
    [...noLocalTitleCounts.values()].reduce((sum, count) => sum + count - 1, 0)
  // Do not retain source titles after aggregating.
  noLocalTitleCounts.clear()
  const reasonTotal = Object.values(unresolvedReasons).reduce((sum, count) => sum + count, 0)
  if (resolvedLocally + unresolvedNoLocalCandidate + unresolvedWithLocalCandidates !== unique.absent ||
      noLocalTitleGrouping.missingOriginalKeysInspected !== unresolvedNoLocalCandidate ||
      noLocalTitleGrouping.missingOriginalKeysInspected !==
        noLocalTitleGrouping.uniqueNormalizedSourceTitles +
        noLocalTitleGrouping.duplicateOriginalKeysWithinTitleGroups +
        noLocalTitleGrouping.originalKeysWithoutNormalizedTitle ||
      noLocalTitleGrouping.repeatedNormalizedTitleGroups >
        noLocalTitleGrouping.uniqueNormalizedSourceTitles ||
      noLocalTitleGrouping.originalKeysWithSourceDescription > unresolvedNoLocalCandidate ||
      noLocalTitleGrouping.originalKeysWithSecondaryTitle > unresolvedNoLocalCandidate ||
      noLocalCachedTypeEvidence.uniqueNormalizedSourceTitlesInspected !==
        noLocalTitleGrouping.uniqueNormalizedSourceTitles ||
      noLocalCachedTypeEvidence.uniqueNormalizedSourceTitlesInspected !==
        noLocalCachedTypeEvidence.titleGroupsWithoutTrustedType +
        noLocalCachedTypeEvidence.titleGroupsWithConflictingTypes +
        noLocalCachedTypeEvidence.titleGroupsWithOnlyMovieType +
        noLocalCachedTypeEvidence.titleGroupsWithOnlySeriesType ||
      noLocalCachedTypeEvidence.titleGroupsWithCachedJoynSearch >
        noLocalCachedTypeEvidence.uniqueNormalizedSourceTitlesInspected ||
      noLocalCachedTypeEvidence.titleGroupsWithCachedAlgoliaHits >
        noLocalCachedTypeEvidence.uniqueNormalizedSourceTitlesInspected ||
      noLocalCachedTypeEvidence.titleGroupsWithTrustedJoynType >
        noLocalCachedTypeEvidence.titleGroupsWithCachedJoynSearch ||
      noLocalCachedTypeEvidence.titleGroupsWithValidatedAlgoliaType >
        noLocalCachedTypeEvidence.titleGroupsWithCachedAlgoliaHits ||
      noLocalTmdbFirstPassCache.uniqueTitleGroupsInspected !==
        noLocalTitleGrouping.uniqueNormalizedSourceTitles ||
      noLocalTmdbFirstPassCache.uniqueTitleGroupsInspected !==
        noLocalTmdbFirstPassCache.movieOnlyGroups +
        noLocalTmdbFirstPassCache.seriesOnlyGroups +
        noLocalTmdbFirstPassCache.unknownOrConflictingGroups ||
      noLocalTmdbFirstPassCache.movieOnlyGroups !==
        noLocalCachedTypeEvidence.titleGroupsWithOnlyMovieType ||
      noLocalTmdbFirstPassCache.seriesOnlyGroups !==
        noLocalCachedTypeEvidence.titleGroupsWithOnlySeriesType ||
      noLocalTmdbFirstPassCache.unknownOrConflictingGroups !==
        noLocalCachedTypeEvidence.titleGroupsWithoutTrustedType +
        noLocalCachedTypeEvidence.titleGroupsWithConflictingTypes ||
      noLocalTmdbFirstPassCache.modelMovieSearchSlots !==
        noLocalTmdbFirstPassCache.movieOnlyGroups +
        noLocalTmdbFirstPassCache.unknownOrConflictingGroups ||
      noLocalTmdbFirstPassCache.modelSeriesSearchSlots !==
        noLocalTmdbFirstPassCache.seriesOnlyGroups +
        noLocalTmdbFirstPassCache.unknownOrConflictingGroups ||
      noLocalTmdbFirstPassCache.modelTotalSearchSlots !==
        noLocalTmdbFirstPassCache.modelMovieSearchSlots +
        noLocalTmdbFirstPassCache.modelSeriesSearchSlots ||
      noLocalTmdbFirstPassCache.modelTotalSearchSlots !==
        noLocalTmdbFirstPassCache.cachedReadySearchResponses +
        noLocalTmdbFirstPassCache.missingSearchResponses +
        noLocalTmdbFirstPassCache.invalidCachedSearchResponses ||
      noLocalTmdbFirstPassCache.cachedNonemptySearchResponses >
        noLocalTmdbFirstPassCache.cachedReadySearchResponses ||
      reasonTotal !== unresolvedWithLocalCandidates ||
      unresolvedContext.exactlyOneLocalCandidate + unresolvedContext.multipleLocalCandidates !== unresolvedWithLocalCandidates ||
      unresolvedContext.exactAmbiguityWithSourceDescription +
        unresolvedContext.exactAmbiguityWithoutSourceDescription !== unresolvedReasons.ambiguousExactTitle) {
    throw new Error('Offline local Joyn matcher count mismatch')
  }
  if (trustedTypeReplay.ambiguousKeysInspected !== unresolvedReasons.ambiguousExactTitle ||
      trustedTypeReplay.ambiguousKeysInspected !==
        trustedTypeReplay.noValidCachedJoynSearch +
        trustedTypeReplay.cachedSearchWithoutTrustedType +
        trustedTypeReplay.trustedMovieType + trustedTypeReplay.trustedSeriesType ||
      trustedTypeReplay.trustedMovieType + trustedTypeReplay.trustedSeriesType !==
        trustedTypeReplay.matchedAfterTrustedType +
        trustedTypeReplay.stillUnresolvedAfterTrustedType ||
      trustedTypeReplay.cachedSearchWithoutTrustedType !==
        trustedTypeReplay.cachedBothMovieAndSeries +
        trustedTypeReplay.cachedNoExactType +
        trustedTypeReplay.cachedOtherOrInvalidType ||
      trustedTypeReplay.stillUnresolvedAfterTrustedType !==
        trustedTypeReplay.typedNoCandidate + trustedTypeReplay.typedBelowThreshold +
        trustedTypeReplay.typedAmbiguousMargin + trustedTypeReplay.typedAmbiguousExactTitle ||
      cachedAlgoliaReplay.noExactJoynTypeInspected !== trustedTypeReplay.cachedNoExactType ||
      cachedAlgoliaReplay.noExactJoynTypeInspected !==
        cachedAlgoliaReplay.noValidCachedAlgoliaHits + cachedAlgoliaReplay.cachedAlgoliaInvalidResponse +
        cachedAlgoliaReplay.cachedAlgoliaNoValidatedHit + cachedAlgoliaReplay.cachedAlgoliaConflictingTypes +
        cachedAlgoliaReplay.cachedAlgoliaMovieType + cachedAlgoliaReplay.cachedAlgoliaSeriesType ||
      cachedAlgoliaReplay.cachedAlgoliaMovieType + cachedAlgoliaReplay.cachedAlgoliaSeriesType !==
        cachedAlgoliaReplay.matchedAfterAlgoliaType + cachedAlgoliaReplay.stillUnresolvedAfterAlgoliaType ||
      cachedAlgoliaReplay.stillUnresolvedAfterAlgoliaType !==
        cachedAlgoliaReplay.stillAmbiguousExactTitle + cachedAlgoliaReplay.otherUnresolvedReasons) {
    throw new Error('Trusted Joyn type replay counts inconsistent')
  }
  const versionCompatible = matchCache.matcherVersion === JOYN_MATCHER_VERSION
  return {
    kind: 'g1e-private-joyn-original-cache-coverage',
    schemaVersion: 1,
    mode: 'private-read-only',
    source: {
      completeBaseWindowsVerified: WINDOWS,
      sourceRecent: horizon.sourceRecent,
      horizonIncludesNow: horizon.horizonIncludesNow,
      originalRawWindowRows: rawEvents,
      normalizedRemainingOriginalPrograms: uniquePrograms.size,
    },
    match: {
      compatibleMatcherVersion: versionCompatible,
      originalCacheEntries: Object.keys(matchCache.entries).length,
      exactOriginalSourceKeyPresent: exactSourceKeyPresent,
      exactOriginalSourceKeyAbsent: exactKeyAbsent,
      exactKeyRejectedByOriginalPolicy,
      reusablePositiveDecisions,
      reusableNegativeDecisions,
      distinctOriginalSourceKeys: keyOutcomes.size,
      distinctMissingOriginalKeys: unique.absent,
      distinctRejectedOriginalKeys: unique.rejected,
      distinctReusablePositiveKeys: unique.positive,
      distinctReusableNegativeKeys: unique.negative,
    },
    offlineNoLocalTitleGroups: noLocalTitleGrouping,
    offlineNoLocalCachedTypeEvidence: noLocalCachedTypeEvidence,
    offlineNoLocalTmdbFirstPassCache: noLocalTmdbFirstPassCache,
    offlineLocalPreflight: {
      distinctMissingKeysInspected: unique.absent,
      locallyMatchedWithoutExternalCalls: resolvedLocally,
      unresolvedWithoutLocalCandidates: unresolvedNoLocalCandidate,
      unresolvedWithLocalCandidates,
      providerOrTmdbQueriesStarted: 0,
    },
    offlineLocalRejectionReasons: unresolvedReasons,
    offlineLocalCandidateContext: unresolvedContext,
    offlineTrustedJoynTypeReplay: trustedTypeReplay,
    offlineCachedAlgoliaReplay: cachedAlgoliaReplay,
    gate: {
      sourceKeyAndCandidateContextCompared: true,
      usableForCurrentHorizon: horizon.sourceRecent && horizon.horizonIncludesNow && versionCompatible,
      freshOriginalMatcherReceiptsApproved: false,
      measuredProductionSavings: null,
    },
    limitations: 'Read-only restored Joyn EPG and PUBLIC local catalog projection; no new source generation, TMDB HTTP, original matcher receipts or real production savings.',
  }
}

export function isSafeJoynRestoredSourceCoverage(value) {
  const s = value?.source, m = value?.match, o = value?.offlineLocalPreflight
  const rr = value?.offlineLocalRejectionReasons, cc = value?.offlineLocalCandidateContext
  const tr = value?.offlineTrustedJoynTypeReplay, ar = value?.offlineCachedAlgoliaReplay
  const ng = value?.offlineNoLocalTitleGroups
  const nt = value?.offlineNoLocalCachedTypeEvidence
  const tq = value?.offlineNoLocalTmdbFirstPassCache, g = value?.gate
  return keysExactly(value, ['kind', 'schemaVersion', 'mode', 'source', 'match',
    'offlineLocalPreflight', 'offlineLocalRejectionReasons',
    'offlineLocalCandidateContext', 'offlineTrustedJoynTypeReplay',
    'offlineCachedAlgoliaReplay', 'offlineNoLocalTitleGroups',
    'offlineNoLocalCachedTypeEvidence', 'offlineNoLocalTmdbFirstPassCache',
    'gate', 'limitations']) &&
    value.kind === 'g1e-private-joyn-original-cache-coverage' &&
    value.schemaVersion === 1 && value.mode === 'private-read-only' &&
    typeof value.limitations === 'string' &&
    value.limitations === 'Read-only restored Joyn EPG and PUBLIC local catalog projection; no new source generation, TMDB HTTP, original matcher receipts or real production savings.' &&
    keysExactly(s, ['completeBaseWindowsVerified', 'sourceRecent', 'horizonIncludesNow',
      'originalRawWindowRows', 'normalizedRemainingOriginalPrograms']) &&
    s.completeBaseWindowsVerified === WINDOWS &&
    typeof s.sourceRecent === 'boolean' &&
    typeof s.horizonIncludesNow === 'boolean' &&
    integer(s.originalRawWindowRows, MAX_RAW_EVENTS) &&
    integer(s.normalizedRemainingOriginalPrograms, MAX_RAW_EVENTS) &&
    keysExactly(m, ['compatibleMatcherVersion', 'originalCacheEntries',
      'exactOriginalSourceKeyPresent', 'exactOriginalSourceKeyAbsent',
      'exactKeyRejectedByOriginalPolicy', 'reusablePositiveDecisions',
      'reusableNegativeDecisions', 'distinctOriginalSourceKeys',
      'distinctMissingOriginalKeys', 'distinctRejectedOriginalKeys',
      'distinctReusablePositiveKeys', 'distinctReusableNegativeKeys']) &&
    typeof m.compatibleMatcherVersion === 'boolean' &&
    ['originalCacheEntries', 'exactOriginalSourceKeyPresent', 'exactOriginalSourceKeyAbsent',
      'exactKeyRejectedByOriginalPolicy', 'reusablePositiveDecisions',
      'reusableNegativeDecisions', 'distinctOriginalSourceKeys',
      'distinctMissingOriginalKeys', 'distinctRejectedOriginalKeys',
      'distinctReusablePositiveKeys', 'distinctReusableNegativeKeys'
    ].every(x => integer(m[x], MAX_RAW_EVENTS)) &&
    m.distinctOriginalSourceKeys === m.distinctMissingOriginalKeys +
      m.distinctRejectedOriginalKeys + m.distinctReusablePositiveKeys +
      m.distinctReusableNegativeKeys &&
    m.distinctOriginalSourceKeys <= s.normalizedRemainingOriginalPrograms &&
    m.distinctMissingOriginalKeys <= m.exactOriginalSourceKeyAbsent &&
    m.distinctRejectedOriginalKeys <= m.exactKeyRejectedByOriginalPolicy &&
    m.distinctReusablePositiveKeys <= m.reusablePositiveDecisions &&
    m.distinctReusableNegativeKeys <= m.reusableNegativeDecisions &&
    keysExactly(o, ['distinctMissingKeysInspected', 'locallyMatchedWithoutExternalCalls',
      'unresolvedWithoutLocalCandidates', 'unresolvedWithLocalCandidates',
      'providerOrTmdbQueriesStarted']) &&
    ['distinctMissingKeysInspected', 'locallyMatchedWithoutExternalCalls',
      'unresolvedWithoutLocalCandidates', 'unresolvedWithLocalCandidates']
      .every(x => integer(o[x], MAX_RAW_EVENTS)) &&
    o.providerOrTmdbQueriesStarted === 0 &&
    o.distinctMissingKeysInspected === m.distinctMissingOriginalKeys &&
    o.distinctMissingKeysInspected === o.locallyMatchedWithoutExternalCalls +
      o.unresolvedWithoutLocalCandidates + o.unresolvedWithLocalCandidates &&
    keysExactly(ng, ['missingOriginalKeysInspected', 'uniqueNormalizedSourceTitles',
      'repeatedNormalizedTitleGroups', 'duplicateOriginalKeysWithinTitleGroups',
      'originalKeysWithoutNormalizedTitle', 'originalKeysWithSourceDescription',
      'originalKeysWithSecondaryTitle', 'externalRequestsStarted']) &&
    ['missingOriginalKeysInspected', 'uniqueNormalizedSourceTitles',
      'repeatedNormalizedTitleGroups', 'duplicateOriginalKeysWithinTitleGroups',
      'originalKeysWithoutNormalizedTitle', 'originalKeysWithSourceDescription',
      'originalKeysWithSecondaryTitle'].every(x => integer(ng[x], MAX_RAW_EVENTS)) &&
    ng.externalRequestsStarted === 0 &&
    ng.missingOriginalKeysInspected === o.unresolvedWithoutLocalCandidates &&
    ng.missingOriginalKeysInspected === ng.uniqueNormalizedSourceTitles +
      ng.duplicateOriginalKeysWithinTitleGroups + ng.originalKeysWithoutNormalizedTitle &&
    ng.repeatedNormalizedTitleGroups <= ng.uniqueNormalizedSourceTitles &&
    ng.originalKeysWithSourceDescription <= ng.missingOriginalKeysInspected &&
    ng.originalKeysWithSecondaryTitle <= ng.missingOriginalKeysInspected &&
    keysExactly(nt, ['uniqueNormalizedSourceTitlesInspected',
      'titleGroupsWithCachedJoynSearch', 'titleGroupsWithCachedAlgoliaHits',
      'titleGroupsWithTrustedJoynType', 'titleGroupsWithValidatedAlgoliaType',
      'titleGroupsWithOnlyMovieType', 'titleGroupsWithOnlySeriesType',
      'titleGroupsWithConflictingTypes', 'titleGroupsWithoutTrustedType',
      'externalRequestsStarted']) &&
    ['uniqueNormalizedSourceTitlesInspected', 'titleGroupsWithCachedJoynSearch',
      'titleGroupsWithCachedAlgoliaHits', 'titleGroupsWithTrustedJoynType',
      'titleGroupsWithValidatedAlgoliaType', 'titleGroupsWithOnlyMovieType',
      'titleGroupsWithOnlySeriesType', 'titleGroupsWithConflictingTypes',
      'titleGroupsWithoutTrustedType'].every(x => integer(nt[x], MAX_RAW_EVENTS)) &&
    nt.externalRequestsStarted === 0 &&
    nt.uniqueNormalizedSourceTitlesInspected === ng.uniqueNormalizedSourceTitles &&
    nt.uniqueNormalizedSourceTitlesInspected ===
      nt.titleGroupsWithoutTrustedType + nt.titleGroupsWithConflictingTypes +
      nt.titleGroupsWithOnlyMovieType + nt.titleGroupsWithOnlySeriesType &&
    nt.titleGroupsWithCachedJoynSearch <= nt.uniqueNormalizedSourceTitlesInspected &&
    nt.titleGroupsWithCachedAlgoliaHits <= nt.uniqueNormalizedSourceTitlesInspected &&
    nt.titleGroupsWithTrustedJoynType <= nt.titleGroupsWithCachedJoynSearch &&
    nt.titleGroupsWithValidatedAlgoliaType <= nt.titleGroupsWithCachedAlgoliaHits &&
    keysExactly(tq, ['uniqueTitleGroupsInspected', 'movieOnlyGroups',
      'seriesOnlyGroups', 'unknownOrConflictingGroups', 'modelMovieSearchSlots',
      'modelSeriesSearchSlots', 'modelTotalSearchSlots',
      'cachedReadySearchResponses', 'cachedNonemptySearchResponses',
      'missingSearchResponses', 'invalidCachedSearchResponses',
      'externalRequestsStarted']) &&
    ['uniqueTitleGroupsInspected', 'movieOnlyGroups',
      'seriesOnlyGroups', 'unknownOrConflictingGroups', 'modelMovieSearchSlots',
      'modelSeriesSearchSlots', 'modelTotalSearchSlots',
      'cachedReadySearchResponses', 'cachedNonemptySearchResponses',
      'missingSearchResponses', 'invalidCachedSearchResponses']
      .every(x => integer(tq[x], MAX_RAW_EVENTS)) &&
    tq.externalRequestsStarted === 0 &&
    tq.uniqueTitleGroupsInspected === nt.uniqueNormalizedSourceTitlesInspected &&
    tq.uniqueTitleGroupsInspected === tq.movieOnlyGroups +
      tq.seriesOnlyGroups + tq.unknownOrConflictingGroups &&
    tq.movieOnlyGroups === nt.titleGroupsWithOnlyMovieType &&
    tq.seriesOnlyGroups === nt.titleGroupsWithOnlySeriesType &&
    tq.unknownOrConflictingGroups === nt.titleGroupsWithoutTrustedType +
      nt.titleGroupsWithConflictingTypes &&
    tq.modelMovieSearchSlots === tq.movieOnlyGroups + tq.unknownOrConflictingGroups &&
    tq.modelSeriesSearchSlots === tq.seriesOnlyGroups + tq.unknownOrConflictingGroups &&
    tq.modelTotalSearchSlots === tq.modelMovieSearchSlots + tq.modelSeriesSearchSlots &&
    tq.modelTotalSearchSlots === tq.cachedReadySearchResponses +
      tq.missingSearchResponses + tq.invalidCachedSearchResponses &&
    tq.cachedNonemptySearchResponses <= tq.cachedReadySearchResponses &&
    keysExactly(rr, ['noCandidateAboveMinimumScore', 'belowAcceptanceScore',
      'ambiguousScoreMargin', 'ambiguousExactTitle']) &&
    Object.values(rr).every(x => integer(x, MAX_RAW_EVENTS)) &&
    rr.noCandidateAboveMinimumScore + rr.belowAcceptanceScore +
      rr.ambiguousScoreMargin + rr.ambiguousExactTitle === o.unresolvedWithLocalCandidates &&
    keysExactly(cc, ['exactlyOneLocalCandidate', 'multipleLocalCandidates',
      'exactAmbiguityWithSourceDescription', 'exactAmbiguityWithoutSourceDescription']) &&
    Object.values(cc).every(x => integer(x, MAX_RAW_EVENTS)) &&
    cc.exactlyOneLocalCandidate + cc.multipleLocalCandidates === o.unresolvedWithLocalCandidates &&
    cc.exactAmbiguityWithSourceDescription +
      cc.exactAmbiguityWithoutSourceDescription === rr.ambiguousExactTitle &&
    keysExactly(tr, ['ambiguousKeysInspected', 'noValidCachedJoynSearch',
      'cachedSearchWithoutTrustedType', 'cachedBothMovieAndSeries',
      'cachedNoExactType', 'cachedOtherOrInvalidType',
      'trustedMovieType', 'trustedSeriesType',
      'matchedAfterTrustedType', 'stillUnresolvedAfterTrustedType',
      'typedNoCandidate', 'typedBelowThreshold', 'typedAmbiguousMargin',
      'typedAmbiguousExactTitle', 'externalRequestsStarted']) &&
    ['ambiguousKeysInspected', 'noValidCachedJoynSearch',
      'cachedSearchWithoutTrustedType', 'cachedBothMovieAndSeries',
      'cachedNoExactType', 'cachedOtherOrInvalidType',
      'trustedMovieType', 'trustedSeriesType',
      'matchedAfterTrustedType', 'stillUnresolvedAfterTrustedType',
      'typedNoCandidate', 'typedBelowThreshold', 'typedAmbiguousMargin',
      'typedAmbiguousExactTitle'].every(x => integer(tr[x], MAX_RAW_EVENTS)) &&
    tr.externalRequestsStarted === 0 &&
    tr.ambiguousKeysInspected === rr.ambiguousExactTitle &&
    tr.ambiguousKeysInspected === tr.noValidCachedJoynSearch +
      tr.cachedSearchWithoutTrustedType + tr.trustedMovieType + tr.trustedSeriesType &&
    tr.trustedMovieType + tr.trustedSeriesType ===
      tr.matchedAfterTrustedType + tr.stillUnresolvedAfterTrustedType &&
    tr.cachedSearchWithoutTrustedType === tr.cachedBothMovieAndSeries +
      tr.cachedNoExactType + tr.cachedOtherOrInvalidType &&
    tr.stillUnresolvedAfterTrustedType === tr.typedNoCandidate +
      tr.typedBelowThreshold + tr.typedAmbiguousMargin + tr.typedAmbiguousExactTitle &&
    keysExactly(ar, ['noExactJoynTypeInspected', 'noValidCachedAlgoliaHits',
      'cachedAlgoliaInvalidResponse', 'cachedAlgoliaNoValidatedHit',
      'cachedAlgoliaConflictingTypes', 'cachedAlgoliaMovieType', 'cachedAlgoliaSeriesType',
      'matchedAfterAlgoliaType', 'stillUnresolvedAfterAlgoliaType',
      'stillAmbiguousExactTitle', 'otherUnresolvedReasons', 'externalRequestsStarted']) &&
    ['noExactJoynTypeInspected', 'noValidCachedAlgoliaHits',
      'cachedAlgoliaInvalidResponse', 'cachedAlgoliaNoValidatedHit',
      'cachedAlgoliaConflictingTypes', 'cachedAlgoliaMovieType', 'cachedAlgoliaSeriesType',
      'matchedAfterAlgoliaType', 'stillUnresolvedAfterAlgoliaType',
      'stillAmbiguousExactTitle', 'otherUnresolvedReasons'].every(x => integer(ar[x], MAX_RAW_EVENTS)) &&
    ar.externalRequestsStarted === 0 &&
    ar.noExactJoynTypeInspected === tr.cachedNoExactType &&
    ar.noExactJoynTypeInspected === ar.noValidCachedAlgoliaHits +
      ar.cachedAlgoliaInvalidResponse + ar.cachedAlgoliaNoValidatedHit +
      ar.cachedAlgoliaConflictingTypes + ar.cachedAlgoliaMovieType + ar.cachedAlgoliaSeriesType &&
    ar.cachedAlgoliaMovieType + ar.cachedAlgoliaSeriesType ===
      ar.matchedAfterAlgoliaType + ar.stillUnresolvedAfterAlgoliaType &&
    ar.stillUnresolvedAfterAlgoliaType === ar.stillAmbiguousExactTitle + ar.otherUnresolvedReasons &&
    s.normalizedRemainingOriginalPrograms ===
      m.exactOriginalSourceKeyPresent + m.exactOriginalSourceKeyAbsent &&
    m.exactOriginalSourceKeyPresent === m.reusablePositiveDecisions +
      m.reusableNegativeDecisions + m.exactKeyRejectedByOriginalPolicy &&
    keysExactly(g, ['sourceKeyAndCandidateContextCompared', 'usableForCurrentHorizon',
      'freshOriginalMatcherReceiptsApproved', 'measuredProductionSavings']) &&
    g.sourceKeyAndCandidateContextCompared === true &&
    g.usableForCurrentHorizon ===
      (s.sourceRecent && s.horizonIncludesNow && m.compatibleMatcherVersion) &&
    g.freshOriginalMatcherReceiptsApproved === false &&
    g.measuredProductionSavings === null
}

async function readJsonBounded(path, maxBytes) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) {
    throw new Error('Invalid or unbounded original source file')
  }
  return JSON.parse(await readFile(path, 'utf8'))
}

async function readOptionalPublic(path) {
  try { return await readJsonBounded(path, MAX_PUBLIC_BYTES) }
  catch (error) {
    if (error?.code === 'ENOENT') return { entries: [] }
    throw error
  }
}

async function main(argv) {
  if (argv.length !== 4 || argv[0] !== '--root' || argv[2] !== '--output') {
    throw new TypeError('Expected isolated source root and fixed output')
  }
  const root = resolve(argv[1]), output = resolve(argv[3])
  const now = Date.now()
  const [status, checkpoint, matchCache, lookupCache, catalog, searchIndex,
    previousJoynTitles, waipuTitles] = await Promise.all([
    readJsonBounded(join(root, 'artifacts/joyn-sync/status.json'), 1024 * 1024),
    readJsonBounded(join(root, 'artifacts/joyn-sync/checkpoint.json'), 1024 * 1024),
    readJsonBounded(join(root, 'artifacts/joyn-live/match-cache.json'), MAX_CACHE_BYTES),
    readJsonBounded(join(root, 'artifacts/joyn-live/lookup-cache.json'), MAX_CACHE_BYTES),
    readJsonBounded(join(root, 'public/catalog.json'), MAX_PUBLIC_BYTES),
    readJsonBounded(join(root, 'public/search-index.json'), MAX_PUBLIC_BYTES),
    readOptionalPublic(join(root, 'public/joyn-live/titles.json')),
    readOptionalPublic(join(root, 'public/waipu-live/titles.json')),
  ])
  const horizon = sourceHorizon(status, checkpoint, now)
  let totalWindowBytes = 0
  const windowRecords = []
  for (const { key } of horizon.windows) {
    const path = join(root, 'artifacts/joyn-sync/cache', `${key}.json`)
    const stat = await lstat(path)
    totalWindowBytes += stat.size
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_WINDOW_BYTES ||
        totalWindowBytes > 1024 * 1024 * 1024) {
      throw new RangeError('Original source cache exceeds bounded window limits')
    }
    windowRecords.push(await readJsonBounded(path, MAX_WINDOW_BYTES))
  }
  const report = await inspectJoynRestoredSourceCacheCoverage({
    status, checkpoint, windowRecords, matchCache, lookupCache,
    catalog, searchIndex, previousJoynTitles, waipuTitles, now,
  })
  if (!isSafeJoynRestoredSourceCoverage(report)) {
    throw new Error('Original private aggregate failed output validation')
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8')
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    // Never expose private original exception strings, titles, cache keys, IDs.
    console.error('G1e private original cache coverage audit failed closed.')
    process.exitCode = 1
  })
}
