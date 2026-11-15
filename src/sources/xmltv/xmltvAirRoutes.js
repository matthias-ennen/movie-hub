/** #336 G3 – curated linear station links; never infer links from feed data. */
import { normalizePlaybackRoute } from '../sourceAdapterContract.js'
import { reviewedXmltvStation } from './xmltvStationMappings.js'

export const XMLTV_AIR_SOURCE_REVIEWED_AT = '2026-11-15T00:00:00.000Z'

export const XMLTV_AIR_ROUTE_CANDIDATES = Object.freeze([
  { stationId: 'ard', providerId: 'air-ard', label: 'Das Erste', short: 'ARD',
    target: 'https://www.ardmediathek.de/live/Y3JpZDovL2Rhc2Vyc3RlLmRlL2xpdmUvY2xpcC9hYmNhMDdhMy0zNDc2LTQ4NTEtYjE2Mi1mZGU4ZjY0NmQ0YzQ',
    requiresAuth: false, requiresSubscription: false },
  { stationId: 'zdf', providerId: 'air-zdf', label: 'ZDF', short: 'ZDF',
    target: 'https://www.zdf.de/live-tv/zdf-live-beitrag-100',
    requiresAuth: false, requiresSubscription: false },
  { stationId: 'rtl', providerId: 'air-rtl', label: 'RTL', short: 'RTL',
    target: 'https://plus.rtl.de/rtlde-rtl',
    requiresAuth: true, requiresSubscription: true },
  { stationId: 'pro7', providerId: 'air-pro7', label: 'ProSieben', short: 'PRO7',
    target: 'https://www.joyn.de/live-tv/prosieben',
    requiresAuth: true, requiresSubscription: false },
  { stationId: 'sat1', providerId: 'air-sat1', label: 'SAT.1', short: 'SAT1',
    target: 'https://www.joyn.de/live-tv/sat1',
    requiresAuth: true, requiresSubscription: false },
  { stationId: 'vox', providerId: 'air-vox', label: 'VOX', short: 'VOX',
    target: 'https://plus.rtl.de/rtlde-vox',
    requiresAuth: true, requiresSubscription: true },
].map((entry) => Object.freeze(entry)))

// Matthias reported all six exact links working in the Android test app on
// 2026-11-15; checkedAt is the report time, not a precise playback timestamp.
// Fire TV was explicitly deferred to final acceptance of the completed app.
// Targets are literal: editing a candidate URL must never transfer approval.
export const XMLTV_AIR_DEVICE_APPROVALS = Object.freeze([
  { stationId: 'ard', device: 'android', checkedAt: '2026-11-15T14:56:15.000Z',
    target: 'https://www.ardmediathek.de/live/Y3JpZDovL2Rhc2Vyc3RlLmRlL2xpdmUvY2xpcC9hYmNhMDdhMy0zNDc2LTQ4NTEtYjE2Mi1mZGU4ZjY0NmQ0YzQ', result: 'exact-channel-confirmed', viaMovieHub: true },
  { stationId: 'zdf', device: 'android', checkedAt: '2026-11-15T14:56:15.000Z',
    target: 'https://www.zdf.de/live-tv/zdf-live-beitrag-100', result: 'exact-channel-confirmed', viaMovieHub: true },
  { stationId: 'rtl', device: 'android', checkedAt: '2026-11-15T14:56:15.000Z',
    target: 'https://plus.rtl.de/rtlde-rtl', result: 'exact-channel-confirmed', viaMovieHub: true },
  { stationId: 'pro7', device: 'android', checkedAt: '2026-11-15T14:56:15.000Z',
    target: 'https://www.joyn.de/live-tv/prosieben', result: 'exact-channel-confirmed', viaMovieHub: true },
  { stationId: 'sat1', device: 'android', checkedAt: '2026-11-15T14:56:15.000Z',
    target: 'https://www.joyn.de/live-tv/sat1', result: 'exact-channel-confirmed', viaMovieHub: true },
  { stationId: 'vox', device: 'android', checkedAt: '2026-11-15T14:56:15.000Z',
    target: 'https://plus.rtl.de/rtlde-vox', result: 'exact-channel-confirmed', viaMovieHub: true },
].map((receipt) => Object.freeze(receipt)))
// Independent release decision: device approvals alone never publish AIR.
export const XMLTV_AIR_PUBLISH_ENABLED = true

export const isXmltvAirProviderId = (id) => XMLTV_AIR_ROUTE_CANDIDATES.some((row) => row.providerId === id)

