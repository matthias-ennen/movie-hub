import { describe, expect, it } from 'vitest'
import { resolveProviderPresentation } from '../src/providers/providerPresentation.js'

describe('provider presentation policy', () => {
  it('uses title-wide evidence for normal title surfaces', () => {
    const result = resolveProviderPresentation({
      tmdbProviderIds: ['netflix'],
      liveAvailability: {
        waipu: { providerId: 'waipu' },
        joyn: { providerId: 'joyn' },
      },
    }, { context: 'title', hasMovieHub: true })

    expect(result.providerIds).toEqual(['netflix', 'waipu', 'joyn'])
    expect(result.includeMovieHub).toBe(true)
  })

  it('does not treat a TMDB-only provider as a live provider', () => {
    const result = resolveProviderPresentation({
      tmdbProviderIds: ['joyn'],
    }, { context: 'title' })

    expect(result.providerIds).toEqual(['joyn'])
    expect(result.liveProviderIds).toEqual([])
  })

  it('keeps legacy live evidence visible until old title data has refreshed', () => {
    const result = resolveProviderPresentation({
      joynLive: { providerId: 'joyn' },
      waipuLive: { providerId: 'waipu' },
    }, { context: 'title' })

    expect(result.liveProviderIds).toEqual(['waipu', 'joyn'])
    expect(result.providerIds).toEqual(['waipu', 'joyn'])
  })

  it('uses only the concrete airing live providers for TV-airing surfaces', () => {
    const result = resolveProviderPresentation({
      tmdbProviderIds: ['netflix'],
      liveAvailability: {
        waipu: { providerId: 'waipu' },
        joyn: { providerId: 'joyn' },
      },
      tvAiring: {
        providerIds: ['joyn'],
        playbackRoutes: [{ providerId: 'joyn', target: 'https://joyn.de/example' }],
      },
    }, { context: 'airing' })

    expect(result.providerIds).toEqual(['netflix', 'joyn'])
    expect(result.liveProviderIds).toEqual(['joyn'])
    expect(result.playbackRoutes.map((route) => route.providerId)).toEqual(['joyn'])
  })

  it('keeps both live providers when the concrete broadcast is merged', () => {
    const result = resolveProviderPresentation({
      tmdbProviderIds: ['netflix'],
      tvAiring: {
        providerIds: ['joyn', 'waipu'],
        playbackRoutes: [
          { providerId: 'joyn', target: 'https://joyn.de/example' },
          { providerId: 'waipu', target: 'waipu://example' },
        ],
      },
    }, { context: 'airing' })

    expect(result.providerIds).toEqual(['netflix', 'joyn', 'waipu'])
    expect(result.liveProviderIds).toEqual(['joyn', 'waipu'])
    expect(result.playbackRoutes.map((route) => route.providerId).sort()).toEqual(['joyn', 'waipu'])
  })

  it('does not infer the other live provider from title-wide availability for a concrete airing', () => {
    const result = resolveProviderPresentation({
      tmdbProviderIds: [],
      liveAvailability: {
        waipu: { providerId: 'waipu' },
        joyn: { providerId: 'joyn' },
      },
      tvAiring: {
        providerIds: ['joyn'],
      },
    }, { context: 'airing' })

    expect(result.providerIds).toEqual(['joyn'])
  })

  it('falls back to legacy provider ids only for non-live TMDB providers', () => {
    const result = resolveProviderPresentation({
      providerIds: ['netflix', 'waipu', 'joyn'],
    }, { context: 'title' })

    expect(result.tmdbProviderIds).toEqual(['netflix'])
    expect(result.providerIds).toEqual(['netflix'])
  })
})
