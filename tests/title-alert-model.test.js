import { describe, expect, it } from 'vitest'
import {
  TV_DISCOVERY_WINDOW_MS, TV_FINAL_REMINDER_LEAD_MS,
  dueTvAiring, filterEnabledTvAirings, includedProviderIds, includedTransition, tvAiringId, tvTransition,
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

  it('filters disabled stations independently for Waipu and Joyn', () => {
    const airings = [
      { stationId: 'zdf', source: 'waipu', providerIds: ['waipu'] },
      { stationId: 'joyn.prosieben', sourceStationId: 'prosieben', source: 'joyn', providerIds: ['joyn'] },
    ]
    expect(filterEnabledTvAirings(airings, {
      waipuStationSettings: { disabledStationIds: ['zdf'] },
      joynStationSettings: { disabledStationIds: [] },
    })).toEqual([airings[1]])
    expect(filterEnabledTvAirings(airings, {
      waipuStationSettings: { disabledStationIds: [] },
      joynStationSettings: { disabledStationIds: ['prosieben'] },
    })).toEqual([airings[0]])
  })

  it('discovers only real named-station airings in the full 14-day horizon', () => {
    const now = Date.parse('2026-10-09T08:00:00Z')
    const DAY = 86400000
    const airing = (days, stationName = 'ZDF') => ({
      stationId: 'zdf', stationName,
      startTime: new Date(now + days * DAY).toISOString(),
      stopTime: new Date(now + days * DAY + 7200000).toISOString(),
    })
    expect(TV_DISCOVERY_WINDOW_MS).toBe(14 * DAY)
    expect(dueTvAiring([airing(10)], [], now)).toEqual(airing(10))
    expect(dueTvAiring([airing(14)], [], now)).toEqual(airing(14))
    expect(dueTvAiring([airing(14.001)], [], now)).toBeNull()
    expect(dueTvAiring([airing(3)], ['zdf'], now)).toBeNull()
    expect(dueTvAiring([airing(2, '')], [], now)).toBeNull()
    expect(dueTvAiring([airing(-1)], [], now)).toBeNull()
  })

  it('binds only the first TV discovery per activation and schedules its final stage', () => {
    const now = Date.parse('2026-10-09T08:00:00Z')
    const upcoming = {
      stationId: 'zdf', stationName: 'ZDF', startTime: new Date(now + 10 * 86400000).toISOString(),
      stopTime: new Date(now + 10 * 86400000 + 7200000).toISOString(),
    }
    const first = tvTransition(null, 'activation-1', upcoming, now)
    expect(first).toMatchObject({
      send: true, activationId: 'activation-1', firstAiringStart: upcoming.startTime,
      firstAiringStop: upcoming.stopTime, firstAiringStation: 'ZDF', status: 'scheduled',
    })
    expect(first.finalReminderAt.getTime()).toBe(Date.parse(upcoming.startTime) - TV_FINAL_REMINDER_LEAD_MS)
    expect(tvTransition({ ...first, firstNotificationId: 'initial' }, 'activation-1',
      { ...upcoming, startTime: new Date(now + 12 * 86400000).toISOString() }, now + 86400000).send)
      .toBe(false)
    expect(tvTransition({ activationId: 'activation-1', lastAiringStart: upcoming.startTime },
      'activation-1', upcoming, now + 86400000).send).toBe(false) // V1 server state.
    expect(tvTransition(first, 'activation-2', upcoming, now).send).toBe(true)
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
