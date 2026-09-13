import { afterEach, describe, expect, it } from 'vitest'
import {
  loadNativeTmdbTitleMetadata,
  resetNativeTitleMetadataForTests,
} from '../src/tmdb/nativeTitleMetadata.js'

afterEach(() => resetNativeTitleMetadataForTests())

describe('nativer TMDB-Titeldetailzugriff', () => {
  it('returns a sanitized complete movie without exposing credentials', async () => {
    const target = {
      MovieHubNative: {
        requestTmdbTitleMetadata(mediaType, tmdbId, requestId) {
          expect(mediaType).toBe('movie')
          expect(tmdbId).toBe('562')
          queueMicrotask(() => target.__movieHubTmdbTitleMetadataResult(JSON.stringify({
            ok: true,
            requestId,
            syncedAt: '2026-09-13T10:00:00Z',
            title: {
              tmdbId: 562,
              mediaType: 'movie',
              title: 'Stirb langsam',
              collectionId: 1570,
              collectionName: 'Stirb langsam - Collection',
              collectionChecked: true,
              collectionDetails: { id: 1570, name: 'Stirb langsam - Collection', parts: [] },
              metadataVersion: 2,
              metadataComplete: true,
            },
          })))
        },
      },
    }

    const result = await loadNativeTmdbTitleMetadata({ tmdbId: 562, type: 'movie' }, { target })
    expect(result).toMatchObject({
      id: 'tmdb-movie-562',
      tmdbId: 562,
      collectionId: 1570,
      metadataComplete: true,
    })
  })
})
