import { describe, expect, it } from 'vitest'
import {
  formatDetailTvAiring,
  resolveDetailTvAiring,
} from '../src/tv/detailTvAiring.js'

const movie = {
  tmdbId: 11,
  type: 'movie',
}

function airing({
  providerId,
  stationId = 'tele5',
  stationName = 'TELE 5',
  startTime,
  stopTime,
  target,
}) {
  return {
    stationId,
    canonicalStationId: stationId,
    stationName,
    startTime,
    stopTime,
    providerIds: [providerId],
    playbackRoutes: target
      ? [{ providerId, mode: 'APP_DEEP_LINK', scope: 'program', target }]
      : [],
  }
}

describe('kanonische TV-Ausstrahlung auf der Detailseite', () => {
  it('nimmt die laufende Ausstrahlung und ignoriert einen alten Klick-Kontext', () => {
    const current = airing({
      providerId: 'waipu',
      startTime: '2026-10-04T18:15:00.000Z',
      stopTime: '2026-10-04T20:15:00.000Z',
      target: 'waipu://tele5/current',
    })
    const future = airing({
      providerId: 'waipu',
      stationId: 'zdf',
      stationName: 'ZDF',
      startTime: '2026-10-05T18:15:00.000Z',
      stopTime: '2026-10-05T20:15:00.000Z',
      target: 'waipu://zdf/future',
    })

    const result = resolveDetailTvAiring({
      ...movie,
      tvAiring: {
        ...current,
        stationId: 'old',
        canonicalStationId: 'old',
        stationName: 'Alter Klick-Kontext',
        startTime: '2026-10-03T18:15:00.000Z',
        stopTime: '2026-10-03T20:15:00.000Z',
      },
      liveAvailability: {
        waipu: { providerId: 'waipu', airings: [current, future], nextAiring: current },
      },
    }, { now: Date.parse('2026-10-04T19:00:00.000Z') })

    expect(result.stationName).toBe('TELE 5')
    expect(result.startTime).toBe(current.startTime)
  })

  it('rückt nach Ablauf automatisch auf die nächste Ausstrahlung weiter', () => {
    const expired = airing({
      providerId: 'waipu',
      startTime: '2026-10-04T16:00:00.000Z',
      stopTime: '2026-10-04T18:00:00.000Z',
      target: 'waipu://tele5/expired',
    })
    const next = airing({
      providerId: 'waipu',
      stationId: 'zdf',
      stationName: 'ZDF',
      startTime: '2026-10-04T20:15:00.000Z',
      stopTime: '2026-10-04T22:00:00.000Z',
      target: 'waipu://zdf/next',
    })

    const result = resolveDetailTvAiring({
      ...movie,
      liveAvailability: {
        waipu: { providerId: 'waipu', airings: [expired, next], nextAiring: expired },
      },
    }, { now: Date.parse('2026-10-04T18:30:00.000Z') })

    expect(result.stationName).toBe('ZDF')
    expect(result.startTime).toBe(next.startTime)
  })

  it('führt dieselbe Waipu-/Joyn-Ausstrahlung zu einem Detailtermin zusammen', () => {
    const waipu = airing({
      providerId: 'waipu',
      startTime: '2026-10-04T18:15:00.000Z',
      stopTime: '2026-10-04T20:15:00.000Z',
      target: 'waipu://tele5/11',
    })
    const joyn = airing({
      providerId: 'joyn',
      startTime: '2026-10-04T18:15:00.000Z',
      stopTime: '2026-10-04T20:15:00.000Z',
      target: 'https://www.joyn.de/live-tv/tele5',
    })

    const result = resolveDetailTvAiring({
      ...movie,
      liveAvailability: {
        waipu: { providerId: 'waipu', airings: [waipu], nextAiring: waipu },
        joyn: { providerId: 'joyn', airings: [joyn], nextAiring: joyn },
      },
    }, { now: Date.parse('2026-10-04T17:00:00.000Z') })

    expect(result.providerIds).toEqual(['joyn', 'waipu'])
    expect(result.playbackRoutes.map((route) => route.providerId).sort()).toEqual(['joyn', 'waipu'])
  })

  it('liefert ohne noch gültige Ausstrahlung null', () => {
    const expired = airing({
      providerId: 'joyn',
      startTime: '2026-10-04T16:00:00.000Z',
      stopTime: '2026-10-04T18:00:00.000Z',
      target: 'https://www.joyn.de/live-tv/tele5',
    })

    expect(resolveDetailTvAiring({
      ...movie,
      liveAvailability: {
        joyn: { providerId: 'joyn', airings: [expired], nextAiring: expired },
      },
    }, { now: Date.parse('2026-10-04T18:00:01.000Z') })).toBeNull()
  })

  it('formatiert nur Datum, Uhrzeit und Sender ohne „Im TV:“', () => {
    const value = formatDetailTvAiring({
      stationName: 'TELE 5',
      startTime: '2026-10-04T18:15:00.000Z',
    })

    expect(value).toBe('Sonntag, 4. Oktober · 20:15 Uhr · TELE 5')
    expect(value).not.toContain('Im TV:')
  })
})
