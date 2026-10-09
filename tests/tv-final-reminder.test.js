import { describe, expect, it } from 'vitest'
import {
  FINAL_LEAD_MS, FINAL_LATE_GRACE_MS, isCanonicalFirstTvEvent,
  tvFinalEligibility, tvFinalNotification,
} from '../src/notifications/tvFinalReminderModel.js'
import { runTvFinalReminderCheck } from '../scripts/check-tv-final-reminders.mjs'

const now = Date.parse('2026-10-09T19:10:00Z')
const MIN = 60000
const DAY = 86400000
const watched = { schemaVersion: 2, status: 'active', kind: 'tv',
  type: 'movie', tmdbId: 42, title: 'TV-Film', activationId: 'session-1' }
const first = { schemaVersion: 2, phase: 'tv-found', kind: 'tv',
  titleType: 'movie', tmdbId: 42, mediaTitle: 'TV-Film',
  stationName: 'ZDF', airingStartAt: new Date(now + 5 * MIN),
  airingEndsAt: new Date(now + 120 * MIN) }
const profilePath = 'users/alice/profiles/main'
const firstPath = `${profilePath}/notifications/movie-42-tv-session-1-initial`
const finalPath = `${profilePath}/notifications/movie-42-tv-session-1-final`
const watchPath = `${profilePath}/titleAlerts/movie-42-tv`

function memoryDb(initial = {}) {
  const data = new Map(Object.entries(initial))
  const ref = (path) => ({
    path, id: path.split('/').at(-1),
    get parent() { return collection(path.split('/').slice(0, -1).join('/')) },
    collection(name) { return collection(`${path}/${name}`) },
  })
  const collection = (path) => ({
    path,
    get parent() { return ref(path.split('/').slice(0, -1).join('/')) },
    doc(name) { return ref(`${path}/${name}`) },
  })
  const snap = (path) => ({
    id: path.split('/').at(-1), ref: ref(path),
    exists: data.has(path), data: () => data.get(path),
  })
  const queryFilters = []
  return {
    data, queryFilters,
    collectionGroup(name) {
      expect(name).toBe('notifications')
      const filters = []
      let max = 200
      const query = {
        where(k, op, value) { filters.push([k, op, value]); return query },
        orderBy() { return query },
        limit(value) { max = value; return query },
        async get() {
          queryFilters.push(...filters)
          const docs = [...data.keys()]
            .filter((path) => path.split('/').at(-2) === name)
            .filter((path) => filters.every(([key, op, value]) => {
              const a = data.get(path)?.[key]
              const left = a instanceof Date ? a.getTime() : a
              const right = value instanceof Date ? value.getTime() : value
              if (op === '==') return left === right
              if (op === '>=') return left >= right
              if (op === '<=') return left <= right
              throw Error(`Unexpected query op ${op}`)
            }))
            .sort((a, b) => (data.get(a)?.airingStartAt?.getTime() || 0)
              - (data.get(b)?.airingStartAt?.getTime() || 0))
            .slice(0, max).map(snap)
          return { docs }
        },
      }
      return query
    },
    async runTransaction(fn) {
      return fn({
        get: async (target) => snap(target.path),
        create: (target, value) => {
          if (data.has(target.path)) throw Error('duplicate event')
          data.set(target.path, value)
        },
        update: (target, fields) => {
          if (!data.has(target.path)) throw Error('missing update target')
          data.set(target.path, { ...data.get(target.path), ...fields })
        },
        set: (target, value) => data.set(target.path, value),
      })
    },
  }
}

