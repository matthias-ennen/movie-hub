import { describe, expect, it, vi } from 'vitest'
import {
  enrichSharedMediaTitleRef,
  runSharedMediaMetadataBackfill,
} from '../scripts/enrich-shared-media-metadata.mjs'

function detailPayload(id = 562) {
  const secondPart = id === 1573
  return {
    id,
    title: secondPart ? 'Stirb langsam 2' : 'Stirb langsam',
    original_title: secondPart ? 'Die Hard 2' : 'Die Hard',
    overview: secondPart ? 'John McClane gerät erneut in Schwierigkeiten.' : 'John McClane gerät in einen Überfall.',
    release_date: secondPart ? '1990-07-02' : '1988-07-15',
    runtime: secondPart ? 124 : 132,
    genres: [{ id: 28, name: 'Action' }],
    credits: { cast: [{ id: 62, name: 'Bruce Willis', character: 'John McClane' }], crew: [] },
    keywords: { keywords: [] },
    images: {
      posters: [{ file_path: '/poster.jpg', iso_639_1: null, width: 1000, height: 1500 }],
      backdrops: [{ file_path: '/wide.jpg', iso_639_1: null, width: 1920, height: 1080 }],
    },
    'watch/providers': { results: {} },
    videos: { results: [] },
    release_dates: { results: [] },
    belongs_to_collection: { id: 1570, name: 'Stirb langsam - Collection' },
    poster_path: '/poster.jpg',
    backdrop_path: '/wide.jpg',
    vote_average: 7.8,
    vote_count: 11000,
  }
}

const collectionPayload = {
  id: 1570,
  name: 'Stirb langsam - Collection',
  overview: 'Alle Filme der Reihe.',
  parts: [
    { id: 562, title: 'Stirb langsam', release_date: '1988-07-15', poster_path: '/one.jpg' },
    { id: 1573, title: 'Stirb langsam 2', release_date: '1990-07-02', poster_path: '/two.jpg' },
  ],
}

describe('Movie-Hub-Metadaten-Backfill', () => {
  it('lädt Film- und Collection-Daten und erzeugt eine vollständige Anbieter-Titelreferenz', async () => {
    const fetchTmdb = vi.fn(async (path) => path.startsWith('/collection/') ? collectionPayload : detailPayload())
    const result = await enrichSharedMediaTitleRef({
      id: 'tmdb-movie-562',
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      metadataVersion: 1,
      metadataComplete: false,
    }, { fetchTmdb, updatedAt: '2026-09-13T09:00:00.000Z' })

    expect(fetchTmdb).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      tmdbId: 562,
      collectionId: 1570,
      collectionChecked: true,
      metadataVersion: 2,
      metadataComplete: true,
      metadataUpdatedAt: '2026-09-13T09:00:00.000Z',
    })
    expect(result.collectionDetails.parts).toHaveLength(2)
    expect(result.cast[0].name).toBe('Bruce Willis')
    expect(result.artwork.posterPaths).toEqual(['/poster.jpg'])
  })

  it('aktualisiert nur echte unvollständige Manifest-Dokumente und fasst Fehler zusammen', async () => {
    const set = vi.fn(async () => {})
    const documents = [{
      ref: { path: 'users/user-1/sharedMedia/movie-562', set },
      data: () => ({
        hasMedia: true,
        titleRef: { tmdbId: 562, type: 'movie', title: 'Stirb langsam', metadataVersion: 1 },
      }),
    }, {
      ref: { path: 'users/user-1/sharedMedia/movie-11', set: vi.fn() },
      data: () => ({
        hasMedia: true,
        titleRef: {
          tmdbId: 11,
          type: 'movie',
          title: 'Vollständig',
          metadataVersion: 2,
          metadataComplete: true,
          collectionChecked: true,
          collectionId: null,
          metadataUpdatedAt: '2026-09-10T09:00:00.000Z',
        },
      }),
    }]
    const db = { collectionGroup: () => ({ get: async () => ({ docs: documents, size: documents.length }) }) }
    const fetchTmdb = vi.fn(async (path) => path.startsWith('/collection/') ? collectionPayload : detailPayload())
    const result = await runSharedMediaMetadataBackfill({
      db,
      fetchTmdb,
      now: new Date('2026-09-13T09:00:00.000Z'),
      ageDays: 30,
    })

    expect(result).toEqual({ scanned: 2, candidates: 1, updated: 1, failed: 0 })
    expect(set).toHaveBeenCalledTimes(1)
    expect(fetchTmdb).toHaveBeenCalledTimes(2)
  })

  it('selektiert einen formal vollständigen TMDB-Platzhalter erneut und repariert seinen Titel', async () => {
    const set = vi.fn(async () => {})
    const documents = [{
      ref: { path: 'users/user-1/sharedMedia/movie-1573', set },
      data: () => ({
        hasMedia: true,
        titleRef: {
          tmdbId: 1573,
          type: 'movie',
          title: 'TMDB #1573',
          metadataVersion: 2,
          metadataComplete: true,
          collectionChecked: true,
          collectionId: 1570,
          collectionDetails: collectionPayload,
          metadataUpdatedAt: '2026-09-16T08:00:00.000Z',
        },
      }),
    }]
    const db = { collectionGroup: () => ({ get: async () => ({ docs: documents, size: documents.length }) }) }
    const fetchTmdb = vi.fn(async (path) => path.startsWith('/collection/') ? collectionPayload : detailPayload(1573))

    const result = await runSharedMediaMetadataBackfill({
      db,
      fetchTmdb,
      now: new Date('2026-09-16T09:00:00.000Z'),
      ageDays: 30,
    })

    expect(result).toEqual({ scanned: 1, candidates: 1, updated: 1, failed: 0 })
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][0].titleRef).toMatchObject({
      tmdbId: 1573,
      title: 'Stirb langsam 2',
      metadataVersion: 2,
      metadataComplete: true,
    })
  })
})
