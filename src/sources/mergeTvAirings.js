export const TV_AIRING_MATCH_MAX_START_DELTA_MS = 5 * 60 * 1_000
export const TV_AIRING_MATCH_MIN_OVERLAP_RATIO = 0.8

function text(value) {
  return String(value ?? '').trim()
}

function mediaType(value) {
  if (value === 'series' || value === 'tv') return 'series'
  if (value === 'movie') return 'movie'
  return null
}

function stationIdentity(airing) {
  return text(airing?.canonicalStationId || airing?.stationId)
}

function interval(airing) {
  const start = Date.parse(airing?.startTime)
  const stop = Date.parse(airing?.stopTime)
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) return null
  return { start, stop, duration: stop - start }
}

export function tvAiringOverlapRatio(left, right) {
  const a = interval(left)
  const b = interval(right)
  if (!a || !b) return 0
  const overlap = Math.max(0, Math.min(a.stop, b.stop) - Math.max(a.start, b.start))
  return overlap / Math.max(a.duration, b.duration)
}

export function areEquivalentTvAirings(left, right, {
  maxStartDeltaMs = TV_AIRING_MATCH_MAX_START_DELTA_MS,
  minOverlapRatio = TV_AIRING_MATCH_MIN_OVERLAP_RATIO,
} = {}) {
  const leftType = mediaType(left?.type)
  const rightType = mediaType(right?.type)
  const leftTmdbId = Number(left?.tmdbId)
  const rightTmdbId = Number(right?.tmdbId)
  const leftStation = stationIdentity(left)
  const rightStation = stationIdentity(right)
  const a = interval(left)
  const b = interval(right)

  if (!leftType || !rightType || leftType !== rightType) return false
  if (!Number.isInteger(leftTmdbId) || leftTmdbId <= 0 || leftTmdbId !== rightTmdbId) return false
  if (!leftStation || leftStation !== rightStation || !a || !b) return false

  if (a.start === b.start && a.stop === b.stop) return true
  return Math.abs(a.start - b.start) <= maxStartDeltaMs
    && tvAiringOverlapRatio(left, right) >= minOverlapRatio
}

function routeKey(route) {
  return [text(route?.providerId), text(route?.mode), text(route?.target)].join('|')
}

function providerValueMap(airing, mapField, fallbackFields = []) {
  const explicit = airing?.[mapField]
  if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) {
    return Object.fromEntries(Object.entries(explicit)
      .map(([providerId, value]) => [text(providerId), text(value)])
      .filter(([providerId, value]) => providerId && value))
  }
  const providerIds = [...new Set((Array.isArray(airing?.providerIds) ? airing.providerIds : [])
    .map(text).filter(Boolean))]
  const fields = Array.isArray(fallbackFields) ? fallbackFields : [fallbackFields]
  const fallback = fields.map((field) => text(airing?.[field])).find(Boolean) || null
  return providerIds.length === 1 && fallback ? { [providerIds[0]]: fallback } : {}
}


function mergePair(previous, airing) {
  const routeMap = new Map(
    [...(previous.playbackRoutes || []), ...(Array.isArray(airing.playbackRoutes) ? airing.playbackRoutes : [])]
      .map((route) => [routeKey(route), route]),
  )
  return {
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
    providerStationIds: {
      ...providerValueMap(previous, 'providerStationIds', ['sourceStationId', 'stationId', 'canonicalStationId']),
      ...providerValueMap(airing, 'providerStationIds', ['sourceStationId', 'stationId', 'canonicalStationId']),
    },
    providerProgramIds: {
      ...providerValueMap(previous, 'providerProgramIds', ['programId']),
      ...providerValueMap(airing, 'providerProgramIds', ['programId']),
    },
  }
}

export function mergeTvAirings(...groups) {
  const merged = []
  for (const airing of groups.flatMap((group) => Array.isArray(group) ? group : [])) {
    const type = mediaType(airing?.type)
    const tmdbId = Number(airing?.tmdbId)
    const stationId = stationIdentity(airing)
    if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0 || !stationId || !interval(airing)) continue

    const matchIndex = merged.findIndex((candidate) => areEquivalentTvAirings(candidate, airing))
    if (matchIndex < 0) {
      merged.push({
        ...airing,
        stationId,
        providerIds: [...new Set(Array.isArray(airing.providerIds) ? airing.providerIds : [])],
        providerStationIds: providerValueMap(airing, 'providerStationIds', ['sourceStationId', 'stationId', 'canonicalStationId']),
        providerProgramIds: providerValueMap(airing, 'providerProgramIds', ['programId']),
        playbackRoutes: Array.isArray(airing.playbackRoutes) ? [...airing.playbackRoutes] : [],
      })
      continue
    }
    merged[matchIndex] = mergePair(merged[matchIndex], airing)
  }

  return merged.sort((left, right) => (
    text(left.startTime).localeCompare(text(right.startTime))
    || text(left.stationId).localeCompare(text(right.stationId))
    || Number(left.tmdbId) - Number(right.tmdbId)
  ))
}
