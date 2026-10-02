import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_EXPERIENCE_SETTINGS,
} from '../src/profiles/profileExperienceSettings.js'
import {
  setActiveProfileExperienceRuntime,
} from '../src/profiles/profileExperienceRuntime.js'
import {
  assembleTopTenPageRows,
  visiblePageRows,
} from '../src/catalog/pageRowContract.js'

function row(id, overrides = {}) {
  return {
    id,
    title: id,
    items: [{ id: `${id}-1`, tmdbId: 1, type: 'movie', title: id }],
    ...overrides,
  }
}

afterEach(() => {
  setActiveProfileExperienceRuntime(DEFAULT_PROFILE_EXPERIENCE_SETTINGS)
})

describe('page row contract', () => {
  it('setzt Top 10 nach der dritten tatsächlich sichtbaren Reihe ein', () => {
    setActiveProfileExperienceRuntime({
      visibility: {
        home: {
          providerRows: false,
          personalRows: true,
          top10: true,
        },
      },
    })

    const result = assembleTopTenPageRows({
      page: 'home',
      rows: [
        row('provider-netflix-home', { providerId: 'netflix' }),
        row('trending'),
        row('my-watchlist'),
        row('new-movies'),
        row('new-series'),
      ],
      topTen: {
        id: 'top-ten-home',
        title: 'Top 10',
        items: [{ id: 'top-1', tmdbId: 99, type: 'movie', title: 'Top' }],
      },
    })

    expect(result.map((entry) => entry.id))
      .toEqual(['trending', 'my-watchlist', 'new-movies', 'top-ten-home', 'new-series'])
  })

  it('entfernt leere und profilseitig ausgeblendete Reihen vor der Seitenmontage', () => {
    setActiveProfileExperienceRuntime({
      visibility: {
        movies: {
          providerRows: false,
          top10: true,
        },
      },
    })

    const result = visiblePageRows([
      row('category-action'),
      { id: 'empty', items: [] },
      row('provider-prime-movie', { providerId: 'prime' }),
    ], 'movies')

    expect(result.map((entry) => entry.id)).toEqual(['category-action'])
  })

  it('entfernt auch eine deaktivierte Top-10-Reihe nach zentraler Montage', () => {
    setActiveProfileExperienceRuntime({
      visibility: {
        series: {
          top10: false,
        },
      },
    })

    const result = assembleTopTenPageRows({
      page: 'series',
      rows: [row('series-drama'), row('series-comedy')],
      topTen: {
        id: 'top-ten-series',
        title: 'Top 10',
        items: [{ id: 'top-1', tmdbId: 99, type: 'series', title: 'Top' }],
      },
    })

    expect(result.map((entry) => entry.id)).toEqual(['series-drama', 'series-comedy'])
  })
})
