import { describe, expect, it } from 'vitest'
import {
  buildTmdbCatalogRows,
  mergePublicAndPersonalCatalog,
  nativeTitleToFirestore,
  normalizePersonalTmdbTitle,
  tmdbCatalogKey,
} from '../src/tmdb/tmdbCatalogModel.js'

describe('persönlicher TMDB-Katalog', () => {
  const dune = {
    tmdbId: 693134,
    mediaType: 'movie',
    title: 'Dune: Part Two',
    releaseDate: '2024-02-27',
    posterPath: '/poster.jpg',
    genreNames: ['Science-Fiction', 'Abenteuer'],
    providerIds: ['prime'],
    favorite: true,
    watchlist: true,
    favoriteOrder: 2,
    watchlistOrder: 1,
  }

  it('unterscheidet Film und Serie auch bei identischer numerischer TMDB-ID', () => {
    expect(tmdbCatalogKey(dune)).toBe('movie:693134')
    expect(tmdbCatalogKey({ ...dune, mediaType: 'tv' })).toBe('tv:693134')
  })

  it('normalisiert native, nicht geheime TMDB-Daten in das Movie-Hub-Titelmodell', () => {
    const title = normalizePersonalTmdbTitle(dune)
    expect(title.type).toBe('movie')
    expect(title.tmdbId).toBe(693134)
    expect(title.tmdbFavorite).toBe(true)
    expect(title.tmdbWatchlist).toBe(true)
    expect(title.tmdbRated).toBe(false)
    expect(title.genre).toBe('Science-Fiction · Abenteuer')
    expect(title.posterUrl).toContain('/w500/poster.jpg')
  })

  it('dedupliziert einen persönlichen Titel gegen den öffentlichen Katalog', () => {
    const publicTitle = {
      id: 'tmdb-movie-693134',
      source: 'tmdb',
      type: 'movie',
      tmdbId: 693134,
      title: 'Dune: Part Two',
      description: 'Reichere öffentliche Metadaten',
      providerIds: ['prime', 'youtube'],
    }
    const merged = mergePublicAndPersonalCatalog([publicTitle], [normalizePersonalTmdbTitle(dune)])

    expect(merged).toHaveLength(1)
    expect(merged[0].description).toBe('Reichere öffentliche Metadaten')
    expect(merged[0].tmdbFavorite).toBe(true)
    expect(merged[0].tmdbWatchlist).toBe(true)
    expect(merged[0].providerIds).toEqual(['prime', 'youtube'])
  })

  it('führt Favoriten und Watchlist mit den einheitlichen TMDB-Reihennamen', () => {
    const title = normalizePersonalTmdbTitle(dune)
    const rows = buildTmdbCatalogRows([title])
    expect(rows.map((row) => row.title)).toEqual([
      'Meine Watchlist · TMDB',
      'Meine Favoriten · TMDB',
    ])
    expect(rows[0].items[0].id).toBe(rows[1].items[0].id)
  })

  it('normalisiert TMDB-Bewertungen und erzeugt eine eigene Bewertungsreihe', () => {
    const rated = normalizePersonalTmdbTitle({
      ...dune,
      favorite: false,
      watchlist: false,
      rated: true,
      ratingValue: 9,
      ratedOrder: 3,
    })
    const rows = buildTmdbCatalogRows([rated])

    expect(rated.tmdbRated).toBe(true)
    expect(rated.tmdbRating).toBe(9)
    expect(rated.ratingOrder).toBe(3)
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Meine Bewertungen · TMDB')
    expect(rows[0].items[0].id).toBe(rated.id)
  })

  it('persistiert ausschließlich normalisierte Katalogfelder einschließlich Bewertung', () => {
    const stored = nativeTitleToFirestore({
      ...dune,
      rated: true,
      ratingValue: 8.5,
      ratedOrder: 4,
      apiReadAccessToken: 'secret',
      sessionId: 'secret',
    }, '2026-09-09T12:00:00Z')
    expect(stored).not.toHaveProperty('apiReadAccessToken')
    expect(stored).not.toHaveProperty('sessionId')
    expect(stored).not.toHaveProperty('password')
    expect(stored.favorite).toBe(true)
    expect(stored.watchlist).toBe(true)
    expect(stored.rated).toBe(true)
    expect(stored.ratingValue).toBe(8.5)
    expect(stored.ratingOrder).toBe(4)
  })
})
