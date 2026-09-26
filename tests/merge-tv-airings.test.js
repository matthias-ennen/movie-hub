import { describe, expect, it } from 'vitest'
import { mergeTvAirings } from '../src/sources/mergeTvAirings.js'

describe('neutral TV airing merge', () => {
  it('merges the same Waipu/Joyn broadcast while keeping both providers', () => {
    const base = {
      tmdbId: 11,
      type: 'movie',
      stationId: 'pro7',
      stationName: 'ProSieben',
      startTime: '2026-09-26T18:15:00.000Z',
      stopTime: '2026-09-26T20:15:00.000Z',
    }
    const merged = mergeTvAirings(
      [{ ...base, providerIds: ['waipu'], playbackRoutes: [{ providerId: 'waipu', mode: 'APP_DEEP_LINK', target: 'https://app.waipu.tv/x' }] }],
      [{ ...base, sourceStationId: 'prosieben-de', providerIds: ['joyn'], playbackRoutes: [{ providerId: 'joyn', mode: 'WEB_LINK', target: 'https://www.joyn.de/live-tv/prosieben' }] }],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].providerIds).toEqual(['joyn', 'waipu'])
    expect(merged[0].playbackRoutes.map(({ providerId }) => providerId).sort()).toEqual(['joyn', 'waipu'])
  })

  it('keeps Joyn-only stations as separate broadcasts', () => {
    const merged = mergeTvAirings([], [{
      tmdbId: 11,
      type: 'movie',
      stationId: 'joyn.only',
      stationName: 'Joyn Only',
      startTime: '2026-09-26T18:15:00.000Z',
      stopTime: '2026-09-26T20:15:00.000Z',
      providerIds: ['joyn'],
    }])
    expect(merged).toHaveLength(1)
    expect(merged[0].stationId).toBe('joyn.only')
  })
})