/** Shared exact station-route validation for both runtime index builders. */
export function isExactXmltvAirAiring(airing, providerId) {
  const row = XMLTV_AIR_ROUTE_CANDIDATES.find((candidate) => candidate.providerId === providerId)
  if (!row || airing?.stationId !== row.stationId || airing?.canonicalStationId !== row.stationId) return false
  const routes = airing.playbackRoutes
  return Array.isArray(routes) && routes.length === 1 && routes.every((route) =>
    route?.providerId === providerId && route.mode === 'WEB_LINK' &&
    route.scope === 'channel' && route.target === row.target)
}

export function createXmltvAirRouteRegistry({ deviceReceipts = [], now = Date.now() } = {}) {
  const approved = new Map()
  for (const candidate of XMLTV_AIR_ROUTE_CANDIDATES) {
    const checkDevice = (device, required) => {
      const matching = deviceReceipts.filter((receipt) => receipt?.device === device &&
        receipt.stationId === candidate.stationId)
      if (!matching.length && !required) return undefined
      // Duplicate, wrong-target and negative receipts never become approval.
      if (matching.length !== 1) return null
      const receipt = matching[0]
      const checked = Date.parse(receipt.checkedAt)
      return receipt.target === candidate.target && receipt.result === 'exact-channel-confirmed' &&
        receipt.viaMovieHub === true && Number.isFinite(checked) &&
        checked >= Date.parse(XMLTV_AIR_SOURCE_REVIEWED_AT) && checked <= Number(now) ? checked : null
    }
    const android = checkDevice('android', true)
    const fireTv = checkDevice('fire-tv', false)
    // Android is the route prerequisite; Fire TV is the final actual-app QA.
    // If a Fire TV test exists and failed, block that station, not just its badge.
    if (android === null || fireTv === null) continue
    approved.set(candidate.stationId, Object.freeze({
      ...candidate, verifiedDevices: Object.freeze(fireTv === undefined ? ['android'] : ['android', 'fire-tv']),
      route: Object.freeze(normalizePlaybackRoute({
        providerId: candidate.providerId, mode: 'WEB_LINK', scope: 'channel',
        target: candidate.target, geoRegion: 'DE', requiresAuth: candidate.requiresAuth,
        requiresSubscription: candidate.requiresSubscription,
        verifiedAt: new Date(fireTv === undefined ? android : Math.min(android, fireTv)).toISOString(),
      })),
    }))
  }

  return Object.freeze({
    providers: Object.freeze([...approved.values()].map((row) => Object.freeze({
      id: row.providerId, label: row.label + ' (Live-TV)', short: row.short,
      source: 'special', liveTvSource: 'xmltv', defaultEnabled: true,
      aliases: Object.freeze([]), searchUrl: null,
      description: 'Linearen Sender ' + row.label + ' öffnen.',
    }))),
    verifiedDevices(stationId) { return approved.get(stationId)?.verifiedDevices || Object.freeze([]) },
    fieldsForEvent(event) {
      const noRoute = () => ({ providerIds: [], playbackRoutes: [] })
      if (event?.kind !== 'broadcast' || !Number.isInteger(event?.titleRef?.tmdbId) ||
        event.titleRef.tmdbId <= 0 || !['movie', 'series'].includes(event.titleRef.mediaType) ||
        event.extensions?.xmltv?.timestampsExplicitlyZoned !== true) return noRoute()
      const row = approved.get(event.channelId)
      const rawStation = event.extensions?.xmltv?.sourceStationId
      if (!row || event.channelName !== row.label || !rawStation) return noRoute()
      const refs = Array.isArray(event.sourceRefs) ? event.sourceRefs : []
      const exactMapping = refs.some((ref) => {
        if (!String(ref?.sourceId || '').startsWith('xmltv:')) return false
        const sourceId = ref.sourceId.slice('xmltv:'.length)
        const mapped = reviewedXmltvStation(sourceId, rawStation)
        return mapped?.stationId === event.channelId && mapped.stationName === event.channelName &&
          String(ref.externalId || '').startsWith(rawStation + '|')
      })
      if (!exactMapping) return noRoute()
      return { providerIds: [row.providerId], providerStationIds: { [row.providerId]: row.stationId },
        playbackRoutes: [row.route] }
    },
  })
}

const registry = createXmltvAirRouteRegistry({
  deviceReceipts: XMLTV_AIR_PUBLISH_ENABLED ? XMLTV_AIR_DEVICE_APPROVALS : [],
})
export const APPROVED_XMLTV_AIR_PROVIDERS = registry.providers
export const xmltvAirFieldsForEvent = registry.fieldsForEvent
