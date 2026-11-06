import { describe, expect, it } from 'vitest'
import { buildTvRuntimeSnapshot } from '../src/tv/tvRuntimePublication.js'
import { tvRuntimeTitleShardKey, TV_RUNTIME_TITLE_SHARD_COUNT } from '../src/tv/tvRuntimeTitleIndex.js'
import { filterTvRuntimeTitleAirings, loadTvRuntimeTitleAirings } from '../src/tv/tvRuntimeClient.js'
import { listDetailTvAirings, resolveDetailTvAiring } from '../src/tv/detailTvAiring.js'
import { DEFAULT_AIRINGS_PER_PROVIDER } from '../src/sources/liveAvailabilityIndex.js'

const now = Date.parse('2026-11-06T10:00:00.000Z')
const series = { type: 'series', tmdbId: 4242, title: 'King of Queens Test' }
const t = (day, hour, minute = '00') => `2026-11-${day}T${hour}:${minute}:00.000Z`
const airing = (episode, day, hour, stationId = 'rtl', seasonNumber = 1) => ({
  stationId, canonicalStationId: stationId, stationName: stationId.toUpperCase(),
  programId: `w-${day}-${hour}-${episode}`,
  startTime: t(day, hour), stopTime: t(day, String(Number(hour) + 1).padStart(2, '0')),
  episode: { seasonNumber, episodeNumber: episode, title: `Folge ${episode}` },
})
function publication() {
  const waipu = [9, 10, 11, 12].map((e, i) => airing(e, i < 3 ? '07' : '08', String(12 + i).padStart(2, '0')))
  const joyn = [
    { ...waipu[2], programId: 'j-11', sourceStationId: 'rtl-joyn' },
    airing(11, '09', '18', 'pro7'),
    airing(3, '10', '19', 'pro7', 2),
  ]
  return buildTvRuntimeSnapshot({
    now, catalog: { titles: [series] }, sourceCatalogs: [
      { providerId: 'waipu', entries: [{ ...series, airings: waipu }] },
      { providerId: 'joyn', entries: [{ ...series, airings: joyn }] },
    ],
  })
}
const fetchResponse = data => ({ ok: true, status: 200, json: async () => data })

