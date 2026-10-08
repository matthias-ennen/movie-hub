import { describe, expect, it } from 'vitest'
import {
  TITLE_ALERT_SCHEMA_VERSION, PERSONAL_HARD_TTL_MS, PERSONAL_READ_AFTER_COMPLETION_MS,
  TV_POST_AIRING_TTL_MS, titleWatchStatus, isActiveTitleWatch,
  isTerminalAlertPhase, finishTitleWatch, activateTitleWatch,
  personalHardExpiry, personalVisibleUntil, isCurrentPersonalNotification, timeMillis,
} from '../src/notifications/titleAlertLifecycleModel.js'

const H = 3600000
const D = 24 * H
const T0 = Date.parse('2026-10-08T10:00:00Z')
const legacy = {
  schemaVersion: 1, kind: 'included', type: 'movie', tmdbId: 121,
  title: 'Die zwei Türme', activationId: 'session-1',
}
const firstId = 'movie-121-included-session-1-initial'
const v1Message = {
  schemaVersion: 1, kind: 'included',
  startsAt: new Date(T0), expiresAt: new Date(T0 + 30 * D),
}

describe('#381 pure title-watch lifecycle contract', () => {
  it('reads legacy V1 as active; explicitly finished or unknown states are inactive', () => {
    expect(titleWatchStatus(legacy)).toBe('active')
    expect(isActiveTitleWatch(legacy)).toBe(true)
    expect(titleWatchStatus({ ...legacy, schemaVersion: 2, status: 'active' })).toBe('active')
    expect(titleWatchStatus({ ...legacy, schemaVersion: 2, status: 'completed' })).toBe('completed')
    expect(isActiveTitleWatch({ ...legacy, status: 'completed' })).toBe(false)
    expect(isActiveTitleWatch({ ...legacy, schemaVersion: 3, status: 'unexpected' })).toBe(false)
    expect(isActiveTitleWatch(null)).toBe(false)
  })

  it('ends included watches after a persisted included-found event, never after unknown phases', () => {
    expect(isTerminalAlertPhase('included', 'included-found')).toBe(true)
    expect(isTerminalAlertPhase('included', 'tv-final')).toBe(false)
    const completed = finishTitleWatch(legacy, {
      phase: 'included-found', notificationId: firstId, completedAt: T0,
    })
    expect(completed).toMatchObject({
      ...legacy, schemaVersion: TITLE_ALERT_SCHEMA_VERSION,
      status: 'completed', completionNotificationId: firstId,
      completedAt: new Date(T0),
    })
    expect(finishTitleWatch(completed, {
      phase: 'included-found', notificationId: firstId, completedAt: T0 + 3 * D,
    })).toBeNull()
    expect(completed.completedAt.getTime()).toBe(T0)
  })

  it('keeps TV observation active after discovery; only future TV final can finish it', () => {
    const tv = { ...legacy, kind: 'tv' }
    expect(isTerminalAlertPhase('tv', 'tv-found')).toBe(false)
    expect(finishTitleWatch(tv, {
      phase: 'tv-found', notificationId: 'movie-121-tv-session-1-airing-101', completedAt: T0,
    })).toBeNull()
    expect(finishTitleWatch(tv, {
      phase: 'tv-final', notificationId: 'movie-121-tv-session-1-final', completedAt: T0,
    })).toMatchObject({ status: 'completed', kind: 'tv' })
    expect(isActiveTitleWatch(tv)).toBe(true)
  })

  it('requires proof of a saved message and a valid time before completion', () => {
    expect(() => finishTitleWatch(legacy, {
      phase: 'included-found', notificationId: '../../escape', completedAt: T0,
    })).toThrow(/persisted notification/)
    expect(() => finishTitleWatch(legacy, {
      phase: 'included-found', notificationId: firstId, completedAt: 'bad time',
    })).toThrow(/completion instant/)
  })

  it('allows an explicitly new activation, but never replaces an active watch or reuses its ID', () => {
    const done = finishTitleWatch(legacy, {
      phase: 'included-found', notificationId: firstId, completedAt: T0,
    })
    const second = activateTitleWatch(done, { activationId: 'session-2', createdAt: T0 + D })
    expect(second).toMatchObject({ status: 'active', activationId: 'session-2', schemaVersion: 2 })
    expect(second.createdAt).toEqual(new Date(T0 + D))
    expect(second).not.toHaveProperty('completedAt')
    expect(second).not.toHaveProperty('completionNotificationId')
    expect(legacy.activationId).toBe('session-1')
    expect(() => activateTitleWatch(done, {
      activationId: 'session-1', createdAt: T0 + D,
    })).toThrow(/new valid activation/)
    expect(() => activateTitleWatch(legacy, {
      activationId: 'session-2', createdAt: T0 + D,
    })).toThrow(/cannot be silently replaced/)
    expect(() => activateTitleWatch(done, {
      activationId: 'session-2', createdAt: NaN,
    })).toThrow(/activation instant/)
  })
})

