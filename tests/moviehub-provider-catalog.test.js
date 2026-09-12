import { describe, expect, it } from 'vitest'
import { buildMovieHubCatalogRows } from '../src/catalog/movieHubCatalog.js'
import { buildCategoryRows } from '../src/catalog/categoryRows.js'

function title(id, type = 'movie') {
  return {
    id: `tmdb-${type}-${id}`,
    tmdbId: id,
    type,
    title: `Titel ${id}`,
    providerIds: ['moviehub'],
    genres: [{ id: 28, name: 'Action' }],
  }
}

describe('Movie Hub als virtueller Anbieter', () => {
  it('builds mixed, movie and series provider rows without duplicate titles', () => {
    const items = [title(1), title(2, 'series'), title(1)]
    const home = buildMovieHubCatalogRows(items)
    const movies = buildMovieHubCatalogRows(items, 'movie')
    const series = buildMovieHubCatalogRows(items, 'series')

    expect(home[0]).toMatchObject({ providerId: 'moviehub', title: 'Bei Movie Hub verfügbar' })
    expect(home[0].items).toHaveLength(2)
    expect(movies[0].title).toBe('Filme bei Movie Hub')
    expect(series[0].title).toBe('Serien bei Movie Hub')
    expect(movies[0].items.every((item) => item.type === 'movie')).toBe(true)
    expect(series[0].items.every((item) => item.type === 'series')).toBe(true)
  })

  it('makes Movie-Hub titles eligible for profile categories when the provider is active', () => {
    const items = Array.from({ length: 6 }, (_, index) => title(index + 1))
    expect(buildCategoryRows({
      titles: items,
      mediaType: 'movie',
      enabledCategoryIds: ['action'],
      enabledProviderIds: ['moviehub'],
    })).toHaveLength(1)
    expect(buildCategoryRows({
      titles: items,
      mediaType: 'movie',
      enabledCategoryIds: ['action'],
      enabledProviderIds: [],
    })).toEqual([])
  })
})
