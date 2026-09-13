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
    ],
    backdrops: [
      { file_path: '/wide-de.jpg', iso_639_1: 'de', vote_average: 9, width: 1920, height: 1080 },
      { file_path: '/wide-neutral.jpg', iso_639_1: null, vote_average: 7, width: 1920, height: 1080 },
      { file_path: '/portrait.jpg', iso_639_1: null, width: 1000, height: 1500 },
    ],
  }

  it('bevorzugt sprachneutrale Hochformatposter und filtert falsche Formate', () => {
    expect(selectTmdbPosterPaths(images)).toEqual(['/neutral-a.jpg', '/neutral-b.jpg', '/de.jpg'])
  })

  it('bevorzugt sprachneutrale Querformat-Backdrops', () => {
    expect(selectTmdbBackdropPaths(images)).toEqual(['/wide-neutral.jpg', '/wide-de.jpg'])
  })

  it('behält vorhandene TMDB-Hauptbilder als Fallback', () => {
    expect(selectTmdbArtwork({}, {
      primaryPosterPath: '/poster.jpg',
      primaryBackdropPath: '/backdrop.jpg',
    })).toEqual({
      posterPaths: ['/poster.jpg'],
      heroBackdropPaths: ['/backdrop.jpg'],
    })
  })
})
