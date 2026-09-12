import { describe, expect, it } from 'vitest'
import {
  CONTENT_SORT_MODES,
  DEFAULT_CONTENT_DISPLAY_SETTINGS,
  getContentPeriodKey,
  normalizeContentDisplaySettings,
  resolveContentSortMode,
  withContentAutoSwitch,
  withManualContentSortMode,
} from '../src/catalog/contentDisplaySettings.js'
import { curateTitles } from '../src/catalog/contentCuration.js'

function title(id, overrides = {}) {
  return {
    id: `tmdb-movie-${id}`,
    tmdbId: id,
    type: 'movie',
    title: `Titel ${id}`,
    popularity: id,
    voteAverage: 6 + (id / 10),
    voteCount: id * 20,
    year: 2000 + id,
    ...overrides,
  }
}

describe('profilbezogene Inhaltskuratierung', () => {
  it('normalisiert alte Profile auf eine ausgewogene, manuelle Standardkonfiguration', () => {
    expect(normalizeContentDisplaySettings()).toEqual(DEFAULT_CONTENT_DISPLAY_SETTINGS)
    expect(normalizeContentDisplaySettings({ sortMode: 'invalid', watchedMode: 'invalid' }))
      .toEqual(DEFAULT_CONTENT_DISPLAY_SETTINGS)
  })

  it('ermittelt stabile Tages- und Wochenperioden', () => {
    const date = new Date(2026, 8, 12, 15, 30)
    expect(getContentPeriodKey('daily', date)).toBe('2026-09-12')
    expect(getContentPeriodKey('weekly', date)).toMatch(/^2026-W\d{2}$/)
  })

  it('behält eine manuelle Wahl bis zum nächsten automatischen Wechsel bei', () => {
    const date = new Date(2026, 8, 12)
    const enabled = withContentAutoSwitch(DEFAULT_CONTENT_DISPLAY_SETTINGS, { enabled: true }, date)
    const manual = withManualContentSortMode(enabled, 'newest', date)
    expect(resolveContentSortMode(manual, 'profile-a', date)).toBe('newest')

    const tomorrow = new Date(2026, 8, 13)
    const tomorrowMode = resolveContentSortMode(manual, 'profile-a', tomorrow)
    expect(CONTENT_SORT_MODES.map((mode) => mode.id)).toContain(tomorrowMode)
    expect(tomorrowMode).not.toBe('newest')
  })

  it('sortiert streng nach Beliebtheit oder Aktualität und begrenzt erst danach', () => {
    const items = [title(1), title(3), title(2)]
    expect(curateTitles(items, { mode: 'popular', limit: 2 }).map((item) => item.tmdbId)).toEqual([3, 2])
    expect(curateTitles(items, { mode: 'newest', limit: 2 }).map((item) => item.tmdbId)).toEqual([3, 2])
  })

  it('stellt gesehene Titel zurück oder blendet sie in öffentlichen Reihen aus', () => {
    const items = [title(3), title(2), title(1)]
    const getTitleState = (item) => ({ watched: item.tmdbId === 3 })
    expect(curateTitles(items, { mode: 'popular', watchedMode: 'demote', getTitleState })
      .map((item) => item.tmdbId)).toEqual([2, 1, 3])
    expect(curateTitles(items, { mode: 'popular', watchedMode: 'hide', getTitleState })
      .map((item) => item.tmdbId)).toEqual([2, 1])
  })

  it('liefert bei gleichem Seed reproduzierbare Abwechslung', () => {
    const items = Array.from({ length: 12 }, (_, index) => title(index + 1))
    const first = curateTitles(items, { mode: 'discover', seed: '2026-09-12' })
    const again = curateTitles(items, { mode: 'discover', seed: '2026-09-12' })
    const next = curateTitles(items, { mode: 'discover', seed: '2026-09-13' })
    expect(first.map((item) => item.id)).toEqual(again.map((item) => item.id))
    expect(first.map((item) => item.id)).not.toEqual(next.map((item) => item.id))
  })
})
