import { describe, expect, it, vi } from 'vitest'
import {
  enrichPersonalTmdbTitle,
  runPersonalTmdbMetadataBackfill,
} from '../scripts/enrich-personal-tmdb-metadata.mjs'

function detailPayload() {
  return {
    id: 11,
    title: 'Star Wars',
    original_title: 'Star Wars',
    overview: 'Aktualisierte Beschreibung.',
    release_date: '1977-05-25',
    runtime: 121,
    genres: [{ id: 12, name: 'Abenteuer' }],
    credits: { cast: [], crew: [] },
    keywords: { keywords: [] },
    images: { posters: [], backdrops: [] },
    'watch/providers': { results: {} },
    videos: { results: [] },
    release_dates: { results: [] },
    belongs_to_collection: null,
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    vote_average: 8.2,
    vote_count: 1000,
    original_language: 'en',
  }
}

function personalTitle(overrides = {}) {
  return {
    tmdbId: 11,
    mediaType: 'movie',
    title: 'Star Wars',
    metadataVersion: 2,
    metadataComplete: true,
    metadataUpdatedAt: '2026-09-19T00:00:00.000Z',
    collectionChecked: true,
    favorite: true,
    watchlist: false,
    rated: true,
    ratingValue: 9,
    favoriteOrder: 1,
    ratingOrder: 1,
    syncedAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  }
}

describe('personal TMDB metadata backfill', () => {
  it('refreshes public metadata without changing personal memberships', async () => {
    const result = await enrichPersonalTmdbTitle(personalTitle(), {
      fetchTmdb: async () => detailPayload(),
      updatedAt: '2026-09-20T03:17:00.000Z',
    })

    expect(result).toMatchObject({
      tmdbId: 11,
      mediaType: 'movie',
      description: 'Aktualisierte Beschreibung.',
      metadataComplete: true,
      metadataUpdatedAt: '2026-09-20T03:17:00.000Z',
      favorite: true,
      watchlist: false,
      rated: true,
      ratingValue: 9,
      syncedAt: '2026-09-10T10:00:00.000Z',
    })
  })

  it('selects a fresh personal title when it is in the TMDB change queue', async () => {
    const set = vi.fn(async () => {})
    const document = {
      ref: { path: 'users/user-1/tmdbCatalog/movie:11', set },
      data: () => personalTitle(),
    }
    const db = { collectionGroup: () => ({ get: async () => ({ docs: [document], size: 1 }) }) }

    const result = await runPersonalTmdbMetadataBackfill({
      db,
      fetchTmdb: async () => detailPayload(),
      now: new Date('2026-09-20T03:17:00.000Z'),
      changedTitleKeys: new Set(['movie:11']),
    })

    expect(result).toEqual({ scanned: 1, candidates: 1, updated: 1, failed: 0 })
    expect(set).toHaveBeenCalledOnce()
  })
})
