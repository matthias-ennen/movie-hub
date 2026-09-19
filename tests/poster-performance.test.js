import { afterEach, describe, expect, it } from 'vitest'
import { buildPersonalRows, buildWatchedHistoryRows } from '../src/library/personalRows.js'
import {
  getPosterPrefetchWindow,
  POSTER_PREFETCH_AHEAD,
  prefetchPosterWindow,
  resetPosterPrefetchCacheForTests,
} from '../src/performance/posterPrefetch.js'
import {
  estimatePosterRowHeight,
  limitPosterRowItems,
  ROW_VIRTUAL_OVERSCAN,
  STANDARD_POSTER_ROW_LIMIT,
  TOP_TEN_ROW_LIMIT,
  TV_POSTER_ROW_LIMIT,
} from '../src/performance/posterRows.js'
import { buildTmdbCatalogRows } from '../src/tmdb/tmdbCatalogModel.js'

afterEach(() => {
  resetPosterPrefetchCacheForTests()
  delete globalThis.Image
})

function title(index) {
  return {
    id: `movie-${index}`,
    tmdbId: index,
    type: 'movie',
    title: `Titel ${String(index).padStart(2, '0')}`,
    posterUrl: `https://image.test/${index}.jpg`,
  }
}

describe('Fire-TV Posterreihen-Last', () => {
  it('begrenzt normale Reihen auf 50 und Top 10 auf 10', () => {
    const items = Array.from({ length: 80 }, (_, index) => title(index + 1))
    expect(limitPosterRowItems(items)).toHaveLength(STANDARD_POSTER_ROW_LIMIT)
    expect(limitPosterRowItems(items, 'top-ten')).toHaveLength(TOP_TEN_ROW_LIMIT)
    expect(limitPosterRowItems(Array.from({ length: 200 }, (_, index) => title(index + 1)), 'tv'))
      .toHaveLength(TV_POSTER_ROW_LIMIT)
    expect(ROW_VIRTUAL_OVERSCAN).toBe(2)
    expect(estimatePosterRowHeight('top-ten')).toBeGreaterThan(estimatePosterRowHeight('standard'))
  })

  it('begrenzt persönliche und Verlauf-Reihen bereits vor dem Rendern', () => {
    const items = Array.from({ length: 80 }, (_, index) => title(index + 1))
    const stateById = new Map(items.map((item, index) => [item.id, {
      watchlist: true,
      favorite: true,
      rating: 10 - (index % 10),
      watched: true,
      watchedMarkedAt: new Date(2026, 0, index + 1).toISOString(),
    }]))
    const getTitleState = (item) => stateById.get(item.id)

    const rows = buildPersonalRows(items, getTitleState)
    expect(rows.every((row) => row.items.length === STANDARD_POSTER_ROW_LIMIT)).toBe(true)
    expect(buildWatchedHistoryRows(items, getTitleState)[0].items).toHaveLength(STANDARD_POSTER_ROW_LIMIT)
  })

  it('begrenzt synchronisierte TMDB-Reihen vor der Darstellung', () => {
    const items = Array.from({ length: 80 }, (_, index) => ({
      ...title(index + 1),
      tmdbWatchlist: true,
      tmdbFavorite: true,
      tmdbRated: true,
      tmdbRating: 8,
      watchlistOrder: index,
      favoriteOrder: index,
      ratingOrder: index,
    }))

    const rows = buildTmdbCatalogRows(items)
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.items.length === STANDARD_POSTER_ROW_LIMIT)).toBe(true)
  })

  it('hält beim Fokus mindestens fünf kommende Poster im Prefetch-Fenster', () => {
    const items = Array.from({ length: 12 }, (_, index) => title(index + 1))
    const windowItems = getPosterPrefetchWindow(items, 3)
    expect(POSTER_PREFETCH_AHEAD).toBe(5)
    expect(windowItems.map((item) => item.tmdbId)).toEqual([3, 4, 5, 6, 7, 8, 9])
  })

  it('dedupliziert bereits angeforderte Posterbilder', () => {
    const requested = []
    globalThis.Image = class MockImage {
      set src(value) { requested.push(value) }
      set decoding(_value) {}
      set fetchPriority(_value) {}
    }

    const items = Array.from({ length: 10 }, (_, index) => title(index + 1))
    const first = prefetchPosterWindow(items, 2)
    const second = prefetchPosterWindow(items, 3)

    expect(first.length).toBeGreaterThanOrEqual(6)
    expect(second.length).toBeLessThan(first.length)
    expect(new Set(requested).size).toBe(requested.length)
  })
})
