import { getWaipuEpgDestination } from '../data/catalog.js'
import { buildItemLiveProviderRouteSnapshot } from '../sources/liveAvailabilityIndex.js'

function uniqueProviderIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))]
}

export function resolveBoundLiveProviderRoutes(item, providerIds = [], {
  now = Date.now(),
} = {}) {
  const ids = uniqueProviderIds(providerIds)
  const snapshot = {
    ...buildItemLiveProviderRouteSnapshot(item, ids, { now }),
  }

  if (ids.includes('waipu') && !snapshot.waipu) {
    const waipuSource = item?.tvAiring
      ? { airings: [item.tvAiring], nextAiring: item.tvAiring }
      : item?.waipuLive
    const exactWaipuDestination = getWaipuEpgDestination(waipuSource, { now })
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
