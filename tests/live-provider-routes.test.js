import { describe, expect, it } from 'vitest'
import { resolveBoundLiveProviderRoutes } from '../src/providers/liveProviderRoutes.js'

const now = Date.parse('2026-10-01T18:00:00.000Z')

describe('bound live provider routes', () => {
  it('rebuilds the exact Waipu route from the same concrete TV airing', () => {
    const item = {
      tvAiring: {
        providerIds: ['waipu'],
        stationId: 'zdf',
        programId: 'program-123',
        startTime: '2026-10-01T19:00:00.000Z',
        stopTime: '2026-10-01T21:00:00.000Z',
        playbackRoutes: [],
      },
      waipuLive: {
        airings: [{
          stationId: 'other',
          programId: 'other-program',
          startTime: '2026-10-01T20:00:00.000Z',
          stopTime: '2026-10-01T22:00:00.000Z',
        }],
      },
    }

    expect(resolveBoundLiveProviderRoutes(item, ['waipu'], { now })).toEqual({
      waipu: {
        providerId: 'waipu',
        mode: 'APP_DEEP_LINK',
        scope: 'program',
        target: 'https://app.waipu.tv/epgdetails/zdf/program-123',
      },
    })
  })

  it('uses Waipu provider ids on a merged Joyn/Waipu airing instead of the shared programId', () => {
    const item = {
      tvAiring: {
        providerIds: ['joyn', 'waipu'],
        stationId: 'topfilme',
        programId: 'joyn-aaron-program',
        providerStationIds: {
          joyn: 'top-filme-hd',
          waipu: 'topfilme',
        },
        providerProgramIds: {
          joyn: 'joyn-aaron-program',
          waipu: 'c4c79494-1e94-5ccf-b7f2-bb5641d4f14f',
        },
        startTime: '2026-10-01T16:37:00.000Z',
        stopTime: '2026-10-01T18:15:00.000Z',
        playbackRoutes: [],
      },
    }

    expect(resolveBoundLiveProviderRoutes(item, ['joyn', 'waipu'], {
      now: Date.parse('2026-10-01T17:01:00.000Z'),
    }).waipu).toEqual({
      providerId: 'waipu',
      mode: 'APP_DEEP_LINK',
      scope: 'program',
      target: 'https://app.waipu.tv/epgdetails/topfilme/c4c79494-1e94-5ccf-b7f2-bb5641d4f14f',
    })
  })

  it('refuses the shared programId on a multi-provider airing when Waipu identity is missing', () => {
    const item = {
      tvAiring: {
        providerIds: ['joyn', 'waipu'],
        stationId: 'topfilme',
        programId: 'joyn-aaron-program',
        providerStationIds: {
          joyn: 'top-filme-hd',
          waipu: 'topfilme',
        },
        startTime: '2026-10-01T16:37:00.000Z',
        stopTime: '2026-10-01T18:15:00.000Z',
        playbackRoutes: [],
      },
    }

    expect(resolveBoundLiveProviderRoutes(item, ['joyn', 'waipu'], {
      now: Date.parse('2026-10-01T17:01:00.000Z'),
    }).waipu).toBeUndefined()
  })

  it('does not borrow another Waipu airing when the concrete airing lacks source ids', () => {
    const item = {
      tvAiring: {
        providerIds: ['waipu'],
        stationId: 'zdf',
        programId: null,
        startTime: '2026-10-01T19:00:00.000Z',
        stopTime: '2026-10-01T21:00:00.000Z',
        playbackRoutes: [],
      },
      waipuLive: {
        airings: [{
          stationId: 'other',
          programId: 'other-program',
          startTime: '2026-10-01T20:00:00.000Z',
          stopTime: '2026-10-01T22:00:00.000Z',
        }],
      },
    }

    expect(resolveBoundLiveProviderRoutes(item, ['waipu'], { now })).toEqual({})
  })

  it('does not fall back to shared programId when the provider identity contract exists but Waipu is missing', () => {
    const item = {
      tvAiring: {
        providerIds: ['waipu'],
        providerStationIds: { waipu: 'topfilme' },
        providerProgramIds: {},
        stationId: 'topfilme',
        programId: 'foreign-or-shared-program',
        startTime: '2026-10-01T16:37:00.000Z',
        stopTime: '2026-10-01T18:15:00.000Z',
        playbackRoutes: [],
      },
    }

    expect(resolveBoundLiveProviderRoutes(item, ['waipu'], {
      now: Date.parse('2026-10-01T17:01:00.000Z'),
    }).waipu).toBeUndefined()
  })

  it('keeps the legacy Waipu title fallback for non-airing detail pages', () => {
    const item = {
      waipuLive: {
        airings: [{
          stationId: 'prosieben',
          programId: 'program-456',
          startTime: '2026-10-01T19:00:00.000Z',
          stopTime: '2026-10-01T21:00:00.000Z',
        }],
      },
    }

    expect(resolveBoundLiveProviderRoutes(item, ['waipu'], { now }).waipu).toMatchObject({
      scope: 'program',
      target: 'https://app.waipu.tv/epgdetails/prosieben/program-456',
    })
  })

  it('preserves an existing Joyn channel route unchanged', () => {
    const item = {
      tvAiring: {
        providerIds: ['joyn'],
        stationId: 'one',
        startTime: '2026-10-01T19:00:00.000Z',
        stopTime: '2026-10-01T21:00:00.000Z',
        playbackRoutes: [{
          providerId: 'joyn',
          mode: 'WEB_LINK',
          scope: 'channel',
          target: 'https://www.joyn.de/play/live-tv?channel_id=one-de-hd',
        }],
      },
    }

    expect(resolveBoundLiveProviderRoutes(item, ['joyn'], { now }).joyn).toEqual({
      providerId: 'joyn',
      mode: 'WEB_LINK',
      scope: 'channel',
      target: 'https://www.joyn.de/play/live-tv?channel_id=one-de-hd',
    })
  })
})
