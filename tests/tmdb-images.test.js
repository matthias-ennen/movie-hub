import { describe, expect, it } from 'vitest'
import {
  selectTmdbArtwork,
  selectTmdbBackdropPaths,
  selectTmdbPosterPaths,
} from '../src/services/tmdbImages.js'

describe('TMDB-Bildkandidaten', () => {
  const images = {
    posters: [
      { file_path: '/de.jpg', iso_639_1: 'de', vote_average: 9, vote_count: 20, width: 1000, height: 1500 },
      { file_path: '/neutral-b.jpg', iso_639_1: null, vote_average: 7, vote_count: 5, width: 1000, height: 1500 },
      { file_path: '/neutral-a.jpg', iso_639_1: null, vote_average: 8, vote_count: 10, width: 1000, height: 1500 },
      { file_path: '/landscape.jpg', iso_639_1: null, width: 1500, height: 1000 },
      { file_path: '/small.jpg', iso_639_1: null, vote_average: 10, width: 320, height: 480 },
      { file_path: '/poster.png', iso_639_1: null, vote_average: 10, width: 1000, height: 1500 },
      { file_path: '/poster.webp', iso_639_1: null, vote_average: 10, width: 1000, height: 1500 },
    ],
    backdrops: [
      { file_path: '/wide-de.jpg', iso_639_1: 'de', vote_average: 9, width: 1920, height: 1080 },
      { file_path: '/wide-neutral.jpg', iso_639_1: null, vote_average: 7, width: 1920, height: 1080 },
      { file_path: '/portrait.jpg', iso_639_1: null, width: 1000, height: 1500 },
      { file_path: '/small-wide.jpg', iso_639_1: null, vote_average: 10, width: 960, height: 540 },
      { file_path: '/ultrawide.jpg', iso_639_1: null, vote_average: 10, width: 2560, height: 1080 },
      { file_path: '/wide.png', iso_639_1: null, vote_average: 10, width: 1920, height: 1080 },
      { file_path: '/wide.webp', iso_639_1: null, vote_average: 10, width: 1920, height: 1080 },
    ],
  }

  it('bevorzugt sprachneutrale HD-taugliche JPEG-Poster und filtert ungeeignete Bilder', () => {
    expect(selectTmdbPosterPaths(images)).toEqual(['/neutral-a.jpg', '/neutral-b.jpg', '/de.jpg'])
  })

  it('bevorzugt sprachneutrale HD-taugliche JPEG-Backdrops', () => {
    expect(selectTmdbBackdropPaths(images)).toEqual(['/wide-neutral.jpg', '/wide-de.jpg'])
  })

  it('verwendet ein unterstütztes TMDB-Hauptbild nur als Fallback, wenn keine geprüften Kandidaten vorliegen', () => {
    expect(selectTmdbArtwork({}, {
      primaryPosterPath: '/poster.jpg',
      primaryBackdropPath: '/backdrop.jpeg',
    })).toEqual({
      posterPaths: ['/poster.jpg'],
      heroBackdropPaths: ['/backdrop.jpeg'],
    })

    expect(selectTmdbPosterPaths(images, { primaryPath: '/primary.jpg' }))
      .toEqual(['/neutral-a.jpg', '/neutral-b.jpg', '/de.jpg'])
  })

  it('übernimmt unbekannte oder nicht freigegebene Formate nicht als Hauptbild-Fallback', () => {
    expect(selectTmdbArtwork({}, {
      primaryPosterPath: '/poster.png',
      primaryBackdropPath: '/backdrop.webp',
    })).toEqual({
      posterPaths: [],
      heroBackdropPaths: [],
    })
  })
})
