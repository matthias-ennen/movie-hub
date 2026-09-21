import { PROVIDER_REGISTRY } from '../providers/providerRegistry.js'
import { isProviderEnabledSnapshot } from '../settings/providerSelectionRuntime.js'

export const WAIPU_VOD_URL = 'https://app.waipu.tv/waiputhek'
export const WAIPU_LIVE_URL = 'https://www.waipu.tv/fernsehen/'
export const WAIPU_EPG_DETAILS_URL = 'https://app.waipu.tv/epgdetails'

export const providerDirectory = Object.fromEntries(PROVIDER_REGISTRY.map((provider) => [
  provider.id,
  {
    label: provider.label,
    short: provider.short,
    source: provider.source,
    searchUrl: provider.searchUrl,
  },
]))

// Bestehende Komponenten greifen weiter über `providers[id]` zu. Der Proxy
// hält diese API stabil, blendet aber konto-weit deaktivierte Anbieter aus.
// Die vollständige Definition bleibt separat über providerDirectory verfügbar.
export const providers = new Proxy(providerDirectory, {
  get(target, property, receiver) {
    if (
      typeof property === 'string'
      && Object.prototype.hasOwnProperty.call(target, property)
      && !isProviderEnabledSnapshot(property)
    ) {
      return undefined
    }
    return Reflect.get(target, property, receiver)
  },
})

/**
 * Select the airing represented by a Waipu provider action. A currently
 * running airing wins over every future airing. Ties are resolved from source
 * data only so the result does not depend on input order.
 */
export function selectWaipuAiring(waipuLive, { now = Date.now() } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  if (!Number.isFinite(timestamp)) return null

  const sourceAirings = Array.isArray(waipuLive?.airings) && waipuLive.airings.length
    ? waipuLive.airings
    : [waipuLive?.nextAiring]
  const airings = sourceAirings
    .filter(Boolean)
    .filter((airing) => {
      const stationId = String(airing?.stationId || '').trim()
      const programId = String(airing?.programId || '').trim()
      const startTime = Date.parse(airing?.startTime)
      const stopTime = Date.parse(airing?.stopTime)
      return stationId && programId
        && Number.isFinite(startTime) && Number.isFinite(stopTime)
        && startTime < stopTime && stopTime > timestamp
    })
    .sort((left, right) => {
      const byStart = Date.parse(left.startTime) - Date.parse(right.startTime)
      if (byStart) return byStart
      const byStop = Date.parse(left.stopTime) - Date.parse(right.stopTime)
      if (byStop) return byStop
      const byStation = String(left.stationId).localeCompare(String(right.stationId))
      if (byStation) return byStation
      return String(left.programId).localeCompare(String(right.programId))
    })

  return airings.find((airing) => Date.parse(airing.startTime) <= timestamp) || airings[0] || null
}

export function getWaipuEpgDestination(waipuLive, options = {}) {
  const airing = selectWaipuAiring(waipuLive, options)
  if (!airing) return null
  return `${WAIPU_EPG_DETAILS_URL}/${encodeURIComponent(String(airing.stationId).trim())}/${encodeURIComponent(String(airing.programId).trim())}`
}

/**
 * A provider's own public page is the stable fallback destination. Verified
 * title-specific Waipu EPG links are selected from the preserved source airing.
 */
export function getProviderDestination(providerId, title, options = {}) {
  if (providerId === 'waipu' && options?.waipuMode === 'live') {
    if (!isProviderEnabledSnapshot('waipu')) return null
    return getWaipuEpgDestination(options.waipuLive, options) || WAIPU_LIVE_URL
  }

  const provider = providers[providerId]
  if (!provider?.searchUrl || !title) return null
  return provider.searchUrl(title)
}

// Intentionally empty. Movie Hub no longer ships hard-coded demo titles or
// demo rows. Public content must come from the generated /catalog.json; the
// user's personal TMDB/Movie-Hub data is merged independently at runtime.
export const titles = []
export const rowDefinitions = []