describe('#381 time normalization and hard expiry', () => {
  it('accepts Firestore Timestamps, Date, Unix millis and ISO instants without using local DST', () => {
    const ts = { toMillis: () => T0 }
    const wire = { seconds: T0 / 1000, nanoseconds: 0 }
    for (const value of [T0, new Date(T0), new Date(T0).toISOString(), ts, wire]) {
      expect(timeMillis(value)).toBe(T0)
    }
    expect(Number.isNaN(timeMillis(null))).toBe(true)
    expect(Number.isNaN(timeMillis('not a date'))).toBe(true)
    const beforeDst = Date.parse('2026-10-25T00:30:00Z')
    expect(personalHardExpiry('included', { createdAt: beforeDst }).getTime() - beforeDst)
      .toBe(PERSONAL_HARD_TTL_MS)
  })

  it('caps included messages at 30 days, TV messages at airing end + 7 or max 30 days', () => {
    expect(personalHardExpiry('included', { createdAt: T0 }).getTime()).toBe(T0 + 30 * D)
    expect(personalHardExpiry('tv', { createdAt: T0, airingEndsAt: T0 + 2 * D }).getTime())
      .toBe(T0 + 2 * D + TV_POST_AIRING_TTL_MS)
    expect(personalHardExpiry('tv', { createdAt: T0, airingEndsAt: T0 + 60 * D }).getTime())
      .toBe(T0 + PERSONAL_HARD_TTL_MS)
    expect(personalHardExpiry('tv', { createdAt: T0 }).getTime()).toBe(T0 + 7 * D)
    expect(() => personalHardExpiry('unknown', { createdAt: T0 })).toThrow(/supported type/)
  })
})

describe('#381 personal inbox visibility contract', () => {
  it('preserves legacy V1 messages and old hard limits even when read', () => {
    expect(personalVisibleUntil(v1Message, { readAt: new Date(T0 + D) })).toBe(T0 + 30 * D)
    expect(isCurrentPersonalNotification(v1Message, { readAt: new Date(T0 + D) }, T0 + 28 * D)).toBe(true)
    expect(isCurrentPersonalNotification(v1Message, null, T0 + 30 * D)).toBe(false)
    expect(isCurrentPersonalNotification({ ...v1Message, expiresAt: null }, null, T0)).toBe(false)
  })

  it('keeps unread completed messages until hard TTL; reading alone never erases them', () => {
    const v2 = { ...v1Message, schemaVersion: 2, completedAt: new Date(T0 + D) }
    expect(personalVisibleUntil(v2, null)).toBe(T0 + 30 * D)
    expect(isCurrentPersonalNotification(v2, null, T0 + 29 * D)).toBe(true)
    expect(personalVisibleUntil({ ...v2, completedAt: null }, { readAt: new Date(T0 + D) }))
      .toBe(T0 + 30 * D)
  })

  it('uses seven days from the later of reading and completion without exceeding the hard expiry', () => {
    const message = { ...v1Message, schemaVersion: 2, completedAt: new Date(T0 + 2 * D) }
    const read = { readAt: { toMillis: () => T0 + 5 * D } }
    expect(personalVisibleUntil(message, read)).toBe(T0 + 5 * D + PERSONAL_READ_AFTER_COMPLETION_MS)
    expect(isCurrentPersonalNotification(message, read, T0 + 12 * D - 1)).toBe(true)
    expect(isCurrentPersonalNotification(message, read, T0 + 12 * D)).toBe(false)
    expect(personalVisibleUntil(message, { readAt: new Date(T0 + D) })).toBe(T0 + 9 * D)
    const nearingHard = { readAt: new Date(T0 + 29 * D) }
    expect(personalVisibleUntil(message, nearingHard)).toBe(T0 + 30 * D)
  })

  it('never exposes future/expired/unsupported notifications even if Firestore still contains them', () => {
    expect(isCurrentPersonalNotification(v1Message, null, T0 - 1)).toBe(false)
    expect(isCurrentPersonalNotification(v1Message, null, T0)).toBe(true)
    expect(isCurrentPersonalNotification({ ...v1Message, schemaVersion: 9 }, null, T0)).toBe(false)
    expect(isCurrentPersonalNotification({ ...v1Message, kind: 'admin' }, null, T0)).toBe(false)
    expect(isCurrentPersonalNotification(v1Message, null, NaN)).toBe(false)
  })
})
