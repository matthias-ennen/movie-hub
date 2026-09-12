import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORY_SETTINGS,
  MOVIE_CATEGORY_OPTIONS,
  SERIES_CATEGORY_OPTIONS,
  buildCategoryRows,
  normalizeCategorySettings,
} from '../src/catalog/categoryRows.js'

function title(id, {
  type = 'movie',
  genreId = 28,
  providerIds = ['netflix'],
  year = 2020,
  popularity = 1,
  voteCount = 10,
  voteAverage = 7,
} = {}) {
  return {
    id,
    title: id,
    type,
    genres: [{ id: genreId, name: 'Genre' }],
    providerIds,
    year,
    popularity,
    voteCount,
    voteAverage,
  }
}

describe('profilbezogene Videothek-Kategorien', () => {
  it('activates every defined movie and series category by default', () => {
    expect(DEFAULT_CATEGORY_SETTINGS.enabledMovieCategoryIds)
      .toEqual(MOVIE_CATEGORY_OPTIONS.map((category) => category.id))
    expect(DEFAULT_CATEGORY_SETTINGS.enabledSeriesCategoryIds)
      .toEqual(SERIES_CATEGORY_OPTIONS.map((category) => category.id))
  })

  it('normalizes legacy, empty and unknown profile settings', () => {
    expect(normalizeCategorySettings()).toEqual(DEFAULT_CATEGORY_SETTINGS)
    expect(normalizeCategorySettings({
      enabledMovieCategoryIds: ['horror', 'unknown', 'action', 'horror'],
      enabledSeriesCategoryIds: [],
    })).toEqual({
      enabledMovieCategoryIds: ['action', 'horror'],
      enabledSeriesCategoryIds: [],
    })
  })

  it('keeps movie and series rows strictly separated', () => {
    const titles = [
      ...Array.from({ length: 6 }, (_, index) => title(`movie-${index}`, { genreId: 35 })),
      ...Array.from({ length: 6 }, (_, index) => title(`series-${index}`, { type: 'series', genreId: 35 })),
    ]

    const movieRows = buildCategoryRows({
      titles,
      mediaType: 'movie',
      enabledCategoryIds: ['comedy'],
      enabledProviderIds: ['netflix'],
    })
    const seriesRows = buildCategoryRows({
      titles,
      mediaType: 'series',
      enabledCategoryIds: ['comedy'],
      enabledProviderIds: ['netflix'],
    })

    expect(movieRows[0].items.every((item) => item.type === 'movie')).toBe(true)
    expect(seriesRows[0].items.every((item) => item.type === 'series')).toBe(true)
  })

  it('filters disabled providers, deduplicates and hides thin rows', () => {
    const titles = [
      ...Array.from({ length: 5 }, (_, index) => title(`netflix-${index}`)),
      title('duplicate', { popularity: 2 }),
      title('duplicate', { popularity: 99 }),
      title('prime-only', { providerIds: ['prime'] }),
    ]

    const rows = buildCategoryRows({
      titles,
      mediaType: 'movie',
      enabledCategoryIds: ['action'],
      enabledProviderIds: ['netflix'],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].items).toHaveLength(6)
    expect(rows[0].items.some((item) => item.id === 'prime-only')).toBe(false)

    expect(buildCategoryRows({
      titles: titles.slice(0, 5),
      mediaType: 'movie',
      enabledCategoryIds: ['action'],
      enabledProviderIds: ['netflix'],
    })).toEqual([])
  })

  it('sorts by popularity and keeps Klassiker before the year 2000', () => {
    const actionTitles = Array.from({ length: 6 }, (_, index) => title(`action-${index}`, { popularity: index }))
    const actionRows = buildCategoryRows({
      titles: actionTitles,
      mediaType: 'movie',
      enabledCategoryIds: ['action'],
      enabledProviderIds: ['netflix'],
    })
    expect(actionRows[0].items.map((item) => item.popularity)).toEqual([5, 4, 3, 2, 1, 0])

    const classicTitles = [
      ...Array.from({ length: 6 }, (_, index) => title(`classic-${index}`, { year: 1990 + index })),
      title('millennium', { year: 2000 }),
      title('unknown-year', { year: null }),
    ]
    const classicRows = buildCategoryRows({
      titles: classicTitles,
      mediaType: 'movie',
      enabledCategoryIds: ['classics'],
      enabledProviderIds: ['netflix'],
    })
    expect(classicRows[0].items.every((item) => item.year < 2000)).toBe(true)
    expect(classicRows[0].items).toHaveLength(6)
  })

  it('limits a category row to forty posters', () => {
    const rows = buildCategoryRows({
      titles: Array.from({ length: 45 }, (_, index) => title(`action-${index}`, { popularity: index })),
      mediaType: 'movie',
      enabledCategoryIds: ['action'],
      enabledProviderIds: ['netflix'],
    })

    expect(rows[0].items).toHaveLength(40)
    expect(rows[0].items[0].popularity).toBe(44)
  })
})
