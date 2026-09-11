import { describe, expect, it, vi } from 'vitest'
import {
  CATALOG_ROWS,
  PROVIDER_TEST_REFERENCES,
  applyProviderTestReference,
  buildProviderTestRows,
  buildRowDefinitions,
  tmdbFetch,
} from '../scripts/generate-tmdb-catalog.mjs'

describe('automatischer TMDB-Katalog', () => {
  it('defines separate configurable discovery rows', () => {
    expect(CATALOG_ROWS.map((row) => row.id)).toEqual([
      'trending', 'new-movies', 'new-series', 'movies', 'series',
    ])
    expect(CATALOG_ROWS.every((row) => row.limit === 10)).toBe(true)
  })

  it('retries a throttled TMDB request before failing the catalog refresh', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"status_code":25}', {
        status: 429,
        headers: { 'retry-after': '0.001' },
      }))
      .mockResolvedValueOnce(new Response('{"results":[]}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))

    try {
      const request = tmdbFetch('/discover/movie', { language: 'de-DE' })
      await vi.runAllTimersAsync()
      await expect(request).resolves.toEqual({ results: [] })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      fetchMock.mockRestore()
      vi.useRealTimers()
    }
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

  it('skips an incomplete supplemental discovery row without blocking the provider catalog refresh', () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, mediaType: 'tv' }))
    const titles = new Map(candidates.map((candidate) => [
      `tv-${candidate.id}`,
      { id: `tmdb-series-${candidate.id}`, providerIds: ['netflix'] },
    ]))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(buildRowDefinitions([{ id: 'test', title: 'Test', candidates, limit: 10 }], titles)).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/skipped.*only 5 supported titles/))
    warn.mockRestore()
  })

  it('keeps healthy discovery rows when another supplemental row is too thin', () => {
    const thinCandidates = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, mediaType: 'tv' }))
    const healthyCandidates = Array.from({ length: 7 }, (_, index) => ({ id: index + 10, mediaType: 'movie' }))
    const titles = new Map([
      ...thinCandidates.map((candidate) => [
        `tv-${candidate.id}`,
        { id: `tmdb-series-${candidate.id}`, providerIds: ['netflix'] },
      ]),
      ...healthyCandidates.map((candidate) => [
        `movie-${candidate.id}`,
        { id: `tmdb-movie-${candidate.id}`, providerIds: ['prime'] },
      ]),
    ])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const rows = buildRowDefinitions([
      { id: 'thin', title: 'Thin', candidates: thinCandidates, limit: 10 },
      { id: 'healthy', title: 'Healthy', candidates: healthyCandidates, limit: 10 },
    ], titles)

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('healthy')
    expect(rows[0].ids).toHaveLength(7)
    warn.mockRestore()
  })

  it('keeps Machete Kills as an isolated waipu device-test reference', () => {
    expect(PROVIDER_TEST_REFERENCES).toContainEqual(expect.objectContaining({
      id: 106747,
      mediaType: 'movie',
      providerId: 'waipu',
    }))

    const reference = PROVIDER_TEST_REFERENCES[0]
    const title = applyProviderTestReference({
      id: 'tmdb-movie-106747',
      tmdbId: 106747,
      providerIds: [],
      providerOffers: [],
    }, reference)

    expect(title.providerIds).toEqual(['waipu'])
    expect(title.providerOffers).toContainEqual({
      id: 'waipu',
      tmdbProviderId: null,
      offerTypes: ['test-reference'],
    })
    expect(title.providerTestReference.providerId).toBe('waipu')

    const rows = buildProviderTestRows(
      [reference],
      new Map([['movie-106747', title]]),
    )
    expect(rows).toEqual([
      { id: 'provider-test-waipu', title: 'Anbieter-Test · waipu.tv', ids: ['tmdb-movie-106747'] },
    ])
  })

  it('does not duplicate waipu when TMDB already reports it', () => {
    const reference = PROVIDER_TEST_REFERENCES[0]
    const title = applyProviderTestReference({
      id: 'tmdb-movie-106747',
      providerIds: ['waipu'],
      providerOffers: [{ id: 'waipu', tmdbProviderId: 999, offerTypes: ['flatrate'] }],
    }, reference)

    expect(title.providerIds).toEqual(['waipu'])
    expect(title.providerOffers).toEqual([
      { id: 'waipu', tmdbProviderId: 999, offerTypes: ['flatrate'] },
    ])
  })
})
