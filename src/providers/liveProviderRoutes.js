import { getWaipuEpgDestination } from '../data/catalog.js'
import { buildItemLiveProviderRouteSnapshot } from '../sources/liveAvailabilityIndex.js'

function uniqueProviderIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))]
}

function text(value) {
  const result = String(value ?? '').trim()
  return result || null
}

function concreteWaipuAiring(item) {
  const airing = item?.tvAiring
  if (!airing) return null
  const providerIds = uniqueProviderIds(airing?.providerIds)
  const isWaipuOnly = providerIds.length === 1 && providerIds[0] === 'waipu'
  const stationId = text(airing?.providerStationIds?.waipu)
    || (isWaipuOnly ? text(airing?.stationId) : null)
  const programId = text(airing?.providerProgramIds?.waipu)
    || (isWaipuOnly ? text(airing?.programId) : null)
  return stationId && programId ? { ...airing, stationId, programId } : null
}


export function resolveBoundLiveProviderRoutes(item, providerIds = [], {
  now = Date.now(),
} = {}) {
  const ids = uniqueProviderIds(providerIds)
  const snapshot = {
    ...buildItemLiveProviderRouteSnapshot(item, ids, { now }),
  }

  if (ids.includes('waipu') && !snapshot.waipu) {
    const concreteAiring = concreteWaipuAiring(item)
    const waipuSource = item?.tvAiring
      ? (concreteAiring ? { airings: [concreteAiring], nextAiring: concreteAiring } : null)
      : item?.waipuLive
    const exactWaipuDestination = waipuSource
      ? getWaipuEpgDestination(waipuSource, { now })
      : null
    if (exactWaipuDestination) {
      snapshot.waipu = Object.freeze({
        providerId: 'waipu',
        mode: 'APP_DEEP_LINK',
        scope: 'program',
        target: exactWaipuDestination,
      })
    }
  }

  return Object.freeze(snapshot)
}
