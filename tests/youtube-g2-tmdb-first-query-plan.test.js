import { describe, it, expect } from 'vitest'
import { planTmdbFirstYoutubeQueries } from '../scripts/youtube-g2-tmdb-first-query-plan.mjs'

describe('TMDB-first targeted YouTube candidate search planning', () => {
  it('keeps one movie+year query and widens to true original title without year', () => {
    const params = planTmdbFirstYoutubeQueries(
      { mediaType: 'movie', title: 'Der Pate', year: 1972, originalTitle: 'The Godfather' },
      { original_title: 'The Godfather' },
    )
    expect(params).toHaveLength(2)
    expect(params[0]).toMatchObject({
      type: 'video', videoType: 'movie', regionCode: 'DE', q: 'Der Pate 1972',
    })
    expect(params[1]).toMatchObject({
      type: 'video', videoDuration: 'long', regionCode: 'DE', q: 'The Godfather',
    })
    expect(params[1]).not.toHaveProperty('videoType')
    expect(params[1].q).not.toContain('1972')
  })
  it('drops the year in second pass for identical original and localized titles', () => {
    const params = planTmdbFirstYoutubeQueries(
      { mediaType: 'movie', title: 'Nightmare Before Christmas', year: 1994 },
      { original_title: 'Nightmare Before Christmas' },
    )
    expect(params.map(x => x.q)).toEqual([
      'Nightmare Before Christmas 1994', 'Nightmare Before Christmas',
    ])
  })
  it('uses the canonical TMDB release year when public search index is stale (Citizen Kane)', () => {
    const result = planTmdbFirstYoutubeQueries(
      { mediaType: 'movie', tmdbId: 15, title: 'Citizen Kane',
        originalTitle: 'Citizen Kane', year: 1962 },
      { id: 15, original_title: 'Citizen Kane', release_date: '1941-05-01' },
    )
    expect(result[0].q).toBe('Citizen Kane 1941')
    expect(result[1].q).toBe('Citizen Kane')
    expect(result).toHaveLength(2)
  })
  it('uses source-year fallback for missing or malformed TMDB dates', () => {
    for (const release_date of ['', 'not-a-date', '1941', '1941-99']) {
      const results = planTmdbFirstYoutubeQueries(
        { mediaType: 'movie', title: 'Testfilm', year: 1984 },
        { release_date, original_title: 'Testfilm' },
      )
      expect(results[0].q).toBe('Testfilm 1984')
    }
  })
  it('never adapts movie search heuristics to series/episodes silently', () => {
    expect(() => planTmdbFirstYoutubeQueries(
      { mediaType: 'series', title: 'Dark', year: 2017 }, {},
    )).toThrow('MOVIEHUB_MOVIE_SEED_REQUIRED')
  })
  it('preserves actual year-looking movie titles and exact 2 call budget', () => {
    const params = planTmdbFirstYoutubeQueries(
      { mediaType: 'movie', title: '2010', year: 1984 },
      { original_title: '2010' },
    )
    expect(params.map(x => x.q)).toEqual(['2010 1984', '2010'])
    expect(params).toHaveLength(2)
  })
})
