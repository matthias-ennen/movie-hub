import { describe, expect, it } from 'vitest'
import { buildTmdbImageUrl, normalizeTmdbTitle } from '../src/services/tmdb.js'

describe('TMDB adapter', () => {
  it('normalizes a movie payload without exposing authentication concerns to UI code', () => {
    const normalized = normalizeTmdbTitle({
      id: 11,
      title: 'Krieg der Sterne',
      original_title: 'Star Wars',
      overview: 'Testbeschreibung',
      release_date: '1977-05-25',
      runtime: 121,
      genres: [{ id: 878, name: 'Science Fiction' }],
      vote_average: 8.2,
      vote_count: 20000,
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      original_language: 'en',
      status: 'Released',
    }, 'movie')

    expect(normalized).toMatchObject({
      source: 'tmdb',
      tmdbId: 11,
      type: 'movie',
      title: 'Krieg der Sterne',
      originalTitle: 'Star Wars',
      year: 1977,
      runtimeMinutes: 121,
      genres: [{ id: 878, name: 'Science Fiction' }],
      voteAverage: 8.2,
    })
    expect(normalized.posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster.jpg')
    expect(normalized.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/backdrop.jpg')
  })

  it('normalizes TV payloads as Movie-Hub series', () => {
    const normalized = normalizeTmdbTitle({
      id: 1399,
      name: 'Game of Thrones',
      original_name: 'Game of Thrones',
      first_air_date: '2011-04-17',
      episode_run_time: [60],
      number_of_seasons: 8,
      number_of_episodes: 73,
      genres: [{ id: 18, name: 'Drama' }],
    }, 'tv')

    expect(normalized).toMatchObject({
      tmdbId: 1399,
      type: 'series',
      year: 2011,
      runtimeMinutes: 60,
      numberOfSeasons: 8,
      numberOfEpisodes: 73,
    })
  })

  it('returns null for missing images and rejects unsupported media types', () => {
    expect(buildTmdbImageUrl(null)).toBeNull()
    expect(() => normalizeTmdbTitle({ id: 1 }, 'person')).toThrow(/Unsupported TMDB media type/)
  })
})
