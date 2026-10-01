import { describe, expect, it, vi } from 'vitest'
import {
  buildTvRuntimeSchedule,
  loadTvRuntimeDay,
  loadTvRuntimeIndex,
  normalizeTvRuntimeDay,
  normalizeTvRuntimeIndex,
} from '../src/tv/tvRuntimeClient.js'

const indexPayload = {
  schemaVersion: 1,
  kind: 'moviehub-tv-runtime-index',
  generatedAt: '2026-10-01T09:00:00.000Z',
  providers: ['joyn', 'waipu'],
  days: [{ key: '2026-10-01', count: 1, airingCount: 1 }],
}

const dayPayload = {
  schemaVersion: 1,
  kind: 'moviehub-tv-runtime-day',
  generatedAt: '2026-10-01T09:00:00.000Z',
  key: '2026-10-01',
  entries: [{
    key: 'movie:16281',
    tmdbId: 16281,
    type: 'movie',
    title: 'Creepshow',
    year: 1982,
    ageRating: 16,
    posterUrl: 'https://image.test/creepshow.jpg',
    genreIds: [27],
    genreNames: ['Horror'],
    tmdbProviderIds: ['pluto'],
    airings: [{
      providerIds: ['joyn', 'waipu'],
      providerStationIds: {
        joyn: 'kabeleinsclassics-de-hd',
        waipu: 'kabeleinsclassics',
      },
      providerProgramIds: {
        joyn: 'j1',
        waipu: 'w1',
      },
      stationId: 'kabeleinsclassics',
      programId: 'j1',
      sourceStationId: 'kabeleinsclassics-de-hd',
      stationName: 'Kabel Eins CLASSICS',
      startTime: '2026-10-01T09:30:00.000Z',
      stopTime: '2026-10-01T11:25:00.000Z',
      playbackRoutes: [
        { providerId: 'waipu', mode: 'APP_DEEP_LINK', target: 'waipu://creepshow' },
        { providerId: 'joyn', mode: 'WEB_LINK', target: 'https://joyn.de/creepshow' },
      ],
    }],
  }],
}

describe('TV runtime client', () => {
  it('validates the published index and day contracts', () => {
    expect(normalizeTvRuntimeIndex(indexPayload)?.days[0].key).toBe('2026-10-01')
    expect(normalizeTvRuntimeDay(dayPayload, '2026-10-01')?.entries).toHaveLength(1)
    expect(normalizeTvRuntimeDay(dayPayload, '2026-10-02')).toBeNull()
  })

  it('loads only the compact index and requested day shard', async () => {
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      json: async () => String(url).includes('index.json') ? indexPayload : dayPayload,
    }))

    const index = await loadTvRuntimeIndex({ fetchImpl })
    const day = await loadTvRuntimeDay('2026-10-01', {
      fetchImpl,
      generation: index.generatedAt,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[0][0]).toBe('/tv-runtime/index.json')
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/tv-runtime/days/2026-10-01.json')
    expect(day.entries).toHaveLength(1)
  })

  it('keeps both providers when both source stations are active', () => {
    const schedule = buildTvRuntimeSchedule(normalizeTvRuntimeDay(dayPayload, '2026-10-01'), {
      activeWaipuStationIds: ['kabeleinsclassics'],
      activeJoynStationIds: ['kabeleinsclassics-de-hd'],
    })

    expect(schedule.titles).toHaveLength(1)
    expect(schedule.titles[0].tmdbProviderIds).toEqual(['pluto'])
    expect(schedule.airings).toHaveLength(1)
    expect(schedule.airings[0].providerIds).toEqual(['joyn', 'waipu'])
    expect(schedule.airings[0].playbackRoutes.map(({ providerId }) => providerId).sort())
      .toEqual(['joyn', 'waipu'])
    expect(schedule.airings[0].providerProgramIds).toEqual({
      joyn: 'j1',
      waipu: 'w1',
    })
  })

  it('removes only the disabled provider side from a merged airing', () => {
    const schedule = buildTvRuntimeSchedule(normalizeTvRuntimeDay(dayPayload, '2026-10-01'), {
      activeWaipuStationIds: [],
      activeJoynStationIds: ['kabeleinsclassics-de-hd'],
    })

    expect(schedule.airings).toHaveLength(1)
    expect(schedule.airings[0].providerIds).toEqual(['joyn'])
    expect(schedule.airings[0].providerStationIds).toEqual({ joyn: 'kabeleinsclassics-de-hd' })
    expect(schedule.airings[0].providerProgramIds).toEqual({ joyn: 'j1' })
    expect(schedule.airings[0].playbackRoutes.map(({ providerId }) => providerId)).toEqual(['joyn'])
  })
})
