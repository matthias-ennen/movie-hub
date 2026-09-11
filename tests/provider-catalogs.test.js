import { describe, expect, it } from 'vitest'
import {
  PROVIDER_BROWSE_OFFER_TYPES,
  PROVIDER_CATALOG_DEFINITIONS,
  PROVIDER_CATALOG_SIZE,
  PROVIDER_HOME_SIZE,
  buildHomeIds,
  buildProviderDiscoverParams,
  buildProviderHomeRows,
  mergeProviderCatalogTitle,
} from '../scripts/provider-catalogs.mjs'
import { buildProviderBrowseRows } from '../src/catalog/providerCatalogRows.js'

describe('provider catalog architecture', () => {
  it('keeps 100 movies and 100 series per TMDB provider with 20 mixed home titles', () => {
    expect(PROVIDER_CATALOG_SIZE).toBe(100)
    expect(PROVIDER_HOME_SIZE).toBe(20)
    expect(PROVIDER_CATALOG_DEFINITIONS.map((provider) => provider.id)).toEqual([
      'netflix', 'prime', 'disney', 'youtube', 'joyn', 'wow', 'appletv', 'paramount',
      'rtlplus', 'crunchyroll', 'pluto', 'ard', 'zdf', 'arte', 'netzkino', 'magenta',
    ])
    expect(PROVIDER_CATALOG_DEFINITIONS.map((provider) => provider.id)).not.toContain('waipu')
  })

  it('uses only included/free/ads offers for provider browse catalogs', () => {
    expect(PROVIDER_BROWSE_OFFER_TYPES).toEqual(['flatrate', 'free', 'ads'])

    const movieParams = buildProviderDiscoverParams(119, 'movie', 2)
    expect(movieParams.with_watch_providers).toBe('119')
    expect(movieParams.with_watch_monetization_types).toBe('flatrate|free|ads')
    expect(movieParams.with_watch_monetization_types).not.toContain('rent')
    expect(movieParams.with_watch_monetization_types).not.toContain('buy')
    expect(movieParams.watch_region).toBe('DE')
    expect(movieParams.region).toBe('DE')
    expect(movieParams.page).toBe(2)

    const combinedParams = buildProviderDiscoverParams([119, 701], 'tv')
    expect(combinedParams.region).toBeUndefined()
    expect(combinedParams.with_watch_providers).toBe('119|701')
    expect(combinedParams.with_watch_monetization_types).toBe('flatrate|free|ads')
  })

  it('builds a popularity-sorted mixed home selection', () => {
    const movies = [
      { id: 1, mediaType: 'movie', popularity: 20 },
      { id: 2, mediaType: 'movie', popularity: 5 },
    ]
    const series = [
      { id: 3, mediaType: 'tv', popularity: 30 },
      { id: 4, mediaType: 'tv', popularity: 10 },
    ]

    expect(buildHomeIds(movies, series, 3)).toEqual([
      'tmdb-series-3',
      'tmdb-movie-1',
      'tmdb-series-4',
    ])
  })

  it('turns TMDB provider catalogs into editorial home rows with stable provider ids', () => {
    const rows = buildProviderHomeRows({
      netflix: {
        homeTitle: 'Beliebt auf Netflix',
        homeIds: ['tmdb-movie-1', 'tmdb-series-2'],
      },
      ard: {
        homeTitle: 'Aus der ARD Mediathek',
        homeIds: ['tmdb-movie-3'],
      },
    })

    expect(rows).toEqual([
      {
        id: 'provider-netflix-home',
        providerId: 'netflix',
        title: 'Beliebt auf Netflix',
        ids: ['tmdb-movie-1', 'tmdb-series-2'],
      },
      {
        id: 'provider-ard-home',
        providerId: 'ard',
        title: 'Aus der ARD Mediathek',
        ids: ['tmdb-movie-3'],
      },
    ])
  })

  it('merges provider memberships without duplicating the title', () => {
    const merged = mergeProviderCatalogTitle(
      {
        id: 'tmdb-movie-1',
        tmdbId: 1,
        providerIds: ['netflix'],
        providerOffers: [{ id: 'netflix', tmdbProviderId: 8, offerTypes: ['flatrate'] }],
        videos: [{ id: 'trailer' }],
        cast: [{ name: 'Cast' }],
      },
      {
        id: 'tmdb-movie-1',
        tmdbId: 1,
        providerIds: ['prime'],
        providerOffers: [{ id: 'prime', tmdbProviderId: 119, offerTypes: ['catalog'] }],
        videos: [],
        cast: [],
      },
    )

    expect(merged.providerIds).toEqual(['netflix', 'prime'])
    expect(merged.videos).toEqual([{ id: 'trailer' }])
    expect(merged.cast).toEqual([{ name: 'Cast' }])
  })

  it('separates movie and series rows in the browse tabs', () => {
    const titles = [
      { id: 'tmdb-movie-1', type: 'movie' },
      { id: 'tmdb-series-2', type: 'series' },
      { id: 'tmdb-movie-3', type: 'movie' },
    ]
    const catalogs = {
      netflix: {
        id: 'netflix',
        label: 'Netflix',
        movieTitle: 'Filme auf Netflix',
        seriesTitle: 'Serien auf Netflix',
        movieIds: ['tmdb-movie-1'],
        seriesIds: ['tmdb-series-2'],
      },
    }

    const movieRows = buildProviderBrowseRows(catalogs, titles, 'movie')
    const seriesRows = buildProviderBrowseRows(catalogs, titles, 'series')

    expect(movieRows[0].providerId).toBe('netflix')
    expect(movieRows[0].title).toBe('Filme auf Netflix')
    expect(movieRows[0].items.map((item) => item.id)).toEqual(['tmdb-movie-1'])
    expect(movieRows[1].providerId).toBeNull()
    expect(movieRows[1].title).toBe('Weitere Filme in Movie Hub')
    expect(movieRows[1].items.map((item) => item.id)).toEqual(['tmdb-movie-3'])
    expect(seriesRows).toHaveLength(1)
    expect(seriesRows[0].providerId).toBe('netflix')
    expect(seriesRows[0].title).toBe('Serien auf Netflix')
    expect(seriesRows[0].items.map((item) => item.id)).toEqual(['tmdb-series-2'])
  })
})
