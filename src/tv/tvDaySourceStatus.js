import { isXmltvAirProviderId } from '../sources/xmltv/xmltvAirRoutes.js'

// A published direct station needs neither aggregator's station catalog.
// Disabled providers and failed siblings cannot block an otherwise usable source.
export function resolveTvDaySourceStatus({
  runtimeStatus, runtimeProviderIds = [], enabledProviderIds = [],
  waipuStatus, joynStatus, stationSelectionLoading, joynStationSelectionLoading,
  activeWaipuCount = 0, activeJoynCount = 0,
} = {}) {
  if (runtimeStatus === 'idle' || runtimeStatus === 'loading') return 'loading'
  if (runtimeStatus !== 'ready') return 'unavailable'
  const enabled = new Set(enabledProviderIds)
  if (runtimeProviderIds.some((id) => enabled.has(id) && isXmltvAirProviderId(id))) return 'ready'
  const chosen = [
    { id: 'waipu', status: waipuStatus, loading: stationSelectionLoading, count: activeWaipuCount },
    { id: 'joyn', status: joynStatus, loading: joynStationSelectionLoading, count: activeJoynCount },
  ].filter(({ id }) => enabled.has(id))
  if (chosen.some(({ status, count }) => status === 'ready' && count > 0)) return 'ready'
  if (chosen.some(({ status, loading }) => status === 'loading' || loading)) return 'loading'
  if (chosen.some(({ status }) => status === 'ready')) return 'no-stations'
  return chosen.length || enabledProviderIds.some(isXmltvAirProviderId) ? 'unavailable' : 'no-stations'
}
