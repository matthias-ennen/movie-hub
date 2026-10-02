import { describe, expect, it, vi } from 'vitest'
import {
  buildTv14DayRows,
  loadTv14DaySummary,
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

  it('forwards AbortSignal and stops an obsolete 14-day request', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    }))

    const request = loadTv14DaySummary({
      fetchImpl,
      signal: controller.signal,
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal)

    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
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

  it('removes disabled provider identities from a merged 14-day airing', () => {
    const rows = buildTv14DayRows({
      entries: [{
        key: 'movie:80810',
        tmdbId: 80810,
        type: 'movie',
        title: 'Aaron und der Wolf',
        genreIds: [],
        airingOptions: [{
          providerIds: ['joyn', 'waipu'],
          providerStationIds: { joyn: 'top-filme-hd', waipu: 'topfilme' },
          providerProgramIds: { joyn: 'joyn-aaron-program', waipu: 'waipu-aaron-program' },
          stationId: 'topfilme',
          programId: 'joyn-aaron-program',
          startTime: '2026-10-01T16:37:00Z',
          stopTime: '2026-10-01T18:15:00Z',
          playbackRoutes: [
            { providerId: 'waipu', mode: 'APP_DEEP_LINK', target: 'https://app.waipu.tv/epgdetails/topfilme/waipu-aaron-program' },
            { providerId: 'joyn', mode: 'WEB_LINK', target: 'https://www.joyn.de/play/live-tv?channel_id=top-filme-hd' },
          ],
        }],
        primeTimeOptions: [],
      }],
      activeWaipuStationIds: ['topfilme'],
      activeJoynStationIds: [],
      now: Date.parse('2026-10-01T10:00:00Z'),
    })

    const movie = rows.find((row) => row.id === 'tv-14-days-movies').items[0]
    expect(movie.tvAiring.providerIds).toEqual(['waipu'])
    expect(movie.tvAiring.providerStationIds).toEqual({ waipu: 'topfilme' })
    expect(movie.tvAiring.providerProgramIds).toEqual({ waipu: 'waipu-aaron-program' })
    expect(movie.tvAiring.playbackRoutes.map(({ providerId }) => providerId)).toEqual(['waipu'])
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
          providerProgramIds: { joyn: 'j1', waipu: 'w1' },
          stationId: 'tele5',
          programId: 'j1',
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
    expect(movie.tvAiring.providerProgramIds).toEqual({ joyn: 'j1', waipu: 'w1' })
    expect(movie.waipuLive).toBeTruthy()
    expect(movie.joynLive).toBeTruthy()
  })

})
