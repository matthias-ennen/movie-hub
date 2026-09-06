import { describe, expect, it } from 'vitest'
import {
  applyTitleStatePatch,
  getTitleStateKey,
  hasPersonalTitleState,
  normalizeTitleState,
} from '../src/library/libraryState.js'

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
})
