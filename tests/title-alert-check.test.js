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
        update: (reference, fields) => data.set(reference.path, { ...data.get(reference.path), ...fields }),
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

  it('sends exactly one included event per activation and completes the watch', async () => {
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
    expect((await runTitleAlertCheck(options))).toMatchObject({ observed: 1, includedCreated: 1, failed: 0 })
    expect(db.data.get(watchPath)).toMatchObject({ schemaVersion: 2, status: 'completed',
      completionNotificationId: 'movie-12-included-session-1-initial' })
    expect((await runTitleAlertCheck(options)).observed).toBe(0)
    included = false
    expect((await runTitleAlertCheck(options)).includedCreated).toBe(0)
    included = true
    expect((await runTitleAlertCheck(options)).includedCreated).toBe(0)
    expect([...db.data.keys()].filter((key) => key.includes('/notifications/'))).toHaveLength(1)

    // A new conscious activation uses a different event ID and is independent.
    db.data.set(watchPath, { ...db.data.get(watchPath), activationId: 'session-2', status: 'active' })
    expect((await runTitleAlertCheck(options)).includedCreated).toBe(1)
    expect(db.data.get(watchPath)).toMatchObject({ status: 'completed',
      completionNotificationId: 'movie-12-included-session-2-initial' })
    expect([...db.data.keys()].filter((key) => key.includes('/notifications/'))).toHaveLength(2)
  })

  it('completes a legacy client-first event without creating or replacing the existing message', async () => {
    const userPath = 'users/alice'
    const watchPath = `${userPath}/profiles/main/titleAlerts/movie-12-included`
    const eventPath = `${userPath}/profiles/main/notifications/movie-12-included-session-1-initial`
    const db = inMemoryFirestore({
      [userPath]: { providerSettings: { enabledProviderIds: ['netflix'], version: 2 } },
      [`${userPath}/profiles/main`]: { displayName: 'Hauptprofil' },
      [watchPath]: { schemaVersion: 1, type: 'movie', tmdbId: 12, kind: 'included', title: 'Testfilm', activationId: 'session-1' },
      [eventPath]: { schemaVersion: 1, kind: 'included', title: 'Jetzt inklusive',
        body: 'Vorhandene Sofortmeldung', startsAt: new Date('2026-09-24'),
        expiresAt: new Date('2026-10-24') },
    })
    const fetchImpl = async () => ({ ok: true, json: async () => ({ results: { DE: {} } }) })
    const result = await runTitleAlertCheck({ db, token: 'test-token', fetchImpl, tvTitles: new Map(),
      now: Date.parse('2026-09-25T08:00:00Z') })
    expect(result).toMatchObject({ observed: 1, includedCreated: 0, failed: 0 })
    expect(db.data.get(watchPath).status).toBe('completed')
    expect(db.data.get(eventPath)).toMatchObject({ schemaVersion: 2, body: 'Vorhandene Sofortmeldung',
      phase: 'included-found', expiresAt: new Date('2026-10-24') })
    expect(db.data.get(eventPath).completedAt).toBeInstanceOf(Date)
    expect([...db.data.keys()].filter((key) => key.includes('/notifications/'))).toHaveLength(1)
    expect((await runTitleAlertCheck({ db, token: 'test-token', fetchImpl, tvTitles: new Map() })).observed).toBe(0)
  })

  it('preserves the acknowledged two-towers message and read marker while completing a V1 watch', async () => {
    const profile = 'users/test-account/profiles/main'
    const watchPath = `${profile}/titleAlerts/movie-121-included`
    const eventPath = `${profile}/notifications/movie-121-included/session-1-initial`
    const validEventPath = `${profile}/notifications/movie-121-included-session-1-initial`
    const readPath = `${profile}/notificationReads/movie-121-included-session-1-initial`
    const startsAt = new Date('2026-10-08T09:00:00Z')
    const expiresAt = new Date('2026-11-07T09:00:00Z')
    const readAt = new Date('2026-10-08T09:20:00Z')
    const db = inMemoryFirestore({
      'users/test-account': { providerSettings: { enabledProviderIds: ['netflix'], version: 2 } },
      [profile]: { displayName: 'main' },
      [watchPath]: { schemaVersion: 1, type: 'movie', tmdbId: 121,
        kind: 'included', title: 'Der Herr der Ringe – Die zwei Türme', activationId: 'session-1' },
      [validEventPath]: { schemaVersion: 1, kind: 'included', title: 'Jetzt inklusive',
        body: 'Bestehende Benachrichtigung', startsAt, expiresAt },
      [readPath]: { readAt },
    })
    const fetchImpl = async () => ({ ok: true, json: async () => ({ results: { DE: {} } }) })
    const result = await runTitleAlertCheck({
      db, token: 'test-token', fetchImpl, tvTitles: new Map(), onlyWatchId: 'movie-121-included',
      now: Date.parse('2026-10-08T10:00:00Z'),
    })
    expect(result).toMatchObject({ observed: 1, includedCreated: 0, failed: 0 })
    expect(db.data.get(watchPath)).toMatchObject({
      status: 'completed', completionNotificationId: 'movie-121-included-session-1-initial',
    })
    expect(db.data.get(validEventPath)).toMatchObject({
      body: 'Bestehende Benachrichtigung', startsAt, expiresAt, schemaVersion: 2,
    })
    expect(db.data.get(readPath)).toEqual({ readAt })
    expect(db.data.has(eventPath)).toBe(false)
    expect([...db.data.keys()].filter(path => path.startsWith(`${profile}/notifications/`)))
      .toEqual([validEventPath])
    expect((await runTitleAlertCheck({
      db, token: 'test-token', fetchImpl, tvTitles: new Map(), onlyWatchId: 'movie-121-included',
    })).observed).toBe(0)
  })

  it('scopes a production diagnostic to one watch without changing regular nightly behavior', async () => {
    const userPath = 'users/alice'
    const base = `${userPath}/profiles/main/titleAlerts`
    const db = inMemoryFirestore({
      [userPath]: { providerSettings: { enabledProviderIds: ['netflix'], version: 2 } },
      [`${userPath}/profiles/main`]: { displayName: 'Hauptprofil' },
      [`${base}/movie-121-included`]: {
        schemaVersion: 1, type: 'movie', tmdbId: 121, kind: 'included',
        title: 'Die zwei Türme', activationId: 'session-1',
      },
      [`${base}/movie-122-included`]: {
        schemaVersion: 1, type: 'movie', tmdbId: 122, kind: 'included',
        title: 'Anderer Film', activationId: 'session-2',
      },
    })
    const fetchImpl = async () => ({ ok: true, json: async () => ({
      results: { DE: { flatrate: [{ provider_name: 'Netflix', provider_id: 8 }] } },
    }) })
    const options = { db, token: 'test-token', fetchImpl, tvTitles: new Map(),
      onlyWatchId: 'movie-121-included' }
    expect((await runTitleAlertCheck(options))).toMatchObject({ observed: 1, includedCreated: 1, failed: 0 })
    expect((await runTitleAlertCheck(options))).toMatchObject({ observed: 0, includedCreated: 0, failed: 0 })
    expect([...db.data.keys()].filter(key => key.includes('/notifications/'))).toHaveLength(1)
    expect([...db.data.keys()].some(key => key.includes('movie-122-included') && key.includes('titleAlertState'))).toBe(false)
  })

  it('does not complete a watch or emit an event for rent/buy, catalog, or only unselected offers', async () => {
    const profile = 'users/alice/profiles/main'
    const watchPath = `${profile}/titleAlerts/movie-13-included`
    const db = inMemoryFirestore({
      'users/alice': { providerSettings: { enabledProviderIds: ['netflix'], version: 2 } },
      [profile]: { displayName: 'Main' },
      [watchPath]: { schemaVersion: 2, status: 'active', type: 'movie', tmdbId: 13,
        kind: 'included', title: 'Only for rent', activationId: 'activation-1' },
    })
    let available = false
    const fetchImpl = async () => ({ ok: true, json: async () => ({
      results: { DE: {
        rent: [{ provider_id: 8, provider_name: 'Netflix' }],
        buy: [{ provider_id: 8, provider_name: 'Netflix' }],
        flatrate: [{ provider_id: available ? 8 : 337, provider_name: available ? 'Netflix' : 'Disney Plus' }],
      } },
    }) })
    const opts = { db, token: 'token', fetchImpl, tvTitles: new Map(),
      now: Date.parse('2026-10-08T10:00:00Z') }
    for (let n = 0; n < 2; n++) {
      expect(await runTitleAlertCheck(opts)).toMatchObject({ observed: 1, includedCreated: 0, failed: 0 })
      expect(db.data.get(watchPath)).toMatchObject({ status: 'active', activationId: 'activation-1' })
      expect([...db.data.keys()].filter(x => x.startsWith(`${profile}/notifications/`))).toHaveLength(0)
    }
    available = true
    expect(await runTitleAlertCheck(opts)).toMatchObject({ observed: 1, includedCreated: 1, failed: 0 })
    expect(db.data.get(watchPath).status).toBe('completed')
    expect([...db.data.keys()].filter(x => x.startsWith(`${profile}/notifications/`))).toHaveLength(1)
  })

  it('preserves a pending V1 observation when TMDB fails and lets the next healthy check retry', async () => {
    const profile = 'users/alice/profiles/main'
    const watchPath = `${profile}/titleAlerts/movie-14-included`
    const db = inMemoryFirestore({
      'users/alice': { providerSettings: { enabledProviderIds: ['netflix'], version: 2 } },
      [profile]: { displayName: 'Main' },
      [watchPath]: { schemaVersion: 1, type: 'movie', tmdbId: 14,
        kind: 'included', title: 'Temporarily offline', activationId: 'activation-1' },
    })
    let fail = true
    const fetchImpl = async () => fail
      ? { ok: false, status: 503 }
      : { ok: true, json: async () => ({ results: { DE: {
        flatrate: [{ provider_id: 8, provider_name: 'Netflix' }],
      } } }) }
    const opts = { db, token: 'token', fetchImpl, tvTitles: new Map() }
    await expect(runTitleAlertCheck(opts)).rejects.toThrow(/failed for 1 of 1 watches/)
    expect(db.data.get(watchPath)).toMatchObject({ schemaVersion: 1, activationId: 'activation-1' })
    expect([...db.data.keys()].filter(x => x.startsWith(`${profile}/notifications/`))).toHaveLength(0)
    fail = false
    expect(await runTitleAlertCheck(opts)).toMatchObject({ includedCreated: 1, failed: 0 })
    expect(db.data.get(watchPath).status).toBe('completed')
  })

  it('never creates an event for a stale fetch if another client finished or reactivated the watch', async () => {
    for (const race of ['completed', 'reactivated']) {
      const profile = 'users/alice/profiles/main'
      const watchPath = `${profile}/titleAlerts/movie-15-included`
      const db = inMemoryFirestore({
        'users/alice': { providerSettings: { enabledProviderIds: ['netflix'], version: 2 } },
        [profile]: { displayName: 'Main' },
        [watchPath]: { schemaVersion: 2, status: 'active', type: 'movie', tmdbId: 15,
          kind: 'included', title: 'Race test', activationId: 'session-old' },
      })
      const fetchImpl = async () => {
        const current = db.data.get(watchPath)
        db.data.set(watchPath, race === 'completed'
          ? { ...current, status: 'completed', completedAt: new Date() }
          : { ...current, activationId: 'session-new', status: 'active' })
        return { ok: true, json: async () => ({ results: { DE: {
          flatrate: [{ provider_id: 8, provider_name: 'Netflix' }],
        } } }) }
      }
      const result = await runTitleAlertCheck({ db, token: 'token', fetchImpl, tvTitles: new Map() })
      expect(result).toMatchObject({ observed: 1, includedCreated: 0, failed: 0 })
      expect(db.data.get(watchPath).status).toBe(race === 'completed' ? 'completed' : 'active')
      expect([...db.data.keys()].filter(x => x.startsWith(`${profile}/notifications/`))).toHaveLength(0)
    }
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
