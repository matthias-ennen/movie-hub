import { describe, expect, it } from 'vitest'
import {
  TV_GENRE_CATEGORIES,
  buildTvPeriodOptions,
  buildWaipuTvHeroItems,
  buildWaipuTvViewModel,
  isTvAiringSoon,
  tvDayKey,
  tvDayRange,
} from '../src/waipu/waipuTvCatalog.js'

const NOW = Date.parse('2026-09-21T10:00:00.000Z') // 12:00 Uhr in Berlin

function airing({
  tmdbId,
  type = 'movie',
  startTime,
  durationMinutes = 120,
  stationId = 'zdf',
  programId = `program-${tmdbId}-${startTime}`,
  seasonNumber = null,
  episodeNumber = null,
} = {}) {
  return {
    id: `${stationId}|${programId}|${startTime}`,
    source: 'waipu',
    programId,
    stationId,
    stationName: stationId.toUpperCase(),
    tmdbId,
    type,
    title: `Titel ${tmdbId}`,
    seasonNumber,
    episodeNumber,
    startTime,
    stopTime: new Date(Date.parse(startTime) + durationMinutes * 60_000).toISOString(),
  }
}

function title(tmdbId, type = 'movie', {
  popularity = 10,
  genres = [{ id: 28 }],
  backdrop = true,
} = {}) {
  return {
    id: `${type}-${tmdbId}`,
    tmdbId,
    type,
    title: `Titel ${tmdbId}`,
    popularity,
    genres,
    metadataComplete: true,
    backdropUrl: backdrop ? `https://image.test/${tmdbId}.jpg` : null,
    posterUrl: `https://image.test/${tmdbId}-poster.jpg`,
    providerIds: ['waipu'],
  }
}

describe('TV-Tag und Zeitraumwahl', () => {
  it('ordnet 00:05 Uhr dem TV-Tag des Vorabends zu', () => {
    expect(tvDayKey('2026-09-22T22:05:00.000Z')).toBe('2026-09-22')
    const range = tvDayRange('2026-09-22')
    expect(new Date(range.start).toISOString()).toBe('2026-09-22T04:00:00.000Z')
    expect(new Date(range.endExclusive).toISOString()).toBe('2026-09-23T04:00:00.000Z')
  })

  it('bildet 23- und 25-stündige TV-Tage an den Zeitumstellungen korrekt ab', () => {
    const spring = tvDayRange('2026-03-28')
    const autumn = tvDayRange('2026-10-24')
    expect(spring.endExclusive - spring.start).toBe(23 * 60 * 60 * 1_000)
    expect(autumn.endExclusive - autumn.start).toBe(25 * 60 * 60 * 1_000)
  })

  it('liefert 14 Tage, Heute, Morgen und danach konkrete Datumswerte', () => {
    const options = buildTvPeriodOptions([
      airing({ tmdbId: 1, startTime: '2026-09-21T18:15:00.000Z' }),
      airing({ tmdbId: 2, startTime: '2026-09-22T18:15:00.000Z' }),
      airing({ tmdbId: 3, startTime: '2026-09-23T18:15:00.000Z' }),
    ], { now: NOW })
    expect(options.map(({ label }) => label)).toEqual(['14 Tage', 'Heute', 'Morgen', '23.09.26'])
  })
})

