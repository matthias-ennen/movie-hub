/** #336 G3 – curated linear station links; never infer links from feed data. */
import { normalizePlaybackRoute } from '../sourceAdapterContract.js'
import { reviewedXmltvStation } from './xmltvStationMappings.js'

export const XMLTV_AIR_SOURCE_REVIEWED_AT = '2026-11-15T00:00:00.000Z'

export const XMLTV_AIR_PILOT_ROUTE_CANDIDATES = Object.freeze([
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

// #838 A3: exact prospective live pages; user acceptance separate from device receipt.
export const XMLTV_AIR_EXPANSION_ROUTE_CANDIDATES = Object.freeze([
  { stationId: 'arte', providerId: 'air-arte', label: 'ARTE', short: 'ARTE',
    target: 'https://www.ardmediathek.de/live/arte-deutsch/Y3JpZDovL2FydGUuZGUvTGl2ZXN0cmVhbS1BUlRF',
    requiresAuth: false, requiresSubscription: false },
  { stationId: '3sat', providerId: 'air-3sat', label: '3sat', short: '3SAT',
    target: 'https://www.zdf.de/live-tv/3sat-live-beitrag-100',
    requiresAuth: false, requiresSubscription: false },
  { stationId: 'zdfneo', providerId: 'air-zdfneo', label: 'ZDFneo', short: 'ZDFneo',
    target: 'https://www.zdf.de/live-tv/zdfneo-live-beitrag-100',
    requiresAuth: false, requiresSubscription: false },
  { stationId: 'zdfinfo', providerId: 'air-zdfinfo', label: 'ZDFinfo', short: 'ZDFinfo',
    target: 'https://www.zdf.de/live-tv/zdfinfo-live-beitrag-100',
    requiresAuth: false, requiresSubscription: false },
  { stationId: 'einsfestival', providerId: 'air-einsfestival', label: 'ONE', short: 'ONE',
    target: 'https://www.ardmediathek.de/live/one/Y3JpZDovL3dkci5kZS9CZWl0cmFnLTFlNjA0YWFlLTViODctNGMzNC04ZDhmLTg4OWI1ZjE2ZDU3Mw',
    requiresAuth: false, requiresSubscription: false },
  { stationId: 'kabeleins', providerId: 'air-kabeleins', label: 'Kabel Eins', short: 'K1',
    target: 'https://www.joyn.de/live-tv/kabel-eins',
    requiresAuth: true, requiresSubscription: false },
  { stationId: 'rtl2', providerId: 'air-rtl2', label: 'RTLZWEI', short: 'RTL2',
    target: 'https://plus.rtl.de/rtlde-rtlzwei',
    requiresAuth: true, requiresSubscription: true },
  { stationId: 'superrtl', providerId: 'air-superrtl', label: 'SUPER RTL', short: 'SRTL',
    target: 'https://plus.rtl.de/rtlde-super-rtl',
    requiresAuth: true, requiresSubscription: true },
  { stationId: 'tele5', providerId: 'air-tele5', label: 'TELE 5', short: 'TELE5',
    target: 'https://www.joyn.de/live-tv/tele-5',
    requiresAuth: true, requiresSubscription: false },
  { stationId: 'prosieben_maxx', providerId: 'air-prosieben_maxx', label: 'ProSieben MAXX', short: 'MAXX',
    target: 'https://www.joyn.de/live-tv/prosieben-maxx',
    requiresAuth: true, requiresSubscription: false },
  { stationId: 'sat1gold', providerId: 'air-sat1gold', label: 'SAT.1 GOLD', short: 'SAT1G',
    target: 'https://www.joyn.de/live-tv/sat1-gold',
    requiresAuth: true, requiresSubscription: false },
  { stationId: 'rtlnitro', providerId: 'air-rtlnitro', label: 'NITRO', short: 'NITRO',
    target: 'https://plus.rtl.de/rtlde-nitro',
    requiresAuth: true, requiresSubscription: true },
].map(entry => Object.freeze(entry)))

export const XMLTV_AIR_ROUTE_CANDIDATES = Object.freeze([
  ...XMLTV_AIR_PILOT_ROUTE_CANDIDATES, ...XMLTV_AIR_EXPANSION_ROUTE_CANDIDATES,
])

// #838 user accepted the presented links provisionally on this date. Date-only
// evidence is not an Android or Fire TV receipt. Exact URLs are immutable.
export const XMLTV_AIR_DIRECT_LINK_APPROVALS = Object.freeze([
  { stationId: 'arte', target: 'https://www.ardmediathek.de/live/arte-deutsch/Y3JpZDovL2FydGUuZGUvTGl2ZXN0cmVhbS1BUlRF', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: '3sat', target: 'https://www.zdf.de/live-tv/3sat-live-beitrag-100', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'zdfneo', target: 'https://www.zdf.de/live-tv/zdfneo-live-beitrag-100', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'zdfinfo', target: 'https://www.zdf.de/live-tv/zdfinfo-live-beitrag-100', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'einsfestival', target: 'https://www.ardmediathek.de/live/one/Y3JpZDovL3dkci5kZS9CZWl0cmFnLTFlNjA0YWFlLTViODctNGMzNC04ZDhmLTg4OWI1ZjE2ZDU3Mw', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'kabeleins', target: 'https://www.joyn.de/live-tv/kabel-eins', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'rtl2', target: 'https://plus.rtl.de/rtlde-rtlzwei', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'superrtl', target: 'https://plus.rtl.de/rtlde-super-rtl', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'tele5', target: 'https://www.joyn.de/live-tv/tele-5', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'prosieben_maxx', target: 'https://www.joyn.de/live-tv/prosieben-maxx', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'sat1gold', target: 'https://www.joyn.de/live-tv/sat1-gold', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
  { stationId: 'rtlnitro', target: 'https://plus.rtl.de/rtlde-nitro', approvedOn: '2026-11-16', result: 'provisional-direct-link-accepted' },
].map(row => Object.freeze(row)))

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

export function createXmltvAirRouteRegistry({ deviceReceipts = [], directLinkApprovals = [], now = Date.now() } = {}) {
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
    const android = checkDevice('android', false)
    const fireTv = checkDevice('fire-tv', false)
    // An explicit provisional link approval can activate an expansion route.
    // Failed or conflicting device evidence always blocks that route.
    const links = directLinkApprovals.filter(row => row?.stationId === candidate.stationId)
    const link = links[0]
    const linkAt = links.length === 1 && XMLTV_AIR_EXPANSION_ROUTE_CANDIDATES.includes(candidate) &&
      link.target === candidate.target && link.result === 'provisional-direct-link-accepted' &&
      /^\d{4}-\d{2}-\d{2}$/.test(link.approvedOn) ? Date.parse(link.approvedOn) : NaN
    const provisional = Number.isFinite(linkAt) && linkAt >= Date.parse(XMLTV_AIR_SOURCE_REVIEWED_AT) && linkAt <= Number(now)
    if (android === null || fireTv === null || (links.length > 0 && !provisional) ||
        (android === undefined && !provisional)) continue
    const verifiedDevices = Object.freeze([
      ...(android === undefined ? [] : ['android']), ...(fireTv === undefined ? [] : ['fire-tv']),
    ])
    approved.set(candidate.stationId, Object.freeze({
      ...candidate, verifiedDevices, provisional: android === undefined,
      route: Object.freeze(normalizePlaybackRoute({
        providerId: candidate.providerId, mode: 'WEB_LINK', scope: 'channel',
        target: candidate.target, geoRegion: 'DE', requiresAuth: candidate.requiresAuth,
        requiresSubscription: candidate.requiresSubscription,
        verifiedAt: new Date(android === undefined ? linkAt : (fireTv === undefined ? android : Math.min(android, fireTv))).toISOString(),
      })),
    }))
  }

  return Object.freeze({
    providers: Object.freeze([...approved.values()].map((row) => Object.freeze({
      id: row.providerId, label: row.label, short: row.short,
      source: 'special', liveTvSource: 'xmltv', defaultEnabled: true,
      aliases: Object.freeze([]), searchUrl: null,
      description: 'Linearen Sender ' + row.label + ' öffnen.',
    }))),
    approvedRoute(stationId) { return approved.get(stationId)?.route || null },
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
  directLinkApprovals: XMLTV_AIR_PUBLISH_ENABLED ? XMLTV_AIR_DIRECT_LINK_APPROVALS : [],
})
export const APPROVED_XMLTV_AIR_PROVIDERS = registry.providers
export const xmltvAirFieldsForEvent = registry.fieldsForEvent
