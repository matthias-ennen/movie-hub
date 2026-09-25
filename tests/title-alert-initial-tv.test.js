import { describe, expect, it } from 'vitest'
import { loadFreshTvAirings } from '../src/notifications/loadFreshTvAirings.js'
import { dueTvAiring, tvAiringId } from '../src/notifications/titleAlertModel.js'

const now = Date.parse('2026-09-25T10:00:00Z')
const evening = { stationId: 'zdf', stationName: 'ZDF', startTime: '2026-09-25T18:15:00Z', stopTime: '2026-09-25T20:00:00Z' }
const item = { type: 'movie', tmdbId: 321 }

function publishedTv(generatedAt) {
  const requests = []
  const fetchImpl = async (url) => {
    requests.push(url)
    return { ok: true, json: async () => url.endsWith('/index.json')
      ? { schemaVersion: 1, kind: 'waipu-live-index', status: 'complete', generatedAt }
      : { schemaVersion: 1, kind: 'waipu-live-titles', entries: [
        { type: 'movie', tmdbId: 123, airings: [evening] },
        { ...item, airings: [evening] },
      ] } }
  }
  return { fetchImpl, requests }
}

describe('immediate TV observation', () => {
  it('finds a same-evening airing in fresh published title data', async () => {
    const { fetchImpl, requests } = publishedTv('2026-09-25T08:00:00Z')
    const airings = await loadFreshTvAirings(item, now, fetchImpl)
    expect(dueTvAiring(airings, [], now)).toEqual(evening)
    expect(tvAiringId({ ...item, kind: 'tv', activationId: 'session' }, evening))
      .toBe('movie-321-tv-session-airing-1790360100000')
    expect(requests).toEqual(['/waipu-live/index.json', '/waipu-live/titles.json'])
  })

  it('ignores stale data and disabled stations', async () => {
    const stale = publishedTv('2026-09-20T08:00:00Z')
    expect(await loadFreshTvAirings(item, now, stale.fetchImpl)).toEqual([])
    expect(stale.requests).toEqual(['/waipu-live/index.json'])
    const fresh = publishedTv('2026-09-25T08:00:00Z')
    expect(dueTvAiring(await loadFreshTvAirings(item, now, fresh.fetchImpl), ['zdf'], now)).toBeNull()
  })
})
