export const PLAYBACK_ROUTE_QUALITY = Object.freeze({
  EXACT: 'exact',
  PROVIDER_FALLBACK: 'provider-fallback',
  WEB_FALLBACK: 'web-fallback',
})

export function playbackRouteQualityLabel(value) {
  switch (value) {
    case PLAYBACK_ROUTE_QUALITY.EXACT:
      return 'Exact provider target'
    case PLAYBACK_ROUTE_QUALITY.PROVIDER_FALLBACK:
      return 'Provider app/context fallback'
    case PLAYBACK_ROUTE_QUALITY.WEB_FALLBACK:
      return 'Web fallback'
    default:
      return null
  }
}

export function inferPlaybackRouteQuality(route, {
  exactVerified = false,
  providerContextVerified = false,
} = {}) {
  if (exactVerified) return PLAYBACK_ROUTE_QUALITY.EXACT
  if (providerContextVerified) return PLAYBACK_ROUTE_QUALITY.PROVIDER_FALLBACK
  if (route?.mode === 'WEB_LINK') return PLAYBACK_ROUTE_QUALITY.WEB_FALLBACK
  return PLAYBACK_ROUTE_QUALITY.PROVIDER_FALLBACK
}
