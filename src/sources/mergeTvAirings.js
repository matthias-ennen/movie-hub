function text(value) {
  return String(value ?? '').trim()
}

function airingKey(airing) {
  const type = airing?.type === 'series' || airing?.type === 'tv' ? 'series' : airing?.type === 'movie' ? 'movie' : null
  const tmdbId = Number(airing?.tmdbId)
  const stationId = text(airing?.stationId)
  const startTime = text(airing?.startTime)
  const stopTime = text(airing?.stopTime)
  if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0 || !stationId || !startTime || !stopTime) return null
  return [type, tmdbId, stationId, startTime, stopTime].join('|')
}

function routeKey(route) {
  return [text(route?.providerId), text(route?.mode), text(route?.target)].join('|')
}

export function mergeTvAirings(...groups) {
  const merged = new Map()
  for (const airing of groups.flatMap((group) => Array.isArray(group) ? group : [])) {
    const key = airingKey(airing)
    if (!key) continue
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, {
        ...airing,
        providerIds: [...new Set(Array.isArray(airing.providerIds) ? airing.providerIds : [])],
        playbackRoutes: Array.isArray(airing.playbackRoutes) ? [...airing.playbackRoutes] : [],
      })
      continue
    }

    const routeMap = new Map(
      [...(previous.playbackRoutes || []), ...(Array.isArray(airing.playbackRoutes) ? airing.playbackRoutes : [])]
        .map((route) => [routeKey(route), route]),
    )
    merged.set(key, {
      ...previous,
      providerIds: [...new Set([
        ...(Array.isArray(previous.providerIds) ? previous.providerIds : []),
        ...(Array.isArray(airing.providerIds) ? airing.providerIds : []),
      ])].sort(),
      playbackRoutes: [...routeMap.values()].sort((left, right) => routeKey(left).localeCompare(routeKey(right))),
      sourceStationIds: [...new Set([
        ...(Array.isArray(previous.sourceStationIds) ? previous.sourceStationIds : [previous.sourceStationId].filter(Boolean)),
        ...(Array.isArray(airing.sourceStationIds) ? airing.sourceStationIds : [airing.sourceStationId].filter(Boolean)),
      ])],
    })
  }

  return [...merged.values()].sort((left, right) => (
    text(left.startTime).localeCompare(text(right.startTime))
    || text(left.stationId).localeCompare(text(right.stationId))
    || Number(left.tmdbId) - Number(right.tmdbId)
  ))
}
