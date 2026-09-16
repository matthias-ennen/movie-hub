import { describe, expect, it } from 'vitest'
import {
  isUsableTitle,
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
      title: 'Stirb langsam',
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
      collectionId: 1570,
    })).toBe(true)
    expect(titleNeedsMetadataEnrichment({
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
      collectionId: 1570,
      collectionDetails: { id: 1570, parts: [{ id: 562 }, { id: 1573 }] },
    })).toBe(false)
  })

  it('behandelt leere Titel und TMDB-ID-Platzhalter als unvollständig', () => {
    expect(isUsableTitle('Stirb langsam 2')).toBe(true)
    expect(isUsableTitle('')).toBe(false)
    expect(isUsableTitle('  ')).toBe(false)
    expect(isUsableTitle('TMDB #1573')).toBe(false)
    expect(isUsableTitle('tmdb#1573')).toBe(false)
    expect(titleNeedsMetadataEnrichment({
      tmdbId: 1573,
      type: 'movie',
      title: 'TMDB #1573',
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
      collectionId: 1570,
      collectionDetails: { id: 1570, parts: [{ id: 1573, title: 'Stirb langsam 2' }] },
    })).toBe(true)
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

  it('lässt einen vollständigen TMDB-Platzhalter niemals einen echten Titel überschreiben', () => {
    const merged = mergeEnrichedTitle({
      id: 'tmdb-movie-1573',
      tmdbId: 1573,
      type: 'movie',
      title: 'Stirb langsam 2',
      metadataVersion: 1,
      metadataComplete: false,
      providerIds: ['prime'],
    }, {
      id: 'tmdb-movie-1573',
      tmdbId: 1573,
      type: 'movie',
      title: 'TMDB #1573',
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
      collectionId: 1570,
      collectionDetails: { id: 1570, parts: [{ id: 1573, title: 'Stirb langsam 2' }] },
      providerIds: ['moviehub'],
    })

    expect(merged.title).toBe('Stirb langsam 2')
    expect(merged.metadataComplete).toBe(true)
    expect(merged.providerIds).toEqual(['prime', 'moviehub'])
  })

  it('ersetzt einen vorhandenen Platzhalter durch einen echten angereicherten Titel', () => {
    const merged = mergeEnrichedTitle({
      id: 'tmdb-movie-1573',
      tmdbId: 1573,
      type: 'movie',
      title: 'TMDB #1573',
      metadataVersion: 1,
      metadataComplete: false,
    }, {
      id: 'tmdb-movie-1573',
      tmdbId: 1573,
      type: 'movie',
      title: 'Stirb langsam 2',
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
      collectionId: 1570,
      collectionDetails: { id: 1570, parts: [{ id: 1573, title: 'Stirb langsam 2' }] },
    })

    expect(merged.title).toBe('Stirb langsam 2')
    expect(merged.metadataComplete).toBe(true)
  })
})
