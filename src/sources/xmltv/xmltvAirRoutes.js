/** #336 G3 – curated linear station links; never infer links from feed data. */
import { normalizePlaybackRoute } from '../sourceAdapterContract.js'
import { reviewedXmltvStation } from './xmltvStationMappings.js'

export const XMLTV_AIR_SOURCE_REVIEWED_AT = '2026-11-15T00:00:00.000Z'
const DEVICES = Object.freeze(['android', 'fire-tv'])

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

// Intentionally empty until the exact URL has been exercised through MovieHub
// on both device families. An official web page is not a device test.
export const XMLTV_AIR_DEVICE_APPROVALS = Object.freeze([])
// Independent release decision: device approvals alone never publish AIR.
export const XMLTV_AIR_PUBLISH_ENABLED = false

export const isXmltvAirProviderId = (id) => XMLTV_AIR_ROUTE_CANDIDATES.some((row) => row.providerId === id)

export function createXmltvAirRouteRegistry({ deviceReceipts = [], now = Date.now() } = {}) {
  const approved = new Map()
  for (const candidate of XMLTV_AIR_ROUTE_CANDIDATES) {
    const receipts = DEVICES.map((device) => {
      const matching = deviceReceipts.filter((receipt) => receipt?.device === device &&
        receipt.stationId === candidate.stationId && receipt.target === candidate.target)
      // Duplicate/conflicting receipts must be reviewed, not picked arbitrarily.
      if (matching.length !== 1) return null
      const receipt = matching[0]
      const checked = Date.parse(receipt.checkedAt)
      return receipt.result === 'exact-channel-confirmed' && receipt.viaMovieHub === true &&
        Number.isFinite(checked) && checked >= Date.parse(XMLTV_AIR_SOURCE_REVIEWED_AT) &&
        checked <= Number(now) ? checked : null
    })
    if (receipts.some((receipt) => receipt === null)) continue
    approved.set(candidate.stationId, Object.freeze({
      ...candidate, route: Object.freeze(normalizePlaybackRoute({
        providerId: candidate.providerId, mode: 'WEB_LINK', scope: 'channel',
        target: candidate.target, geoRegion: 'DE', requiresAuth: candidate.requiresAuth,
        requiresSubscription: candidate.requiresSubscription,
        verifiedAt: new Date(Math.min(...receipts)).toISOString(),
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