describe('#708 full on-demand title TV dates', () => {
  it('publishes all 14-day title airings without widening the two-airing startup index', () => {
    const pub = publication()
    expect(DEFAULT_AIRINGS_PER_PROVIDER).toBe(2)
    expect(pub.titleShards).toHaveLength(TV_RUNTIME_TITLE_SHARD_COUNT)
    const shard = pub.titleShards[series.tmdbId % TV_RUNTIME_TITLE_SHARD_COUNT]
    expect(shard.shard).toBe(tvRuntimeTitleShardKey(series))
    expect(shard.entries).toHaveLength(1)
    expect(shard.entries[0].airings).toHaveLength(6)
    const merged = shard.entries[0].airings.find(a => a.episode?.episodeNumber === 11 && a.stationId === 'rtl')
    expect(merged.providerIds).toEqual(['joyn', 'waipu'])
    expect(merged.playbackRoutes.map(r => r.providerId).sort()).toEqual(['joyn', 'waipu'])
    expect(pub.index.titleShardCount).toBe(64)
    expect(pub.index.titleShardTitleCount).toBe(1)
  })

  it('loads only one title shard with episode 11+ and no day-shard scan', async () => {
    const pub = publication()
    const requests = []
    const fetchImpl = async url => {
      requests.push(url)
      if (url === '/tv-runtime/index.json') return fetchResponse(pub.index)
      if (url.startsWith('/tv-runtime/titles/')) return fetchResponse(pub.titleShards[series.tmdbId % 64])
      throw new Error('Unexpected request: ' + url)
    }
    const airings = await loadTvRuntimeTitleAirings(series, { fetchImpl })
    expect(requests).toHaveLength(2)
    expect(requests.every(url => !url.includes('/days/'))).toBe(true)
    expect(airings).toHaveLength(6)
    const eleven = listDetailTvAirings({ ...series, liveAvailability: {} }, {
      now, selection: { seasonNumber: 1, episodeNumber: 11, title: 'Folge 11' },
      fullAirings: airings,
    })
    expect(eleven).toHaveLength(2)
    expect(eleven[0].startTime).toBe(t('07', '14'))
    expect(eleven[1].startTime).toBe(t('09', '18'))
    expect(resolveDetailTvAiring(series, {
      now, selection: { seasonNumber: 1, episodeNumber: 13 },
      fullAirings: airings,
    })).toBeNull()
    const seasonTwo = listDetailTvAirings(series, {
      now, selection: { seasonNumber: 2, episodeNumber: 3, title: 'Folge 3' },
      fullAirings: airings,
    })
    expect(seasonTwo).toHaveLength(1)
  })

  it('keeps an exact clicked TV episode and never revives a disabled provider', () => {
    const pub = publication()
    const whole = pub.titleShards[series.tmdbId % 64].entries[0].airings.map(a => ({
      ...a, type: 'series', tmdbId: series.tmdbId,
    }))
    const chosen = whole.find(a => a.stationId === 'pro7' && a.episode.episodeNumber === 11)
    const selected = { seasonNumber: 1, episodeNumber: 11, title: 'Folge 11' }
    const anchored = listDetailTvAirings({ ...series, detailAiring: chosen }, {
      now, selection: selected, fullAirings: whole,
    })
    expect(anchored[0].stationId).toBe('pro7')
    const onlyJoyn = filterTvRuntimeTitleAirings(whole, {
      enabledProviderIds: ['joyn'],
      disabledJoynStationIds: ['rtl-joyn'],
      now,
    })
    expect(onlyJoyn).toHaveLength(2)
    expect(onlyJoyn.every(a => a.providerIds.length === 1 && a.providerIds[0] === 'joyn')).toBe(true)
    const filtered = listDetailTvAirings({ ...series, detailAiring: chosen }, {
      now, selection: selected, fullAirings: onlyJoyn,
    })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].stationId).toBe('pro7')
    expect(listDetailTvAirings({ ...series, detailAiring: chosen }, {
      now, selection: selected, fullAirings: [],
    })).toEqual([])
  })

  it('never copies obsolete opening-card routes into an authoritative full shard', () => {
    const pub = publication()
    const full = pub.titleShards[series.tmdbId % 64].entries[0].airings.map(a => ({
      ...a, type: 'series', tmdbId: series.tmdbId,
    }))
    const current = full.find(a => a.stationId === 'rtl' && a.episode?.episodeNumber === 11)
    const stale = {
      ...current,
      playbackRoutes: [{
        providerId: 'waipu', mode: 'APP_DEEP_LINK',
        scope: 'program', target: 'https://example.invalid/obsolete-program',
      }],
    }
    const [selected] = listDetailTvAirings({ ...series, detailAiring: stale }, {
      now, selection: { seasonNumber: 1, episodeNumber: 11, title: 'Folge 11' },
      fullAirings: full,
    })
    expect(selected.stationId).toBe('rtl')
    expect(selected.playbackRoutes.map(r => r.target)).not.toContain('https://example.invalid/obsolete-program')
    expect(selected.playbackRoutes).toEqual(current.playbackRoutes)
  })

  it('rejects stale generations and performs one bounded index refresh', async () => {
    const pub = publication()
    const newer = '2026-11-07T12:00:00.000Z'
    const requests = []
    let indexReads = 0
    let shardReads = 0
    const fetchImpl = async url => {
      requests.push(url)
      if (url === '/tv-runtime/index.json') {
        indexReads += 1
        return fetchResponse({ ...pub.index, generatedAt: indexReads === 1 ? pub.index.generatedAt : newer })
      }
      if (url.startsWith('/tv-runtime/titles/')) {
        shardReads += 1
        return fetchResponse({ ...pub.titleShards[series.tmdbId % 64], generatedAt: newer })
      }
      throw new Error('Unexpected request: ' + url)
    }
    expect(await loadTvRuntimeTitleAirings(series, { fetchImpl })).toHaveLength(6)
    expect(indexReads).toBe(2)
    expect(shardReads).toBe(2)
    expect(requests.filter(url => url.includes('/days/'))).toHaveLength(0)
  })

  it('does not confuse movies and series sharing a numeric TMDB ID', () => {
    const pub = publication()
    const shard = pub.titleShards[series.tmdbId % 64]
    expect(shard.entries.find(e => e.type === 'movie' && e.tmdbId === series.tmdbId)).toBeUndefined()
    expect(tvRuntimeTitleShardKey({ type: 'movie', tmdbId: series.tmdbId }))
      .toBe(tvRuntimeTitleShardKey(series))
  })
})
