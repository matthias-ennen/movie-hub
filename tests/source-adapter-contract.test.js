import { describe, expect, it } from 'vitest'
import {
  SOURCE_ADAPTER_CONTRACT_VERSION,
  deriveProviderIds,
  exactBroadcastEventKey,
  normalizeAvailability,
  normalizeBroadcastEvent,
  normalizeCapabilities,
  normalizeExtensions,
  normalizeSourceEnvelope,
} from '../src/sources/sourceAdapterContract.js'

describe('source adapter contract', () => {
  it('keeps time-independent availability separate from broadcasts', () => {
    const availability = normalizeAvailability({
      availabilityId: 'tmdb:movie:11:netflix:flatrate:DE',
      titleRef: { mediaType: 'movie', tmdbId: 11 },
      providerId: 'netflix',
      region: 'de',
      accessType: 'flatrate',
      playbackRoutes: [{
        providerId: 'netflix',
        mode: 'WEB_LINK',
        target: 'https://www.netflix.com/search?q=Star%20Wars',
      }],
      sourceRefs: [{
        sourceId: 'tmdb-watch-providers',
        externalId: '11',
        observedAt: '2026-09-26T10:00:00Z',
      }],
    })

    expect(availability).toMatchObject({
      kind: 'availability',
      providerId: 'netflix',
      region: 'DE',
      accessType: 'flatrate',
      titleRef: { mediaType: 'movie', tmdbId: 11 },
    })
    expect(availability).not.toHaveProperty('startAt')
  })

  it('allows one neutral broadcast event to carry multiple provider routes', () => {
    const event = normalizeBroadcastEvent({
      eventId: 'prosieben:2026-09-26T18:15:00Z:movie:667739',
      titleRef: { mediaType: 'movie', tmdbId: 667739 },
      channelId: 'prosieben',
      channelName: 'ProSieben',
      startAt: '2026-09-26T18:15:00Z',
      endAt: '2026-09-26T20:15:00Z',
      playbackRoutes: [
        {
          providerId: 'waipu',
          mode: 'APP_DEEP_LINK',
          target: 'https://app.waipu.tv/epgdetails/example',
          requiresSubscription: true,
        },
        {
          providerId: 'joyn',
          mode: 'WEB_LINK',
          target: 'https://www.joyn.de/live-tv',
          adSupported: true,
        },
      ],
      sourceRefs: [
        { sourceId: 'waipu-epg', externalId: 'program-1', observedAt: '2026-09-26T10:00:00Z' },
        { sourceId: 'joyn-epg', externalId: 'event-2', observedAt: '2026-09-26T10:01:00Z' },
      ],
    })

    expect(event.kind).toBe('broadcast')
    expect(event.playbackRoutes.map((route) => route.providerId)).toEqual(['waipu', 'joyn'])
    expect(exactBroadcastEventKey(event))
      .toBe('movie:667739|prosieben|2026-09-26T18:15:00.000Z|2026-09-26T20:15:00.000Z')
  })

  it('derives legacy providerIds without losing the richer contract', () => {
    const availability = {
      availabilityId: 'pluto:movie:11:ads',
      titleRef: { mediaType: 'movie', tmdbId: 11 },
      providerId: 'pluto',
      region: 'DE',
      accessType: 'ads',
      sourceRefs: [{ sourceId: 'tmdb-watch-providers', observedAt: '2026-09-26T10:00:00Z' }],
    }
    const broadcast = {
      eventId: 'zdf:movie:11',
      titleRef: { mediaType: 'movie', tmdbId: 11 },
      channelId: 'zdf',
      channelName: 'ZDF',
      startAt: '2026-09-27T18:15:00Z',
      endAt: '2026-09-27T20:00:00Z',
      playbackRoutes: [{
        providerId: 'zdf',
        mode: 'WEB_LINK',
        target: 'https://www.zdf.de/live-tv',
      }],
      sourceRefs: [{ sourceId: 'zdf-program', observedAt: '2026-09-26T10:00:00Z' }],
    }

    expect(deriveProviderIds({
      availabilities: [availability],
      broadcastEvents: [broadcast],
    })).toEqual(['pluto', 'zdf'])
  })

  it('keeps optional capabilities and source-specific extensions without making them mandatory', () => {
    const event = normalizeBroadcastEvent({
      eventId: 'waipu:program-1',
      titleRef: { mediaType: 'series', tmdbId: 123 },
      channelId: 'zdf',
      channelName: 'ZDF',
      startAt: '2026-09-27T18:00:00Z',
      endAt: '2026-09-27T19:00:00Z',
      capabilities: {
        recording: true,
        replay: { available: true, availableUntil: '2026-09-30T19:00:00Z' },
      },
      extensions: {
        waipu: {
          programId: 'program-1',
          seriesId: 'series-7',
          recordingRestrictions: { fastForward: false },
        },
      },
    })

    expect(event.capabilities.recording).toEqual({ available: true })
    expect(event.capabilities.replay.available).toBe(true)
    expect(event.extensions.waipu.programId).toBe('program-1')

    const minimal = normalizeBroadcastEvent({
      eventId: 'minimal',
      titleRef: { mediaType: 'movie', tmdbId: 11 },
      channelId: 'zdf',
      channelName: 'ZDF',
      startAt: '2026-09-27T18:00:00Z',
      endAt: '2026-09-27T19:00:00Z',
    })
    expect(minimal.capabilities).toEqual({})
    expect(minimal.extensions).toEqual({})
  })

  it('validates capability names and extension namespaces', () => {
    expect(normalizeCapabilities({ subtitles: { available: true, languages: ['de'] } }))
      .toEqual({ subtitles: { available: true, languages: ['de'] } })
    expect(normalizeExtensions({ joyn: { channelSlug: 'prosieben' } }))
      .toEqual({ joyn: { channelSlug: 'prosieben' } })

    expect(() => normalizeCapabilities({ madeUpCapability: true }))
      .toThrow(/Unknown capability/)
    expect(() => normalizeExtensions({ 'bad namespace': { value: 1 } }))
      .toThrow(/Extension namespace is invalid/)
  })

  it('validates a versioned source envelope and rejects an unknown version', () => {
    const envelope = normalizeSourceEnvelope({
      contractVersion: SOURCE_ADAPTER_CONTRACT_VERSION,
      sourceId: 'fixture-source',
      sourceGenerationId: 'generation-1',
      generatedAt: '2026-09-26T10:00:00Z',
      fetchedAt: '2026-09-26T09:59:00Z',
      sourceStatus: 'healthy',
      records: [],
    })
    expect(envelope.contractVersion).toBe(1)

    expect(() => normalizeSourceEnvelope({
      ...envelope,
      contractVersion: 2,
    })).toThrow(/Unsupported source adapter contract version/)
  })

  it('rejects malformed time windows and unknown access types', () => {
    expect(() => normalizeBroadcastEvent({
      eventId: 'bad',
      titleRef: { mediaType: 'movie', tmdbId: 11 },
      channelId: 'zdf',
      channelName: 'ZDF',
      startAt: '2026-09-26T20:00:00Z',
      endAt: '2026-09-26T19:00:00Z',
    })).toThrow(/endAt must be after startAt/)

    expect(() => normalizeAvailability({
      availabilityId: 'bad',
      titleRef: { mediaType: 'movie', tmdbId: 11 },
      providerId: 'example',
      accessType: 'unknown',
    })).toThrow(/accessType is invalid/)
  })
})
