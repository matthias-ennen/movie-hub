import { describe, expect, it } from 'vitest'
import { restoreLiveJoynCatalog } from '../scripts/restore-live-joyn-catalog.mjs'

function response(value, declaredBytes = null) {
  const body = Buffer.from(JSON.stringify(value))
  return {
    ok: true,
    status: 200,
    headers: { get: () => String(declaredBytes ?? body.byteLength) },
    arrayBuffer: async () => body,
  }
}

describe('Joyn live restore', () => {
  it.each([null, 70 * 1024 * 1024])('restores a complete publication with title content length %s', async (titleBytes) => {
    const writes = new Map()
    const index = {
      schemaVersion: 1,
      kind: 'joyn-live-index',
      status: 'complete',
      generatedAt: '2026-09-26T15:00:00.000Z',
      stationCount: 1,
      airingCount: 1,
      days: [{ key: '2026-09-26', count: 1 }],
    }
    const stations = {
      schemaVersion: 1,
      kind: 'joyn-live-stations',
      stations: [{ id: 'prosieben-de', name: 'ProSieben' }],
    }
    const titles = {
      schemaVersion: 1,
      kind: 'joyn-live-titles',
      entries: [],
    }
    const day = {
      schemaVersion: 1,
      kind: 'joyn-live-day',
      key: '2026-09-26',
      airings: [],
    }

    const fetchImpl = async (url) => {
      if (url.endsWith('/index.json')) return response(index)
      if (url.endsWith('/stations.json')) return response(stations)
      if (url.endsWith('/titles.json')) return response(titles, titleBytes)
      if (url.endsWith('/days/2026-09-26.json')) return response(day)
      throw new Error('unexpected url')
    }

    const result = await restoreLiveJoynCatalog({
      baseUrl: 'https://example.test/joyn-live',
      outputPath: '/tmp/moviehub-joyn-restore-test',
      fetchImpl,
    })
    expect(result).toMatchObject({ status: 'complete', stationCount: 1 })
  })
  it('keeps the individual day shard limit at 64 MiB', async () => {
    const fetchImpl = async url => {
      if (url.endsWith('/index.json')) return response({ days: [{ key: '2026-10-07' }] })
      if (url.includes('/days/')) return response({}, 70 * 1024 * 1024)
      return response({})
    }
    await expect(restoreLiveJoynCatalog({ fetchImpl })).rejects.toThrow('67108864-byte size limit')
  })
  it('stops on decoded stream size even when the transfer length is smaller', async () => {
    const fetchImpl = async url => url.endsWith('/titles.json')
      ? new Response(' '.repeat(64) + '{}', { headers: { 'content-length': '2' } })
      : response({})
    await expect(restoreLiveJoynCatalog({ fetchImpl, limits: { titles: 32 } })).rejects.toThrow('32-byte size limit')
  })
})
