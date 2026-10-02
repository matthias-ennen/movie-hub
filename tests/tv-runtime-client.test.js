import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTvRuntimeSchedule,
  clearTvRuntimeCache,
  getTvRuntimeCacheDiagnostics,
  loadTvRuntimeDay,
  loadTvRuntimeIndex,
  normalizeTvRuntimeDay,
  normalizeTvRuntimeIndex,
  TV_RUNTIME_DAY_CACHE_LIMIT,
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

function emptyDayPayload(key) {
  return {
    schemaVersion: 1,
    kind: 'moviehub-tv-runtime-day',
    generatedAt: '2026-10-01T09:00:00.000Z',
    key,
    entries: [],
  }
}

afterEach(() => {
  clearTvRuntimeCache()
  vi.unstubAllGlobals()
})

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

  it('forwards AbortSignal and stops an obsolete day request', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    }))

    const request = loadTvRuntimeDay('2026-10-01', {
      fetchImpl,
      generation: 'generation-a',
      signal: controller.signal,
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal)

    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps only the three most recently used day shards in the runtime cache', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const key = String(url).match(/days\/(\d{4}-\d{2}-\d{2})\.json/)?.[1]
      return { ok: true, json: async () => emptyDayPayload(key) }
    })
    vi.stubGlobal('fetch', fetchImpl)

    for (const key of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      await loadTvRuntimeDay(key, { generation: 'generation-a' })
    }

    // Cache hit also refreshes the LRU position.
    await loadTvRuntimeDay('2026-10-01', { generation: 'generation-a' })
    await loadTvRuntimeDay('2026-10-04', { generation: 'generation-a' })

    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(getTvRuntimeCacheDiagnostics()).toMatchObject({
      dayCacheLimit: TV_RUNTIME_DAY_CACHE_LIMIT,
      dayCacheKeys: [
        'generation-a:2026-10-03',
        'generation-a:2026-10-01',
        'generation-a:2026-10-04',
      ],
    })

    // 02 was the least recently used day and must be fetched again.
    await loadTvRuntimeDay('2026-10-02', { generation: 'generation-a' })
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    expect(getTvRuntimeCacheDiagnostics().dayCacheKeys).toHaveLength(TV_RUNTIME_DAY_CACHE_LIMIT)
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
