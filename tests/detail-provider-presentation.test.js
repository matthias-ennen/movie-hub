import { describe, expect, it } from 'vitest'
import { buildDetailLiveProviderEntries, buildDetailStreamingProviderIds } from '../src/components/detailProviderPresentation.js'

describe('detail live provider presentation', () => {
  it('keeps a live provider visible even when no exact playback route exists', () => {
    const entries = buildDetailLiveProviderEntries({
      providerIds: ['waipu', 'joyn', 'netzkino'],
      liveProviderIds: ['waipu', 'joyn'],
    }, {
      waipu: { id: 'waipu' },
      joyn: { id: 'joyn' },
      netzkino: { id: 'netzkino' },
    }, {
      waipu: { providerId: 'waipu', target: 'https://app.waipu.tv/example' },
    })

    expect(entries).toEqual([
      { providerId: 'waipu', canLaunch: true },
      { providerId: 'joyn', canLaunch: false },
    ])
  })

  it('still respects the enabled provider set', () => {
    const entries = buildDetailLiveProviderEntries({
      providerIds: ['waipu', 'joyn'],
      liveProviderIds: ['waipu', 'joyn'],
    }, {
      joyn: { id: 'joyn' },
    }, {
      waipu: { providerId: 'waipu', target: 'https://app.waipu.tv/example' },
      joyn: { providerId: 'joyn', target: 'https://www.joyn.de/example' },
    })

    expect(entries).toEqual([
      { providerId: 'joyn', canLaunch: true },
    ])
  })
  it('keeps TMDB Joyn visible as streaming when Joyn is not part of the concrete TV airing', () => {
    const streamingProviderIds = buildDetailStreamingProviderIds({
      providerIds: ['joyn', 'prime', 'netzkino'],
      tmdbProviderIds: ['joyn', 'prime', 'netzkino'],
      liveProviderIds: [],
    }, {
      joyn: { id: 'joyn' },
      prime: { id: 'prime' },
      netzkino: { id: 'netzkino' },
    }, [
      { providerId: 'waipu', canLaunch: true },
    ])

    expect(streamingProviderIds).toEqual(['joyn', 'prime', 'netzkino'])
  })

  it('does not show Joyn twice when the concrete TV airing already uses Joyn', () => {
    const streamingProviderIds = buildDetailStreamingProviderIds({
      providerIds: ['joyn', 'prime'],
      tmdbProviderIds: ['joyn', 'prime'],
    }, {
      joyn: { id: 'joyn' },
      prime: { id: 'prime' },
    }, [
      { providerId: 'joyn', canLaunch: true },
    ])

    expect(streamingProviderIds).toEqual(['prime'])
  })
})
