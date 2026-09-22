import { describe, expect, it, vi } from 'vitest'
import { hydratePersonalTitleState } from '../src/library/personalTitleMetadata.js'

const completeMovie = {
  id: 'tmdb-movie-762441',
  tmdbId: 762441,
  type: 'movie',
  source: 'tmdb',
  title: 'A Quiet Place: Tag Eins',
  description: 'Die Welt verstummt.',
  posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
  artwork: { posterPaths: ['/poster.jpg'], heroBackdropPaths: ['/backdrop.jpg'] },
  collectionId: null,
  collectionChecked: true,
  metadataVersion: 3,
  metadataComplete: true,
  metadataUpdatedAt: '2026-09-22T06:36:20.991Z',
  metadataChecks: {
    details: 'present',
    artwork: 'present',
    ageRating: 'present',
    credits: 'present',
    keywords: 'present',
    videos: 'present',
    providers: 'present',
    collection: 'absent',
  },
  canonicalPublished: true,
}

describe('kanonische Metadaten für persönliche Titel', () => {
  it('ersetzt einen alten Bootstrap beim Profilstart durch das veröffentlichte Search-Detail', async () => {
    const loadDetail = vi.fn(async () => completeMovie)
    const state = await hydratePersonalTitleState({
      watchlist: true,
      titleRef: { catalogId: completeMovie.id, tmdbId: completeMovie.tmdbId, type: 'movie' },
      titleSnapshot: {
        ...completeMovie,
        backdropUrl: null,
        artwork: { posterPaths: ['/poster.jpg'], heroBackdropPaths: [] },
      },
    }, { loadDetail })

    expect(loadDetail).toHaveBeenCalledWith(expect.objectContaining({
      tmdbId: 762441,
      type: 'movie',
    }))
    expect(state).toMatchObject({
      watchlist: true,
      canonicalReady: true,
      canonicalMetadataVersion: 3,
      canonicalMetadataUpdatedAt: '2026-09-22T06:36:20.991Z',
      titleSnapshot: {
        backdropUrl: completeMovie.backdropUrl,
        artwork: { heroBackdropPaths: ['/backdrop.jpg'] },
      },
    })
  })

  it('behält den temporären Bootstrap, solange kein kanonisches Detail veröffentlicht ist', async () => {
    const bootstrapSnapshot = { ...completeMovie, canonicalPublished: false }
    const state = await hydratePersonalTitleState({
      favorite: true,
      titleRef: { catalogId: completeMovie.id, tmdbId: completeMovie.tmdbId, type: 'movie' },
      bootstrapSnapshot,
    }, { loadDetail: async () => ({ ...completeMovie, canonicalPublished: false }) })

    expect(state.canonicalReady).toBe(false)
    expect(state.titleSnapshot).toMatchObject({ title: completeMovie.title, backdropUrl: completeMovie.backdropUrl })
  })
})
