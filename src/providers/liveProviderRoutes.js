import { getWaipuEpgDestination } from '../data/catalog.js'
import { buildItemLiveProviderRouteSnapshot } from '../sources/liveAvailabilityIndex.js'
import { buildProviderLiveRoute } from '../sources/providerLiveRoute.js'

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
  const hasStationMap = airing?.providerStationIds
    && typeof airing.providerStationIds === 'object'
    && !Array.isArray(airing.providerStationIds)
  const hasProgramMap = airing?.providerProgramIds
    && typeof airing.providerProgramIds === 'object'
    && !Array.isArray(airing.providerProgramIds)
  const stationId = text(airing?.providerStationIds?.waipu)
    || (!hasStationMap && isWaipuOnly ? text(airing?.stationId) : null)
  const programId = text(airing?.providerProgramIds?.waipu)
    || (!hasProgramMap && isWaipuOnly ? text(airing?.programId) : null)
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
    const exactWaipuRoute = concreteAiring
      ? buildProviderLiveRoute('waipu', {
          stationId: concreteAiring.stationId,
          programId: concreteAiring.programId,
        })
      : null
    if (exactWaipuRoute) {
      snapshot.waipu = Object.freeze({ ...exactWaipuRoute })
    } else if (!item?.tvAiring) {
      const exactWaipuDestination = getWaipuEpgDestination(item?.waipuLive, { now })
      if (exactWaipuDestination) {
        snapshot.waipu = Object.freeze({
          providerId: 'waipu',
          mode: 'APP_DEEP_LINK',
          scope: 'program',
          target: exactWaipuDestination,
        })
      }
    }
  }

  return Object.freeze(snapshot)
}
