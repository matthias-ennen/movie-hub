import { describe, expect, it } from 'vitest'
import { selectNeutralTmdbPosterPath, selectNeutralTmdbPosterUrl } from '../src/services/tmdbImages.js'

describe('TMDB sprachneutrale Poster', () => {
  it('ignoriert sprachgebundene Poster und wählt das bestbewertete neutrale Poster', () => {
    const payload = {
      posters: [
        { file_path: '/de.jpg', iso_639_1: 'de', vote_average: 10, vote_count: 100, width: 1000 },
        { file_path: '/neutral-low.jpg', iso_639_1: null, vote_average: 5, vote_count: 2, width: 1000 },
        { file_path: '/neutral-best.jpg', iso_639_1: null, vote_average: 7, vote_count: 20, width: 1500 },
      ],
    }

    expect(selectNeutralTmdbPosterPath(payload)).toBe('/neutral-best.jpg')
    expect(selectNeutralTmdbPosterUrl(payload)).toBe('https://image.tmdb.org/t/p/w500/neutral-best.jpg')
  })

  it('unterstützt angehängte TMDB-images-Antworten', () => {
    const payload = {
      images: {
        posters: [
          { file_path: '/neutral.jpg', iso_639_1: null, vote_average: 8, vote_count: 30, width: 1200 },
        ],
      },
    }

    expect(selectNeutralTmdbPosterPath(payload)).toBe('/neutral.jpg')
  })

  it('liefert null wenn kein sprachneutrales Poster vorhanden ist', () => {
    const payload = {
      posters: [
        { file_path: '/de.jpg', iso_639_1: 'de' },
        { file_path: '/en.jpg', iso_639_1: 'en' },
      ],
    }

    expect(selectNeutralTmdbPosterPath(payload)).toBeNull()
    expect(selectNeutralTmdbPosterUrl(payload)).toBeNull()
  })
})
