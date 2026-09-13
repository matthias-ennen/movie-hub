import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSearchDetailMemoryCache,
  loadSearchDetail,
  mergeSearchDetail,
  searchDetailBucket,
  toSearchDetailFallback,
} from '../src/search/lazySearchDetails.js'

function entry(overrides = {}) {
  return {
    id: 'tmdb-movie-65',
    tmdbId: 65,
    type: 'movie',
    title: 'Lazy Movie',
    originalTitle: 'Lazy Movie',
    year: 2025,
    posterUrl: 'https://image.example/poster.jpg',
    providerIds: ['prime'],
    providerOffers: [{ id: 'prime', tmdbProviderId: 9, offerTypes: ['rent'] }],
    scope: 'public',
    ...overrides,
  }
}

function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

beforeEach(() => clearSearchDetailMemoryCache())

describe('lazy search details', () => {
  it('maps one TMDB id deterministically to one of 64 detail shards', () => {
    expect(searchDetailBucket(entry({ tmdbId: 65 }))).toBe('01')
    expect(searchDetailBucket(entry({ tmdbId: 64 }))).toBe('00')
  })

  it('keeps provider offers usable even before richer detail metadata exists', () => {
    const fallback = toSearchDetailFallback(entry())
    expect(fallback.source).toBe('tmdb')
    expect(fallback.providerIds).toEqual(['prime'])
    expect(fallback.providerOffers[0].offerTypes).toEqual(['rent'])
    expect(fallback.meta).toBe('Film')
  })

  it('keeps compact season summaries when a series detail is hydrated lazily', () => {
    const fallback = toSearchDetailFallback(entry({
      id: 'tmdb-series-65',
      type: 'series',
      numberOfSeasons: 2,
      numberOfEpisodes: 12,
      seasons: [{ season_number: 2, name: 'Zweite Staffel', episode_count: 6 }],
    }))

    expect(fallback.numberOfSeasons).toBe(2)
    expect(fallback.numberOfEpisodes).toBe(12)
    expect(fallback.seasons).toEqual([
      expect.objectContaining({ seasonNumber: 2, title: 'Zweite Staffel', episodeCount: 6 }),
    ])
  })

  it('merges a discover detail seed without overwriting provider membership', () => {
    const merged = mergeSearchDetail(entry(), {
      id: 'tmdb-movie-65',
      description: 'Geladene Beschreibung',
      voteAverage: 7.25,
      genreNames: ['Drama', 'Thriller'],
      backdropUrl: 'https://image.example/backdrop.jpg',
      completeness: 'discover',
    })

    expect(merged.description).toBe('Geladene Beschreibung')
    expect(merged.genre).toBe('Drama · Thriller')
    expect(merged.score).toBe('7,3')
    expect(merged.providerIds).toEqual(['prime'])
    expect(merged.detailSource).toBe('discover')
  })

  it('loads only the matching shard and reuses the persistent cache afterwards', async () => {
    const fakeStorage = storage()
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({
        kind: 'search-detail-shard',
        entries: [{
          id: 'tmdb-movie-65',
          description: 'Aus dem Shard',
          voteAverage: 8,
          genreNames: ['Science-Fiction'],
          completeness: 'discover',
        }],
      }),
      url,
    }))

    const first = await loadSearchDetail(entry(), { fetchImpl, storage: fakeStorage, now: 1000 })
    expect(first.description).toBe('Aus dem Shard')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('/search-details/01.json')

    clearSearchDetailMemoryCache()
    const secondFetch = vi.fn()
    const second = await loadSearchDetail(entry(), { fetchImpl: secondFetch, storage: fakeStorage, now: 2000 })
    expect(second.description).toBe('Aus dem Shard')
    expect(secondFetch).not.toHaveBeenCalled()
  })

  it('hydrates an old Movie-Hub id through the same TMDB identity', async () => {
    const result = await loadSearchDetail(entry({ id: 'legacy-movie-65', providerIds: ['moviehub'] }), {
      storage: storage(),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          kind: 'search-detail-shard',
          entries: [{
            id: 'tmdb-movie-65',
            tmdbId: 65,
            type: 'movie',
            description: 'Vollständiger Treffer',
            collectionChecked: true,
            collectionId: 99,
            collectionDetails: { id: 99, parts: [{ id: 65 }, { id: 66 }] },
            metadataVersion: 2,
            metadataComplete: true,
            completeness: 'enriched',
          }],
        }),
      }),
    })

    expect(result.id).toBe('legacy-movie-65')
    expect(result.providerIds).toEqual(['moviehub'])
    expect(result.collectionId).toBe(99)
    expect(result.metadataComplete).toBe(true)
  })

  it('falls back safely when a shard does not contain the title', async () => {
    const result = await loadSearchDetail(entry(), {
      storage: storage(),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ kind: 'search-detail-shard', entries: [] }),
      }),
    })

    expect(result.title).toBe('Lazy Movie')
    expect(result.providerIds).toEqual(['prime'])
    expect(result.detailSource).toBe('search-index')
  })
})
