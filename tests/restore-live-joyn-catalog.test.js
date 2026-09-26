import { describe, expect, it } from 'vitest'
import { restoreLiveJoynCatalog } from '../scripts/restore-live-joyn-catalog.mjs'

function response(value) {
  const body = Buffer.from(JSON.stringify(value))
  return {
    ok: true,
    status: 200,
    headers: { get: () => String(body.byteLength) },
    arrayBuffer: async () => body,
  }
}

describe('Joyn live restore', () => {
  it('restores only a complete validated Joyn publication', async () => {
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
    const day = {
      schemaVersion: 1,
      kind: 'joyn-live-day',
      key: '2026-09-26',
      airings: [],
    }

    const fetchImpl = async (url) => {
      if (url.endsWith('/index.json')) return response(index)
      if (url.endsWith('/stations.json')) return response(stations)
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
})
