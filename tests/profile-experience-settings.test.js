import { afterEach, describe, expect, it } from 'vitest'
import { buildCategoryRows } from '../src/catalog/categoryRows.js'
import { selectCoordinatedHeroItems } from '../src/catalog/heroSelection.js'
import { buildPersonalRows } from '../src/library/personalRows.js'
import { limitPosterRowItems } from '../src/performance/posterRows.js'
import {
  DEFAULT_PROFILE_EXPERIENCE_SETTINGS,
  normalizeProfileExperienceSettings,
  updateProfileExperienceSetting,
} from '../src/profiles/profileExperienceSettings.js'
import {
  getActiveHeroCount,
  getActivePosterRowLimit,
  isExperienceModuleVisible,
  setActiveProfileExperienceRuntime,
} from '../src/profiles/profileExperienceRuntime.js'

afterEach(() => {
  setActiveProfileExperienceRuntime(DEFAULT_PROFILE_EXPERIENCE_SETTINGS)
})

function title(index, type = 'movie') {
  return {
    id: `${type}-${index}`,
    tmdbId: index,
    type,
    title: `Titel ${index}`,
    providerIds: ['netflix'],
    genres: [{ id: type === 'movie' ? 28 : 10759 }],
  }
}

describe('profilbezogene Oberflächeneinstellungen', () => {
  it('liefert für bestehende Profile die heutigen Defaults', () => {
    const settings = normalizeProfileExperienceSettings()
    expect(settings.posterRowLimit).toBe(50)
    expect(settings.heroCount).toBe(5)
    expect(settings.visibility.home.hero).toBe(true)
    expect(settings.visibility.movies.top10).toBe(true)
    expect(settings.visibility.myContent.history).toBe(true)
  })

  it('akzeptiert nur definierte Poster- und Hero-Werte', () => {
    expect(normalizeProfileExperienceSettings({ posterRowLimit: 70, heroCount: 7 })).toMatchObject({
      posterRowLimit: 70,
      heroCount: 7,
    })
    expect(normalizeProfileExperienceSettings({ posterRowLimit: 55, heroCount: 9 })).toMatchObject({
      posterRowLimit: 50,
      heroCount: 5,
    })
  })

  it('ändert verschachtelte Sichtbarkeit ohne andere Defaults zu verlieren', () => {
    const next = updateProfileExperienceSetting(undefined, 'visibility.home.providerRows', false)
    expect(next.visibility.home.providerRows).toBe(false)
    expect(next.visibility.home.hero).toBe(true)
    expect(next.visibility.series.providerRows).toBe(true)
  })

  it('wendet Posterlimit und Hero-Anzahl zur Laufzeit an', () => {
    setActiveProfileExperienceRuntime({ posterRowLimit: 30, heroCount: 3 })
    expect(getActivePosterRowLimit()).toBe(30)
    expect(getActiveHeroCount()).toBe(3)

    const items = Array.from({ length: 80 }, (_, index) => title(index + 1))
    expect(limitPosterRowItems(items)).toHaveLength(30)
    expect(selectCoordinatedHeroItems(items).home).toHaveLength(3)
  })

  it('begrenzt persönliche und Kategorie-Reihen bereits beim Erzeugen', () => {
    setActiveProfileExperienceRuntime({ posterRowLimit: 30 })
    const items = Array.from({ length: 80 }, (_, index) => title(index + 1))
    const state = () => ({ watchlist: true, favorite: true, rating: 8 })
    expect(buildPersonalRows(items, state).every((row) => row.items.length === 30)).toBe(true)

    const categoryRows = buildCategoryRows({
      titles: items,
      mediaType: 'movie',
      enabledCategoryIds: ['action'],
      enabledProviderIds: ['netflix'],
    })
    expect(categoryRows[0].items).toHaveLength(30)
  })

  it('hält Sichtbarkeit profilbezogen im Runtime-Modell', () => {
    setActiveProfileExperienceRuntime({
      visibility: { home: { hero: false }, myContent: { history: false } },
    })
    expect(isExperienceModuleVisible('home', 'hero')).toBe(false)
    expect(isExperienceModuleVisible('home', 'top10')).toBe(true)
    expect(isExperienceModuleVisible('myContent', 'history')).toBe(false)
  })
})
