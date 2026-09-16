import { describe, expect, it } from 'vitest'
import {
  formatTmdbSyncSummary,
  mergeTmdbSyncDocuments,
  normalizeTmdbSyncSections,
} from '../src/tmdb/tmdbSyncMerge.js'

const successSections = [
  ['favorite_movies', 2],
  ['favorite_tv', 1],
  ['watchlist_movies', 3],
  ['watchlist_tv', 2],
  ['rated_movies', 1],
  ['rated_tv', 1],
].map(([id, count]) => ({ id, ok: true, count, retried: false }))

function failSection(id, error = 'HTTP 500 · TMDB-Status 11') {
  return successSections.map((section) => (
    section.id === id ? { id, ok: false, preserved: true, error } : section
  ))
}

describe('fehlertoleranter TMDB-Teil-Sync', () => {
  it('behandelt alte APK-Payloads ohne Bereichsbericht weiterhin als vollständigen Sync', () => {
    const sections = normalizeTmdbSyncSections(undefined)
    expect(sections).toHaveLength(6)
    expect(sections.every((section) => section.ok)).toBe(true)
    expect(sections.every((section) => section.reported === false)).toBe(true)
  })

  it('ersetzt bei 6/6 Erfolg alle Memberships mit dem neuen TMDB-Stand', () => {
    const current = [
      { id: 'movie:1', mediaType: 'movie', title: 'Alt', favorite: true, watchlist: true, rated: false },
      { id: 'tv:2', mediaType: 'tv', title: 'Serie alt', favorite: false, watchlist: false, rated: true, ratingValue: 7 },
    ]
    const incoming = [
      { id: 'movie:1', mediaType: 'movie', title: 'Neu', favorite: true, favoriteOrder: 1, watchlist: false, rated: false },
      { id: 'movie:3', mediaType: 'movie', title: 'Neu 3', favorite: false, watchlist: true, watchlistOrder: 1, rated: false },
    ]

    const result = mergeTmdbSyncDocuments(current, incoming, successSections)

    expect(result.partial).toBe(false)
    expect(result.documents.map((item) => item.id).sort()).toEqual(['movie:1', 'movie:3'])
    expect(result.documents.find((item) => item.id === 'movie:1')).toMatchObject({
      title: 'Neu',
      favorite: true,
      watchlist: false,
      rated: false,
    })
    expect(result.counts).toEqual({ favorite: 1, watchlist: 1, rated: 0, total: 2 })
  })

  it('bewahrt einen endgültig fehlgeschlagenen Bereich vollständig und aktualisiert die anderen fünf', () => {
    const current = [
      {
        id: 'tv:10', mediaType: 'tv', title: 'Bewertete Serie',
        favorite: false, watchlist: true, watchlistOrder: 4,
        rated: true, ratingValue: 8.5, ratingOrder: 2,
      },
      { id: 'movie:20', mediaType: 'movie', title: 'Alter Favorit', favorite: true, favoriteOrder: 5, watchlist: false, rated: false },
    ]
    const incoming = [
      {
        id: 'tv:10', mediaType: 'tv', title: 'Bewertete Serie',
        favorite: false, watchlist: false, rated: false,
      },
      { id: 'movie:30', mediaType: 'movie', title: 'Neuer Favorit', favorite: true, favoriteOrder: 1, watchlist: false, rated: false },
    ]

    const result = mergeTmdbSyncDocuments(current, incoming, failSection('rated_tv'))
    const series = result.documents.find((item) => item.id === 'tv:10')

    expect(result.partial).toBe(true)
    expect(result.successfulSections).toBe(5)
    expect(series.watchlist).toBe(false)
    expect(series.rated).toBe(true)
    expect(series.ratingValue).toBe(8.5)
    expect(series.ratingOrder).toBe(2)
    expect(result.documents.some((item) => item.id === 'movie:20')).toBe(false)
    expect(result.documents.some((item) => item.id === 'movie:30')).toBe(true)
  })

  it('ignoriert einen möglichen Teilstand eines fehlgeschlagenen Bereichs und behält den alten Membership-Stand', () => {
    const current = [
      { id: 'tv:10', mediaType: 'tv', title: 'Serie A', favorite: true, favoriteOrder: 1, watchlist: false, rated: false },
      { id: 'tv:11', mediaType: 'tv', title: 'Serie B', favorite: true, favoriteOrder: 2, watchlist: false, rated: false },
    ]
    // Simuliert einen versehentlich gelieferten Teilstand von Seite 1. Weil
    // favorite_tv als fehlgeschlagen markiert ist, darf er nicht übernehmen.
    const incoming = [
      { id: 'tv:10', mediaType: 'tv', title: 'Serie A', favorite: true, favoriteOrder: 1, watchlist: false, rated: false },
    ]

    const result = mergeTmdbSyncDocuments(current, incoming, failSection('favorite_tv'))

    expect(result.documents.filter((item) => item.favorite).map((item) => item.id).sort())
      .toEqual(['tv:10', 'tv:11'])
  })

  it('kann mehrere fehlgeschlagene Bereiche konservieren, während erfolgreiche Bereiche weiterlaufen', () => {
    const sections = successSections.map((section) => (
      ['favorite_tv', 'rated_movies'].includes(section.id)
        ? { id: section.id, ok: false, error: 'temporär nicht verfügbar' }
        : section
    ))
    const current = [
      { id: 'tv:1', mediaType: 'tv', title: 'TV Favorit', favorite: true, favoriteOrder: 1, watchlist: false, rated: false },
      { id: 'movie:2', mediaType: 'movie', title: 'Film Rating', favorite: false, watchlist: false, rated: true, ratingValue: 9, ratingOrder: 1 },
      { id: 'movie:3', mediaType: 'movie', title: 'Alte Watchlist', favorite: false, watchlist: true, watchlistOrder: 1, rated: false },
    ]
    const incoming = [
      { id: 'movie:4', mediaType: 'movie', title: 'Neue Watchlist', favorite: false, watchlist: true, watchlistOrder: 1, rated: false },
    ]

    const result = mergeTmdbSyncDocuments(current, incoming, sections)

    expect(result.successfulSections).toBe(4)
    expect(result.documents.some((item) => item.id === 'tv:1' && item.favorite)).toBe(true)
    expect(result.documents.some((item) => item.id === 'movie:2' && item.rated)).toBe(true)
    expect(result.documents.some((item) => item.id === 'movie:3')).toBe(false)
    expect(result.documents.some((item) => item.id === 'movie:4' && item.watchlist)).toBe(true)
  })

  it('erstellt eine verständliche Abschlussmeldung pro Bereich', () => {
    const sections = failSection('rated_tv').map((section) => (
      section.id === 'watchlist_movies' ? { ...section, retried: true } : section
    ))
    const summary = formatTmdbSyncSummary(sections)

    expect(summary).toContain('5 von 6 Bereichen aktualisiert')
    expect(summary).toContain('✓ Watchlist Filme: 3 (nach Wiederholung)')
    expect(summary).toContain('⚠ Bewertungen Serien: nicht aktualisiert – bisheriger Stand beibehalten')
  })
})
