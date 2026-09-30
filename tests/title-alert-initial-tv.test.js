import { describe, expect, it } from 'vitest'
import { loadFreshTvAirings } from '../src/notifications/loadFreshTvAirings.js'
import { dueTvAiring, filterEnabledTvAirings, tvAiringId } from '../src/notifications/titleAlertModel.js'

const now = Date.parse('2026-09-25T10:00:00Z')
const evening = { stationId: 'zdf', stationName: 'ZDF', startTime: '2026-09-25T18:15:00Z', stopTime: '2026-09-25T20:00:00Z' }
const item = { type: 'movie', tmdbId: 321 }

function publishedTv(generatedAt, providerId = 'waipu', airing = evening) {
  const requests = []
  const fetchImpl = async (url) => {
    requests.push(url)
    return {
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        kind: 'moviehub-live-availability-index',
        generatedAt,
        entries: [
          {
            type: 'movie',
            tmdbId: 123,
            providers: [{ providerId, airings: [{ ...airing }] }],
          },
          {
            ...item,
            providers: [{ providerId, airings: [{ ...airing }] }],
          },
        ],
      }),
    }
  }
  return { fetchImpl, requests }
}

describe('immediate TV observation', () => {
  it('finds a same-evening airing in the generic live index', async () => {
    const { fetchImpl, requests } = publishedTv('2026-09-25T08:00:00Z')
    const airings = await loadFreshTvAirings(item, now, fetchImpl)
    expect(dueTvAiring(airings, [], now)).toMatchObject(evening)
    expect(airings[0].providerIds).toEqual(['waipu'])
    expect(tvAiringId({ ...item, kind: 'tv', activationId: 'session' }, evening))
      .toBe('movie-321-tv-session-airing-1790360100000')
    expect(requests).toEqual(['/live-availability-index.json'])
  })

  it('uses Joyn airings immediately and respects Joyn station settings', async () => {
    const joynAiring = {
      stationId: 'joyn.prosieben',
      sourceStationId: 'prosieben',
      stationName: 'ProSieben',
      startTime: '2026-09-25T18:15:00Z',
      stopTime: '2026-09-25T20:00:00Z',
    }
    const { fetchImpl } = publishedTv('2026-09-25T08:00:00Z', 'joyn', joynAiring)
    const airings = await loadFreshTvAirings(item, now, fetchImpl)
    expect(airings[0]).toMatchObject({ source: 'joyn', sourceStationId: 'prosieben', providerIds: ['joyn'] })
    expect(dueTvAiring(filterEnabledTvAirings(airings, {
      joynStationSettings: { disabledStationIds: ['prosieben'] },
    }), [], now)).toBeNull()
  })

  it('ignores stale generic live data', async () => {
    const stale = publishedTv('2026-09-20T08:00:00Z')
    expect(await loadFreshTvAirings(item, now, stale.fetchImpl)).toEqual([])
    expect(stale.requests).toEqual(['/live-availability-index.json'])
  })
})
