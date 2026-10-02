import { describe, expect, it } from 'vitest'
import { buildTv14DaySummary } from '../scripts/tv-14-day-summary.mjs'
import { buildTv14DayRows } from '../src/tv/tv14DaySummary.js'
import { isPrimeTimeStart } from '../src/tv/tvPrimeTime.js'
import { buildWaipuTvViewModel } from '../src/waipu/waipuTvCatalog.js'

describe('foundation product rules', () => {
  it('uses 20:15 Europe/Berlin as the exact prime-time lower boundary', () => {
    expect(isPrimeTimeStart('2026-10-01T18:14:00.000Z')).toBe(false)
    expect(isPrimeTimeStart('2026-10-01T18:15:00.000Z')).toBe(true)
    expect(isPrimeTimeStart('2026-10-01T20:59:00.000Z')).toBe(true)
    expect(isPrimeTimeStart('2026-10-01T21:00:00.000Z')).toBe(false)
  })

  it('applies the 20:15 boundary to daily TV poster rows', () => {
    const model = buildWaipuTvViewModel({
      airings: [
        {
          tmdbId: 1,
          type: 'movie',
          title: 'Zu früh',
          stationId: 'zdf',
          stationName: 'ZDF',
          startTime: '2026-10-01T18:14:00.000Z',
          stopTime: '2026-10-01T19:30:00.000Z',
          providerIds: ['waipu'],
        },
        {
          tmdbId: 2,
          type: 'movie',
          title: 'Prime Time',
          stationId: 'zdf',
          stationName: 'ZDF',
          startTime: '2026-10-01T18:15:00.000Z',
          stopTime: '2026-10-01T19:45:00.000Z',
          providerIds: ['waipu'],
        },
      ],
      titles: [
        { id: 'movie-1', tmdbId: 1, type: 'movie', title: 'Zu früh', metadataComplete: true },
        { id: 'movie-2', tmdbId: 2, type: 'movie', title: 'Prime Time', metadataComplete: true },
      ],
      stationOrder: ['zdf'],
      selectedPeriodId: 'day:2026-10-01',
      availableDays: [{ key: '2026-10-01', count: 2 }],
      now: Date.parse('2026-10-01T12:00:00.000Z'),
    })

    const primeRow = model.rows.find((row) => row.id === 'tv-2026-10-01-prime-time')
    expect(primeRow.items.map((item) => item.tmdbId)).toEqual([2])
  })

  it('applies the same boundary while generating the 14-day summary', () => {
    const summary = buildTv14DaySummary({
      waipuTitles: {
        entries: [
          {
            tmdbId: 1,
            type: 'movie',
            title: 'Zu früh',
            airings: [{
              stationId: 'zdf',
              startTime: '2026-10-01T18:14:00.000Z',
              stopTime: '2026-10-01T19:30:00.000Z',
            }],
          },
          {
            tmdbId: 2,
            type: 'movie',
            title: 'Prime Time',
            airings: [{
              stationId: 'zdf',
              startTime: '2026-10-01T18:15:00.000Z',
              stopTime: '2026-10-01T19:45:00.000Z',
            }],
          },
        ],
      },
    })

    expect(summary.entries.find((entry) => entry.tmdbId === 1)?.hasPrimeTime).toBe(false)
    expect(summary.entries.find((entry) => entry.tmdbId === 2)?.hasPrimeTime).toBe(true)
  })

  it('ranks the 14-day TV Top 10 by TMDB popularity, not rating or vote count', () => {
    const rows = buildTv14DayRows({
      entries: [
        {
          key: 'movie:1',
          tmdbId: 1,
          type: 'movie',
          title: 'Popular',
          popularity: 100,
          voteAverage: 5,
          voteCount: 10,
          airingOptions: [{
            providerId: 'waipu',
            stationId: 'zdf',
            startTime: '2026-10-02T18:15:00.000Z',
            stopTime: '2026-10-02T20:00:00.000Z',
          }],
          primeTimeOptions: [],
        },
        {
          key: 'movie:2',
          tmdbId: 2,
          type: 'movie',
          title: 'Highly rated',
          popularity: 10,
          voteAverage: 9.5,
          voteCount: 5000,
          airingOptions: [{
            providerId: 'waipu',
            stationId: 'zdf',
            startTime: '2026-10-02T18:16:00.000Z',
            stopTime: '2026-10-02T20:00:00.000Z',
          }],
          primeTimeOptions: [],
        },
      ],
      activeWaipuStationIds: ['zdf'],
      now: Date.parse('2026-10-01T10:00:00.000Z'),
    })

    const topTen = rows.find((row) => row.id === 'top-ten-tv')
    expect(topTen.items.map((item) => item.tmdbId)).toEqual([1, 2])
  })
})
