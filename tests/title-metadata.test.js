import { describe, expect, it } from 'vitest'
import {
  isUsableTitle,
  metadataChecksComplete,
  mergeEnrichedTitle,
  sameTmdbTitle,
  titleNeedsMetadataEnrichment,
} from '../src/catalog/titleMetadata.js'

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

describe('kanonische Titelmetadaten', () => {
  it('accepts checked negative values but rejects unchecked and failed contract groups', () => {
    const complete = {
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      metadataVersion: 3,
      metadataComplete: true,
      metadataChecks: completeChecks,
      collectionChecked: true,
    }
    expect(metadataChecksComplete(complete)).toBe(true)
    expect(titleNeedsMetadataEnrichment(complete, { requireContract: true })).toBe(false)
    expect(metadataChecksComplete({
      ...complete,
      metadataChecks: { ...completeChecks, videos: 'unchecked' },
    })).toBe(false)
    expect(metadataChecksComplete({
      ...complete,
      metadataChecks: { ...completeChecks, videos: 'failed' },
    })).toBe(false)
  })

  it('requires the new contract explicitly while legacy callers remain migratable', () => {
    const legacy = {
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
    }
    expect(titleNeedsMetadataEnrichment(legacy)).toBe(false)
    expect(titleNeedsMetadataEnrichment(legacy, { requireContract: true })).toBe(true)
  })
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

  it('behält kanonische Metadaten bei, wenn eine Anreicherung leere Werte liefert', () => {
    const base = {
      id: 'tmdb-movie-562',
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      description: 'Ein New Yorker Polizist kämpft gegen Terroristen.',
      videos: [{ id: 'trailer-1', site: 'YouTube', key: 'abc', type: 'Trailer' }],
      cast: [{ id: 1, name: 'Bruce Willis' }],
      genres: [{ id: 28, name: 'Action' }],
      genreNames: ['Action'],
      artwork: { posterPaths: ['/poster-a.jpg'], heroBackdropPaths: ['/backdrop-a.jpg'] },
      providerIds: ['prime'],
      providerOffers: [{ id: 'prime', offerTypes: ['flatrate'] }],
      metadataVersion: 2,
      metadataComplete: true,
    }

    const merged = mergeEnrichedTitle(base, {
      ...base,
      description: '',
      videos: [],
      cast: [],
      genres: [],
      genreNames: [],
      artwork: { posterPaths: [], heroBackdropPaths: [] },
      providerIds: [],
      providerOffers: [],
    })

    expect(merged.description).toBe(base.description)
    expect(merged.videos).toEqual(base.videos)
    expect(merged.cast).toEqual(base.cast)
    expect(merged.genres).toEqual(base.genres)
    expect(merged.artwork).toEqual(base.artwork)
    expect(merged.providerIds).toEqual(['prime'])
    expect(merged.providerOffers).toEqual(base.providerOffers)
  })

  it('ergänzt neue Array-Metadaten ohne vorhandene Einträge zu duplizieren', () => {
    const merged = mergeEnrichedTitle({
      id: 'tmdb-movie-562',
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      videos: [{ id: 'trailer-1', site: 'YouTube', key: 'abc' }],
      cast: [{ id: 1, name: 'Bruce Willis' }],
      artwork: { posterPaths: ['/poster-a.jpg'], heroBackdropPaths: [] },
      providerIds: ['prime'],
      providerOffers: [{ id: 'prime', offerTypes: ['flatrate'] }],
    }, {
      id: 'tmdb-movie-562',
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      videos: [
        { id: 'trailer-1', site: 'YouTube', key: 'abc', official: true },
        { id: 'teaser-2', site: 'YouTube', key: 'def' },
      ],
      cast: [{ id: 2, name: 'Alan Rickman' }],
      artwork: { posterPaths: ['/poster-b.jpg'], heroBackdropPaths: ['/backdrop-a.jpg'] },
      providerIds: ['disney'],
      providerOffers: [
        { id: 'prime', offerTypes: ['rent'] },
        { id: 'disney', offerTypes: ['flatrate'] },
      ],
    })

    expect(merged.videos).toHaveLength(2)
    expect(merged.videos[0]).toMatchObject({ id: 'trailer-1', official: true })
    expect(merged.cast.map((person) => person.name)).toEqual(['Bruce Willis', 'Alan Rickman'])
    expect(merged.artwork.posterPaths).toEqual(['/poster-a.jpg', '/poster-b.jpg'])
    expect(merged.providerIds).toEqual(['prime', 'disney'])
    expect(merged.providerOffers).toEqual([
      { id: 'prime', offerTypes: ['flatrate', 'rent'] },
      { id: 'disney', offerTypes: ['flatrate'] },
    ])
  })

  it('erlaubt nur über collectionChecked ein geprüftes Leeren der Collection', () => {
    const merged = mergeEnrichedTitle({
      id: 'tmdb-movie-562',
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      collectionId: 1570,
      collectionName: 'Stirb langsam - Collection',
      collectionChecked: true,
      collectionDetails: { id: 1570, parts: [{ id: 562 }] },
      smartFacets: { collection: { id: 1570, name: 'Stirb langsam - Collection' } },
    }, {
      id: 'tmdb-movie-562',
      tmdbId: 562,
      type: 'movie',
      title: 'Stirb langsam',
      collectionId: null,
      collectionName: null,
      collectionChecked: true,
      collectionDetails: null,
    })

    expect(merged.collectionChecked).toBe(true)
    expect(merged.collectionId).toBeNull()
    expect(merged.collectionName).toBeNull()
    expect(merged.collectionDetails).toBeNull()
    expect(merged.smartFacets.collection).toBeNull()
  })

  it('ergänzt Serien- und Staffelmetadaten ohne bekannte Werte zu verlieren', () => {
    const merged = mergeEnrichedTitle({
      id: 'tmdb-series-1399',
      tmdbId: 1399,
      type: 'series',
      title: 'Game of Thrones',
      numberOfSeasons: 8,
      numberOfEpisodes: 73,
      seasons: [{ id: 'season-1', seasonNumber: 1, title: 'Staffel 1', episodeCount: 10 }],
    }, {
      id: 'tmdb-series-1399',
      tmdbId: 1399,
      type: 'series',
      title: 'Game of Thrones',
      numberOfSeasons: null,
      numberOfEpisodes: null,
      seasons: [{ id: 'season-2', seasonNumber: 2, title: 'Staffel 2', episodeCount: 10 }],
    })

    expect(merged.numberOfSeasons).toBe(8)
    expect(merged.numberOfEpisodes).toBe(73)
    expect(merged.seasons.map((season) => season.seasonNumber)).toEqual([1, 2])
    expect(merged.collectionChecked).toBeNull()
  })
})
