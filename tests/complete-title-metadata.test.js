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
})
