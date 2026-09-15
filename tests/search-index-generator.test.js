import { describe, expect, it } from 'vitest'
import {
  SEARCH_OFFER_TYPES,
  buildSearchDiscoverParams,
  mergeSearchDetails,
  mergeProviderSearchEntries,
  resolveSearchPageLimits,
  resolveSearchDetailRefreshOptions,
  searchPageLimitForMediaType,
  searchEntryFromDiscover,
  selectSearchDetailEnrichmentCandidates,
} from '../scripts/generate-search-index.mjs'

const prime = {
  id: 'prime',
  label: 'Prime Video',
  aliases: ['amazonprimevideo', 'primevideo'],
}

function movie(id = 1, overrides = {}) {
  return {
    id,
    title: 'Testfilm',
    original_title: 'Test Movie',
    release_date: '2024-05-01',
    poster_path: '/poster.jpg',
    popularity: 42,
    ...overrides,
  }
}

describe('breiter Provider-Suchindex', () => {
  it('configures movie and series discovery independently without an arbitrary 50-page cap', () => {
    const limits = resolveSearchPageLimits({
      TMDB_SEARCH_PAGES_PER_OFFER: '32',
      TMDB_SEARCH_MOVIE_PAGES_PER_OFFER: '75',
      TMDB_SEARCH_SERIES_PAGES_PER_OFFER: '50',
    })

    expect(limits).toEqual({ movie: 75, series: 50 })
    expect(searchPageLimitForMediaType('movie', limits)).toBe(75)
    expect(searchPageLimitForMediaType('tv', limits)).toBe(50)
  })

  it('keeps the external TMDB discovery maximum of 500 pages', () => {
    const limits = resolveSearchPageLimits({
      TMDB_SEARCH_MOVIE_PAGES_PER_OFFER: '700',
      TMDB_SEARCH_SERIES_PAGES_PER_OFFER: '900',
    })

    expect(searchPageLimitForMediaType('movie', limits)).toBe(500)
    expect(searchPageLimitForMediaType('tv', limits)).toBe(500)
  })

  it('uses a sustainable default refresh capacity and bounds explicit settings', () => {
    expect(resolveSearchDetailRefreshOptions({})).toEqual({ limit: 800, maxAgeDays: 30 })
    expect(resolveSearchDetailRefreshOptions({
      TMDB_SEARCH_DETAIL_ENRICH_LIMIT: '5000',
      TMDB_SEARCH_DETAIL_MAX_AGE_DAYS: '500',
    })).toEqual({ limit: 2000, maxAgeDays: 365 })
    expect(resolveSearchDetailRefreshOptions({
      TMDB_SEARCH_DETAIL_ENRICH_LIMIT: '0',
      TMDB_SEARCH_DETAIL_MAX_AGE_DAYS: '14',
    })).toEqual({ limit: 0, maxAgeDays: 14 })
  })

  it('queries one provider and one offer type explicitly in Germany', () => {
    expect(buildSearchDiscoverParams([9], 'movie', 'rent', 3)).toMatchObject({
      language: 'de-DE',
      region: 'DE',
      watch_region: 'DE',
      with_watch_providers: '9',
      with_watch_monetization_types: 'rent',
      include_adult: false,
      page: 3,
    })
    expect(SEARCH_OFFER_TYPES).toEqual(['flatrate', 'free', 'ads', 'rent', 'buy'])
  })

  it('creates a compact search entry directly from TMDB discover data', () => {
    const entry = searchEntryFromDiscover(movie(42), 'movie', prime, [9], 'buy')

    expect(entry).toMatchObject({
      id: 'tmdb-movie-42',
      tmdbId: 42,
      type: 'movie',
      title: 'Testfilm',
      originalTitle: 'Test Movie',
      year: 2024,
      providerIds: ['prime'],
    })
    expect(entry.posterUrl).toContain('/w500/poster.jpg')
    expect(entry.providerOffers).toEqual([
      { id: 'prime', tmdbProviderId: 9, offerTypes: ['buy'] },
    ])
    expect(entry).not.toHaveProperty('description')
    expect(entry).not.toHaveProperty('cast')
  })

  it('merges offer types for the same provider instead of duplicating the title', () => {
    const rent = searchEntryFromDiscover(movie(42), 'movie', prime, [9], 'rent')
    const buy = searchEntryFromDiscover(movie(42), 'movie', prime, [9], 'buy')
    const [merged] = mergeProviderSearchEntries([rent, buy])

    expect(merged.providerIds).toEqual(['prime'])
    expect(merged.providerOffers).toEqual([
      { id: 'prime', tmdbProviderId: 9, offerTypes: ['rent', 'buy'] },
    ])
  })

  it('merges different providers while keeping their offer types separate', () => {
    const primeEntry = searchEntryFromDiscover(movie(42), 'movie', prime, [9], 'flatrate')
    const netflixEntry = searchEntryFromDiscover(movie(42), 'movie', {
      id: 'netflix',
      label: 'Netflix',
      aliases: ['netflix'],
    }, [8], 'flatrate')

    const [merged] = mergeProviderSearchEntries([primeEntry, netflixEntry])
    expect(merged.providerIds.sort()).toEqual(['netflix', 'prime'])
    expect(merged.providerOffers).toEqual(expect.arrayContaining([
      { id: 'prime', tmdbProviderId: 9, offerTypes: ['flatrate'] },
      { id: 'netflix', tmdbProviderId: 8, offerTypes: ['flatrate'] },
    ]))
  })

  it('drops non-product membership markers when catalog entries are merged', () => {
    const [merged] = mergeProviderSearchEntries([{
      id: 'tmdb-movie-42',
      tmdbId: 42,
      type: 'movie',
      title: 'Testfilm',
      providerIds: ['prime'],
      providerOffers: [{ id: 'prime', tmdbProviderId: 9, offerTypes: ['catalog', 'rent'] }],
      scope: 'public',
    }])

    expect(merged.providerOffers[0].offerTypes).toEqual(['rent'])
  })

  it('keeps successful enrichment ahead of an incomplete historic catalog snapshot', () => {
    const incompleteCatalog = {
      id: 'tmdb-movie-42',
      tmdbId: 42,
      type: 'movie',
      title: 'Alter Katalogtitel',
      posterPath: '/catalog-poster.jpg',
      metadataComplete: false,
      completeness: 'catalog',
    }
    const enriched = {
      id: 'tmdb-movie-42',
      tmdbId: 42,
      type: 'movie',
      title: 'Vollständiger Titel',
      description: 'Vollständige TMDB-Details',
      metadataComplete: true,
      metadataVersion: 2,
      completeness: 'enriched',
    }

    const [merged] = mergeSearchDetails([
      incompleteCatalog,
      enriched,
      incompleteCatalog,
    ])

    expect(merged).toMatchObject({
      title: 'Vollständiger Titel',
      description: 'Vollständige TMDB-Details',
      posterPath: '/catalog-poster.jpg',
      metadataComplete: true,
      completeness: 'enriched',
    })
  })

  it('refreshes gaps first and then stale details from oldest to newest', () => {
    const entries = [1, 2, 3, 4, 5, 6].map((id) => ({
      id: `tmdb-movie-${id}`,
      tmdbId: id,
      type: 'movie',
    }))
    const complete = (id, metadataUpdatedAt, overrides = {}) => ({
      id: `tmdb-movie-${id}`,
      tmdbId: id,
      type: 'movie',
      metadataComplete: true,
      metadataUpdatedAt,
      collectionChecked: true,
      ...overrides,
    })
    const existingDetails = [
      { ...complete(1, '2026-09-14T00:00:00.000Z'), metadataComplete: false },
      complete(2, '2026-05-01T00:00:00.000Z', { collectionId: 42, collectionDetails: null }),
      complete(3, '2026-06-01T00:00:00.000Z'),
      complete(4, '2026-07-15T00:00:00.000Z'),
      complete(5, 'kein-datum'),
      complete(6, '2026-09-10T00:00:00.000Z'),
    ]

    const selected = selectSearchDetailEnrichmentCandidates(entries, existingDetails, {
      limit: 5,
      maxAgeDays: 30,
      now: new Date('2026-09-15T00:00:00.000Z'),
    })

    expect(selected.map((entry) => entry.tmdbId)).toEqual([1, 2, 5, 3, 4])
  })

  it('does not refresh complete details before their configured age', () => {
    const entry = { id: 'tmdb-movie-42', tmdbId: 42, type: 'movie' }
    const details = [{
      ...entry,
      metadataComplete: true,
      metadataUpdatedAt: '2026-08-17T00:00:01.000Z',
      collectionChecked: true,
    }]

    expect(selectSearchDetailEnrichmentCandidates([entry], details, {
      now: new Date('2026-09-15T00:00:00.000Z'),
      maxAgeDays: 30,
      limit: 800,
    })).toEqual([])
  })

  it('does not repeatedly refresh fresh optional collection or season gaps', () => {
    const entries = [
      { id: 'tmdb-movie-42', tmdbId: 42, type: 'movie' },
      { id: 'tmdb-series-43', tmdbId: 43, type: 'series' },
    ]
    const details = [
      {
        ...entries[0],
        metadataComplete: true,
        metadataUpdatedAt: '2026-09-14T00:00:00.000Z',
        collectionId: 7,
        collectionDetails: null,
      },
      {
        ...entries[1],
        metadataComplete: true,
        metadataUpdatedAt: '2026-09-14T00:00:00.000Z',
        seasons: [],
      },
    ]

    expect(selectSearchDetailEnrichmentCandidates(entries, details, {
      now: new Date('2026-09-15T00:00:00.000Z'),
      maxAgeDays: 30,
      limit: 800,
    })).toEqual([])
  })
})
