import { describe, expect, it, vi } from 'vitest'
import { launchProviderPlaybackRoute } from '../src/providers/providerPlaybackLaunch.js'

describe('provider playback launch', () => {
  it('passes the full route semantics to the current native bridge', () => {
    const nativeBridge = { openProviderRoute: vi.fn() }
    const launched = launchProviderPlaybackRoute({
      providerId: 'waipu',
      title: 'Film',
      route: {
        providerId: 'waipu',
        mode: 'APP_DEEP_LINK',
        scope: 'program',
        target: 'https://app.waipu.tv/epgdetails/zdf/program-1',
      },
      fallbackUrl: 'https://www.waipu.tv/fernsehen/',
      nativeBridge,
    })

    expect(launched).toBe(true)
    expect(nativeBridge.openProviderRoute).toHaveBeenCalledWith(
      'waipu',
      'Film',
      'APP_DEEP_LINK',
      'program',
      'https://app.waipu.tv/epgdetails/zdf/program-1',
      'https://www.waipu.tv/fernsehen/',
    )
  })

  it('keeps APP_DEEP_LINK behavior on an older native bridge', () => {
    const nativeBridge = {
      openProviderExact: vi.fn(),
      openExternalUrl: vi.fn(),
    }
    const launched = launchProviderPlaybackRoute({
      providerId: 'waipu',
      title: 'Film',
      route: {
        mode: 'APP_DEEP_LINK',
        scope: 'program',
        target: 'https://app.waipu.tv/epgdetails/zdf/program-1',
      },
      fallbackUrl: 'https://www.waipu.tv/fernsehen/',
      nativeBridge,
    })

    expect(launched).toBe(true)
    expect(nativeBridge.openProviderExact).toHaveBeenCalledOnce()
    expect(nativeBridge.openExternalUrl).not.toHaveBeenCalled()
  })

  it('does not force a WEB_LINK into a provider app on an older bridge', () => {
    const nativeBridge = {
      openProviderExact: vi.fn(),
      openExternalUrl: vi.fn(),
    }
    const launched = launchProviderPlaybackRoute({
      providerId: 'joyn',
      title: 'Film',
      route: {
        mode: 'WEB_LINK',
        scope: 'channel',
        target: 'https://www.joyn.de/live-tv/prosieben',
      },
      fallbackUrl: 'https://www.joyn.de/live-tv',
      nativeBridge,
    })

    expect(launched).toBe(true)
    expect(nativeBridge.openExternalUrl)
      .toHaveBeenCalledWith('https://www.joyn.de/live-tv/prosieben')
    expect(nativeBridge.openProviderExact).not.toHaveBeenCalled()
  })

  it('returns false when no usable route exists', () => {
    expect(launchProviderPlaybackRoute({
      providerId: 'joyn',
      route: { mode: 'WEB_LINK', target: null },
      nativeBridge: {},
    })).toBe(false)
  })
})
