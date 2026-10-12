// The published Waipu catalog carries the reviewed common channel order.
// Joyn shares canonical IDs where a match was reviewed. Unmatched channels
// follow alphabetically; legacy account stationOrder values remain stored.
export function orderTvStations(stations = [], canonicalStations = []) {
  const ranks = new Map(canonicalStations.map((station, index) => [station.id, index]))
  return [...stations].filter((station) => station?.id).sort((left, right) => (
    (ranks.get(left.canonicalId || left.id) ?? Number.MAX_SAFE_INTEGER)
      - (ranks.get(right.canonicalId || right.id) ?? Number.MAX_SAFE_INTEGER)
    || String(left.name || left.id).localeCompare(String(right.name || right.id), 'de', { sensitivity: 'base' })
    || String(left.id).localeCompare(String(right.id))
  ))
}

export function combinedTvStationOrder(waipuStations = [], joynStations = [], canonicalStations = waipuStations) {
  return [...new Set(orderTvStations([...waipuStations, ...joynStations], canonicalStations)
    .map((station) => station.canonicalId || (waipuStations.includes(station) ? station.id : `joyn.${station.id}`)))]
}
