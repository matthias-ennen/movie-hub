import { describe, expect, it } from 'vitest'
import { mapTmdbProviderOffersToAvailabilities } from '../src/sources/adapters/tmdbWatchProviderContractMapper.js'
import { mapWaipuAiringToBroadcastEvent } from '../src/sources/adapters/waipuContractMapper.js'

describe('source adapter contract mappers', () => {
  it('maps all real TMDB monetization offer types without reducing them to providerIds', () => {
    const values = mapTmdbProviderOffersToAvailabilities({
      tmdbId: 11,
      type: 'movie',
      watchProviderLink: 'https://www.themoviedb.org/movie/11/watch',
      providerOffers: [{
        id: 'pluto',
        tmdbProviderId: 300,
        offerTypes: ['free', 'ads'],
      }, {
        id: 'prime',
        tmdbProviderId: 9,
        offerTypes: ['rent', 'buy'],
      }],
    }, {
      observedAt: '2026-09-26T10:00:00Z',
    })

    expect(values.map((value) => [value.providerId, value.accessType])).toEqual([
      ['pluto', 'free'],
      ['pluto', 'ads'],
      ['prime', 'rent'],
      ['prime', 'buy'],
    ])
    expect(values[0].extensions.tmdb.tmdbProviderId).toBe(300)
  })

  it('ignores synthetic catalog membership because it is not a real availability type', () => {
    const values = mapTmdbProviderOffersToAvailabilities({
      tmdbId: 11,
      type: 'movie',
      providerOffers: [{
        id: 'netflix',
        tmdbProviderId: null,
        offerTypes: ['catalog'],
      }],
    }, {
      observedAt: '2026-09-26T10:00:00Z',
    })

    expect(values).toEqual([])
  })

  it('maps a current Waipu airing into core, capability and extension layers', () => {
    const event = mapWaipuAiringToBroadcastEvent({
      tmdbId: 667739,
      type: 'movie',
    }, {
      programId: 'program-1',
      seriesId: null,
      stationId: 'prosieben',
      stationName: 'ProSieben',
      startTime: '2026-09-26T18:15:00Z',
      stopTime: '2026-09-26T20:15:00Z',
      imageUrl: 'https://example.test/poster.jpg',
      recordingAvailable: true,
      recordingRestrictions: { fastForward: false },
    }, {
      observedAt: '2026-09-26T10:00:00Z',
      playbackTarget: 'https://app.waipu.tv/epgdetails/example',
      verifiedAt: '2026-09-26T09:00:00Z',
    })

    expect(event).toMatchObject({
      kind: 'broadcast',
      titleRef: { mediaType: 'movie', tmdbId: 667739 },
      channelId: 'prosieben',
      capabilities: {
        recording: { available: true },
      },
      extensions: {
        waipu: {
          programId: 'program-1',
          recordingRestrictions: { fastForward: false },
        },
      },
    })
    expect(event.playbackRoutes[0]).toMatchObject({
      providerId: 'waipu',
      mode: 'APP_DEEP_LINK',
    })
  })

  it('does not require optional Waipu capabilities', () => {
    const event = mapWaipuAiringToBroadcastEvent({
      tmdbId: 11,
      type: 'movie',
    }, {
      programId: 'program-2',
      stationId: 'zdf',
      stationName: 'ZDF',
      startTime: '2026-09-27T18:15:00Z',
      stopTime: '2026-09-27T20:00:00Z',
    }, {
      observedAt: '2026-09-26T10:00:00Z',
    })

    expect(event.capabilities).toEqual({})
    expect(event.playbackRoutes).toEqual([])
  })
})
