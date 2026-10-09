import { describe, expect, it } from 'vitest'
import { tvFirstAiringReconciliation } from '../src/notifications/tvAiringReconciliationModel.js'
import { tvFinalEligibility } from '../src/notifications/tvFinalReminderModel.js'

const DAY = 86400000
const NOW = Date.parse('2026-10-09T08:00:00Z')
const makeAiring = (days, stationName = 'ZDF') => ({
  startTime: new Date(NOW + days * DAY).toISOString(),
  stopTime: new Date(NOW + days * DAY + 2 * 3600000).toISOString(),
  stationName, stationId: 'zdf',
})
const first = {
  schemaVersion: 2, phase: 'tv-found', kind: 'tv', titleType: 'movie',
  tmdbId: 100, airingStartAt: new Date(NOW + 5 * DAY),
  airingEndsAt: new Date(NOW + 5 * DAY + 2 * 3600000), stationName: 'ZDF',
}
const watch = { schemaVersion: 2, status: 'active', kind: 'tv',
  type: 'movie', tmdbId: 100, title: 'Filmtitel', activationId: 'session' }

describe('#382 first TV airing reconciliation', () => {
  it('does not modify a confirmed, unchanged broadcast', () => {
    expect(tvFirstAiringReconciliation(first, makeAiring(5), { now: NOW })).toBeNull()
  })
  it('binds moved broadcasts, including a changed station, before start', () => {
    expect(tvFirstAiringReconciliation(first, makeAiring(7, 'Das Erste'), { now: NOW }))
      .toMatchObject({
        status: 'scheduled', start: NOW + 7 * DAY,
        end: NOW + 7 * DAY + 2 * 3600000, station: 'Das Erste',
      })
  })
  it('cancels a missing broadcast only for complete published TV sources', () => {
    expect(tvFirstAiringReconciliation(first, null, { now: NOW, sourceComplete: false })).toBeNull()
    expect(tvFirstAiringReconciliation(first, null, { now: NOW, sourceComplete: true }))
      .toEqual({ status: 'cancelled' })
    expect(tvFinalEligibility(watch, { ...first, scheduleStatus: 'cancelled' },
      NOW + 5 * DAY - 300000)).toBeNull()
  })
  it('restores an already cancelled broadcast without a new alert activation', () => {
    const cancelled = { ...first, scheduleStatus: 'cancelled' }
    expect(tvFirstAiringReconciliation(cancelled, null, { now: NOW })).toBeNull()
    expect(tvFirstAiringReconciliation(cancelled, makeAiring(10), { now: NOW + 6 * DAY }))
      .toMatchObject({ status: 'scheduled', start: NOW + 10 * DAY })
  })
  it('never shifts an already started broadcast or a malformed TV event', () => {
    expect(tvFirstAiringReconciliation(first, makeAiring(7),
      { now: NOW + 5 * DAY })).toBeNull()
    expect(tvFirstAiringReconciliation({ ...first, schemaVersion: 1 }, makeAiring(7),
      { now: NOW })).toBeNull()
    expect(tvFirstAiringReconciliation({ ...first, phase: 'tv-final' }, makeAiring(7),
      { now: NOW })).toBeNull()
  })
})
