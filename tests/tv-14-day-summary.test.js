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
          airings: [{
            stationId: 'tele5',
            stationName: 'TELE 5',
            programId: 'w1',
            startTime: '2026-10-01T18:15:00.000Z',
            stopTime: '2026-10-01T20:00:00.000Z',
          }],
        }],
      },
      joynTitles: {
        entries: [{
          tmdbId: 11,
          type: 'movie',
          airings: [{
            stationId: 'tele5-de',
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
    expect(summary.entries[0].nextAiring.providerId).toBe('waipu')
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
