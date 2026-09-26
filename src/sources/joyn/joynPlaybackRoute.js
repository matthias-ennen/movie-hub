import { normalizePlaybackRoute } from '../sourceAdapterContract.js'
import { joynPilotStationByWaipuId } from './joynPilotStations.js'

const JOYN_CHANNEL_ID_URL = 'https://www.joyn.de/play/live-tv?channel_id='

function safeBrandId(value) {
  const id = String(value || '').trim()
  return /^[a-zA-Z0-9._:-]{1,160}$/.test(id) ? id : null
}

export function joynPlaybackRouteForStation(stationId, {
  brandId = null,
  verifiedAt = null,
} = {}) {
  const station = joynPilotStationByWaipuId(stationId)
  const candidateBrandId = safeBrandId(brandId)
  const target = station?.joynUrl
    || (candidateBrandId ? `${JOYN_CHANNEL_ID_URL}${encodeURIComponent(candidateBrandId)}` : null)
  if (!target) return null

  return normalizePlaybackRoute({
    providerId: 'joyn',
    mode: 'WEB_LINK',
    target,
    requiresAuth: false,
    requiresSubscription: false,
    adSupported: false,
    geoRegion: 'DE',
    verifiedAt,
  })
}
