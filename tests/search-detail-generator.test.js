import { describe, expect, it } from 'vitest'
import { searchDetailFromDiscover } from '../scripts/generate-search-index.mjs'

describe('TMDB discovery detail seeds', () => {
  it('keeps richer discover metadata outside the compact search entry', () => {
    const detail = searchDetailFromDiscover({
      id: 42,
      title: 'Testfilm',
      original_title: 'Test Movie',
      release_date: '2024-05-01',
      overview: 'Eine Beschreibung aus TMDB Discover.',
      backdrop_path: '/backdrop.jpg',
      poster_path: '/poster.jpg',
      original_language: 'en',
      vote_average: 7.4,
      genre_ids: [18, 53],
    }, 'movie', new Map([
      [18, 'Drama'],
      [53, 'Thriller'],
    ]))

    expect(detail).toMatchObject({
      id: 'tmdb-movie-42',
      tmdbId: 42,
      type: 'movie',
      description: 'Eine Beschreibung aus TMDB Discover.',
      year: 2024,
      releaseDate: '2024-05-01',
      originalLanguage: 'en',
      voteAverage: 7.4,
      genreNames: ['Drama', 'Thriller'],
      completeness: 'discover',
    })
    expect(detail.backdropUrl).toContain('/w1280/backdrop.jpg')
    expect(detail).not.toHaveProperty('providerIds')
    expect(detail).not.toHaveProperty('providerOffers')
  })

  it('preserves compact season summaries from enriched series payloads', () => {
    const detail = searchDetailFromDiscover({
      id: 1399,
      name: 'Game of Thrones',
      first_air_date: '2011-04-17',
      number_of_seasons: 2,
      number_of_episodes: 20,
      seasons: [
        { season_number: 0, name: 'Specials' },
        { season_number: 1, name: 'Staffel 1', episode_count: 10 },
        { season_number: 2, name: 'Staffel 2', episode_count: 10 },
      ],
    }, 'tv')

    expect(detail.numberOfSeasons).toBe(2)
    expect(detail.numberOfEpisodes).toBe(20)
    expect(detail.seasons.map((season) => season.seasonNumber)).toEqual([1, 2])
  })
})
