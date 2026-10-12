export function stationIdForProvider(airing, providerId) {
  return String(airing?.providerStationIds?.[providerId]
    || (providerId === 'joyn' ? airing?.sourceStationId : null)
    || airing?.stationId || airing?.canonicalStationId || '')
}

// Build sets once per selection, never per poster/airing.
export function createLiveProviderFilter({
  enabledProviderIds = null,
  activeWaipuStationIds = null,
  activeJoynStationIds = null,
  disabledWaipuStationIds = [],
  disabledJoynStationIds = [],
} = {}) {
  const enabled = Array.isArray(enabledProviderIds) ? new Set(enabledProviderIds) : null
  const active = {
    waipu: Array.isArray(activeWaipuStationIds) ? new Set(activeWaipuStationIds.map(String)) : null,
    joyn: Array.isArray(activeJoynStationIds) ? new Set(activeJoynStationIds.map(String)) : null,
  }
  const disabled = { waipu: new Set(disabledWaipuStationIds.map(String)), joyn: new Set(disabledJoynStationIds.map(String)) }
  return (providerId, airing) => {
    if (enabled && !enabled.has(providerId)) return false
    const stationId = stationIdForProvider(airing, providerId)
    if (active[providerId]) return active[providerId].has(stationId)
    return !disabled[providerId]?.has(stationId)
  }
}
