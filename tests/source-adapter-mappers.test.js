import { describe, expect, it } from 'vitest'
import { mapTmdbProviderOffersToAvailabilities } from '../src/sources/adapters/tmdbWatchProviderContractMapper.js'
import { dedupeWaipuBroadcastEvents, mapWaipuAiringToBroadcastEvent, projectBroadcastEventToWaipuAiring } from '../src/sources/adapters/waipuContractMapper.js'

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

  it('round-trips source-specific Waipu fields through the canonical event without loss', () => {
    const event = mapWaipuAiringToBroadcastEvent({
      tmdbId: 11,
      type: 'series',
    }, {
      programId: 'program-3',
      seriesId: 'series-1',
      stationId: 'zdf',
      stationName: 'ZDF',
      startTime: '2026-09-27T18:15:00Z',
      stopTime: '2026-09-27T19:00:00Z',
      seasonNumber: 2,
      episodeNumber: 7,
      episodeTitle: 'Das Leck',
      restrictions: { recordingForbidden: true },
      rerun: true,
      newTvMeta: { publicationWindows: [{ from: '2026-09-27' }] },
      trackingContentId: 'tracking-1',
    }, {
      observedAt: '2026-09-26T10:00:00Z',
    })

    expect(projectBroadcastEventToWaipuAiring(event)).toMatchObject({
      programId: 'program-3',
      seriesId: 'series-1',
      stationId: 'zdf',
      seasonNumber: 2,
      episodeNumber: 7,
      episodeTitle: 'Das Leck',
      restrictions: { recordingForbidden: true },
      rerun: true,
      newTvMeta: { publicationWindows: [{ from: '2026-09-27' }] },
      trackingContentId: 'tracking-1',
    })
  })

  it('deduplicates identical neutral broadcasts while preserving unique routes and source refs', () => {
    const base = mapWaipuAiringToBroadcastEvent({
      tmdbId: 11,
      type: 'movie',
    }, {
      programId: 'program-4',
      stationId: 'zdf',
      stationName: 'ZDF',
      startTime: '2026-09-27T18:15:00Z',
      stopTime: '2026-09-27T20:00:00Z',
    }, {
      observedAt: '2026-09-26T10:00:00Z',
      playbackTarget: 'waipu://first',
    })
    const duplicate = mapWaipuAiringToBroadcastEvent({
      tmdbId: 11,
      type: 'movie',
    }, {
      programId: 'program-4b',
      stationId: 'zdf',
      stationName: 'ZDF',
      startTime: '2026-09-27T18:15:00Z',
      stopTime: '2026-09-27T20:00:00Z',
    }, {
      observedAt: '2026-09-26T10:05:00Z',
      playbackTarget: 'waipu://second',
    })

    const forward = dedupeWaipuBroadcastEvents([duplicate, base])
    const reversed = dedupeWaipuBroadcastEvents([base, duplicate])
    expect(forward).toHaveLength(1)
    expect(reversed).toEqual(forward)

    const [merged] = forward
    expect(merged.playbackRoutes.map((route) => route.target)).toEqual([
      'waipu://first',
      'waipu://second',
    ])
    expect(merged.sourceRefs).toHaveLength(2)
    expect(projectBroadcastEventToWaipuAiring(merged).programId).toBe('program-4')
  })

  it('encodes the verified Waipu EPG target directly in the canonical PlaybackRoute', () => {
    const event = mapWaipuAiringToBroadcastEvent({
      tmdbId: 11,
      type: 'movie',
    }, {
      programId: 'program id',
      stationId: 'sender/test',
      stationName: 'Sender Test',
      startTime: '2026-09-27T18:15:00Z',
      stopTime: '2026-09-27T20:00:00Z',
    }, {
      observedAt: '2026-09-26T10:00:00Z',
    })

    expect(event.playbackRoutes[0]).toMatchObject({
      providerId: 'waipu',
      mode: 'APP_DEEP_LINK',
      target: 'https://app.waipu.tv/epgdetails/sender%2Ftest/program%20id',
      requiresSubscription: true,
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
    expect(event.playbackRoutes).toEqual([expect.objectContaining({
      providerId: 'waipu',
      mode: 'APP_DEEP_LINK',
      target: 'https://app.waipu.tv/epgdetails/zdf/program-2',
    })])
  })
})
