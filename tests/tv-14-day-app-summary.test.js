import { describe, expect, it } from 'vitest'
import {
  buildTv14DayRows,
  normalizeTv14DaySummary,
  TV_14_DAY_ROW_LIMIT,
} from '../src/tv/tv14DaySummary.js'

describe('TV 14-day app summary', () => {
  it('rejects malformed payloads and accepts the published contract', () => {
    expect(normalizeTv14DaySummary({})).toBeNull()
    expect(normalizeTv14DaySummary({
      schemaVersion: 1,
      kind: 'moviehub-tv-14-day-summary',
      entries: [{ tmdbId: 11, type: 'movie', title: 'Film' }],
    })?.count).toBe(1)
  })

  it('uses only active provider stations and chooses prime-time independently', () => {
    const rows = buildTv14DayRows({
      entries: [{
        key: 'movie:11',
        tmdbId: 11,
        type: 'movie',
        title: 'Film',
        voteAverage: 8,
        voteCount: 500,
        genreIds: [28],
        airingCount: 3,
        airingOptions: [
          { providerId: 'waipu', stationId: 'disabled', stationName: 'Disabled', startTime: '2026-10-01T17:00:00Z', stopTime: '2026-10-01T19:00:00Z' },
          { providerId: 'joyn', stationId: 'tele5-de', stationName: 'TELE 5', startTime: '2026-10-01T18:00:00Z', stopTime: '2026-10-01T20:00:00Z' },
        ],
        primeTimeOptions: [
          { providerId: 'waipu', stationId: 'tele5', stationName: 'TELE 5', startTime: '2026-10-01T18:15:00Z', stopTime: '2026-10-01T20:15:00Z' },
        ],
      }],
      activeWaipuStationIds: ['tele5'],
      activeJoynStationIds: ['tele5-de'],
      now: Date.parse('2026-10-01T10:00:00Z'),
    })

    const movie = rows.find((row) => row.id === 'tv-14-days-movies').items[0]
    const prime = rows.find((row) => row.id === 'tv-14-days-prime-time').items[0]
    expect(movie.providerIds).toContain('joyn')
    expect(movie.providerIds).not.toContain('waipu')
    expect(prime.providerIds).toContain('waipu')
    expect(prime.tvAiring.stationId).toBe('tele5')
  })

  it('keeps each 14-day TV row bounded', () => {
    const entries = Array.from({ length: 100 }, (_, index) => ({
      key: `movie:${index + 1}`,
      tmdbId: index + 1,
      type: 'movie',
      title: `Movie ${index + 1}`,
      voteAverage: 8,
      voteCount: 100 + index,
      genreIds: [28],
      airingOptions: [{
        providerId: 'waipu',
        stationId: 'tele5',
        startTime: '2026-10-01T18:00:00Z',
        stopTime: '2026-10-01T20:00:00Z',
      }],
      primeTimeOptions: [],
    }))
    const rows = buildTv14DayRows({
      entries,
      activeWaipuStationIds: ['tele5'],
      now: Date.parse('2026-10-01T10:00:00Z'),
    })
    expect(rows.find((row) => row.id === 'tv-14-days-movies').items).toHaveLength(TV_14_DAY_ROW_LIMIT)
  })
  it('keeps both live badges when a merged airing is enabled for Waipu and Joyn', () => {
    const rows = buildTv14DayRows({
      entries: [{
        key: 'movie:11',
        tmdbId: 11,
        type: 'movie',
        title: 'Film',
        voteAverage: 8,
        voteCount: 500,
        genreIds: [28],
        airingCount: 1,
        airingOptions: [{
          providerIds: ['joyn', 'waipu'],
          providerStationIds: { joyn: 'tele5-de', waipu: 'tele5' },
          stationId: 'tele5',
          sourceStationId: 'tele5-de',
          stationName: 'TELE 5',
          startTime: '2026-10-01T18:00:00Z',
          stopTime: '2026-10-01T20:00:00Z',
          playbackRoutes: [
            { providerId: 'waipu', target: 'waipu://11' },
            { providerId: 'joyn', target: 'https://joyn.de/11' },
          ],
        }],
        primeTimeOptions: [],
      }],
      activeWaipuStationIds: ['tele5'],
      activeJoynStationIds: ['tele5-de'],
      now: Date.parse('2026-10-01T10:00:00Z'),
    })

    const movie = rows.find((row) => row.id === 'tv-14-days-movies').items[0]
    expect(movie.providerIds).toEqual(expect.arrayContaining(['joyn', 'waipu']))
    expect(movie.tvAiring.providerIds).toEqual(['joyn', 'waipu'])
    expect(movie.waipuLive).toBeTruthy()
    expect(movie.joynLive).toBeTruthy()
  })

})
