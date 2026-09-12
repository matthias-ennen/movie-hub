import { describe, expect, it } from 'vitest'
import {
  INITIAL_VISIBLE_POSTERS,
  INITIAL_VISIBLE_ROWS,
  initialVisibleCount,
  nextVisibleCount,
  preloadHeroImage,
} from '../src/performance/progressiveRendering.js'

describe('Hero-first und progressives Rendering', () => {
  it('mountet vor der Hero-Bereitschaft keine Reihen oder Poster', () => {
    expect(initialVisibleCount(8, false, INITIAL_VISIBLE_ROWS)).toBe(0)
    expect(initialVisibleCount(120, false, INITIAL_VISIBLE_POSTERS)).toBe(0)
  })

  it('beginnt nach dem Hero mit genau einem begrenzten ersten Batch', () => {
    expect(initialVisibleCount(8, true, INITIAL_VISIBLE_ROWS)).toBe(1)
    expect(initialVisibleCount(120, true, INITIAL_VISIBLE_POSTERS)).toBe(12)
    expect(initialVisibleCount(4, true, INITIAL_VISIBLE_POSTERS)).toBe(4)
  })

  it('überschreitet beim Nachladen niemals den verfügbaren Inhalt', () => {
    expect(nextVisibleCount(1, 8, 1)).toBe(2)
    expect(nextVisibleCount(7, 8, 4)).toBe(8)
    expect(nextVisibleCount(0, 0, 1)).toBe(0)
  })

  it('überspringt Hero-Preloading außerhalb eines Browsers', () => {
    expect(preloadHeroImage([{ backdropUrl: 'https://example.test/hero.jpg' }])).toBe(false)
  })
})
