import { normalizePlaybackRoute } from '../sourceAdapterContract.js'
import { joynPilotStationByWaipuId } from './joynPilotStations.js'

export function joynPlaybackRouteForStation(stationId, {
  verifiedAt = null,
} = {}) {
  const station = joynPilotStationByWaipuId(stationId)
  if (!station) return null

  return normalizePlaybackRoute({
    providerId: 'joyn',
    mode: 'WEB_LINK',
    target: station.joynUrl,
    requiresAuth: false,
    requiresSubscription: false,
    adSupported: false,
    geoRegion: 'DE',
    verifiedAt,
  })
}
