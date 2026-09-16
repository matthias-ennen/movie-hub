import { describe, expect, it } from 'vitest'
import { loadCompleteTitleMetadata } from '../src/catalog/loadCompleteTitleMetadata.js'

describe('vollständige Titelmetadaten', () => {
  it('uses the secure native source when the published detail is incomplete', async () => {
    const item = { id: 'legacy', tmdbId: 562, type: 'movie', title: 'Stirb langsam' }
    const result = await loadCompleteTitleMetadata(item, {
      loadPublished: async () => ({
        ...item,
        metadataVersion: 2,
        metadataComplete: false,
        collectionChecked: false,
      }),
      loadNative: async () => ({
        ...item,
        metadataVersion: 2,
        metadataComplete: true,
        collectionChecked: true,
        collectionId: 1570,
        collectionDetails: { id: 1570, name: 'Stirb langsam - Collection', parts: [] },
      }),
    })

    expect(result).toMatchObject({ metadataComplete: true, collectionId: 1570 })
  })

  it('resolves a personal TMDB placeholder natively when no published search detail exists', async () => {
    const item = {
      id: 'tmdb-movie-928',
      tmdbId: 928,
      type: 'movie',
      title: 'Titel wird geladen …',
      metadataVersion: 2,
      metadataComplete: false,
      collectionChecked: false,
    }
    let nativeCalls = 0

    const result = await loadCompleteTitleMetadata(item, {
      loadPublished: async () => item,
      loadNative: async () => {
        nativeCalls += 1
        return {
          ...item,
          title: 'Gremlins 2 - Die Rückkehr der kleinen Monster',
          originalTitle: 'Gremlins 2: The New Batch',
          metadataVersion: 2,
          metadataComplete: true,
          collectionChecked: true,
          collectionId: 89151,
          collectionDetails: { id: 89151, name: 'Gremlins Collection', parts: [] },
        }
      },
    })

    expect(nativeCalls).toBe(1)
    expect(result.title).toBe('Gremlins 2 - Die Rückkehr der kleinen Monster')
    expect(result.metadataComplete).toBe(true)
  })
})
