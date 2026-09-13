import { describe, expect, it } from 'vitest'
import {
  buildFilmCollectionIndex,
  collectionIdForTitle,
  findFilmCollectionForTitle,
  normalizeFilmCollectionIndex,
  resolveFilmCollectionParts,
} from '../src/catalog/filmCollections.js'

function catalogTitle(tmdbId, collectionId, extra = {}) {
  return {
    id: `tmdb-movie-${tmdbId}`,
    tmdbId,
    type: 'movie',
    title: `Film ${tmdbId}`,
    releaseDate: `202${tmdbId}-01-01`,
    smartFacets: { collection: { id: collectionId, name: 'Beispiel-Reihe' } },
    providerIds: [],
    ...extra,
  }
}

describe('Filmreihen-Katalog', () => {
  it('finds collection ids in generated, normalized and compact titles', () => {
    expect(collectionIdForTitle({ facets: { collectionId: 40 } })).toBe(40)
    expect(collectionIdForTitle({ smartFacets: { collection: { id: 41 } } })).toBe(41)
    expect(collectionIdForTitle({ collectionId: 42 })).toBe(42)
    expect(collectionIdForTitle({ type: 'series' })).toBeNull()
  })

  it('keeps all TMDB parts, enriches catalog members and sorts by release date', () => {
    const index = buildFilmCollectionIndex([{
      id: 40,
      name: 'Sternensaga',
      parts: [
        { id: 3, title: 'Ohne Datum' },
        { id: 2, title: 'Zweiter Film', release_date: '2002-05-01' },
        { id: 1, title: 'Erster Film', release_date: '2000-05-01' },
      ],
    }], [catalogTitle(2, 40, { title: 'Zweiter Film aus dem Katalog', providerIds: ['prime'] })])

    expect(index['40'].parts.map((part) => part.tmdbId)).toEqual([1, 2, 3])
    expect(index['40'].parts[1]).toMatchObject({
      title: 'Zweiter Film aus dem Katalog',
      providerIds: ['prime'],
      facets: { collectionId: 40 },
    })
  })

  it('falls back to known catalog members when a collection request is unavailable', () => {
    const index = buildFilmCollectionIndex([], [
      catalogTitle(1, 40),
      catalogTitle(2, 40),
      catalogTitle(9, 99),
    ])

    expect(index['40'].name).toBe('Beispiel-Reihe')
    expect(index['40'].parts).toHaveLength(2)
    expect(index['99']).toBeUndefined()
  })

  it('accepts old catalogs without a collection index', () => {
    expect(normalizeFilmCollectionIndex(undefined)).toEqual({})
    expect(normalizeFilmCollectionIndex([])).toEqual({})
  })

  it('finds a collection defensively by the current TMDB id', () => {
    const collections = buildFilmCollectionIndex([{
      id: 40,
      name: 'Sternensaga',
      parts: [
        { id: 1, title: 'Erster Film' },
        { id: 2, title: 'Zweiter Film' },
      ],
    }])

    expect(findFilmCollectionForTitle({ type: 'movie', tmdbId: 2 }, collections)?.id).toBe(40)
    expect(findFilmCollectionForTitle({ type: 'series', tmdbId: 2 }, collections)).toBeNull()
  })

  it('merges current provider and Movie-Hub availability by TMDB id', () => {
    const collection = buildFilmCollectionIndex([{
      id: 40,
      name: 'Sternensaga',
      parts: [
        { id: 1, title: 'Erster Film', release_date: '2000-05-01' },
        { id: 2, title: 'Zweiter Film', release_date: '2002-05-01' },
      ],
    }])['40']
    const parts = resolveFilmCollectionParts(collection, [
      catalogTitle(2, 40, { providerIds: ['moviehub', 'netflix'], description: 'Vollständig' }),
    ])

    expect(parts[1]).toMatchObject({
      description: 'Vollständig',
      providerIds: ['moviehub', 'netflix'],
      facets: { collectionId: 40 },
    })
  })
})
