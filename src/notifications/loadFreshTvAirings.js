import { alertTitleKey } from './titleAlertModel.js'
import {
  LIVE_AVAILABILITY_INDEX_URL,
  LIVE_AVAILABILITY_INDEX_VERSION,
  normalizeLiveAvailabilityIndex,
} from '../sources/liveAvailabilityIndex.js'

export async function loadFreshTvAirings(item, now = Date.now(), fetchImpl = fetch) {
  const response = await fetchImpl(LIVE_AVAILABILITY_INDEX_URL, { cache: 'no-store' })
  if (!response.ok) return []
  const index = await response.json()
  const generated = Date.parse(index?.generatedAt)
  if (index?.schemaVersion !== LIVE_AVAILABILITY_INDEX_VERSION
    || index?.kind !== 'moviehub-live-availability-index'
    || !Number.isFinite(generated)
    || Math.abs(now - generated) > 48 * 3600000) return []

  const entries = normalizeLiveAvailabilityIndex(index, { now })
  return entries.find((entry) => alertTitleKey(entry) === alertTitleKey(item))?.airings || []
}