describe('TV-Videothek-Ansichtsmodell', () => {
  const airings = [
    airing({ tmdbId: 1, startTime: '2026-09-21T09:00:00.000Z', durationMinutes: 180 }), // ON AIR
    airing({ tmdbId: 2, startTime: '2026-09-21T18:15:00.000Z' }), // Prime Time
    airing({ tmdbId: 3, type: 'series', startTime: '2026-09-21T19:00:00.000Z', seasonNumber: 2, episodeNumber: 4 }),
    airing({ tmdbId: 3, type: 'series', startTime: '2026-09-21T20:00:00.000Z', seasonNumber: 2, episodeNumber: 5 }),
    airing({ tmdbId: 4, startTime: '2026-09-21T22:05:00.000Z' }), // 00:05 Uhr, Nachtprogramm
    airing({ tmdbId: 2, startTime: '2026-09-22T18:15:00.000Z', stationId: 'rtl' }), // Wiederholung
    airing({ tmdbId: 5, startTime: '2026-09-23T18:15:00.000Z' }),
  ]
  const titles = [
    title(1, 'movie', { popularity: 1 }),
    title(2, 'movie', { popularity: 90 }),
    title(3, 'series', { popularity: 60, genres: [{ id: 10759 }] }),
    title(4, 'movie', { popularity: 30, genres: [{ id: 35 }] }),
    title(5, 'movie', { popularity: 120, genres: [{ id: 99 }] }),
  ]

  it('bildet den Hero vor dem Laden der Senderdateien aus dem kompakten Titelbestand', () => {
    const titleEntries = [
      {
        ...titles[0],
        key: 'movie:1',
        airings: [airings[0]],
        nextAiring: airings[0],
      },
      {
        ...titles[1],
        key: 'movie:2',
        airings: [airings[1]],
        nextAiring: airings[1],
      },
    ]

    const allStations = buildWaipuTvHeroItems({
      titles,
      titleEntries,
      stationOrder: ['zdf'],
      now: NOW,
    })
    const onlyRtl = buildWaipuTvHeroItems({
      titles,
      titleEntries: [{
        ...titleEntries[1],
        airings: [{ ...airings[1], stationId: 'rtl', stationName: 'RTL' }],
      }],
      stationOrder: ['rtl'],
      now: NOW,
    })

    expect(allStations.map((item) => item.tmdbId)).toEqual([1, 2])
    expect(onlyRtl.map((item) => item.tmdbId)).toEqual([2])
  })

  it('startet standardmäßig mit Heute und baut den vereinbarten Tages-Reihensatz', () => {
    const model = buildWaipuTvViewModel({ airings, titles, now: NOW })
    expect(model.selectedPeriod).toMatchObject({ id: 'day:2026-09-21', label: 'Heute' })
    expect(model.rows.slice(0, 4).map(({ title }) => title)).toEqual([
      'Filme heute im Fernsehen',
      'Serien heute im Fernsehen',
      'Zur Prime Time',
      'TV Top 10',
    ])
    expect(model.rows.find((row) => row.title === 'Nachtprogramm').items.map((item) => item.tmdbId)).toEqual([4])
    expect(model.rows.find((row) => row.title === 'Serien heute im Fernsehen').items).toHaveLength(2)
  })

  it('verwendet in beiden Ansichten exakt dieselben zentralen Kategorien', () => {
    const today = buildWaipuTvViewModel({ airings, titles, now: NOW })
    const all = buildWaipuTvViewModel({ airings, titles, selectedPeriodId: '14-days', now: NOW })
    const categoryTitles = TV_GENRE_CATEGORIES.map(({ title: categoryTitle }) => categoryTitle)
    expect(today.rows.filter((row) => categoryTitles.includes(row.title)).map((row) => row.title))
      .toEqual(['Action & Abenteuer', 'Komödie'])
    expect(all.rows.filter((row) => categoryTitles.includes(row.title)).map((row) => row.title))
      .toEqual(['Action & Abenteuer', 'Komödie', 'Dokumentation'])
  })

  it('fasst Titel über 14 Tage zusammen und zeigt die nächste Ausstrahlung', () => {
    const model = buildWaipuTvViewModel({ airings, titles, selectedPeriodId: '14-days', now: NOW })
    const movies = model.rows.find((row) => row.id === 'tv-14-days-movies').items
    expect(movies.filter((item) => item.tmdbId === 2)).toHaveLength(1)
    expect(movies.find((item) => item.tmdbId === 2).tvAiring.startTime).toBe('2026-09-21T18:15:00.000Z')
  })

  it('ordnet die Top 10 ausschließlich nach TMDB-Beliebtheit und nach der dritten sichtbaren Reihe ein', () => {
    const model = buildWaipuTvViewModel({ airings, titles, selectedPeriodId: '14-days', now: NOW })
    const topTenIndex = model.rows.findIndex((row) => row.id === 'top-ten-tv')
    expect(topTenIndex).toBe(3)
    expect(model.rows[topTenIndex].variant).toBe('top-ten')
    expect(model.rows[topTenIndex].items.map((item) => item.tmdbId)).toEqual([5, 2, 3, 4, 1])
  })

  it('hält den Hero beim Umschalten des Posterreihen-Zeitraums vollständig stabil', () => {
    const today = buildWaipuTvViewModel({ airings, titles, now: NOW })
    const future = buildWaipuTvViewModel({ airings, titles, selectedPeriodId: 'day:2026-09-23', now: NOW })
    expect(future.heroItems.map((item) => item.id)).toEqual(today.heroItems.map((item) => item.id))
    expect(today.heroItems[0].tmdbId).toBe(1) // ON AIR vor höherer Beliebtheit
    expect(today.heroItems[1].tmdbId).toBe(2)
  })

  it('markiert Sendungen erst innerhalb des Zwei-Stunden-Fensters als BALD', () => {
    const next = airing({ tmdbId: 9, startTime: '2026-09-21T11:30:00.000Z' })
    expect(isTvAiringSoon(next, NOW)).toBe(true)
    expect(isTvAiringSoon(next, Date.parse('2026-09-21T08:00:00.000Z'))).toBe(false)
  })
})
