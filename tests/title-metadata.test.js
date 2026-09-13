import { describe, expect, it } from 'vitest'
import {
  mergeEnrichedTitle,
  sameTmdbTitle,
  titleNeedsMetadataEnrichment,
} from '../src/catalog/titleMetadata.js'

describe('kanonische Titelmetadaten', () => {
  it('erkennt ungeprüfte Filme und fehlende Collection-Details als unvollständig', () => {
    expect(titleNeedsMetadataEnrichment({ tmdbId: 562, type: 'movie', metadataVersion: 1 })).toBe(true)
    expect(titleNeedsMetadataEnrichment({
      tmdbId: 562,
      type: 'movie',
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
      collectionId: 1570,
    })).toBe(true)
    expect(titleNeedsMetadataEnrichment({
      tmdbId: 562,
      type: 'movie',
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
      collectionId: 1570,
      collectionDetails: { id: 1570, parts: [{ id: 562 }, { id: 1573 }] },
    })).toBe(false)
  })

  it('führt vollständige Metadaten mit der Movie-Hub-Anbieterzugehörigkeit zusammen', () => {
    const merged = mergeEnrichedTitle({
      id: 'legacy-movie-562',
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      providerIds: ['moviehub'],
      movieHubCatalog: true,
      metadataVersion: 1,
    }, {
      id: 'tmdb-movie-562',
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      providerIds: ['disney'],
      collectionId: 1570,
      collectionName: 'Stirb langsam - Collection',
      collectionChecked: true,
      collectionDetails: { id: 1570, parts: [{ id: 562 }, { id: 1573 }] },
      metadataVersion: 2,
      metadataComplete: true,
    })
    expect(merged.id).toBe('legacy-movie-562')
    expect(merged.providerIds).toEqual(['moviehub', 'disney'])
    expect(merged.collectionId).toBe(1570)
    expect(merged.movieHubCatalog).toBe(true)
    expect(sameTmdbTitle(merged, { tmdbId: 562, type: 'movie' })).toBe(true)
  })
})
