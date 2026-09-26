import { normalizeBroadcastEvent } from '../sourceAdapterContract.js'
import { joynPlaybackRouteForStation } from './joynPlaybackRoute.js'
import { PLAYBACK_ROUTE_QUALITY } from '../playbackRouteQuality.js'

function routeKey(route) {
  return [route?.providerId || '', route?.mode || '', route?.target || ''].join('|')
}

export function addJoynPilotRouteToBroadcastEvent(event, {
  verifiedAt = null,
} = {}) {
  const normalized = normalizeBroadcastEvent(event)
  const route = joynPlaybackRouteForStation(normalized.channelId, { verifiedAt })
  if (!route) {
    return {
      event: normalized,
      added: false,
      quality: null,
    }
  }

  const routes = new Map(
    normalized.playbackRoutes.map((existing) => [routeKey(existing), existing]),
  )
  const key = routeKey(route)
  const added = !routes.has(key)
  routes.set(key, route)

  return {
    event: normalizeBroadcastEvent({
      ...normalized,
      playbackRoutes: [...routes.values()],
    }),
    added,
    quality: PLAYBACK_ROUTE_QUALITY.WEB_FALLBACK,
  }
}

export function addJoynPilotRoutes(events = [], options = {}) {
  return (Array.isArray(events) ? events : []).map((event) => (
    addJoynPilotRouteToBroadcastEvent(event, options)
  ))
}
