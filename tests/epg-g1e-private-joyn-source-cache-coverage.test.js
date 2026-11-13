import { describe, expect, it } from 'vitest'
import {
  inspectJoynRestoredSourceCacheCoverage, isSafeJoynRestoredSourceCoverage,
  trustedCachedJoynSearchType, classifyCachedJoynSearchWithoutType,
} from '../scripts/epg-g1e-private-joyn-source-cache-coverage.mjs'
import { JoynMatchCache, JoynLookupCache } from '../scripts/joyn-match-cache.mjs'
import { JOYN_MATCHER_VERSION } from '../scripts/joyn-tmdb-matcher.mjs'
import { localTmdbCandidates } from '../scripts/waipu-live-catalog.mjs'
import { titleLookup } from '../scripts/joyn-adapter-diagnostic.mjs'

const NOW = Date.parse('2026-11-12T12:00:00Z')
const START = Date.parse('2026-11-12T00:00:00Z')
const HOUR = 3_600_000
const SECRET = 'PRIVATE_JOYN_SOURCE_TITLE_MUST_NEVER_LEAVE_887722'
const programs = [
  { id: 'pA', title: `${SECRET}_A`, status: 'matched' },
  { id: 'pB', title: `${SECRET}_B`, status: 'context-mismatch' },
  { id: 'pC', title: `${SECRET}_C`, status: 'absent' },
  { id: 'pD', title: `${SECRET}_D`, status: 'expired' },
  { id: 'pE', title: `${SECRET}_E`, status: 'unmatched' },
]

function input() {
  const windows = []
  const checkpointWindows = {}
  for (let i = 0; i < 56; i++) {
    const from = START + i * 6 * HOUR
    const to = from + 6 * HOUR
    const rows = i === 2 ? programs.map((p, n) => {
      const start = START + 12 * HOUR + (n + 1) * 30 * 60_000
      const end = start + 20 * 60_000
      return {
        livestream: { id: 'channel-one' },
        program: {
          __typename: 'EpgEntryV2', id: p.id, title: p.title,
          description: 'Private source description',
          secondaryTitle: null,
        },
        start: start / 1000, end: end / 1000,
      }
    }) : []
    const fetchedAt = new Date(NOW - HOUR).toISOString()
    windows.push({ from, to, fetchedAt, items: rows })
    checkpointWindows[`${from}_${to}`] = { fetchedAt, count: rows.length, inventory: 'original-inventory' }
  }
  const catalog = { titles: [
    { type: 'movie', tmdbId: 101, title: programs[1].title },
    { type: 'movie', tmdbId: 102, title: programs[4].title },
  ] }
  const candidatesFor = titleLookup(localTmdbCandidates({ catalog, searchIndex: { entries: [] } }))
  const match = new JoynMatchCache({}, NOW)
  const makeCandidate = n => {
    const row = windows[2].items[n]
    return {
      title: row.program.title, secondaryTitle: null,
      description: row.program.description,
      startTime: new Date(row.start * 1000).toISOString(),
      endTime: new Date(row.end * 1000).toISOString(),
    }
  }
  match.set(makeCandidate(0), { decision: { status: 'matched' } }, [])
  match.set(makeCandidate(1), { decision: { status: 'unmatched' } }, [])
  match.set(makeCandidate(3), { decision: { status: 'matched' } }, [])
  match.set(makeCandidate(4), { decision: { status: 'unmatched' } }, candidatesFor(programs[4].title))
  // Matching source key but expired positive TTL.
  const positiveKeys = Object.keys(match.values).filter(k =>
    match.values[k]?.diagnostic?.decision?.status === 'matched')
  expect(positiveKeys).toHaveLength(2)
  match.values[positiveKeys[1]].checkedAt = new Date(NOW - 31 * 86_400_000).toISOString()

  return {
    status: {
      kind: 'joyn-sync-status', schemaVersion: 1, status: 'complete',
      generatedAt: new Date(NOW - HOUR).toISOString(),
      horizon: {
        start: new Date(START).toISOString(),
        endExclusive: new Date(START + 14 * 86_400_000).toISOString(),
      },
      coverage: [{ id: 'channel-one', title: 'ZDF', programs: 5 }],
      metrics: { windowsProcessed: 56 },
    },
    checkpoint: {
      kind: 'joyn-sync-checkpoint', schemaVersion: 1,
      windows: checkpointWindows,
    },
    windowRecords: windows,
    matchCache: {
      kind: 'joyn-match-cache', schemaVersion: 1,
      matcherVersion: JOYN_MATCHER_VERSION, entries: match.values,
    },
    lookupCache: { kind: 'joyn-lookup-cache', schemaVersion: 1, entries: {} },
    catalog,
    searchIndex: { entries: [] },
    now: NOW,
  }
}

