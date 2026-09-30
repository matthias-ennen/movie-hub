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


describe('tolerant cross-provider broadcast matching', () => {
  const base = {
    tmdbId: 603,
    type: 'movie',
    stationId: 'tele5',
    stationName: 'TELE 5',
    startTime: '2026-09-30T18:15:00.000Z',
    stopTime: '2026-09-30T20:15:00.000Z',
  }

  it('merges broadcasts with a small start offset and strong overlap', () => {
    const merged = mergeTvAirings(
      [{ ...base, providerIds: ['waipu'], playbackRoutes: [{ providerId: 'waipu', mode: 'APP_DEEP_LINK', target: 'waipu://603' }] }],
      [{
        ...base,
        startTime: '2026-09-30T18:18:00.000Z',
        stopTime: '2026-09-30T20:17:00.000Z',
        sourceStationId: 'tele-5',
        providerIds: ['joyn'],
        playbackRoutes: [{ providerId: 'joyn', mode: 'WEB_LINK', target: 'https://joyn.de/603' }],
      }],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].providerIds).toEqual(['joyn', 'waipu'])
    expect(merged[0].playbackRoutes.map(({ providerId }) => providerId).sort()).toEqual(['joyn', 'waipu'])
  })

  it('does not merge different TMDB identities even on the same station and timeslot', () => {
    const merged = mergeTvAirings(
      [{ ...base, providerIds: ['waipu'] }],
      [{ ...base, tmdbId: 604, providerIds: ['joyn'] }],
    )
    expect(merged).toHaveLength(2)
  })

  it('does not merge different media types', () => {
    const merged = mergeTvAirings(
      [{ ...base, providerIds: ['waipu'] }],
      [{ ...base, type: 'series', providerIds: ['joyn'] }],
    )
    expect(merged).toHaveLength(2)
  })

  it('does not merge same title on different canonical stations', () => {
    const merged = mergeTvAirings(
      [{ ...base, providerIds: ['waipu'] }],
      [{ ...base, stationId: 'pro7', providerIds: ['joyn'] }],
    )
    expect(merged).toHaveLength(2)
  })

  it('does not merge when the overlap is too weak', () => {
    const merged = mergeTvAirings(
      [{ ...base, providerIds: ['waipu'] }],
      [{
        ...base,
        startTime: '2026-09-30T18:20:00.000Z',
        stopTime: '2026-09-30T19:00:00.000Z',
        providerIds: ['joyn'],
      }],
    )
    expect(merged).toHaveLength(2)
  })
})
