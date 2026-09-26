export const JOYN_STATION_SELECTION_VERSION = 1

function stationId(value) {
  const id = String(value || '').trim()
  return /^[a-zA-Z0-9._-]{1,128}$/.test(id) ? id : null
}

export function normalizeDisabledJoynStationIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(stationId)
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'de'))
    .slice(0, 500)
}

export function normalizeJoynStationOrder(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(stationId)
    .filter(Boolean))]
    .slice(0, 500)
}

export function normalizeStoredJoynStationSelection(value, version = null, stationOrder = []) {
  return {
    disabledStationIds: normalizeDisabledJoynStationIds(value),
    stationOrder: normalizeJoynStationOrder(stationOrder),
    version: JOYN_STATION_SELECTION_VERSION,
    needsMigration: (Array.isArray(value) || Array.isArray(stationOrder))
      && Number(version) !== JOYN_STATION_SELECTION_VERSION,
  }
}

export function orderJoynStations(stations, stationOrder) {
  const available = (Array.isArray(stations) ? stations : [])
    .filter((station) => station && stationId(station.id))
  const byId = new Map(available.map((station) => [station.id, station]))
  const ordered = normalizeJoynStationOrder(stationOrder)
    .map((id) => byId.get(id))
    .filter(Boolean)
  const used = new Set(ordered.map(({ id }) => id))
  return [...ordered, ...available.filter(({ id }) => !used.has(id))]
}

export function moveJoynStation(stations, id, direction) {
  const ids = (Array.isArray(stations) ? stations : [])
    .map((station) => stationId(station?.id))
    .filter(Boolean)
  const index = ids.indexOf(stationId(id))
  const target = index + Number(direction)
  if (index < 0 || !Number.isInteger(target) || target < 0 || target >= ids.length) return ids
  ;[ids[index], ids[target]] = [ids[target], ids[index]]
  return ids
}

export function isJoynStationEnabled(disabledStationIds, id) {
  const normalizedId = stationId(id)
  return Boolean(normalizedId) && !normalizeDisabledJoynStationIds(disabledStationIds).includes(normalizedId)
}
