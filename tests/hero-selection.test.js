import { describe, expect, it } from 'vitest'
import {
  HERO_LIMIT,
  selectHeroItems,
  selectHomeHeroItems,
  selectPersonalHeroItems,
} from '../src/catalog/heroSelection.js'

function title(id, type = 'movie') {
  return { id, type, title: id }
}

describe('Hero-Auswahl', () => {
  it('limits every carousel to five unique titles', () => {
    const items = [
      title('a'), title('b'), title('c'), title('d'), title('e'), title('f'), title('a'),
    ]

    expect(HERO_LIMIT).toBe(5)
    expect(selectHeroItems(items).map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('keeps movie and series category heroes pure', () => {
    const items = [title('m1'), title('s1', 'series'), title('m2'), title('s2', 'series')]

    expect(selectHeroItems(items, { type: 'movie' }).every((item) => item.type === 'movie')).toBe(true)
    expect(selectHeroItems(items, { type: 'series' }).every((item) => item.type === 'series')).toBe(true)
  })

  it('keeps Home mixed when both media types are available', () => {
    const items = [
      title('m1'), title('m2'), title('m3'), title('m4'), title('m5'), title('s1', 'series'),
    ]
    const heroes = selectHomeHeroItems(items)

    expect(heroes).toHaveLength(5)
    expect(heroes.some((item) => item.type === 'movie')).toBe(true)
    expect(heroes.some((item) => item.type === 'series')).toBe(true)
  })

  it('deduplicates personal titles that occur in several personal rows', () => {
    const shared = title('shared')
    const rows = [
      { id: 'favorites', items: [shared, title('two')] },
      { id: 'watchlist', items: [shared, title('three'), title('four'), title('five'), title('six')] },
    ]

    expect(selectPersonalHeroItems(rows).map((item) => item.id)).toEqual([
      'shared', 'two', 'three', 'four', 'five',
    ])
  })

  it('returns fewer than five heroes only when fewer real titles exist', () => {
    expect(selectHeroItems([title('one'), title('two')])).toHaveLength(2)
  })
})
