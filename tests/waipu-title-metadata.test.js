import { describe, expect, it, vi } from 'vitest'
import {
  WaipuTmdbMetadataClient,
  enrichWaipuTitleMetadata,
  requireCompleteWaipuTitleMetadata,
} from '../scripts/waipu-title-metadata.mjs'

function airingEntry(overrides = {}) {
  return {
    tmdbId: 8688,
    type: 'movie',
    title: 'Spiel auf Zeit',
    originalTitle: 'Snake Eyes',
    year: 1998,
    posterUrl: null,
    airings: [{
      stationId: 'tntfilm',
      stationName: 'WARNER TV FILM',
      startTime: '2026-09-19T19:30:00.000Z',
      stopTime: '2026-09-19T21:15:00.000Z',
    }],
    nextAiring: {
      stationId: 'tntfilm',
      stationName: 'WARNER TV FILM',
      startTime: '2026-09-19T19:30:00.000Z',
      stopTime: '2026-09-19T21:15:00.000Z',
    },
    airingCount: 1,
    ...overrides,
  }
}

function completeMetadata(overrides = {}) {
  return {
    id: 'tmdb-movie-8688',
    source: 'tmdb',
    tmdbId: 8688,
    type: 'movie',
    mediaType: 'movie',
    title: 'Spiel auf Zeit',
    originalTitle: 'Snake Eyes',
    description: 'Ein Polizeidetektiv untersucht ein Attentat.',
    year: 1998,
    genres: [{ id: 53, name: 'Thriller' }],
    genre: 'Thriller',
    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
    providerIds: [],
    ageRating: 16,
    collectionId: null,
    collectionChecked: true,
    collectionDetails: null,
    metadataVersion: 2,
    metadataComplete: true,
    metadataUpdatedAt: '2026-09-19T18:00:00.000Z',
    ...overrides,
  }
}

describe('Waipu title metadata enrichment', () => {
  it('reuses complete canonical metadata and keeps current airing data', async () => {
    const loadTitleMetadata = vi.fn()
    const result = await enrichWaipuTitleMetadata([airingEntry()], {
      catalogTitles: [completeMetadata()],
      loadTitleMetadata,
      now: new Date('2026-09-19T18:30:00.000Z'),
    })

    expect(loadTitleMetadata).not.toHaveBeenCalled()
    expect(result.metrics).toEqual({ total: 1, fromCatalog: 1, fromCache: 0, fetched: 0, complete: 1 })
    expect(result.entries[0]).toMatchObject({
      title: 'Spiel auf Zeit',
      ageRating: 16,
      metadataComplete: true,
      providerIds: ['waipu'],
      airingCount: 1,
      nextAiring: { stationId: 'tntfilm' },
    })
    expect(requireCompleteWaipuTitleMetadata(result.entries)).toBe(true)
  })

  it('loads missing metadata once and publishes the complete TMDB title', async () => {
    const loadTitleMetadata = vi.fn(async () => completeMetadata())
    const result = await enrichWaipuTitleMetadata([airingEntry()], {
      loadTitleMetadata,
      now: new Date('2026-09-19T18:30:00.000Z'),
    })

    expect(loadTitleMetadata).toHaveBeenCalledOnce()
    expect(result.metrics).toMatchObject({ fetched: 1, complete: 1 })
    expect(result.entries[0]).toMatchObject({
      description: 'Ein Polizeidetektiv untersucht ein Attentat.',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      ageRating: 16,
    })
  })

  it('bypasses a fresh Waipu cache entry when TMDB reported the title as changed', async () => {
    const loadTitleMetadata = vi.fn(async () => completeMetadata({ description: 'Aktualisierte Beschreibung' }))
    const result = await enrichWaipuTitleMetadata([airingEntry()], {
      cachedTitles: [completeMetadata()],
      loadTitleMetadata,
      changedTitleKeys: new Set(['movie:8688']),
      now: new Date('2026-09-20T03:17:00.000Z'),
    })

    expect(loadTitleMetadata).toHaveBeenCalledOnce()
    expect(result.metrics).toMatchObject({ fromCache: 0, fetched: 1 })
    expect(result.entries[0].description).toBe('Aktualisierte Beschreibung')
  })

  it('loads German certification together with the TMDB details', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 8688,
        title: 'Spiel auf Zeit',
        original_title: 'Snake Eyes',
        overview: 'Ein Polizeidetektiv untersucht ein Attentat.',
        release_date: '1998-08-07',
        runtime: 98,
        genres: [{ id: 53, name: 'Thriller' }],
        credits: { cast: [], crew: [] },
        keywords: { keywords: [] },
        images: { posters: [], backdrops: [] },
        'watch/providers': { results: {} },
        videos: { results: [] },
        release_dates: {
          results: [{
            iso_3166_1: 'DE',
            release_dates: [{ certification: '16', type: 3, release_date: '1998-08-20T00:00:00.000Z' }],
          }],
        },
        belongs_to_collection: null,
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
        vote_average: 6.2,
        vote_count: 1400,
        popularity: 10,
        original_language: 'en',
        status: 'Released',
      }),
    }))
    const client = new WaipuTmdbMetadataClient({ token: 'test-token', fetchImpl })

    const metadata = await client.loadTitle(airingEntry(), '2026-09-19T18:30:00.000Z')

    expect(metadata).toMatchObject({
      tmdbId: 8688,
      title: 'Spiel auf Zeit',
      ageRating: 16,
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
