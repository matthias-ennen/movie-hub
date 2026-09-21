import { describe, expect, it } from 'vitest'
import {
  HERO_LIMIT,
  selectCoordinatedHeroItems,
  selectHeroItems,
  selectHomeHeroItems,
  selectPersonalHeroItems,
} from '../src/catalog/heroSelection.js'

function title(id, type = 'movie') {
  return { id, type, title: id }
}

describe('Hero-Auswahl', () => {
  it('prepares seven unique titles for the largest profile setting', () => {
    const items = [
      title('a'), title('b'), title('c'), title('d'), title('e'), title('f'), title('g'), title('h'), title('a'),
    ]

    expect(HERO_LIMIT).toBe(7)
    expect(selectHeroItems(items).map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  })

  it('keeps movie and series category heroes pure', () => {
    const items = [title('m1'), title('s1', 'series'), title('m2'), title('s2', 'series')]

    expect(selectHeroItems(items, { type: 'movie' }).every((item) => item.type === 'movie')).toBe(true)
    expect(selectHeroItems(items, { type: 'series' }).every((item) => item.type === 'series')).toBe(true)
  })

  it('keeps Home mixed when both media types are available', () => {
    const items = [
      title('m1'), title('m2'), title('m3'), title('m4'), title('m5'), title('m6'), title('s1', 'series'),
    ]
    const heroes = selectHomeHeroItems(items)

    expect(heroes).toHaveLength(7)
    expect(heroes.some((item) => item.type === 'movie')).toBe(true)
    expect(heroes.some((item) => item.type === 'series')).toBe(true)
  })

  it('deduplicates personal titles that occur in several personal rows', () => {
    const shared = title('shared')
    const rows = [
      { id: 'favorites', items: [shared, title('two')] },
      { id: 'watchlist', items: [shared, title('three'), title('four'), title('five'), title('six'), title('seven'), title('eight')] },
    ]

    expect(selectPersonalHeroItems(rows).map((item) => item.id)).toEqual([
      'shared', 'two', 'three', 'four', 'five', 'six', 'seven',
    ])
  })

  it('returns fewer than seven heroes only when fewer valid titles exist', () => {
    expect(selectHeroItems([title('one'), title('two')])).toHaveLength(2)
  })

  it('does not publish a provisional personal-only selection while the catalog is loading', () => {
    const provisional = [title('personal-only')]

    expect(selectCoordinatedHeroItems(provisional, { selectionReady: false })).toEqual({
      home: [],
      movies: [],
      series: [],
    })

    const complete = Array.from({ length: 7 }, (_, index) => title(`movie-${index + 1}`))
    expect(selectCoordinatedHeroItems(complete, { selectionReady: true }).movies).toHaveLength(7)
  })

  it('coordinates different first heroes across Home, movies and series', () => {
    const heroes = selectCoordinatedHeroItems([
      title('m1'), title('s1', 'series'), title('m2'), title('s2', 'series'), title('m3'), title('s3', 'series'),
    ])
    const firstIds = [heroes.home[0].id, heroes.movies[0].id, heroes.series[0].id]
    expect(new Set(firstIds).size).toBe(3)
    expect(heroes.home.some((item) => item.type === 'movie')).toBe(true)
    expect(heroes.home.some((item) => item.type === 'series')).toBe(true)
  })

  it('uses separately ranked category pools when the mixed Home ranking is one-sided', () => {
    const mixedHomeRanking = [
      ...Array.from({ length: 50 }, (_, index) => title(`s${index + 1}`, 'series')),
      title('m1'),
    ]
    const movieItems = Array.from({ length: 7 }, (_, index) => title(`m${index + 1}`))
    const seriesItems = Array.from({ length: 7 }, (_, index) => title(`s${index + 1}`, 'series'))

    const heroes = selectCoordinatedHeroItems(mixedHomeRanking, { movieItems, seriesItems })

    expect(heroes.movies).toHaveLength(7)
    expect(heroes.movies.every((item) => item.type === 'movie')).toBe(true)
    expect(heroes.series).toHaveLength(7)
    expect(heroes.series.every((item) => item.type === 'series')).toBe(true)
  })
})
