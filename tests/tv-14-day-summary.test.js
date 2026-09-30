import { describe, expect, it } from 'vitest'
import { buildTv14DaySummary } from '../scripts/tv-14-day-summary.mjs'

describe('TV 14-day summary', () => {
  it('deduplicates titles across Waipu and Joyn and keeps compact provider airings', () => {
    const summary = buildTv14DaySummary({
      generatedAt: '2026-09-30T06:00:00.000Z',
      catalog: {
        titles: [{
          tmdbId: 11,
          type: 'movie',
          title: 'Film A',
          voteAverage: 8.1,
          voteCount: 1000,
          popularity: 22,
          genres: [{ id: 28, name: 'Action' }],
        }],
      },
      waipuTitles: {
        entries: [{
          tmdbId: 11,
          type: 'movie',
          airings: [
            {
              stationId: 'tele5',
              stationName: 'TELE 5',
              programId: 'w1',
              startTime: '2026-10-01T18:15:00.000Z',
              stopTime: '2026-10-01T20:00:00.000Z',
            },
            {
              stationId: 'rtl2',
              stationName: 'RTLZWEI',
              programId: 'w2',
              startTime: '2026-10-03T18:15:00.000Z',
              stopTime: '2026-10-03T20:00:00.000Z',
            },
          ],
        }],
      },
      joynTitles: {
        entries: [{
          tmdbId: 11,
          type: 'movie',
          airings: [{
            stationId: 'tele5-de',
            canonicalStationId: 'tele5',
            sourceStationId: 'tele5-de',
            stationName: 'TELE 5',
            programId: 'j1',
            startTime: '2026-10-01T18:15:30.000Z',
            stopTime: '2026-10-01T20:00:00.000Z',
            playbackRoutes: [{ providerId: 'joyn', target: 'https://example.invalid' }],
          }],
        }],
      },
    })

    expect(summary.count).toBe(1)
    expect(summary.entries[0]).toMatchObject({
      key: 'movie:11',
      title: 'Film A',
      voteAverage: 8.1,
      voteCount: 1000,
      popularity: 22,
      providerIds: ['joyn', 'waipu'],
      airingCount: 2,
    })
    expect(summary.entries[0].nextAiring.providerIds).toEqual(['joyn', 'waipu'])
    expect(summary.entries[0].airingOptions).toHaveLength(2)
    expect(summary.entries[0].airingOptions[0].stationId).toBe('tele5')
    expect(summary.entries[0].airingOptions[0].providerIds).toEqual(['joyn', 'waipu'])
    expect(summary.entries[0].airingOptions[0].providerStationIds).toEqual({
      waipu: 'tele5',
      joyn: 'tele5-de',
    })
  })

  it('marks a title when any airing starts during prime time', () => {
    const summary = buildTv14DaySummary({
      joynTitles: {
        entries: [{
          tmdbId: 22,
          type: 'series',
          airings: [{
            stationId: 'pro7',
            startTime: '2026-10-01T18:15:00.000Z',
            stopTime: '2026-10-01T19:15:00.000Z',
          }],
        }],
      },
    })
    expect(summary.entries[0].hasPrimeTime).toBe(true)
    expect(summary.entries[0].nextPrimeTimeAiring).toBeTruthy()
  })
})

describe('TV 14-day summary candidate pool', () => {
  it('caps each semantic row bucket while preserving multiple categories in one compact union', () => {
    const movies = Array.from({ length: 150 }, (_, index) => ({
      tmdbId: index + 1,
      type: 'movie',
      title: `Movie ${index + 1}`,
      voteAverage: 9 - (index / 100),
      voteCount: 1000 - index,
      popularity: 500 - index,
      genres: [{ id: 28 }],
    }))
    const waipuEntries = movies.map((movie) => ({
      tmdbId: movie.tmdbId,
      type: movie.type,
      airings: [{
        stationId: 'tele5',
        startTime: '2026-10-01T18:15:00.000Z',
        stopTime: '2026-10-01T20:00:00.000Z',
      }],
    }))
    const summary = buildTv14DaySummary({
      catalog: { titles: movies },
      waipuTitles: { entries: waipuEntries },
    })

    expect(summary.sourceCount).toBe(150)
    expect(summary.count).toBeLessThanOrEqual(150)
    expect(summary.candidateLimitPerRow).toBe(120)
    expect(summary.entries.filter((entry) => entry.type === 'movie').length).toBeLessThanOrEqual(120)
  })
})
