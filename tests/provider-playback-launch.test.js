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
      'https://app.waipu.tv/epgdetails/zdf/program-1',
    )
  })

  it('keeps a bound channel route as its own fallback target', () => {
    const nativeBridge = { openProviderRoute: vi.fn() }
    launchProviderPlaybackRoute({
      providerId: 'joyn',
      title: 'Film',
      route: {
        providerId: 'joyn',
        mode: 'WEB_LINK',
        scope: 'channel',
        target: 'https://www.joyn.de/play/live-tv?channel_id=one-de-hd',
      },
      fallbackUrl: 'https://www.joyn.de/play/live-tv',
      nativeBridge,
    })

    expect(nativeBridge.openProviderRoute).toHaveBeenCalledWith(
      'joyn',
      'Film',
      'WEB_LINK',
      'channel',
      'https://www.joyn.de/play/live-tv?channel_id=one-de-hd',
      'https://www.joyn.de/play/live-tv?channel_id=one-de-hd',
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

  it('passes an exact YouTube playlist video to current native PlaybackRoute, never replacing it with search', () => {
    const nativeBridge = { openProviderRoute: vi.fn() }
    expect(launchProviderPlaybackRoute({
      providerId: 'youtube',
      title: 'The Watcher',
      route: { mode: 'APP_DEEP_LINK', scope: 'title',
        target: 'https://www.youtube.com/watch?v=1uf2AMrQMk0' },
      fallbackUrl: 'https://www.youtube.com/results?search_query=The+Watcher',
      nativeBridge,
    })).toBe(true)
    expect(nativeBridge.openProviderRoute).toHaveBeenCalledWith(
      'youtube','The Watcher','APP_DEEP_LINK','title',
      'https://www.youtube.com/watch?v=1uf2AMrQMk0',
      'https://www.youtube.com/results?search_query=The+Watcher',
    )
  })

  it('preserves exact YouTube video target for older APK bridge, with search as last fallback', () => {
    const nativeBridge = {openProviderExact:vi.fn(),openExternalUrl:vi.fn()}
    expect(launchProviderPlaybackRoute({
      providerId:'youtube',title:'Die Jagd',
      route:{mode:'APP_DEEP_LINK',scope:'title',
        target:'https://youtu.be/1uf2AMrQMk0'},
      fallbackUrl:'https://www.youtube.com/results?search_query=Die+Jagd',
      nativeBridge,
    })).toBe(true)
    expect(nativeBridge.openProviderExact).toHaveBeenCalledWith(
      'youtube','Die Jagd','https://youtu.be/1uf2AMrQMk0',
      'https://www.youtube.com/results?search_query=Die+Jagd',
    )
    expect(nativeBridge.openExternalUrl).not.toHaveBeenCalled()
  })

  it('returns false when no usable route exists', () => {
    expect(launchProviderPlaybackRoute({
      providerId: 'joyn',
      route: { mode: 'WEB_LINK', target: null },
      nativeBridge: {},
    })).toBe(false)
  })
})
