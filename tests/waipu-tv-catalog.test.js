import { describe, expect, it, vi } from 'vitest'
import {
  WAIPU_LIVE_INDEX_URL,
  WAIPU_LIVE_STATIONS_URL,
  buildWaipuTvRows,
  formatTvAiringCard,
  isTvAiringOnAir,
  loadWaipuLiveStationCatalog,
  loadWaipuTvAirings,
  normalizeWaipuDayShard,
  normalizeWaipuLiveStationCatalog,
  normalizeWaipuStationShard,
  nextTvAiringTransition,
} from '../src/waipu/waipuTvCatalog.js'

const index = {
  schemaVersion: 1,
  kind: 'waipu-live-index',
  status: 'complete',
  generatedAt: '2026-09-19T08:00:00.000Z',
  horizon: { start: '2026-09-19T00:00:00.000Z', endExclusive: '2026-10-03T00:00:00.000Z' },
}

const stations = {
  schemaVersion: 1,
  kind: 'waipu-live-stations',
  stations: [
    { id: 'zdf', name: 'ZDF' },
    { id: 'rtl', name: 'RTL' },
  ],
}

function shard(stationId, title, startTime, tmdbId) {
  return {
    schemaVersion: 1,
    kind: 'waipu-live-station',
    station: { id: stationId, name: stationId.toUpperCase() },
    airings: [{
      id: `${stationId}-airing`,
      programId: `${stationId}-program`,
      tmdbId,
      type: 'movie',
      title,
      startTime,
      stopTime: new Date(Date.parse(startTime) + 7_200_000).toISOString(),
    }],
  }
}

