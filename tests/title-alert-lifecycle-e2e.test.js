import { describe, expect, it } from 'vitest'
import { verifyLegacyCompletion } from '../scripts/verify-title-alert-lifecycle.mjs'

const before = {
  active: true, completed: false, activationId: 'first',
  notificationId: 'movie-121-included-first-initial',
  eventPhase: undefined, body: 'Already delivered', startsAt: 1000,
  expiresAt: 3000000000, readAt: 1200, notificationCount: 1,
}
const after = {
  ...before, active: false, completed: true, eventPhase: 'included-found',
}
const first = { observed: 1, includedCreated: 0, failed: 0 }
const replay = { observed: 0, includedCreated: 0, failed: 0 }

describe('#381 accepted real watch lifecycle evidence', () => {
  it('requires terminal state without losing an existing message or read marker', () => {
    expect(verifyLegacyCompletion(before, after, first, replay)).toEqual({
      watchesMatched: 1, completed: true, createdNotifications: 0,
      replayCreatedNotifications: 0, originalEventPreserved: true,
      originalReadStatePreserved: true, duplicates: 0,
    })
  })
  it('also accepts a watch which was already completed before replay', () => {
    expect(verifyLegacyCompletion({ ...before, active: false, completed: true },
      after, { ...first, observed: 0 }, replay)).toMatchObject({ completed: true, duplicates: 0 })
  })
  it('rejects a new event, a repeated active watch, or a changed original message', () => {
    expect(() => verifyLegacyCompletion(before, after, { ...first, includedCreated: 1 }, replay))
      .toThrow(/Scoped legacy/)
    expect(() => verifyLegacyCompletion(before, after, first, { ...replay, observed: 1 }))
      .toThrow(/Scoped legacy/)
    expect(() => verifyLegacyCompletion(before, { ...after, body: 'Replaced' }, first, replay))
      .toThrow(/Original notification/)
    expect(() => verifyLegacyCompletion(before, { ...after, readAt: 999 }, first, replay))
      .toThrow(/Original notification/)
    expect(() => verifyLegacyCompletion(before, { ...after, notificationCount: 2 }, first, replay))
      .toThrow(/Original notification/)
  })
  it('rejects invalid completion state and changed activation', () => {
    expect(() => verifyLegacyCompletion(before, { ...after, completed: false }, first, replay))
      .toThrow(/Persisted terminal/)
    expect(() => verifyLegacyCompletion(before, { ...after, activationId: 'second' }, first, replay))
      .toThrow(/Persisted terminal/)
  })
})