describe('G1e original private source key/context coverage without network calls', () => {
  it('uses the original normalized title/description/duration and negative candidate context', async () => {
    const report = await inspectJoynRestoredSourceCacheCoverage(input())
    expect(report).toMatchObject({
      kind: 'g1e-private-joyn-original-cache-coverage',
      mode: 'private-read-only',
      source: {
        completeBaseWindowsVerified: 56, sourceRecent: true,
        horizonIncludesNow: true,
        originalRawWindowRows: 5, normalizedRemainingOriginalPrograms: 5,
      },
      match: {
        compatibleMatcherVersion: true, originalCacheEntries: 4,
        exactOriginalSourceKeyPresent: 4, exactOriginalSourceKeyAbsent: 1,
        exactKeyRejectedByOriginalPolicy: 2,
        reusablePositiveDecisions: 1, reusableNegativeDecisions: 1,
        distinctOriginalSourceKeys: 5,
        distinctMissingOriginalKeys: 1,
        distinctRejectedOriginalKeys: 2,
        distinctReusablePositiveKeys: 1,
        distinctReusableNegativeKeys: 1,
      },
      offlineLocalPreflight: {
        distinctMissingKeysInspected: 1,
        locallyMatchedWithoutExternalCalls: 0,
        unresolvedWithoutLocalCandidates: 1,
        unresolvedWithLocalCandidates: 0,
        providerOrTmdbQueriesStarted: 0,
      },
      offlineLocalRejectionReasons: {
        noCandidateAboveMinimumScore: 0,
        belowAcceptanceScore: 0,
        ambiguousScoreMargin: 0,
        ambiguousExactTitle: 0,
      },
      offlineLocalCandidateContext: {
        exactlyOneLocalCandidate: 0,
        multipleLocalCandidates: 0,
        exactAmbiguityWithSourceDescription: 0,
        exactAmbiguityWithoutSourceDescription: 0,
      },
      gate: {
        sourceKeyAndCandidateContextCompared: true,
        usableForCurrentHorizon: true,
        freshOriginalMatcherReceiptsApproved: false,
        measuredProductionSavings: null,
      },
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(SECRET)
    expect(JSON.stringify(report)).not.toContain('channel-one')
    expect(JSON.stringify(report)).not.toContain('Private source description')
  })

  it('deduplicates repeated programme IDs into one missing ORIGINAL key without leaking IDs', async () => {
    const value = input()
    const original = value.windowRecords[2].items[2] // synthetic missing key
    const repeat = {
      ...original, livestream: { ...original.livestream },
      program: { ...original.program, id: 'private-repeated-programme' },
      start: original.start + 3600, end: original.end + 3600,
    }
    value.windowRecords[2].items.push(repeat)
    const key = `${value.windowRecords[2].from}_${value.windowRecords[2].to}`
    value.checkpoint.windows[key].count++
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.source).toMatchObject({
      originalRawWindowRows: 6, normalizedRemainingOriginalPrograms: 6,
    })
    expect(report.match).toMatchObject({
      exactOriginalSourceKeyAbsent: 2,
      distinctMissingOriginalKeys: 1,
      distinctOriginalSourceKeys: 5,
      reusablePositiveDecisions: 1,
      reusableNegativeDecisions: 1,
    })
    expect(report.offlineLocalPreflight).toMatchObject({
      distinctMissingKeysInspected: 1,
      unresolvedWithoutLocalCandidates: 1,
      providerOrTmdbQueriesStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain('private-repeated-programme')
    expect(JSON.stringify(report)).not.toContain(SECRET)
  })

  it('counts local-only successful matches without any remote TMDB or source calls', async () => {
    const value = input()
    value.catalog.titles.push({
      type: 'movie', tmdbId: 203, title: programs[2].title,
    })
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.match.distinctMissingOriginalKeys).toBe(1)
    expect(report.offlineLocalPreflight).toEqual({
      distinctMissingKeysInspected: 1,
      locallyMatchedWithoutExternalCalls: 1,
      unresolvedWithoutLocalCandidates: 0,
      unresolvedWithLocalCandidates: 0,
      providerOrTmdbQueriesStarted: 0,
    })
    expect(report.gate.freshOriginalMatcherReceiptsApproved).toBe(false)
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(programs[2].title)
    expect(JSON.stringify(report)).not.toContain('203')
  })

  it('distinguishes ambiguous local candidates from no local candidate', async () => {
    const value = input()
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 205, title: programs[2].title },
      { type: 'series', tmdbId: 206, title: programs[2].title },
    )
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineLocalPreflight).toMatchObject({
      distinctMissingKeysInspected: 1,
      locallyMatchedWithoutExternalCalls: 0,
      unresolvedWithoutLocalCandidates: 0,
      unresolvedWithLocalCandidates: 1,
      providerOrTmdbQueriesStarted: 0,
    })
    expect(report.offlineLocalRejectionReasons).toEqual({
      noCandidateAboveMinimumScore: 0,
      belowAcceptanceScore: 0,
      ambiguousScoreMargin: 0,
      ambiguousExactTitle: 1,
    })
    expect(report.offlineLocalCandidateContext).toEqual({
      exactlyOneLocalCandidate: 0,
      multipleLocalCandidates: 1,
      exactAmbiguityWithSourceDescription: 1,
      exactAmbiguityWithoutSourceDescription: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
  })

  it('counts ambiguous exact-title reasons separately when the source description is absent', async () => {
    const value = input()
    value.windowRecords[2].items[2].program.description = null
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 305, title: programs[2].title },
      { type: 'movie', tmdbId: 306, title: programs[2].title },
    )
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineLocalRejectionReasons.ambiguousExactTitle).toBe(1)
    expect(report.offlineLocalCandidateContext).toEqual({
      exactlyOneLocalCandidate: 0,
      multipleLocalCandidates: 1,
      exactAmbiguityWithSourceDescription: 0,
      exactAmbiguityWithoutSourceDescription: 1,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(programs[2].title)
  })

  it('replays only a trustworthy cached exact Joyn movie type, without APIs or raw output', async () => {
    const value = input()
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 401, title: programs[2].title },
      { type: 'series', tmdbId: 402, title: programs[2].title },
    )
    const lookup = new JoynLookupCache({}, NOW)
    const original = { type: 'movie', reason: 'exact_joyn_search',
      exactTypes: ['movie'], exactCount: 1,
      exactResults: [{ type: 'movie', joynType: 'Movie',
        title: programs[2].title, id: 'private-joyn-movie-1' }] }
    lookup.set('joyn-title-v1', programs[2].title, original)
    value.lookupCache.entries = lookup.entries
    const result = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(result.offlineLocalRejectionReasons.ambiguousExactTitle).toBe(1)
    expect(result.offlineTrustedJoynTypeReplay).toEqual({
      ambiguousKeysInspected: 1,
      noValidCachedJoynSearch: 0,
      cachedSearchWithoutTrustedType: 0,
      cachedBothMovieAndSeries: 0,
      cachedNoExactType: 0,
      cachedOtherOrInvalidType: 0,
      trustedMovieType: 1,
      trustedSeriesType: 0,
      matchedAfterTrustedType: 1,
      stillUnresolvedAfterTrustedType: 0,
      typedNoCandidate: 0,
      typedBelowThreshold: 0,
      typedAmbiguousMargin: 0,
      typedAmbiguousExactTitle: 0,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(programs[2].title)
    expect(JSON.stringify(result)).not.toContain('private-joyn-movie')
  })

  it('does not guess an identity when trusted Joyn type still has same-type title collisions', async () => {
    const value = input()
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 403, title: programs[2].title },
      { type: 'movie', tmdbId: 404, title: programs[2].title },
    )
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', programs[2].title, {
      type: 'movie', reason: 'exact_joyn_search', exactTypes: ['movie'], exactCount: 1,
      exactResults: [{ type: 'movie', joynType: 'Movie', title: programs[2].title }],
    })
    value.lookupCache.entries = lookup.entries
    const result = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(result.offlineTrustedJoynTypeReplay).toMatchObject({
      trustedMovieType: 1, matchedAfterTrustedType: 0,
      stillUnresolvedAfterTrustedType: 1, typedAmbiguousExactTitle: 1,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(result)).toBe(true)
  })

  it('rejects untrusted, wrong-title and ambiguous cached Joyn SearchQ classification', async () => {
    const title = programs[2].title
    const valid = { type: 'movie', reason: 'exact_joyn_search',
      exactTypes: ['movie'], exactCount: 1,
      exactResults: [{ type: 'movie', joynType: 'Movie', title }] }
    expect(trustedCachedJoynSearchType(valid, title)).toBe('movie')
    for (const bad of [
      { ...valid, reason: 'ambiguous_joyn_search' },
      { ...valid, exactTypes: ['movie', 'series'] },
      { ...valid, exactResults: [{ ...valid.exactResults[0], title: 'Different' }] },
      { ...valid, exactCount: 2 },
      { ...valid, type: 'series' },
      { ...valid, exactResults: [{ ...valid.exactResults[0], joynType: 'Series' }] },
    ]) expect(trustedCachedJoynSearchType(bad, title)).toBeNull()

    const value = input()
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 405, title },
      { type: 'series', tmdbId: 406, title },
    )
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, { ...valid, reason: 'ambiguous_joyn_search' })
    value.lookupCache.entries = lookup.entries
    const result = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(result.offlineTrustedJoynTypeReplay).toMatchObject({
      cachedSearchWithoutTrustedType: 1, trustedMovieType: 0,
      trustedSeriesType: 0, matchedAfterTrustedType: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(result)).toBe(true)
  })

  it('separates well-formed cached SearchQ dual-type and no-type evidence from malformed responses', async () => {
    const title = programs[2].title
    const bothTypes = {
      type: null, reason: 'ambiguous_joyn_search',
      exactTypes: ['movie', 'series'], exactCount: 2,
      exactResults: [
        { type: 'movie', joynType: 'Movie', title },
        { type: 'series', joynType: 'Series', title },
      ],
    }
    const noType = {
      type: null, reason: 'no_joyn_type',
      exactTypes: [], exactCount: 0, exactResults: [],
    }
    expect(classifyCachedJoynSearchWithoutType(bothTypes, title)).toBe('both_types')
    expect(classifyCachedJoynSearchWithoutType(noType, title)).toBe('no_exact_type')
    expect(classifyCachedJoynSearchWithoutType({ ...bothTypes,
      exactResults: [{ ...bothTypes.exactResults[0], title: 'wrong title' },
        bothTypes.exactResults[1]] }, title)).toBe('other_or_invalid')
    expect(classifyCachedJoynSearchWithoutType({
      ...bothTypes, exactTypes: ['movie', 'movie'],
    }, title)).toBe('other_or_invalid')
    expect(classifyCachedJoynSearchWithoutType({
      ...noType, exactCount: 1,
    }, title)).toBe('other_or_invalid')

    for (const [cached, classification] of [
      [bothTypes, 'cachedBothMovieAndSeries'],
      [noType, 'cachedNoExactType'],
      [{ ...noType, reason: 'untrusted' }, 'cachedOtherOrInvalidType'],
    ]) {
      const value = input()
      value.catalog.titles.push(
        { type: 'movie', tmdbId: 499, title },
        { type: 'series', tmdbId: 500, title },
      )
      const lookup = new JoynLookupCache({}, NOW)
      lookup.set('joyn-title-v1', title, cached)
      value.lookupCache.entries = lookup.entries
      const report = await inspectJoynRestoredSourceCacheCoverage(value)
      expect(report.offlineTrustedJoynTypeReplay).toMatchObject({
        cachedSearchWithoutTrustedType: 1,
        cachedBothMovieAndSeries: classification === 'cachedBothMovieAndSeries' ? 1 : 0,
        cachedNoExactType: classification === 'cachedNoExactType' ? 1 : 0,
        cachedOtherOrInvalidType: classification === 'cachedOtherOrInvalidType' ? 1 : 0,
        trustedMovieType: 0, trustedSeriesType: 0,
        externalRequestsStarted: 0,
      })
      expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
      expect(JSON.stringify(report)).not.toContain(title)
    }
  })

  it('replays only the existing original cached Algolia response for a no-exact-Joyn-type case', async () => {
    const title = programs[2].title
    const value = input()
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 601, title },
      { type: 'series', tmdbId: 602, title },
    )
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: null, reason: 'no_joyn_type', exactTypes: [], exactCount: 0, exactResults: [],
    })
    lookup.set('algolia-hits-v1', title, {
      status: 'ready', hits: [{ type: 'MOVIE', titles: { DE: title },
        id: 'PRIVATE_ALGOLIA_HIT_NEVER_PUBLIC' }],
    })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineTrustedJoynTypeReplay).toMatchObject({ cachedNoExactType: 1 })
    expect(report.offlineCachedAlgoliaReplay).toEqual({
      noExactJoynTypeInspected: 1,
      noValidCachedAlgoliaHits: 0,
      cachedAlgoliaInvalidResponse: 0,
      cachedAlgoliaNoValidatedHit: 0,
      cachedAlgoliaConflictingTypes: 0,
      cachedAlgoliaMovieType: 1,
      cachedAlgoliaSeriesType: 0,
      matchedAfterAlgoliaType: 1,
      stillUnresolvedAfterAlgoliaType: 0,
      stillAmbiguousExactTitle: 0,
      otherUnresolvedReasons: 0,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(title)
    expect(JSON.stringify(report)).not.toContain('PRIVATE_ALGOLIA')
  })

  it('reports missing, expired, conflicting, unusable and still-ambiguous private Algolia evidence', async () => {
    const title = programs[2].title
    const cases = [
      { hits: null, expected: { noValidCachedAlgoliaHits: 1 } },
      { hits: { status: 'ready', hits: [] },
        expected: { cachedAlgoliaNoValidatedHit: 1 } },
      { hits: { status: 'ready', hits: [
        { type: 'MOVIE', titles: { DE: title } },
        { type: 'SERIES', titles: { DE: title } },
      ] }, expected: { cachedAlgoliaConflictingTypes: 1 } },
      { hits: { status: 'unavailable', hits: [] },
        expected: { cachedAlgoliaInvalidResponse: 1 } },
      { hits: { status: 'ready', hits: [{ type: 'SERIES', titles: { DE: title } }] },
        expected: { cachedAlgoliaSeriesType: 1, matchedAfterAlgoliaType: 1 } },
    ]
    for (const item of cases) {
      const value = input()
      value.catalog.titles.push(
        { type: 'movie', tmdbId: 610, title },
        { type: 'series', tmdbId: 611, title },
      )
      const lookup = new JoynLookupCache({}, NOW)
      lookup.set('joyn-title-v1', title, {
        type: null, reason: 'no_joyn_type', exactTypes: [], exactCount: 0, exactResults: [],
      })
      if (item.hits) lookup.set('algolia-hits-v1', title, item.hits)
      value.lookupCache.entries = lookup.entries
      const report = await inspectJoynRestoredSourceCacheCoverage(value)
      expect(report.offlineCachedAlgoliaReplay).toMatchObject({
        noExactJoynTypeInspected: 1, externalRequestsStarted: 0, ...item.expected,
      })
      expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
      expect(JSON.stringify(report)).not.toContain(title)
    }

    const sameFamily = input()
    sameFamily.catalog.titles.push(
      { type: 'movie', tmdbId: 612, title },
      { type: 'movie', tmdbId: 613, title },
    )
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: null, reason: 'no_joyn_type', exactTypes: [], exactCount: 0, exactResults: [],
    })
    lookup.set('algolia-hits-v1', title, {
      status: 'ready', hits: [{ type: 'MOVIE', titles: { DE: title } }],
    })
    sameFamily.lookupCache.entries = lookup.entries
    const result = await inspectJoynRestoredSourceCacheCoverage(sameFamily)
    expect(result.offlineCachedAlgoliaReplay).toMatchObject({
      cachedAlgoliaMovieType: 1, matchedAfterAlgoliaType: 0,
      stillUnresolvedAfterAlgoliaType: 1, stillAmbiguousExactTitle: 1,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(result)).toBe(true)
  })

  it('rejects cache types from stale private Algolia responses before offline replay', async () => {
    const title = programs[2].title
    const value = input()
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 621, title },
      { type: 'series', tmdbId: 622, title },
    )
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: null, reason: 'no_joyn_type', exactTypes: [], exactCount: 0, exactResults: [],
    })
    lookup.set('algolia-hits-v1', title, {
      status: 'ready', hits: [{ type: 'MOVIE', titles: { DE: title } }],
    })
    const key = lookup.cacheKey('algolia-hits-v1', title)
    lookup.entries[key].checkedAt = new Date(NOW - 8 * 86_400_000).toISOString()
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineCachedAlgoliaReplay).toMatchObject({
      noExactJoynTypeInspected: 1, noValidCachedAlgoliaHits: 1,
      cachedAlgoliaMovieType: 0, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
  })

  it('honours the original 7-day Joyn lookup-cache expiry before typing', async () => {
    const value = input()
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 407, title: programs[2].title },
      { type: 'series', tmdbId: 408, title: programs[2].title },
    )
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', programs[2].title, {
      type: 'movie', reason: 'exact_joyn_search', exactTypes: ['movie'], exactCount: 1,
      exactResults: [{ type: 'movie', joynType: 'Movie', title: programs[2].title }],
    })
    for (const entry of Object.values(lookup.entries)) {
      entry.checkedAt = new Date(NOW - 8 * 86_400_000).toISOString()
    }
    value.lookupCache.entries = lookup.entries
    const result = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(result.offlineTrustedJoynTypeReplay).toMatchObject({
      noValidCachedJoynSearch: 1,
      trustedMovieType: 0, matchedAfterTrustedType: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(result)).toBe(true)
  })

  it('groups different original cache hashes by normalized source title without leaking either', async () => {
    const value = input()
    const original = value.windowRecords[2].items[2]
    const repeat = {
      ...original, livestream: { ...original.livestream },
      program: { ...original.program, id: 'PRIVATE_REPEAT_NEW_HASH',
        secondaryTitle: 'Synthetic episode variation', description: 'Another episode description' },
      start: original.start + 3600, end: original.end + 3600,
    }
    value.windowRecords[2].items.push(repeat)
    const windowKey = `${value.windowRecords[2].from}_${value.windowRecords[2].to}`
    value.checkpoint.windows[windowKey].count++
    const result = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(result.match.distinctMissingOriginalKeys).toBe(2)
    expect(result.offlineLocalPreflight.unresolvedWithoutLocalCandidates).toBe(2)
    expect(result.offlineNoLocalTitleGroups).toEqual({
      missingOriginalKeysInspected: 2,
      uniqueNormalizedSourceTitles: 1,
      repeatedNormalizedTitleGroups: 1,
      duplicateOriginalKeysWithinTitleGroups: 1,
      originalKeysWithoutNormalizedTitle: 0,
      originalKeysWithSourceDescription: 2,
      originalKeysWithSecondaryTitle: 1,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(programs[2].title)
    expect(JSON.stringify(result)).not.toContain('PRIVATE_REPEAT_NEW_HASH')
    expect(JSON.stringify(result)).not.toContain('Synthetic episode variation')
  })

  it('does not mistake two genuinely different normalized source titles for the same search', async () => {
    const value = input()
    const original = value.windowRecords[2].items[2]
    value.windowRecords[2].items.push({
      ...original,
      program: { ...original.program, id: 'PRIVATE_DIFFERENT_TITLE', title: `${original.program.title} second` },
      start: original.start + 3600, end: original.end + 3600,
    })
    const windowKey = `${value.windowRecords[2].from}_${value.windowRecords[2].to}`
    value.checkpoint.windows[windowKey].count++
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineNoLocalTitleGroups).toMatchObject({
      missingOriginalKeysInspected: 2, uniqueNormalizedSourceTitles: 2,
      repeatedNormalizedTitleGroups: 0, duplicateOriginalKeysWithinTitleGroups: 0,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain('PRIVATE_DIFFERENT_TITLE')
  })


  it('counts cached Joyn/Algolia type evidence for no-local titles without inventing TMDB matches', async () => {
    const title = programs[2].title
    const value = input()
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: 'movie', reason: 'exact_joyn_search',
      exactTypes: ['movie'], exactCount: 1,
      exactResults: [{ type: 'movie', joynType: 'Movie',
        title, id: 'PRIVATE_JOYN_SOURCE_IDENTIFIER' }],
    })
    lookup.set('algolia-hits-v1', title, {
      status: 'ready', hits: [{ type: 'MOVIE', titles: { DE: title },
        id: 'PRIVATE_ALGOLIA_SOURCE_IDENTIFIER' }],
    })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineNoLocalCachedTypeEvidence).toEqual({
      uniqueNormalizedSourceTitlesInspected: 1,
      titleGroupsWithCachedJoynSearch: 1,
      titleGroupsWithCachedAlgoliaHits: 1,
      titleGroupsWithTrustedJoynType: 1,
      titleGroupsWithValidatedAlgoliaType: 1,
      titleGroupsWithOnlyMovieType: 1,
      titleGroupsWithOnlySeriesType: 0,
      titleGroupsWithConflictingTypes: 0,
      titleGroupsWithoutTrustedType: 0,
      externalRequestsStarted: 0,
    })
    expect(report.offlineLocalPreflight.locallyMatchedWithoutExternalCalls).toBe(0)
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    for (const secret of [title, 'PRIVATE_JOYN_SOURCE_IDENTIFIER', 'PRIVATE_ALGOLIA_SOURCE_IDENTIFIER']) {
      expect(JSON.stringify(report)).not.toContain(secret)
    }
  })

  it('classifies contradictory cached Joyn vs Algolia types as conflicts for one title', async () => {
    const title = programs[2].title
    const value = input()
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: 'movie', reason: 'exact_joyn_search',
      exactTypes: ['movie'], exactCount: 1,
      exactResults: [{ type: 'movie', joynType: 'Movie', title }],
    })
    lookup.set('algolia-hits-v1', title, {
      status: 'ready', hits: [{ type: 'SERIES', titles: { DE: title } }],
    })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineNoLocalCachedTypeEvidence).toMatchObject({
      titleGroupsWithTrustedJoynType: 1,
      titleGroupsWithValidatedAlgoliaType: 1,
      titleGroupsWithOnlyMovieType: 0,
      titleGroupsWithOnlySeriesType: 0,
      titleGroupsWithConflictingTypes: 1,
      titleGroupsWithoutTrustedType: 0, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
  })

  it('does not count expired or invalid cached type evidence for no-local titles', async () => {
    const title = programs[2].title
    const value = input()
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: 'series', reason: 'exact_joyn_search',
      exactTypes: ['series'], exactCount: 1,
      exactResults: [{ type: 'series', joynType: 'Series', title }],
    })
    lookup.set('algolia-hits-v1', title, {
      status: 'ready', hits: [{ type: 'SERIES', titles: { DE: 'Different title' } }],
    })
    const originalKey = lookup.cacheKey('joyn-title-v1', title)
    lookup.entries[originalKey].checkedAt = new Date(NOW - 8 * 86_400_000).toISOString()
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineNoLocalCachedTypeEvidence).toMatchObject({
      titleGroupsWithCachedJoynSearch: 0,
      titleGroupsWithCachedAlgoliaHits: 1,
      titleGroupsWithTrustedJoynType: 0,
      titleGroupsWithValidatedAlgoliaType: 0,
      titleGroupsWithOnlyMovieType: 0,
      titleGroupsWithOnlySeriesType: 0,
      titleGroupsWithoutTrustedType: 1,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
  })


  it('models the exact two year-free first-pass TMDB cache slots for an untyped source title', async () => {
    const report = await inspectJoynRestoredSourceCacheCoverage(input())
    expect(report.offlineNoLocalTmdbFirstPassCache).toEqual({
      uniqueTitleGroupsInspected: 1,
      movieOnlyGroups: 0,
      seriesOnlyGroups: 0,
      unknownOrConflictingGroups: 1,
      modelMovieSearchSlots: 1,
      modelSeriesSearchSlots: 1,
      modelTotalSearchSlots: 2,
      cachedReadySearchResponses: 0,
      cachedNonemptySearchResponses: 0,
      missingSearchResponses: 2,
      invalidCachedSearchResponses: 0,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(programs[2].title)
  })

  it('reuses a real-shape, still-valid cached TMDB response for a typed title WITHOUT starting requests', async () => {
    const value = input()
    const title = programs[2].title
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: 'movie', reason: 'exact_joyn_search',
      exactTypes: ['movie'], exactCount: 1,
      exactResults: [{ type: 'movie', joynType: 'Movie', title }],
    })
    const requestKey = JSON.stringify(['/search/movie', {
      language: 'de-DE', query: title, include_adult: 'false',
    }])
    lookup.set('tmdb-search-v1', requestKey, {
      results: [{ id: 999, title: 'PRIVATE_REMOTE_TITLE_NO_PUBLICATION' }],
    })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineNoLocalTmdbFirstPassCache).toMatchObject({
      uniqueTitleGroupsInspected: 1, movieOnlyGroups: 1,
      seriesOnlyGroups: 0, unknownOrConflictingGroups: 0,
      modelMovieSearchSlots: 1, modelSeriesSearchSlots: 0,
      modelTotalSearchSlots: 1, cachedReadySearchResponses: 1,
      cachedNonemptySearchResponses: 1, missingSearchResponses: 0,
      invalidCachedSearchResponses: 0, externalRequestsStarted: 0,
    })
    expect(report.offlineLocalPreflight.unresolvedWithoutLocalCandidates).toBe(1)
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    for (const privateValue of [title, 'PRIVATE_REMOTE_TITLE_NO_PUBLICATION', '999']) {
      expect(JSON.stringify(report)).not.toContain(privateValue)
    }
  })

  it('separates missing, invalid and expired TMDB response cache slots conservatively', async () => {
    const title = programs[2].title
    const value = input()
    const lookup = new JoynLookupCache({}, NOW)
    const movieKey = JSON.stringify(['/search/movie', {
      language: 'de-DE', query: title, include_adult: 'false',
    }])
    const tvKey = JSON.stringify(['/search/tv', {
      language: 'de-DE', query: title, include_adult: 'false',
    }])
    lookup.set('tmdb-search-v1', movieKey, { results: [] })
    lookup.set('tmdb-search-v1', tvKey, { results: 'invalid-original-cache-payload' })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineNoLocalTmdbFirstPassCache).toMatchObject({
      modelTotalSearchSlots: 2,
      cachedReadySearchResponses: 1, cachedNonemptySearchResponses: 0,
      missingSearchResponses: 0, invalidCachedSearchResponses: 1,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)

    const cacheEntry = lookup.entries[lookup.cacheKey('tmdb-search-v1', movieKey)]
    cacheEntry.checkedAt = new Date(NOW - 8 * 86_400_000).toISOString()
    value.lookupCache.entries = lookup.entries
    const stale = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(stale.offlineNoLocalTmdbFirstPassCache).toMatchObject({
      cachedReadySearchResponses: 0, missingSearchResponses: 1,
      invalidCachedSearchResponses: 1, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(stale)).toBe(true)
  })


  it('does not replay a Joyn title with missing cached original TMDB first responses', async () => {
    const report = await inspectJoynRestoredSourceCacheCoverage(input())
    expect(report.offlineCachedTmdbMatcherReplay).toEqual({
      titleGroupsInspected: 1, completeFirstPassCache: 0,
      skippedMissingCache: 1, skippedUnsafeResponse: 0,
      replayedTypedMovie: 0, replayedTypedSeries: 0, replayedUntyped: 0,
      hypotheticalMatched: 0, unmatchedNoCandidate: 0,
      unmatchedBelowThreshold: 0, unmatchedAmbiguousMargin: 0,
      unmatchedAmbiguousExactTitle: 0, crossTypeOnly: 0, sameTypeOnly: 0,
      crossAndSame: 0, otherExactAmbiguity: 0, ambiguousTyped: 0,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(programs[2].title)
  })

  it('replays only the ORIGINAL matcher on one complete cached trusted-movie response', async () => {
    const value = input()
    const title = programs[2].title
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: 'movie', reason: 'exact_joyn_search', exactTypes: ['movie'],
      exactCount: 1, exactResults: [{ type: 'movie', joynType: 'Movie', title }],
    })
    lookup.set('tmdb-search-v1', JSON.stringify(['/search/movie', {
      language: 'de-DE', query: title, include_adult: 'false',
    }]), { results: [{
      id: 88321, title, original_title: title, release_date: '2001-01-01',
      overview: 'PRIVATE_TMDB_OVERVIEW_MUST_NOT_LEAK',
    }] })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineCachedTmdbMatcherReplay).toMatchObject({
      titleGroupsInspected: 1, completeFirstPassCache: 1,
      skippedMissingCache: 0, skippedUnsafeResponse: 0,
      replayedTypedMovie: 1, replayedTypedSeries: 0, replayedUntyped: 0,
      hypotheticalMatched: 1, unmatchedNoCandidate: 0,
      unmatchedAmbiguousExactTitle: 0, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    for (const raw of [title, '88321', 'PRIVATE_TMDB_OVERVIEW_MUST_NOT_LEAK']) {
      expect(JSON.stringify(report)).not.toContain(raw)
    }
  })

  it('does not promote two cached exact TMDB identities of an unknown type', async () => {
    const value = input()
    const title = programs[2].title
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('tmdb-search-v1', JSON.stringify(['/search/movie', {
      language: 'de-DE', query: title, include_adult: 'false',
    }]), { results: [{ id: 511, title }] })
    lookup.set('tmdb-search-v1', JSON.stringify(['/search/tv', {
      language: 'de-DE', query: title, include_adult: 'false',
    }]), { results: [{ id: 512, name: title }] })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineCachedTmdbMatcherReplay).toMatchObject({
      titleGroupsInspected: 1, completeFirstPassCache: 1,
      replayedUntyped: 1, hypotheticalMatched: 0,
      unmatchedAmbiguousExactTitle: 1,
      crossTypeOnly: 1, sameTypeOnly: 0,
      crossAndSame: 0, otherExactAmbiguity: 0, ambiguousTyped: 0,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(title)
  })


  it('classifies same-type exact-title collisions without promoting a match', async () => {
    const value = input()
    const title = programs[2].title
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: 'movie', reason: 'exact_joyn_search', exactTypes: ['movie'],
      exactCount: 1, exactResults: [{ type: 'movie', joynType: 'Movie', title }],
    })
    lookup.set('tmdb-search-v1', JSON.stringify(['/search/movie', {
      language: 'de-DE', query: title, include_adult: 'false',
    }]), { results: [{ id: 511, title }, { id: 512, title }] })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineCachedTmdbMatcherReplay).toMatchObject({
      completeFirstPassCache: 1, replayedTypedMovie: 1,
      hypotheticalMatched: 0, unmatchedAmbiguousExactTitle: 1,
      sameTypeOnly: 1, crossTypeOnly: 0, crossAndSame: 0,
      otherExactAmbiguity: 0, ambiguousTyped: 1,
      externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(title)
  })

  it('separates mixed movie/series and duplicate same-type collisions', async () => {
    const value = input()
    const title = programs[2].title
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('tmdb-search-v1', JSON.stringify(['/search/movie', {
      language: 'de-DE', query: title, include_adult: 'false',
    }]), { results: [{ id: 511, title }, { id: 512, title }] })
    lookup.set('tmdb-search-v1', JSON.stringify(['/search/tv', {
      language: 'de-DE', query: title, include_adult: 'false',
    }]), { results: [{ id: 513, name: title }] })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineCachedTmdbMatcherReplay).toMatchObject({
      completeFirstPassCache: 1, hypotheticalMatched: 0,
      unmatchedAmbiguousExactTitle: 1, crossTypeOnly: 0,
      sameTypeOnly: 0, crossAndSame: 1,
      otherExactAmbiguity: 0, ambiguousTyped: 0, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(title)
  })


  it('counts only private same-type ambiguity metadata and existing TMDB runtime cache, never identity', async () => {
    const value = input()
    const title = programs[2].title
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('joyn-title-v1', title, {
      type: 'movie', reason: 'exact_joyn_search', exactTypes: ['movie'],
      exactCount: 1, exactResults: [{ type: 'movie', joynType: 'Movie', title }],
    })
    lookup.set('tmdb-search-v1', JSON.stringify(['/search/movie', {
      language: 'de-DE', query: title, include_adult: 'false',
    }]), { results: [
      { id: 511, title, release_date: '1995-04-04',
        overview: 'PRIVATE_DESCRIPTION_FOR_ONE_OF_TWO_DIFFERENT_TMDB_FILMS' },
      { id: 512, title, release_date: '2005-04-04',
        overview: 'PRIVATE_DESCRIPTION_FOR_ANOTHER_TMDB_FILM' },
    ] })
    for (const id of [511, 512]) {
      lookup.set('tmdb-search-v1', JSON.stringify([`/movie/${id}`, {
        language: 'de-DE',
      }]), { id, runtime: id === 511 ? 12 : 38 })
    }
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineCachedTmdbMatcherReplay).toMatchObject({
      sameTypeOnly: 1, unmatchedAmbiguousExactTitle: 1,
      hypotheticalMatched: 0, externalRequestsStarted: 0,
    })
    expect(report.offlineSameTypeAmbiguityEvidence).toEqual({
      sameTypeGroupsInspected: 1, movieOnlyGroups: 1, seriesOnlyGroups: 0,
      trustedSourceTypeGroups: 1, sourceDescriptionGroups: 1,
      allExactTmdbOverviewsGroups: 1, sourceDescriptionAndAllOverviewsGroups: 1,
      differentTmdbReleaseYearsGroups: 1, typedMoviesWithBroadcastDuration: 1,
      typedMoviesWithAllCachedRuntimeDetails: 1, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    for (const secret of [title, '511', '512', 'PRIVATE_DESCRIPTION_FOR']) {
      expect(JSON.stringify(report)).not.toContain(secret)
    }

    // The actual seven-day cache TTL is honored for detail evidence too.
    const detailKey = lookup.cacheKey('tmdb-search-v1',
      JSON.stringify(['/movie/512', { language: 'de-DE' }]))
    lookup.entries[detailKey].checkedAt = new Date(NOW - 8 * 86_400_000).toISOString()
    value.lookupCache.entries = lookup.entries
    const stale = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(stale.offlineSameTypeAmbiguityEvidence).toMatchObject({
      sameTypeGroupsInspected: 1, typedMoviesWithBroadcastDuration: 1,
      typedMoviesWithAllCachedRuntimeDetails: 0, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(stale)).toBe(true)
  })

  it('classifies two exact series TMDB candidates without pretending they have trusted Joyn type', async () => {
    const value = input()
    const title = programs[2].title
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('tmdb-search-v1', JSON.stringify(['/search/movie', {
      language: 'de-DE', query: title, include_adult: 'false',
    }]), { results: [] })
    lookup.set('tmdb-search-v1', JSON.stringify(['/search/tv', {
      language: 'de-DE', query: title, include_adult: 'false',
    }]), { results: [
      { id: 911, name: title, first_air_date: '1991-01-01' },
      { id: 912, name: title, first_air_date: '1992-01-01' },
    ] })
    value.lookupCache.entries = lookup.entries
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineCachedTmdbMatcherReplay).toMatchObject({
      sameTypeOnly: 1, unmatchedAmbiguousExactTitle: 1,
      hypotheticalMatched: 0, externalRequestsStarted: 0,
    })
    expect(report.offlineSameTypeAmbiguityEvidence).toEqual({
      sameTypeGroupsInspected: 1, movieOnlyGroups: 0, seriesOnlyGroups: 1,
      trustedSourceTypeGroups: 0, sourceDescriptionGroups: 1,
      allExactTmdbOverviewsGroups: 0, sourceDescriptionAndAllOverviewsGroups: 0,
      differentTmdbReleaseYearsGroups: 1, typedMoviesWithBroadcastDuration: 0,
      typedMoviesWithAllCachedRuntimeDetails: 0, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
  })

  it('skips partial and malformed cached responses instead of assuming an empty search', async () => {
    const value = input()
    const title = programs[2].title
    const lookup = new JoynLookupCache({}, NOW)
    const movieKey = JSON.stringify(['/search/movie', {
      language: 'de-DE', query: title, include_adult: 'false',
    }])
    lookup.set('tmdb-search-v1', movieKey, {
      results: [{ id: 'PRIVATE_INVALID_TMDB_ID', title }],
    })
    value.lookupCache.entries = lookup.entries
    const unsafe = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(unsafe.offlineCachedTmdbMatcherReplay).toMatchObject({
      titleGroupsInspected: 1, completeFirstPassCache: 0,
      skippedMissingCache: 0, skippedUnsafeResponse: 1,
      hypotheticalMatched: 0, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(unsafe)).toBe(true)
    expect(JSON.stringify(unsafe)).not.toContain('PRIVATE_INVALID_TMDB_ID')

    lookup.entries[lookup.cacheKey('tmdb-search-v1', movieKey)].checkedAt =
      new Date(NOW - 8 * 86_400_000).toISOString()
    value.lookupCache.entries = lookup.entries
    const expired = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(expired.offlineCachedTmdbMatcherReplay).toMatchObject({
      completeFirstPassCache: 0, skippedMissingCache: 1,
      skippedUnsafeResponse: 0, externalRequestsStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(expired)).toBe(true)
  })

  it('honours modified original source description and duration in hash identity', async () => {
    const value = input()
    value.windowRecords[2].items[0].program.description = 'Different original description'
    value.windowRecords[2].items[4].end += 60
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.match).toMatchObject({
      exactOriginalSourceKeyPresent: 2,
      exactOriginalSourceKeyAbsent: 3,
      reusablePositiveDecisions: 0,
      reusableNegativeDecisions: 0,
    })
  })

  it('never marks a stale but otherwise complete original source as current', async () => {
    const value = input()
    value.status.generatedAt = new Date(NOW - 5 * 86_400_000).toISOString()
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.source.sourceRecent).toBe(false)
    expect(report.gate.usableForCurrentHorizon).toBe(false)
    expect(report.gate.freshOriginalMatcherReceiptsApproved).toBe(false)
  })

  it('rejects mismatched windows, incomplete 14-day source and corrupt snapshots', async () => {
    const wrong = input()
    wrong.windowRecords[2].items.pop()
    await expect(inspectJoynRestoredSourceCacheCoverage(wrong)).rejects.toThrow()
    const status = input()
    status.status.status = 'failed'
    await expect(inspectJoynRestoredSourceCacheCoverage(status)).rejects.toThrow()
    const gap = input()
    gap.windowRecords.pop()
    await expect(inspectJoynRestoredSourceCacheCoverage(gap)).rejects.toThrow()
    const badCache = input()
    badCache.matchCache.schemaVersion = 99
    await expect(inspectJoynRestoredSourceCacheCoverage(badCache)).rejects.toThrow()
  })

  it('accepts only exact fixed aggregate schema and never an arbitrary raw title', async () => {
    const report = await inspectJoynRestoredSourceCacheCoverage(input())
    const rejected = [
      { ...report, rawOriginal: SECRET },
      { ...report, source: { ...report.source, title: SECRET } },
      { ...report, match: { ...report.match, exactOriginalSourceKeyAbsent: 9999 } },
      { ...report, match: { ...report.match, distinctMissingOriginalKeys: 1000 } },
      { ...report, match: { ...report.match, distinctReusablePositiveKeys: 1000 } },
      { ...report, match: { ...report.match, distinctOriginalSourceKeys: 99999 } },
      { ...report, match: { ...report.match, rawOriginalHash: SECRET } },
      { ...report, offlineLocalPreflight: { ...report.offlineLocalPreflight, privateTitle: SECRET } },
      { ...report, offlineLocalPreflight: { ...report.offlineLocalPreflight, distinctMissingKeysInspected: 0 } },
      { ...report, offlineLocalPreflight: { ...report.offlineLocalPreflight, providerOrTmdbQueriesStarted: 1 } },
      { ...report, offlineLocalPreflight: { ...report.offlineLocalPreflight, locallyMatchedWithoutExternalCalls: 999 } },
      { ...report, offlineLocalRejectionReasons: { ...report.offlineLocalRejectionReasons, rawReason: SECRET } },
      { ...report, offlineLocalRejectionReasons: { ...report.offlineLocalRejectionReasons, ambiguousExactTitle: 1 } },
      { ...report, offlineLocalCandidateContext: { ...report.offlineLocalCandidateContext, rawTitle: SECRET } },
      { ...report, offlineLocalCandidateContext: { ...report.offlineLocalCandidateContext, multipleLocalCandidates: 2 } },
      { ...report, offlineTrustedJoynTypeReplay: { ...report.offlineTrustedJoynTypeReplay, rawTitle: SECRET } },
      { ...report, offlineTrustedJoynTypeReplay: { ...report.offlineTrustedJoynTypeReplay, externalRequestsStarted: 1 } },
      { ...report, offlineTrustedJoynTypeReplay: { ...report.offlineTrustedJoynTypeReplay, ambiguousKeysInspected: 12 } },
      { ...report, offlineTrustedJoynTypeReplay: { ...report.offlineTrustedJoynTypeReplay, cachedNoExactType: 1 } },
      { ...report, offlineTrustedJoynTypeReplay: { ...report.offlineTrustedJoynTypeReplay, typedAmbiguousExactTitle: 1 } },
      { ...report, offlineCachedAlgoliaReplay: { ...report.offlineCachedAlgoliaReplay, privateTitle: SECRET } },
      { ...report, offlineCachedAlgoliaReplay: { ...report.offlineCachedAlgoliaReplay, externalRequestsStarted: 1 } },
      { ...report, offlineCachedAlgoliaReplay: { ...report.offlineCachedAlgoliaReplay, cachedAlgoliaMovieType: 1 } },
      { ...report, offlineNoLocalTitleGroups: { ...report.offlineNoLocalTitleGroups, privateTitle: SECRET } },
      { ...report, offlineNoLocalTitleGroups: { ...report.offlineNoLocalTitleGroups, externalRequestsStarted: 1 } },
      { ...report, offlineNoLocalTitleGroups: { ...report.offlineNoLocalTitleGroups, uniqueNormalizedSourceTitles: 99 } },
      { ...report, offlineNoLocalCachedTypeEvidence: { ...report.offlineNoLocalCachedTypeEvidence, privateTitle: SECRET } },
      { ...report, offlineNoLocalCachedTypeEvidence: { ...report.offlineNoLocalCachedTypeEvidence, titleGroupsWithOnlyMovieType: 99 } },
      { ...report, offlineNoLocalCachedTypeEvidence: { ...report.offlineNoLocalCachedTypeEvidence, externalRequestsStarted: 1 } },
      { ...report, offlineNoLocalTmdbFirstPassCache: { ...report.offlineNoLocalTmdbFirstPassCache, privateTitle: SECRET } },
      { ...report, offlineNoLocalTmdbFirstPassCache: { ...report.offlineNoLocalTmdbFirstPassCache, externalRequestsStarted: 1 } },
      { ...report, offlineNoLocalTmdbFirstPassCache: { ...report.offlineNoLocalTmdbFirstPassCache, modelMovieSearchSlots: 99 } },
      { ...report, offlineNoLocalTmdbFirstPassCache: { ...report.offlineNoLocalTmdbFirstPassCache, cachedReadySearchResponses: 2 } },
      { ...report, offlineCachedTmdbMatcherReplay: { ...report.offlineCachedTmdbMatcherReplay, rawTmdbId: SECRET } },
      { ...report, offlineCachedTmdbMatcherReplay: { ...report.offlineCachedTmdbMatcherReplay, externalRequestsStarted: 1 } },
      { ...report, offlineCachedTmdbMatcherReplay: { ...report.offlineCachedTmdbMatcherReplay, hypotheticalMatched: 99 } },
      { ...report, offlineCachedTmdbMatcherReplay: { ...report.offlineCachedTmdbMatcherReplay, crossTypeOnly: 99 } },
      { ...report, offlineCachedTmdbMatcherReplay: { ...report.offlineCachedTmdbMatcherReplay, ambiguousTyped: 99 } },
      { ...report, offlineSameTypeAmbiguityEvidence: { ...report.offlineSameTypeAmbiguityEvidence, originalPrivateTitle: SECRET } },
      { ...report, offlineSameTypeAmbiguityEvidence: { ...report.offlineSameTypeAmbiguityEvidence, externalRequestsStarted: 1 } },
      { ...report, offlineSameTypeAmbiguityEvidence: { ...report.offlineSameTypeAmbiguityEvidence, sameTypeGroupsInspected: 88 } },
      { ...report, offlineSameTypeAmbiguityEvidence: { ...report.offlineSameTypeAmbiguityEvidence, typedMoviesWithAllCachedRuntimeDetails: 7 } },
      { ...report, gate: { ...report.gate, freshOriginalMatcherReceiptsApproved: true } },
      { ...report, gate: { ...report.gate, measuredProductionSavings: 100 } },
      { ...report, mode: SECRET },
    ]
    for (const item of rejected) expect(isSafeJoynRestoredSourceCoverage(item)).toBe(false)
  })
})
