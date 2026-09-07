import { describe, expect, it } from 'vitest'
import { CATALOG_ROWS, buildRowDefinitions } from '../scripts/generate-tmdb-catalog.mjs'

describe('automatischer TMDB-Katalog', () => {
  it('defines separate configurable discovery rows', () => {
    expect(CATALOG_ROWS.map((row) => row.id)).toEqual([
      'trending', 'new-movies', 'new-series', 'movies', 'series',
    ])
    expect(CATALOG_ROWS.every((row) => row.limit === 10)).toBe(true)
  })

  it('keeps only titles with a supported German provider in each row', () => {
    const candidates = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, mediaType: 'movie' }))
    const titles = new Map(candidates.map((candidate) => [
      `movie-${candidate.id}`,
      { id: `tmdb-movie-${candidate.id}`, providerIds: candidate.id === 8 ? [] : ['prime'] },
    ]))

    const [row] = buildRowDefinitions([{ id: 'test', title: 'Test', candidates, limit: 10 }], titles)
    expect(row.ids).toEqual([
      'tmdb-movie-1', 'tmdb-movie-2', 'tmdb-movie-3', 'tmdb-movie-4',
      'tmdb-movie-5', 'tmdb-movie-6', 'tmdb-movie-7',
    ])
  })

  it('rejects an incomplete row instead of publishing a thin catalog', () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, mediaType: 'tv' }))
    const titles = new Map(candidates.map((candidate) => [
      `tv-${candidate.id}`,
      { id: `tmdb-series-${candidate.id}`, providerIds: ['netflix'] },
    ]))

    expect(() => buildRowDefinitions([{ id: 'test', title: 'Test', candidates, limit: 10 }], titles))
      .toThrow(/at least 6/)
  })
})
