import { describe, expect, it } from 'vitest'
import {
  attachTvDayTitleMetadata,
  compactTvTitleMetadata,
  normalizeTvDayTitles,
} from '../src/sources/tvDayTitleMetadata.js'

describe('TV day title metadata', () => {
  it('attaches one canonical title metadata entry per TMDB title used by a day', () => {
    const days = {
      '2026-10-08': {
        key: '2026-10-08',
        airings: [
          { type: 'movie', tmdbId: 157336 },
          { type: 'movie', tmdbId: 157336 },
          { type: 'series', tmdbId: 1399 },
        ],
      },
    }
    const enriched = attachTvDayTitleMetadata(days, [
      { type: 'movie', tmdbId: 157336, title: 'Interstellar', posterUrl: 'poster-a', metadataComplete: true },
      { type: 'series', tmdbId: 1399, title: 'Game of Thrones', posterUrl: 'poster-b', metadataComplete: true },
    ])
    expect(enriched['2026-10-08'].titleCount).toBe(2)
    expect(enriched['2026-10-08'].titles.map((entry) => entry.key)).toEqual(['movie:157336', 'series:1399'])
  })

  it('keeps compact poster metadata for immediate TV card rendering', () => {
    expect(compactTvTitleMetadata({
      type: 'movie',
      tmdbId: 11,
      title: 'Film',
      posterUrl: 'https://image.example/poster.jpg',
      genres: [{ id: 28, name: 'Action' }],
      metadataComplete: true,
    })).toMatchObject({
      key: 'movie:11',
      posterUrl: 'https://image.example/poster.jpg',
      metadataComplete: true,
    })
    expect(normalizeTvDayTitles([{ type: 'movie', tmdbId: 11, title: 'Film' }])).toHaveLength(1)
  })
})
