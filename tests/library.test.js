import { describe, expect, it } from 'vitest'
import {
  applyTitleStatePatch,
  createTitleSnapshot,
  getTitleStateKey,
  hasPersonalTitleState,
  normalizeTitleState,
} from '../src/library/libraryState.js'
import { buildPersonalRows, mergeCatalogWithPersonalSnapshots } from '../src/library/personalRows.js'

describe('persönlicher Film-/Serienzustand', () => {
  it('verwendet TMDB-Typ und TMDB-ID als stabile Referenz', () => {
    expect(getTitleStateKey({ type: 'movie', tmdbId: 11, id: 'irgendwas' })).toBe('movie-11')
    expect(getTitleStateKey({ type: 'series', tmdbId: 1399, id: 'irgendwas' })).toBe('tv-1399')
  })

  it('setzt beim Markieren als gesehen automatisch das lokale Datum', () => {
    const next = applyTitleStatePatch({}, { watched: true }, new Date(2026, 8, 6, 12, 0, 0))
    expect(next.watched).toBe(true)
    expect(next.watchedAt).toBe('2026-09-06')
  })

  it('entfernt das Gesehen-Datum beim Zurücksetzen auf ungesehen', () => {
    const next = applyTitleStatePatch({ watched: true, watchedAt: '2026-09-01' }, { watched: false })
    expect(next.watched).toBe(false)
    expect(next.watchedAt).toBeNull()
  })

  it('akzeptiert nur Bewertungen von 1 bis 10 und begrenzt Notizen', () => {
    expect(normalizeTitleState({ rating: 7 }).rating).toBe(7)
    expect(normalizeTitleState({ rating: 11 }).rating).toBeNull()
    expect(normalizeTitleState({ note: 'x'.repeat(600) }).note).toHaveLength(500)
  })

  it('erkennt nur tatsächlich persönliche Zustände als Meine-Inhalte-relevant', () => {
    expect(hasPersonalTitleState({})).toBe(false)
    expect(hasPersonalTitleState({ favorite: true })).toBe(true)
    expect(hasPersonalTitleState({ rating: 8 })).toBe(true)
    expect(hasPersonalTitleState({ note: 'Merken' })).toBe(true)
  })

  it('keeps a public title snapshot with a personal state for later catalog refreshes', () => {
    const snapshot = createTitleSnapshot({
      id: 'tmdb-movie-11',
      tmdbId: 11,
      type: 'movie',
      source: 'tmdb',
      title: 'Krieg der Sterne',
      description: 'Eine weit, weit entfernte Galaxis.',
      providerIds: ['prime'],
    })

    const merged = mergeCatalogWithPersonalSnapshots([], {
      'movie-11': { favorite: true, titleSnapshot: snapshot },
    })

    expect(merged).toMatchObject([{ tmdbId: 11, title: 'Krieg der Sterne', providerIds: ['prime'] }])
  })

  it('erzeugt genau die drei persönlichen Reihen und sortiert sie fest', () => {
    const titles = [
      { id: 'b', title: 'Beta' },
      { id: 'a', title: 'Alpha' },
      { id: 'c', title: 'Charlie' },
    ]
    const states = {
      a: { watchlist: true, favorite: true, watched: true, watchedAt: '2026-09-01', rating: 8 },
      b: { watchlist: true, favorite: false, watched: true, watchedAt: '2026-09-05', rating: 10 },
      c: { watchlist: false, favorite: true, watched: false, watchedAt: null, rating: null },
    }

    const rows = buildPersonalRows(titles, (item) => states[item.id] ?? {})

    expect(rows.map((row) => row.id)).toEqual([
      'my-watchlist',
      'my-favorites',
      'my-ratings',
    ])
    expect(rows.map((row) => row.title)).toEqual([
      'Meine Watchlist',
      'Meine Favoriten',
      'Meine Bewertungen',
    ])
    expect(rows[0].items.map((item) => item.title)).toEqual(['Alpha', 'Beta'])
    expect(rows[1].items.map((item) => item.title)).toEqual(['Alpha', 'Charlie'])
    expect(rows[2].items.map((item) => item.title)).toEqual(['Beta', 'Alpha'])
  })

  it('liefert bei einem leeren Profil keine toten persönlichen Reihen', () => {
    const rows = buildPersonalRows([{ id: 'a', title: 'Alpha' }], () => ({}))
    expect(rows).toEqual([])
  })
})
