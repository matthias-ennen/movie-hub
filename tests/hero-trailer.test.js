import { describe, expect, it } from 'vitest'
import { selectHeroVideo } from '../src/components/heroTrailer.js'

describe('Hero-Trailer-Auswahl', () => {
  it('bevorzugt Trailer vor Teaser', () => {
    const teaser = { type: 'teaser', site: 'youtube', key: 'teaser123' }
    const trailer = { type: 'trailer', site: 'youtube', key: 'trailer123' }
    expect(selectHeroVideo([teaser, trailer])).toBe(trailer)
  })

  it('verwendet Teaser als Fallback', () => {
    const teaser = { type: 'teaser', site: 'youtube', key: 'teaser123' }
    expect(selectHeroVideo([teaser])).toBe(teaser)
  })

  it('ignoriert unbrauchbare oder nicht unterstützte Videos', () => {
    expect(selectHeroVideo([
      { type: 'trailer', site: 'vimeo', key: 'trailer123' },
      { type: 'clip', site: 'youtube', key: 'clip12345' },
      { type: 'trailer', site: 'youtube', key: 'bad key' },
    ])).toBeNull()
  })
})
