import { describe, expect, it } from 'vitest'
import {
  PLAYBACK_ROUTE_QUALITY,
  inferPlaybackRouteQuality,
} from '../src/sources/playbackRouteQuality.js'

describe('playback route quality', () => {
  it('keeps transport mode separate from user-facing quality', () => {
    expect(inferPlaybackRouteQuality({ mode: 'WEB_LINK' }))
      .toBe(PLAYBACK_ROUTE_QUALITY.WEB_FALLBACK)

    expect(inferPlaybackRouteQuality({ mode: 'WEB_LINK' }, { providerContextVerified: true }))
      .toBe(PLAYBACK_ROUTE_QUALITY.PROVIDER_FALLBACK)

    expect(inferPlaybackRouteQuality({ mode: 'APP_DEEP_LINK' }, { exactVerified: true }))
      .toBe(PLAYBACK_ROUTE_QUALITY.EXACT)
  })
})
