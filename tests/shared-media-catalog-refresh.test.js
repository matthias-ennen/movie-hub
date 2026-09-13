import { describe, expect, it, vi } from 'vitest'
import { refreshSharedMediaCatalogMetadata } from '../src/library/sharedMedia.js'

vi.mock('../src/lib/firebase.js', () => ({
  firebaseReady: new Promise(() => {}),
}))

describe('profilgebundene Movie-Hub-Metadatenpflege', () => {
  it('writes a complete collection manifest without accessing media entries', async () => {
    const writes = []
    const result = await refreshSharedMediaCatalogMetadata('user-1', [{
      key: 'movie-562',
      titleRef: {
        id: 'legacy-die-hard',
        tmdbId: 562,
        type: 'movie',
        title: 'Stirb langsam',
        metadataVersion: 1,
        metadataComplete: false,
        collectionChecked: false,
        providerIds: [],
      },
    }], {
      loadDetail: async () => ({
        id: 'tmdb-movie-562',
        tmdbId: 562,
        type: 'movie',
        title: 'Stirb langsam',
        metadataVersion: 2,
        metadataComplete: true,
        collectionChecked: true,
        collectionId: 1570,
        collectionName: 'Stirb langsam - Collection',
        collectionDetails: {
          id: 1570,
          name: 'Stirb langsam - Collection',
          parts: [
            { id: 562, title: 'Stirb langsam' },
            { id: 1573, title: 'Stirb langsam 2' },
          ],
        },
      }),
      writeTitleRef: async (key, titleRef) => writes.push({ key, titleRef }),
    })

    expect(result).toEqual({ candidates: 1, updated: 1 })
    expect(writes).toHaveLength(1)
    expect(writes[0].key).toBe('movie-562')
    expect(writes[0].titleRef).toMatchObject({
      id: 'legacy-die-hard',
      tmdbId: 562,
      collectionId: 1570,
      collectionChecked: true,
      metadataVersion: 2,
      metadataComplete: true,
    })
    expect(writes[0].titleRef.collectionDetails.parts).toHaveLength(2)
  })
})