describe('Waipu TV catalog', () => {
  it('normalizes the published index and complete station directory', () => {
    expect(normalizeWaipuLiveStationCatalog(index, stations)).toMatchObject({
      status: 'ready',
      generatedAt: index.generatedAt,
      stations: [{ id: 'zdf', name: 'ZDF' }, { id: 'rtl', name: 'RTL' }],
    })
  })

  it('fails softly when the station catalog is not published yet', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }))
    await expect(loadWaipuLiveStationCatalog({ fetchImpl })).resolves.toEqual({
      status: 'unavailable',
      stations: [],
    })
    expect(fetchImpl).toHaveBeenCalledWith(WAIPU_LIVE_INDEX_URL, { cache: 'no-store' })
    expect(fetchImpl).toHaveBeenCalledWith(WAIPU_LIVE_STATIONS_URL, { cache: 'no-store' })
  })

  it('filters expired and structurally invalid shard entries', () => {
    const raw = shard('zdf', 'Film A', '2026-09-20T18:15:00.000Z', 11)
    raw.airings.push({ ...raw.airings[0], id: 'expired', startTime: '2026-09-18T18:00:00.000Z', stopTime: '2026-09-18T20:00:00.000Z' })
    expect(normalizeWaipuStationShard(raw, { id: 'zdf', name: 'ZDF' }, {
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })).toHaveLength(1)
    expect(normalizeWaipuStationShard(raw, { id: 'zdf', name: 'ZDF' }, {
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })[0]).toMatchObject({ source: 'waipu', programId: 'zdf-program' })
    expect(normalizeWaipuStationShard(raw, { id: 'rtl', name: 'RTL' })).toEqual([])
  })

  it('loads only the supplied active station shards', async () => {
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      json: async () => url.includes('zdf')
        ? shard('zdf', 'Film A', '2026-09-20T18:15:00.000Z', 11)
        : shard('rtl', 'Film B', '2026-09-20T19:15:00.000Z', 22),
    }))
    const result = await loadWaipuTvAirings([{ id: 'zdf', name: 'ZDF' }], {
      fetchImpl,
      now: () => Date.parse('2026-09-19T12:00:00.000Z'),
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][0]).toBe('/waipu-live/stations/zdf.json')
    expect(result.map(({ stationId }) => stationId)).toEqual(['zdf'])
  })

  it('loads one selected TV day and filters it to active stations', async () => {
    const day = {
      schemaVersion: 1,
      kind: 'waipu-live-day',
      key: '2026-09-20',
      airings: [
        { ...shard('zdf', 'Film A', '2026-09-20T18:15:00.000Z', 11).airings[0], stationId: 'zdf' },
        { ...shard('rtl', 'Film B', '2026-09-20T19:15:00.000Z', 22).airings[0], stationId: 'rtl' },
      ],
    }
    expect(normalizeWaipuDayShard(day, day.key, stations.stations, {
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })).toHaveLength(2)
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => day }))
    const result = await loadWaipuTvAirings([{ id: 'zdf', name: 'ZDF' }], {
      fetchImpl,
      now: () => Date.parse('2026-09-19T12:00:00.000Z'),
      periodId: 'day:2026-09-20',
      availableDays: [{ key: '2026-09-20', count: 2 }],
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][0]).toBe('/waipu-live/days/2026-09-20.json')
    expect(result.map(({ stationId }) => stationId)).toEqual(['zdf'])
  })

  it('loads every published day only when the 14-day period is selected', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const key = url.includes('2026-09-20') ? '2026-09-20' : '2026-09-21'
      return {
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          kind: 'waipu-live-day',
          key,
          airings: [{ ...shard('zdf', key, `${key}T18:15:00.000Z`, 11).airings[0], stationId: 'zdf' }],
        }),
      }
    })
    const result = await loadWaipuTvAirings([{ id: 'zdf', name: 'ZDF' }], {
      fetchImpl,
      now: () => Date.parse('2026-09-19T12:00:00.000Z'),
      periodId: '14-days',
      availableDays: ['2026-09-20', '2026-09-21'],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(2)
  })

  it('groups all active stations by German calendar day and sorts by start time', () => {
    const airings = [
      ...normalizeWaipuStationShard(
        shard('rtl', 'Film B', '2026-09-20T19:15:00.000Z', 22),
        { id: 'rtl', name: 'RTL' },
        { now: Date.parse('2026-09-19T12:00:00.000Z') },
      ),
      ...normalizeWaipuStationShard(
        shard('zdf', 'Film A', '2026-09-20T18:15:00.000Z', 11),
        { id: 'zdf', name: 'ZDF' },
        { now: Date.parse('2026-09-19T12:00:00.000Z') },
      ),
    ]
    const rows = buildWaipuTvRows({
      airings,
      titles: [{ id: 'movie-11', tmdbId: 11, type: 'movie', title: 'Film A', providerIds: [] }],
      titleEntries: [{
        key: 'movie:22',
        tmdbId: 22,
        type: 'movie',
        title: 'Film B',
        posterUrl: 'https://image.test/b.jpg',
        description: 'Vollständige TMDB-Beschreibung',
        ageRating: 16,
        metadataVersion: 2,
        metadataComplete: true,
        collectionChecked: true,
      }],
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toContain('Morgen')
    expect(rows[0].items.map(({ title }) => title)).toEqual(['Film A', 'Film B'])
    expect(rows[0].items[1]).toMatchObject({
      posterUrl: 'https://image.test/b.jpg',
      description: 'Vollständige TMDB-Beschreibung',
      ageRating: 16,
      metadataComplete: true,
      providerIds: ['waipu'],
      tvAiringOnAir: false,
    })
    expect(rows[0].items[1].waipuLive.airings).toHaveLength(1)
    expect(rows[0].items[1].waipuLive.airings[0].programId).toBe('rtl-program')
  })

  it('marks only a currently running broadcast as on air', () => {
    const airing = {
      startTime: '2026-09-20T18:15:00.000Z',
      stopTime: '2026-09-20T20:15:00.000Z',
    }
    expect(isTvAiringOnAir(airing, Date.parse('2026-09-20T18:14:59.000Z'))).toBe(false)
    expect(isTvAiringOnAir(airing, Date.parse('2026-09-20T18:15:00.000Z'))).toBe(true)
    expect(isTvAiringOnAir(airing, Date.parse('2026-09-20T20:14:59.000Z'))).toBe(true)
    expect(isTvAiringOnAir(airing, Date.parse('2026-09-20T20:15:00.000Z'))).toBe(false)
  })

  it('schedules the next UI update at either a broadcast start or stop', () => {
    const airings = [
      { startTime: '2026-09-20T18:15:00.000Z', stopTime: '2026-09-20T20:15:00.000Z' },
      { startTime: '2026-09-20T19:00:00.000Z', stopTime: '2026-09-20T21:00:00.000Z' },
    ]
    expect(nextTvAiringTransition(airings, Date.parse('2026-09-20T18:00:00.000Z')))
      .toBe(Date.parse('2026-09-20T18:15:00.000Z'))
    expect(nextTvAiringTransition(airings, Date.parse('2026-09-20T18:30:00.000Z')))
      .toBe(Date.parse('2026-09-20T19:00:00.000Z'))
    expect(nextTvAiringTransition(airings, Date.parse('2026-09-20T21:00:00.000Z'))).toBeNull()
  })

  it('formats the time and station for a TV poster card', () => {
    expect(formatTvAiringCard({
      startTime: '2026-09-20T18:15:00.000Z',
      stationName: 'ZDF',
    })).toEqual({ time: '20:15', stationName: 'ZDF' })
  })
})
