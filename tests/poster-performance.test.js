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
  HISTORY_POSTER_ROW_LIMIT,
  isProgressivePosterRow,
  limitPosterRowItems,
  nextPosterRenderCount,
  posterRenderCountForIndex,
  ROW_VIRTUAL_OVERSCAN,
  shouldExpandPosterWindow,
  STANDARD_INITIAL_RENDERED_POSTERS,
  STANDARD_POSTER_ROW_LIMIT,
  STANDARD_RENDER_BATCH_SIZE,
  TOP_TEN_ROW_LIMIT,
  TV_INITIAL_RENDERED_POSTERS,
  TV_POSTER_ROW_LIMIT,
  TV_RENDER_BATCH_SIZE,
  nextTvPosterRenderCount,
  shouldExpandTvPosterWindow,
  tvPosterRenderCountForIndex,
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
    expect(limitPosterRowItems(Array.from({ length: 120 }, (_, index) => title(index + 1)), 'history'))
      .toHaveLength(HISTORY_POSTER_ROW_LIMIT)
    expect(limitPosterRowItems(Array.from({ length: 200 }, (_, index) => title(index + 1)), 'tv'))
      .toHaveLength(TV_POSTER_ROW_LIMIT)
    expect(ROW_VIRTUAL_OVERSCAN).toBe(2)
    expect(estimatePosterRowHeight('top-ten')).toBeGreaterThan(estimatePosterRowHeight('standard'))
  })

  it('rendert normale 30-70er Reihen horizontal in kleinen Fokusfenstern', () => {
    expect(isProgressivePosterRow('standard')).toBe(true)
    expect(isProgressivePosterRow('top-ten')).toBe(false)
    expect(posterRenderCountForIndex(50, 0, 'standard'))
      .toBe(STANDARD_INITIAL_RENDERED_POSTERS)
    expect(posterRenderCountForIndex(50, 20, 'standard')).toBe(36)
    expect(nextPosterRenderCount(STANDARD_INITIAL_RENDERED_POSTERS, 50, 'standard'))
      .toBe(STANDARD_INITIAL_RENDERED_POSTERS + STANDARD_RENDER_BATCH_SIZE)
    expect(shouldExpandPosterWindow(6, 12, 50, 'standard')).toBe(false)
    expect(shouldExpandPosterWindow(7, 12, 50, 'standard')).toBe(true)
    expect(posterRenderCountForIndex(10, 0, 'top-ten')).toBe(10)
  })

  it('rendert TV-Reihen horizontal progressiv statt sofort alle 150 Karten', () => {
    expect(tvPosterRenderCountForIndex(150, 0)).toBe(TV_INITIAL_RENDERED_POSTERS)
    expect(tvPosterRenderCountForIndex(150, 55)).toBe(90)
    expect(nextTvPosterRenderCount(TV_INITIAL_RENDERED_POSTERS, 150))
      .toBe(TV_INITIAL_RENDERED_POSTERS + TV_RENDER_BATCH_SIZE)
    expect(shouldExpandTvPosterWindow(21, 30, 150)).toBe(false)
    expect(shouldExpandTvPosterWindow(22, 30, 150)).toBe(true)
    expect(shouldExpandTvPosterWindow(149, 150, 150)).toBe(false)
  })

  it('begrenzt persönliche Reihen früh und hält den 100er Verlauf separat progressiv', () => {
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
    const history = buildWatchedHistoryRows(items, getTitleState)[0]
    expect(history.variant).toBe('history')
    expect(history.items).toHaveLength(80)
    expect(limitPosterRowItems(history.items, history.variant)).toHaveLength(80)
    expect(tvPosterRenderCountForIndex(history.items.length, 0)).toBe(TV_INITIAL_RENDERED_POSTERS)
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
