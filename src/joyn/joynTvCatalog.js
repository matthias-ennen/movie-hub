export const JOYN_LIVE_CATALOG_VERSION = 1
export const JOYN_LIVE_INDEX_URL = '/joyn-live/index.json'
export const JOYN_LIVE_STATIONS_URL = '/joyn-live/stations.json'

function safeStationId(value) {
  const id = String(value || '').trim()
  return /^[a-zA-Z0-9._-]{1,128}$/.test(id) ? id : null
}

function normalizeStation(raw) {
  const id = safeStationId(raw?.id ?? raw?.joynId)
  const name = String(raw?.name ?? raw?.title ?? '').trim()
  if (!id || !name) return null
  return {
    id,
    name,
    canonicalId: safeStationId(raw?.canonicalId),
    logoUrl: String(raw?.logoUrl || '').trim() || null,
    brandId: String(raw?.brandId || '').trim() || null,
  }
}

export function normalizeJoynLiveStationCatalog(indexRaw, stationsRaw) {
  if (indexRaw?.schemaVersion !== JOYN_LIVE_CATALOG_VERSION
      || indexRaw?.kind !== 'joyn-live-index'
      || indexRaw?.status !== 'complete'
      || stationsRaw?.schemaVersion !== JOYN_LIVE_CATALOG_VERSION
      || stationsRaw?.kind !== 'joyn-live-stations') return null

  const stations = (Array.isArray(stationsRaw.stations) ? stationsRaw.stations : [])
    .map(normalizeStation)
    .filter(Boolean)

  if (!stations.length) return null

  const days = (Array.isArray(indexRaw.days) ? indexRaw.days : [])
    .map((day) => ({ key: String(day?.key || ''), count: Number(day?.count) }))
    .filter(({ key, count }) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isInteger(count) && count >= 0)
    .sort((left, right) => left.key.localeCompare(right.key))

  return {
    status: 'ready',
    generatedAt: indexRaw.generatedAt || null,
    horizon: indexRaw.horizon || null,
    stations,
    days,
  }
}

export async function loadJoynLiveStationCatalog({ fetchImpl = fetch } = {}) {
  try {
    const [indexResponse, stationsResponse] = await Promise.all([
      fetchImpl(JOYN_LIVE_INDEX_URL, { cache: 'no-store' }),
      fetchImpl(JOYN_LIVE_STATIONS_URL, { cache: 'no-store' }),
    ])
    if (!indexResponse.ok || !stationsResponse.ok) return { status: 'unavailable', stations: [], days: [] }
    return normalizeJoynLiveStationCatalog(
      await indexResponse.json(),
      await stationsResponse.json(),
    ) || { status: 'unavailable', stations: [], days: [] }
  } catch {
    return { status: 'unavailable', stations: [], days: [] }
  }
}

const JOYN_TV_LOAD_CONCURRENCY = 4
const JOYN_TV_PERIOD_ALL = '14-days'
const dayShardCache = new Map()
const DAY_SHARD_CACHE_MS = 5 * 60 * 1_000

function mediaType(value) {
  if (value === 'series' || value === 'tv') return 'series'
  if (value === 'movie') return 'movie'
  return null
}

function normalizeJoynAiring(raw, stationById, now) {
  const sourceStationId = safeStationId(raw?.stationId)
  const station = stationById.get(sourceStationId)
  const type = mediaType(raw?.type)
  const tmdbId = Number(raw?.tmdbId)
  const startTime = String(raw?.startTime || '').trim()
  const stopTime = String(raw?.stopTime || '').trim()
  if (!station || !type || !Number.isInteger(tmdbId) || tmdbId <= 0
      || !startTime || !stopTime || Date.parse(stopTime) <= now) return null

  return {
    id: String(raw?.id || `joyn|${sourceStationId}|${raw?.programId || tmdbId}|${startTime}`),
    tmdbId,
    type,
    title: String(raw?.title || '').trim(),
    stationId: station.canonicalId || `joyn.${sourceStationId}`,
    sourceStationId,
    stationName: station.name,
    programId: String(raw?.programId || '').trim() || null,
    startTime,
    stopTime,
    playbackRoutes: Array.isArray(raw?.playbackRoutes) ? raw.playbackRoutes : [],
    providerIds: ['joyn'],
    episode: raw?.episode || null,
    joyn: {
      stationId: sourceStationId,
      canonicalStationId: station.canonicalId || null,
    },
  }
}

export function normalizeJoynDayShard(raw, expectedKey, stations = [], { now = Date.now() } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const key = String(expectedKey || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)
      || raw?.schemaVersion !== JOYN_LIVE_CATALOG_VERSION
      || raw?.kind !== 'joyn-live-day'
      || raw?.key !== key) return []

  const stationById = new Map((Array.isArray(stations) ? stations : [])
    .map(normalizeStation)
    .filter(Boolean)
    .map((station) => [station.id, station]))

  return (Array.isArray(raw.airings) ? raw.airings : [])
    .map((airing) => normalizeJoynAiring(airing, stationById, timestamp))
    .filter(Boolean)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
}

async function loadDayShard(key, stations, fetchImpl, now) {
  const cached = dayShardCache.get(key)
  if (fetchImpl === fetch && cached && Date.now() - cached.loadedAt < DAY_SHARD_CACHE_MS) return cached.promise
  const request = (async () => {
    try {
      const response = await fetchImpl(`/joyn-live/days/${key}.json`, { cache: 'no-store' })
      if (!response.ok) return []
      return normalizeJoynDayShard(await response.json(), key, stations, { now })
    } catch {
      return []
    }
  })()
  if (fetchImpl === fetch) dayShardCache.set(key, { loadedAt: Date.now(), promise: request })
  return request
}

async function loadConcurrent(values, concurrency, loader) {
  const results = Array(values.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(values.length || 1, Number(concurrency) || 1))
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await loader(values[index])
    }
  }))
  return results.flat()
}

export async function loadJoynTvAirings(stations = [], {
  fetchImpl = fetch,
  now = Date.now,
  concurrency = JOYN_TV_LOAD_CONCURRENCY,
  periodId = null,
  availableDays = [],
} = {}) {
  const queue = (Array.isArray(stations) ? stations : []).map(normalizeStation).filter(Boolean)
  const enabledIds = new Set(queue.map(({ id }) => id))
  const dayKeys = [...new Set((Array.isArray(availableDays) ? availableDays : [])
    .map((day) => typeof day === 'string' ? day : day?.key)
    .map(String)
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)))]
    .sort()

  const requestedKeys = periodId === JOYN_TV_PERIOD_ALL
    ? dayKeys
    : String(periodId || '').startsWith('day:')
      ? dayKeys.filter((key) => `day:${key}` === periodId)
      : dayKeys

  const airings = await loadConcurrent(requestedKeys, concurrency, (key) => (
    loadDayShard(key, queue, fetchImpl, now)
  ))
  return airings
    .filter((airing) => enabledIds.has(String(airing?.sourceStationId || '')))
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
}
