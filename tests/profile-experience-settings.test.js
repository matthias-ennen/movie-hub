import { afterEach, describe, expect, it } from 'vitest'
import { buildCategoryRows } from '../src/catalog/categoryRows.js'
import { selectCoordinatedHeroItems } from '../src/catalog/heroSelection.js'
import { buildPersonalSmartRows } from '../src/catalog/personalSmartRows.js'
import { buildPersonalRows } from '../src/library/personalRows.js'
import { limitPosterRowItems } from '../src/performance/posterRows.js'
import {
  DEFAULT_PROFILE_EXPERIENCE_SETTINGS,
  normalizeProfileExperienceSettings,
  updateProfileExperienceSetting,
} from '../src/profiles/profileExperienceSettings.js'
import {
  filterRowsByExperienceVisibility,
  getActiveHeroCount,
  getActiveHeroTrailerSettings,
  getActivePosterRowLimit,
  isExperienceModuleVisible,
  setActiveProfileExperienceRuntime,
} from '../src/profiles/profileExperienceRuntime.js'
import { buildTmdbCatalogRows } from '../src/tmdb/tmdbCatalogModel.js'

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
    facets: { castPersonIds: [123] },
    tmdbWatchlist: true,
    tmdbFavorite: true,
    tmdbRated: true,
    tmdbRating: 8,
  }
}

describe('profilbezogene Oberflächeneinstellungen', () => {
  it('liefert für bestehende Profile die heutigen Defaults', () => {
    const settings = normalizeProfileExperienceSettings()
    expect(settings.posterRowLimit).toBe(50)
    expect(settings.heroCount).toBe(5)
    expect(settings.heroTrailers).toEqual({ enabled: false, delaySeconds: 15, soundEnabled: true })
    expect(settings.visibility.home.hero).toBe(true)
    expect(settings.visibility.movies.top10).toBe(true)
    expect(settings.visibility.myContent.history).toBe(true)
  })

  it('akzeptiert nur definierte Poster-, Hero- und Trailer-Werte', () => {
    expect(normalizeProfileExperienceSettings({
      posterRowLimit: 70,
      heroCount: 7,
      heroTrailers: { enabled: true, delaySeconds: 20, soundEnabled: false },
    })).toMatchObject({
      posterRowLimit: 70,
      heroCount: 7,
      heroTrailers: { enabled: true, delaySeconds: 20, soundEnabled: false },
    })
    expect(normalizeProfileExperienceSettings({
      posterRowLimit: 55,
      heroCount: 9,
      heroTrailers: { enabled: 'yes', delaySeconds: 12, soundEnabled: 'no' },
    })).toMatchObject({
      posterRowLimit: 50,
      heroCount: 5,
      heroTrailers: { enabled: false, delaySeconds: 15, soundEnabled: true },
    })
  })

  it('ändert verschachtelte Einstellungen ohne andere Defaults zu verlieren', () => {
    const visibility = updateProfileExperienceSetting(undefined, 'visibility.home.providerRows', false)
    expect(visibility.visibility.home.providerRows).toBe(false)
    expect(visibility.visibility.home.hero).toBe(true)
    expect(visibility.visibility.series.providerRows).toBe(true)

    const trailers = updateProfileExperienceSetting(undefined, 'heroTrailers.soundEnabled', false)
    expect(trailers.heroTrailers.soundEnabled).toBe(false)
    expect(trailers.heroTrailers.enabled).toBe(false)
    expect(trailers.heroTrailers.delaySeconds).toBe(15)
  })

  it('wendet Posterlimit, Hero-Anzahl und Trailerwerte zur Laufzeit an', () => {
    setActiveProfileExperienceRuntime({
      posterRowLimit: 30,
      heroCount: 3,
      heroTrailers: { enabled: true, delaySeconds: 10, soundEnabled: false },
    })
    expect(getActivePosterRowLimit()).toBe(30)
    expect(getActiveHeroCount()).toBe(3)
    expect(getActiveHeroTrailerSettings()).toEqual({ enabled: true, delaySeconds: 10, soundEnabled: false })

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

  it('unterstützt 70 Titel auch für Smart- und TMDB-Reihen', () => {
    setActiveProfileExperienceRuntime({ posterRowLimit: 70 })
    const items = Array.from({ length: 80 }, (_, index) => title(index + 1))
    const smartRows = buildPersonalSmartRows(items, {
      rows: [{ id: 'cast-123', type: 'cast', valueId: 123, valueLabel: 'Test', enabled: true }],
    })
    expect(smartRows[0].items).toHaveLength(70)
    expect(buildTmdbCatalogRows(items).every((row) => row.items.length === 70)).toBe(true)
  })

  it('filtert ausgeblendete Module ohne Daten zu verändern', () => {
    setActiveProfileExperienceRuntime({
      visibility: {
        home: { top10: false, providerRows: false, personalRows: true },
        myContent: { top10: true, personalRows: false, history: true },
      },
    })
    const homeRows = [
      { id: 'top-ten-home', variant: 'top-ten' },
      { id: 'provider-netflix-home', providerId: 'netflix' },
      { id: 'my-watchlist' },
      { id: 'trending' },
    ]
    expect(filterRowsByExperienceVisibility(homeRows, 'home').map((row) => row.id))
      .toEqual(['my-watchlist', 'trending'])

    const personalRows = [
      { id: 'top-ten-personal', variant: 'top-ten' },
      { id: 'my-watchlist' },
      { id: 'my-watched-history' },
    ]
    expect(filterRowsByExperienceVisibility(personalRows, 'myContent').map((row) => row.id))
      .toEqual(['top-ten-personal', 'my-watched-history'])
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
