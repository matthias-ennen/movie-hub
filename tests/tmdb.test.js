import { describe, expect, it } from 'vitest'
import { buildTmdbImageUrl, normalizeGermanAgeRating, normalizeTmdbTitle, normalizeTmdbVideos, normalizeTmdbWatchProviders, toMovieHubTitle } from '../src/services/tmdb.js'

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
      popularity: 96.4,
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      original_language: 'en',
      status: 'Released',
      release_dates: {
        results: [{
          iso_3166_1: 'DE',
          release_dates: [{ certification: '12', type: 3, release_date: '1978-02-10T00:00:00.000Z' }],
        }],
      },
      credits: {
        cast: [{ id: 1, name: 'Darsteller Eins', character: 'Figur', profile_path: '/person.jpg' }],
      },
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
      popularity: 96.4,
      ageRating: 12,
      cast: [{ id: 1, name: 'Darsteller Eins', character: 'Figur' }],
    })
    expect(normalized.posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster.jpg')
    expect(normalized.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/backdrop.jpg')
    expect(normalized.cast[0].profileUrl).toBe('https://image.tmdb.org/t/p/w185/person.jpg')
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
      vote_average: 8.5,
      content_ratings: { results: [{ iso_3166_1: 'DE', rating: '16' }] },
    }, 'tv')

    expect(normalized).toMatchObject({
      tmdbId: 1399,
      type: 'series',
      year: 2011,
      runtimeMinutes: 60,
      numberOfSeasons: 8,
      numberOfEpisodes: 73,
      ageRating: 16,
    })

    const catalogItem = toMovieHubTitle(normalized, { id: 'got' })
    expect(catalogItem).toMatchObject({
      id: 'got',
      type: 'series',
      meta: '8 Staffeln · 73 Folgen',
      genre: 'Drama',
      score: '8,5',
      ageRating: 16,
      providerIds: [],
    })
  })

  it('prefers the German theatrical movie certification and ignores foreign ratings', () => {
    expect(normalizeGermanAgeRating({
      release_dates: { results: [
        { iso_3166_1: 'US', release_dates: [{ certification: 'R', type: 3 }] },
        { iso_3166_1: 'DE', release_dates: [
          { certification: '16', type: 5 },
          { certification: '12', type: 3 },
        ] },
      ] },
    }, 'movie')).toBe(12)
    expect(normalizeGermanAgeRating({ release_dates: { results: [{ iso_3166_1: 'US', release_dates: [] }] } }, 'movie')).toBeNull()
  })

  it('formats movie runtime for the UI catalog', () => {
    const catalogItem = toMovieHubTitle(normalizeTmdbTitle({
      id: 11,
      title: 'Krieg der Sterne',
      release_date: '1977-05-25',
      runtime: 121,
      genres: [],
      vote_average: 8.2,
    }, 'movie'))

    expect(catalogItem.meta).toBe('2 Std. 1 Min.')
    expect(catalogItem.genre).toBe('Ohne Genreangabe')
    expect(catalogItem.id).toBe('tmdb-movie-11')
  })

  it('keeps only supported German watch providers and their real offer types', () => {
    const providers = normalizeTmdbWatchProviders({
      results: {
        DE: {
          link: 'https://www.themoviedb.org/movie/11/watch?locale=DE',
          flatrate: [
            { provider_id: 8, provider_name: 'Netflix' },
            { provider_id: 119, provider_name: 'Amazon Prime Video' },
            { provider_id: 304, provider_name: 'Joyn Plus' },
            { provider_id: 999, provider_name: 'Unbekannter Anbieter' },
          ],
          free: [{ provider_id: 341, provider_name: 'ARD Mediathek' }],
          rent: [
            { provider_id: 192, provider_name: 'YouTube' },
            { provider_id: 8, provider_name: 'Netflix' },
          ],
          buy: [{ provider_id: 337, provider_name: 'Disney Plus' }],
        },
      },
    })

    expect(providers.providerIds).toEqual(['netflix', 'prime', 'joyn', 'ard', 'youtube', 'disney'])
    expect(providers.providerOffers).toEqual([
      { id: 'netflix', tmdbProviderId: 8, offerTypes: ['flatrate', 'rent'] },
      { id: 'prime', tmdbProviderId: 119, offerTypes: ['flatrate'] },
      { id: 'joyn', tmdbProviderId: 304, offerTypes: ['flatrate'] },
      { id: 'ard', tmdbProviderId: 341, offerTypes: ['free'] },
      { id: 'youtube', tmdbProviderId: 192, offerTypes: ['rent'] },
      { id: 'disney', tmdbProviderId: 337, offerTypes: ['buy'] },
    ])
    expect(providers.watchProviderLink).toBe('https://www.themoviedb.org/movie/11/watch?locale=DE')
  })

  it('recognizes plus-sign provider names through normalized registry aliases', () => {
    const providers = normalizeTmdbWatchProviders({
      results: {
        DE: {
          flatrate: [
            { provider_id: 350, provider_name: 'Apple TV+' },
            { provider_id: 531, provider_name: 'Paramount+' },
            { provider_id: 100, provider_name: 'RTL+' },
          ],
        },
      },
    })

    expect(providers.providerIds).toEqual(['appletv', 'paramount', 'rtlplus'])
  })

  it('returns no provider when TMDB has no German availability', () => {
    expect(normalizeTmdbWatchProviders({ results: { US: {} } })).toEqual({
      providerIds: [],
      providerOffers: [],
      watchProviderLink: null,
    })
  })

  it('prefers official German trailers and keeps a separate teaser', () => {
    const videos = normalizeTmdbVideos([
      { results: [
        { key: 'english1', site: 'YouTube', type: 'Trailer', iso_639_1: 'en', official: true, name: 'Official trailer' },
        { key: 'german01', site: 'YouTube', type: 'Trailer', iso_639_1: 'de', official: true, name: 'Deutscher Trailer' },
        { key: 'teaser01', site: 'YouTube', type: 'Teaser', iso_639_1: 'de', official: true, name: 'Deutscher Teaser' },
        { key: 'ignored1', site: 'Vimeo', type: 'Trailer', iso_639_1: 'de', official: true },
      ] },
    ], 'en')

    expect(videos).toEqual([
      expect.objectContaining({ type: 'trailer', label: 'Trailer', language: 'de', key: 'german01', official: true }),
      expect.objectContaining({ type: 'teaser', label: 'Teaser', language: 'de', key: 'teaser01', official: true }),
    ])
    expect(videos[0].url).toBe('https://www.youtube.com/watch?v=german01')
  })

  it('falls back to the original-language trailer and rejects malformed video references', () => {
    const videos = normalizeTmdbVideos({ results: [
      { key: 'french01', site: 'YouTube', type: 'Trailer', iso_639_1: 'fr', official: true },
      { key: 'bad key!', site: 'YouTube', type: 'Trailer', iso_639_1: 'de', official: true },
      { key: 'feature1', site: 'YouTube', type: 'Featurette', iso_639_1: 'de', official: true },
    ] }, 'fr')

    expect(videos).toHaveLength(1)
    expect(videos[0]).toMatchObject({ key: 'french01', language: 'fr', type: 'trailer' })
  })

  it('returns null for missing images and rejects unsupported media types', () => {
    expect(buildTmdbImageUrl(null)).toBeNull()
    expect(() => normalizeTmdbTitle({ id: 1 }, 'person')).toThrow(/Unsupported TMDB media type/)
    expect(() => toMovieHubTitle({ source: 'other' })).toThrow(/normalized TMDB title/)
  })
})
