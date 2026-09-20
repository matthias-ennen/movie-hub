import { describe, expect, it } from 'vitest'
import {
  IncompleteTitleMetadataError,
  loadCompleteTitleMetadata,
} from '../src/catalog/loadCompleteTitleMetadata.js'

const completeChecks = {
  details: 'present',
  artwork: 'present',
  ageRating: 'absent',
  credits: 'present',
  keywords: 'absent',
  videos: 'absent',
  providers: 'present',
  collection: 'absent',
}

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

  it('requires the strict contract for search-only details and preserves provider membership', async () => {
    const item = {
      id: 'tmdb-movie-562',
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      providerIds: ['prime'],
    }
    const result = await loadCompleteTitleMetadata(item, {
      requireContract: true,
      requireComplete: true,
      loadPublished: async () => ({ ...item, metadataVersion: 2, metadataComplete: true, collectionChecked: true }),
      loadNative: async () => ({
        ...item,
        providerIds: [],
        metadataVersion: 3,
        metadataComplete: true,
        metadataChecks: completeChecks,
        collectionChecked: true,
      }),
    })

    expect(result.metadataVersion).toBe(3)
    expect(result.providerIds).toEqual(['prime'])
  })

  it('rejects an atomic search-only open when no complete source is available', async () => {
    const item = { id: 'tmdb-movie-562', tmdbId: 562, type: 'movie', title: 'Stirb langsam' }
    await expect(loadCompleteTitleMetadata(item, {
      requireContract: true,
      requireComplete: true,
      loadPublished: async () => ({ ...item, metadataVersion: 2, metadataComplete: true, collectionChecked: true }),
      loadNative: async () => null,
    })).rejects.toBeInstanceOf(IncompleteTitleMetadataError)
  })
})
