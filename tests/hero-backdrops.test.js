import { describe, expect, it } from 'vitest'
import { collectHeroCandidates, selectNeutralBackdrop } from '../scripts/enrich-hero-backdrops.mjs'

describe('TMDB Hero-Backdrops', () => {
  it('accepts only language-neutral backdrops and picks the best ranked one', () => {
    const selected = selectNeutralBackdrop({
      backdrops: [
        { file_path: '/de.jpg', iso_639_1: 'de', vote_average: 10, vote_count: 100, width: 1920 },
        { file_path: '/neutral-low.jpg', iso_639_1: null, vote_average: 5, vote_count: 2, width: 1920 },
        { file_path: '/neutral-best.jpg', iso_639_1: null, vote_average: 7, vote_count: 20, width: 2560 },
      ],
    })

    expect(selected).toBe('/neutral-best.jpg')
  })

  it('returns no image when TMDB has no language-neutral backdrop', () => {
    expect(selectNeutralBackdrop({
      backdrops: [
        { file_path: '/de.jpg', iso_639_1: 'de' },
        { file_path: '/en.jpg', iso_639_1: 'en' },
      ],
    })).toBeNull()
  })

  it('bounds image enrichment to likely Home, movie and series hero candidates', () => {
    const titles = [
      ...Array.from({ length: 40 }, (_, index) => ({ id: `m${index}`, tmdbId: index + 1, type: 'movie', title: `Movie ${index}` })),
      ...Array.from({ length: 40 }, (_, index) => ({ id: `s${index}`, tmdbId: index + 100, type: 'series', title: `Series ${index}` })),
    ]

    const candidates = collectHeroCandidates(titles, 5)
    expect(candidates.length).toBeLessThanOrEqual(15)
    expect(candidates.some((title) => title.type === 'movie')).toBe(true)
    expect(candidates.some((title) => title.type === 'series')).toBe(true)
  })
})