describe('#382 independent 5-minute final reminder engine', () => {
  it('fires exactly at the due window and handles a delayed minute invocation safely', () => {
    expect(FINAL_LEAD_MS).toBe(5 * MIN)
    expect(tvFinalEligibility(watched, first, now - 1)).toBeNull()
    expect(tvFinalEligibility(watched, first, now)).toMatchObject({ late: false })
    const message = tvFinalNotification(watched, first, now)
    expect(message).toMatchObject({ schemaVersion: 2, phase: 'tv-final',
      title: 'Gleich im TV', stationName: 'ZDF', airingStartAt: first.airingStartAt })
    expect(message.expiresAt).toEqual(new Date(now + 120 * MIN + 7 * DAY))
    expect(tvFinalNotification(watched, first, now + 8 * MIN)).toMatchObject({
      title: 'Jetzt im TV', phase: 'tv-final',
    })
    expect(tvFinalEligibility(watched, first, now + 5 * MIN + FINAL_LATE_GRACE_MS)).toBeNull()
    expect(tvFinalEligibility(watched, { ...first, airingEndsAt: new Date(now + 8 * MIN) },
      now + 8 * MIN)).toBeNull()
  })

  it('refuses invalid, completed, mismatching, or tampered first events', () => {
    expect(tvFinalEligibility({ ...watched, status: 'completed' }, first, now)).toBeNull()
    expect(tvFinalEligibility(watched, { ...first, tmdbId: 99 }, now)).toBeNull()
    expect(tvFinalEligibility(watched, { ...first, phase: 'tv-final' }, now)).toBeNull()
    expect(tvFinalEligibility(watched, { ...first, stationName: '' }, now)).toBeNull()
    expect(isCanonicalFirstTvEvent(watched, 'movie-42-tv-session-1-initial')).toBe(true)
    expect(isCanonicalFirstTvEvent(watched, 'movie-42-tv-other-initial')).toBe(false)
  })

  it('creates one immutable final message and atomically completes the active watch', async () => {
    const db = memoryDb({ [firstPath]: first, [watchPath]: watched })
    const result = await runTvFinalReminderCheck({ db, now })
    expect(result).toMatchObject({ considered: 1, finalCreated: 1, failed: 0 })
    expect(db.data.get(finalPath)).toMatchObject({
      phase: 'tv-final', titleType: 'movie', tmdbId: 42,
      stationName: 'ZDF', completedAt: new Date(now),
    })
    expect(db.data.get(watchPath)).toMatchObject({
      schemaVersion: 2, status: 'completed', completionNotificationId: 'movie-42-tv-session-1-final',
    })
    expect(db.data.get(`${profilePath}/titleAlertState/movie-42-tv`)).toMatchObject({
      activationId: 'session-1', status: 'completed',
      finalNotificationId: 'movie-42-tv-session-1-final',
    })
    expect(await runTvFinalReminderCheck({ db, now: now + 1 * MIN })).toMatchObject({
      considered: 1, finalCreated: 0, skipped: 1,
    })
    expect([...db.data.keys()].filter((path) => path.startsWith(`${profilePath}/notifications/`)))
      .toHaveLength(2)
    expect(db.queryFilters.some(([key]) => key === 'airingStartAt')).toBe(true)
  })

  it('does not complete a manually stopped or reactivated watch, or another profile', async () => {
    const child = 'users/alice/profiles/child'
    const wrongAccount = 'users/bob/profiles/main'
    const db = memoryDb({
      [firstPath]: first,
      [watchPath]: { ...watched, activationId: 'session-new' },
      [`${child}/notifications/movie-42-tv-session-1-initial`]: first,
      [`${child}/titleAlerts/movie-42-tv`]: { ...watched, status: 'completed' },
      [`${wrongAccount}/notifications/movie-42-tv-session-1-initial`]: first,
      [`${wrongAccount}/titleAlerts/movie-42-tv`]: watched,
    })
    expect(await runTvFinalReminderCheck({ db, now })).toMatchObject({
      considered: 3, finalCreated: 1, skipped: 2,
    })
    expect(db.data.has(finalPath)).toBe(false)
    expect(db.data.has(`${child}/notifications/movie-42-tv-session-1-final`)).toBe(false)
    expect(db.data.has(`${wrongAccount}/notifications/movie-42-tv-session-1-final`)).toBe(true)
    expect(db.data.get(watchPath).activationId).toBe('session-new')
  })

  it('skips a cancelled observation with no watch document and supports series-specific reminders', async () => {
    const seriesProfile = 'users/alice/profiles/series'
    const seriesWatch = { ...watched, type: 'series', tmdbId: 55, title: 'Meine Serie' }
    const seriesFirst = { ...first, titleType: 'series', tmdbId: 55 }
    const db = memoryDb({
      [firstPath]: first, // Manually deleted watch: don't recreate it.
      [`${seriesProfile}/notifications/series-55-tv-session-1-initial`]: seriesFirst,
      [`${seriesProfile}/titleAlerts/series-55-tv`]: seriesWatch,
    })
    expect(await runTvFinalReminderCheck({ db, now })).toMatchObject({
      considered: 2, skipped: 1, finalCreated: 1, failed: 0,
    })
    expect(db.data.get(`${seriesProfile}/notifications/series-55-tv-session-1-final`))
      .toMatchObject({ titleType: 'series', tmdbId: 55, mediaTitle: 'Meine Serie' })
    expect(db.data.has(finalPath)).toBe(false)
  })

  it('ignores stale broadcasts, old schema and malformed paths without scanning the whole catalog', async () => {
    const db = memoryDb({
      [firstPath]: { ...first, airingStartAt: new Date(now - 2 * DAY) },
      [watchPath]: watched,
      ['users/alice/profiles/main/notifications/old-tv-notice']: { ...first, schemaVersion: 1 },
    })
    const result = await runTvFinalReminderCheck({ db, now })
    expect(result).toMatchObject({ considered: 0, finalCreated: 0, failed: 0 })
    expect(db.data.has(finalPath)).toBe(false)
  })
})
