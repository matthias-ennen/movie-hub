import { describe, expect, it } from 'vitest'
import {
  PROVIDER_CATALOG_DEFINITIONS,
  PROVIDER_CATALOG_SIZE,
  PROVIDER_HOME_SIZE,
  buildHomeIds,
  buildProviderHomeRows,
  mergeProviderCatalogTitle,
} from '../scripts/provider-catalogs.mjs'
import { buildProviderBrowseRows } from '../src/catalog/providerCatalogRows.js'

describe('provider catalog architecture', () => {
  it('keeps 100 movies and 100 series per provider with 20 mixed home titles', () => {
    expect(PROVIDER_CATALOG_SIZE).toBe(100)
    expect(PROVIDER_HOME_SIZE).toBe(20)
    expect(PROVIDER_CATALOG_DEFINITIONS.map((provider) => provider.id)).toEqual([
      'netflix', 'prime', 'disney', 'youtube', 'waipu',
    ])
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

  it('turns provider catalogs into editorial home rows', () => {
    const rows = buildProviderHomeRows({
      netflix: {
        homeTitle: 'Beliebt auf Netflix',
        homeIds: ['tmdb-movie-1', 'tmdb-series-2'],
      },
      waipu: {
        homeTitle: 'Aus der waiputhek',
        homeIds: ['tmdb-movie-3'],
      },
    })

    expect(rows).toEqual([
      {
        id: 'provider-netflix-home',
        title: 'Beliebt auf Netflix',
        ids: ['tmdb-movie-1', 'tmdb-series-2'],
      },
      {
        id: 'provider-waipu-home',
        title: 'Aus der waiputhek',
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

    expect(movieRows[0].title).toBe('Filme auf Netflix')
    expect(movieRows[0].items.map((item) => item.id)).toEqual(['tmdb-movie-1'])
    expect(movieRows[1].title).toBe('Weitere Filme in Movie Hub')
    expect(movieRows[1].items.map((item) => item.id)).toEqual(['tmdb-movie-3'])
    expect(seriesRows).toHaveLength(1)
    expect(seriesRows[0].title).toBe('Serien auf Netflix')
    expect(seriesRows[0].items.map((item) => item.id)).toEqual(['tmdb-series-2'])
  })
})
