import { describe, expect, it } from 'vitest'
import {
  dueTvAiring, includedProviderIds, includedTransition, tvAiringId, tvTransition,
} from '../src/notifications/titleAlertModel.js'

describe('personal title alerts', () => {
  it('accepts only included offers from selected providers', () => {
    const offers = [
      { id: 'netflix', offerTypes: ['rent'] },
      { id: 'prime', offerTypes: ['free', 'buy'] },
      { id: 'disney', offerTypes: ['flatrate'] },
      { id: 'waipu', offerTypes: ['catalog'] },
    ]
    expect(includedProviderIds(offers, ['netflix', 'prime', 'waipu'])).toEqual(['prime'])
    expect(includedProviderIds(offers, ['netflix'])).toEqual([])
  })

  it('sends an initial hit, suppresses repeats and reports a real return', () => {
    const first = includedTransition(null, 'session', true, 'netflix')
    expect(first.send).toBe(true)
    const unchanged = includedTransition(first, 'session', true, 'netflix')
    expect(unchanged.send).toBe(false)
    const absent = includedTransition(unchanged, 'session', false, 'netflix')
    const returned = includedTransition(absent, 'session', true, 'netflix')
    expect(returned).toMatchObject({ send: true, cycle: 1 })
    expect(includedTransition(returned, 'session', true, 'netflix').send).toBe(false)
  })

  it('does not turn a changed provider selection into a new event', () => {
    const missing = includedTransition(null, 'session', false, 'netflix')
    const changed = includedTransition(missing, 'session', true, 'netflix,prime')
    expect(changed.send).toBe(false)
    expect(includedTransition(changed, 'new-session', true, 'netflix,prime').send).toBe(true)
  })

  it('reminds before an enabled TV airing and limits repeated series airings', () => {
    const now = Date.parse('2026-09-25T10:00:00Z')
    const blocked = { stationId: 'off', startTime: '2026-09-25T12:00:00Z' }
    const upcoming = { stationId: 'on', stationName: 'ZDF', startTime: '2026-09-26T09:00:00Z', stopTime: '2026-09-26T10:30:00Z' }
    const farAway = { stationId: 'on', startTime: '2026-09-27T22:00:00Z' }
    expect(dueTvAiring([blocked, farAway, upcoming], ['off'], now)).toEqual(upcoming)
    const watch = { type: 'series', tmdbId: 12, kind: 'tv', activationId: 'session' }
    expect(tvAiringId(watch, upcoming)).toContain('airing-')
    expect(tvTransition(null, watch.activationId, upcoming, now).send).toBe(true)
    expect(tvTransition({ activationId: 'session', lastNotifiedAt: new Date(now), lastAiringStart: upcoming.startTime },
      'session', { ...upcoming, startTime: '2026-09-27T09:00:00Z' }, now + 86400000).send).toBe(false)
  })
})
