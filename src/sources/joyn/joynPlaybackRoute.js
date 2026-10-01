import { normalizePlaybackRoute } from '../sourceAdapterContract.js'

const JOYN_CHANNEL_ID_URL = 'https://www.joyn.de/play/live-tv?channel_id='

function safeJoynChannelId(value) {
  const id = String(value || '').trim()
  return /^[a-zA-Z0-9._:-]{1,160}$/.test(id) ? id : null
}

export function joynPlaybackRouteForChannel(joynChannelId, {
  verifiedAt = null,
} = {}) {
  const candidateChannelId = safeJoynChannelId(joynChannelId)
  if (!candidateChannelId) return null

  return normalizePlaybackRoute({
    providerId: 'joyn',
    mode: 'WEB_LINK',
    scope: 'channel',
    target: `${JOYN_CHANNEL_ID_URL}${encodeURIComponent(candidateChannelId)}`,
    requiresAuth: false,
    requiresSubscription: false,
    adSupported: false,
    geoRegion: 'DE',
    verifiedAt,
  })
}

/**
 * Compatibility wrapper for older callers. The canonical live target is now
 * derived exclusively from Joyn's own livestream.id, never from brandId or a
 * hand-maintained station slug.
 */
export function joynPlaybackRouteForStation(_stationId, {
  joynChannelId = null,
  verifiedAt = null,
} = {}) {
  return joynPlaybackRouteForChannel(joynChannelId, { verifiedAt })
}
