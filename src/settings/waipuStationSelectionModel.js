export const WAIPU_STATION_SELECTION_VERSION = 1

function stationId(value) {
  const id = String(value || '').trim()
  return /^[a-zA-Z0-9._-]{1,128}$/.test(id) ? id : null
}

export function normalizeDisabledWaipuStationIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(stationId)
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'de'))
    .slice(0, 500)
}

export function normalizeStoredWaipuStationSelection(value, version = null) {
  return {
    disabledStationIds: normalizeDisabledWaipuStationIds(value),
    version: WAIPU_STATION_SELECTION_VERSION,
    needsMigration: Array.isArray(value) && Number(version) !== WAIPU_STATION_SELECTION_VERSION,
  }
}

export function isWaipuStationEnabled(disabledStationIds, id) {
  const normalizedId = stationId(id)
  return Boolean(normalizedId) && !normalizeDisabledWaipuStationIds(disabledStationIds).includes(normalizedId)
}
