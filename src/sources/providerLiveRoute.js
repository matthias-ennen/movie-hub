import { normalizePlaybackRoute } from './sourceAdapterContract.js'
import { joynPlaybackRouteForChannel } from './joyn/joynPlaybackRoute.js'

function text(value) {
  const result = String(value ?? '').trim()
  return result || null
}

export function buildProviderLiveRoute(providerId, {
  stationId = null,
  programId = null,
  verifiedAt = null,
} = {}) {
  const id = text(providerId)
  const station = text(stationId)
  const program = text(programId)

  if (id === 'waipu' && station && program) {
    return normalizePlaybackRoute({
      providerId: 'waipu',
      mode: 'APP_DEEP_LINK',
      scope: 'program',
      target: `https://app.waipu.tv/epgdetails/${encodeURIComponent(station)}/${encodeURIComponent(program)}`,
      requiresAuth: false,
      requiresSubscription: true,
      adSupported: false,
      geoRegion: 'DE',
      verifiedAt,
    })
  }

  if (id === 'joyn' && station) {
    return joynPlaybackRouteForChannel(station, { verifiedAt })
  }

  return null
}

export function ensureProviderLiveRoute(routes, providerId, ids = {}) {
  const normalized = Array.isArray(routes) ? [...routes] : []
  const id = text(providerId)
  if (!id) return normalized
  if (normalized.some((route) => text(route?.providerId) === id && text(route?.target))) return normalized

  const fallback = buildProviderLiveRoute(id, ids)
  return fallback ? [...normalized, fallback] : normalized
}
