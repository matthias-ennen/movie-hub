import { describe, expect, it } from 'vitest'
import {
  addJoynPilotRouteToBroadcastEvent,
  addJoynPilotRoutes,
} from '../src/sources/joyn/joynPlaybackOverlay.js'
import { PLAYBACK_ROUTE_QUALITY } from '../src/sources/playbackRouteQuality.js'

function broadcast(channelId = 'pro7') {
  return {
    kind: 'broadcast',
    eventId: 'event-1',
    titleRef: { mediaType: 'movie', tmdbId: 11 },
    channelId,
    channelName: channelId === 'pro7' ? 'ProSieben' : 'Unbekannt',
    startAt: '2026-09-26T18:00:00Z',
    endAt: '2026-09-26T20:00:00Z',
    playbackRoutes: [{
      providerId: 'waipu',
      mode: 'APP_DEEP_LINK',
      target: 'https://app.waipu.tv/epgdetails/pro7/program-1',
    }],
    sourceRefs: [{
      sourceId: 'waipu',
      externalId: 'program-1',
      observedAt: '2026-09-26T12:00:00Z',
      expiresAt: '2026-09-26T20:00:00Z',
    }],
  }
}

describe('Joyn pilot playback overlay', () => {
  it('adds Joyn as a separate web-fallback route on a known neutral event', () => {
    const result = addJoynPilotRouteToBroadcastEvent(broadcast(), {
      verifiedAt: '2026-09-26T12:00:00Z',
    })

    expect(result.added).toBe(true)
    expect(result.quality).toBe(PLAYBACK_ROUTE_QUALITY.WEB_FALLBACK)
    expect(result.event.playbackRoutes.map((route) => route.providerId).sort())
      .toEqual(['joyn', 'waipu'])
    expect(result.event.playbackRoutes.find((route) => route.providerId === 'joyn'))
      .toMatchObject({
        mode: 'WEB_LINK',
        target: 'https://www.joyn.de/live-tv/prosieben',
      })
    expect(result.event.extensions.joynRouteOverlay).toMatchObject({
      source: 'joyn-public-link-inventory',
      stationSlug: 'prosieben',
      quality: 'web-fallback',
      eventTimingSource: ['waipu'],
    })
  })

  it('does not fabricate Joyn coverage for an unapproved station', () => {
    const result = addJoynPilotRouteToBroadcastEvent(broadcast('unknown'))
    expect(result.added).toBe(false)
    expect(result.quality).toBeNull()
    expect(result.event.playbackRoutes).toHaveLength(1)
  })

  it('is idempotent when applied more than once', () => {
    const first = addJoynPilotRouteToBroadcastEvent(broadcast())
    const second = addJoynPilotRouteToBroadcastEvent(first.event)

    expect(second.added).toBe(false)
    expect(second.event.playbackRoutes.filter((route) => route.providerId === 'joyn')).toHaveLength(1)
  })

  it('can enrich a mixed event list without changing title identity', () => {
    const results = addJoynPilotRoutes([broadcast('pro7'), broadcast('unknown')])
    expect(results[0].event.titleRef).toEqual({ mediaType: 'movie', tmdbId: 11 })
    expect(results[1].event.titleRef).toEqual({ mediaType: 'movie', tmdbId: 11 })
  })
})
