import { describe, expect, it } from 'vitest'
import { fetchWatchOffers, readPublishedTvEntries, runTitleAlertCheck } from '../scripts/check-title-alerts.mjs'

function inMemoryFirestore(initial) {
  const data = new Map(Object.entries(initial))
  const ref = (path) => ({
    path, id: path.split('/').at(-1),
    get parent() { return collection(path.split('/').slice(0, -1).join('/')) },
    collection(name) { return collection(`${path}/${name}`) },
  })
  const snapshot = (path) => ({
    ref: ref(path), id: path.split('/').at(-1), exists: data.has(path),
    data: () => data.get(path),
  })
  const collection = (path) => ({
    path,
    get parent() { return ref(path.split('/').slice(0, -1).join('/')) },
    doc(id) { return ref(`${path}/${id}`) },
    async get() {
      const docs = [...data.keys()].filter((key) => key.startsWith(`${path}/`)
        && key.slice(path.length + 1).indexOf('/') === -1).map(snapshot)
      return { docs, size: docs.length }
    },
  })
  return {
    data,
    collection,
    doc: ref,
    async runTransaction(fn) {
      return fn({
        get: async (reference) => snapshot(reference.path),
        set: (reference, value) => data.set(reference.path, value),
        create: (reference, value) => {
          if (data.has(reference.path)) throw new Error('duplicate notification')
          data.set(reference.path, value)
        },
      })
    },
  }
}

describe('trusted title alert data sources', () => {
  it('checks a watched title directly and retains its TMDB offer types', async () => {
    let requested = ''
    const fetchImpl = async (url) => {
      requested = url
      return { ok: true, json: async () => ({
        results: { DE: {
          flatrate: [{ provider_id: 8, provider_name: 'Netflix' }],
          rent: [{ provider_id: 8, provider_name: 'Netflix' }],
        } },
      }) }
    }
    const offers = await fetchWatchOffers({ type: 'movie', tmdbId: 12 }, 'test-token', fetchImpl)
    expect(requested).toContain('/movie/12/watch/providers')
    expect(offers).toEqual([expect.objectContaining({ id: 'netflix', offerTypes: ['flatrate', 'rent'] })])
  })

  it('rejects stale TV generations instead of emitting inaccurate reminders', async () => {
    const now = Date.parse('2026-09-25T08:00:00Z')
    const read = async (file) => file.endsWith('index.json')
      ? JSON.stringify({ kind: 'waipu-live-index', status: 'complete', generatedAt: '2026-09-20T08:00:00Z' })
      : JSON.stringify({ kind: 'waipu-live-titles', entries: [] })
    await expect(readPublishedTvEntries({ read, now })).rejects.toThrow(/recent/)
  })

  it('creates one event for the initial offer and one only after disappearance and return', async () => {
    const userPath = 'users/alice'
    const watchPath = `${userPath}/profiles/main/titleAlerts/movie-12-included`
    const db = inMemoryFirestore({
      [userPath]: { providerSettings: { enabledProviderIds: ['netflix'], version: 2 } },
      [`${userPath}/profiles/main`]: { displayName: 'Hauptprofil' },
      [watchPath]: { schemaVersion: 1, type: 'movie', tmdbId: 12, kind: 'included', title: 'Testfilm', activationId: 'session-1' },
    })
    let included = true
    const fetchImpl = async () => ({ ok: true, json: async () => ({
      results: { DE: included ? { flatrate: [{ provider_name: 'Netflix', provider_id: 8 }] } : {} },
    }) })
    const options = { db, token: 'test-token', fetchImpl, tvTitles: new Map(), now: Date.parse('2026-09-25T08:00:00Z') }
    expect((await runTitleAlertCheck(options)).includedCreated).toBe(1)
    expect((await runTitleAlertCheck(options)).includedCreated).toBe(0)
    included = false
    expect((await runTitleAlertCheck(options)).includedCreated).toBe(0)
    included = true
    expect((await runTitleAlertCheck(options)).includedCreated).toBe(1)
    expect([...db.data.keys()].filter((key) => key.includes('/notifications/'))).toHaveLength(2)
  })
  it('merges recent Waipu and Joyn TV title publications', async () => {
    const files = new Map([
      ['public/waipu-live/index.json', JSON.stringify({ kind: 'waipu-live-index', status: 'complete', generatedAt: '2026-09-26T12:00:00.000Z' })],
      ['public/waipu-live/titles.json', JSON.stringify({ kind: 'waipu-live-titles', entries: [{ tmdbId: 11, type: 'movie', airings: [{ stationId: 'pro7', source: 'waipu', startTime: '2026-09-27T18:15:00.000Z', stopTime: '2026-09-27T20:15:00.000Z' }] }] })],
      ['public/joyn-live/index.json', JSON.stringify({ kind: 'joyn-live-index', status: 'complete', generatedAt: '2026-09-26T12:00:00.000Z' })],
      ['public/joyn-live/titles.json', JSON.stringify({ kind: 'joyn-live-titles', entries: [{ tmdbId: 11, type: 'movie', airings: [{ stationId: 'prosieben-de', providerIds: ['joyn'], startTime: '2026-09-28T18:15:00.000Z', stopTime: '2026-09-28T20:15:00.000Z' }] }] })],
    ])
    const read = async (path) => files.get(path)
    const entries = await readPublishedTvEntries({ read, now: Date.parse('2026-09-26T13:00:00.000Z') })
    expect(entries.get('movie-11').airings).toHaveLength(2)
  })

})
