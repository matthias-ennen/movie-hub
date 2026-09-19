import { WAIPU_LIVE_CATALOG_VERSION } from './waipuLiveCatalog.js'

export const WAIPU_LIVE_INDEX_URL = '/waipu-live/index.json'
export const WAIPU_LIVE_STATIONS_URL = '/waipu-live/stations.json'
export const WAIPU_TV_LOAD_CONCURRENCY = 4

const stationShardCache = new Map()
const STATION_SHARD_CACHE_MS = 5 * 60 * 1_000

function safeStationId(value) {
  const id = String(value || '').trim()
  return /^[a-zA-Z0-9._-]{1,128}$/.test(id) ? id : null
}

function mediaType(value) {
  if (value === 'series' || value === 'tv') return 'series'
  if (value === 'movie') return 'movie'
  return null
}

function titleKey(value) {
  const type = mediaType(value?.type ?? value?.mediaType)
  const tmdbId = Number(value?.tmdbId)
  return type && Number.isInteger(tmdbId) && tmdbId > 0 ? `${type}:${tmdbId}` : null
}

function normalizeStation(raw) {
  const id = safeStationId(raw?.id)
  const name = String(raw?.name || '').trim()
  if (!id || !name) return null
  return {
    id,
    name,
    logoTemplateUrl: String(raw?.logoTemplateUrl || '').trim() || null,
  }
}

function normalizeAiring(raw, station, now) {
  const type = mediaType(raw?.type)
  const tmdbId = Number(raw?.tmdbId)
  const start = new Date(raw?.startTime)
  const stop = new Date(raw?.stopTime)
  const seasonNumber = Number(raw?.seasonNumber)
  const episodeNumber = Number(raw?.episodeNumber)
  if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0
      || !Number.isFinite(start.getTime()) || !Number.isFinite(stop.getTime())
      || stop <= start || stop.getTime() <= now) return null
  return {
    id: String(raw?.id || `${station.id}|${raw?.programId || tmdbId}|${start.toISOString()}`),
    programId: String(raw?.programId || '').trim() || null,
    stationId: station.id,
    stationName: station.name,
    tmdbId,
    type,
    title: String(raw?.title || '').trim(),
    episodeTitle: String(raw?.episodeTitle || '').trim() || null,
    seasonNumber: Number.isInteger(seasonNumber) && seasonNumber >= 0 ? seasonNumber : null,
    episodeNumber: Number.isInteger(episodeNumber) && episodeNumber >= 0 ? episodeNumber : null,
    startTime: start.toISOString(),
    stopTime: stop.toISOString(),
    imageUrl: String(raw?.imageUrl || '').trim() || null,
  }
}

export function normalizeWaipuLiveStationCatalog(indexRaw, stationsRaw) {
  if (indexRaw?.schemaVersion !== WAIPU_LIVE_CATALOG_VERSION
      || indexRaw?.kind !== 'waipu-live-index'
      || indexRaw?.status !== 'complete'
      || stationsRaw?.schemaVersion !== WAIPU_LIVE_CATALOG_VERSION
      || stationsRaw?.kind !== 'waipu-live-stations') return null
  const stations = (Array.isArray(stationsRaw.stations) ? stationsRaw.stations : [])
    .map(normalizeStation)
    .filter(Boolean)
  if (!stations.length) return null
  return {
    status: 'ready',
    generatedAt: indexRaw.generatedAt || null,
    horizon: indexRaw.horizon || null,
    stations,
  }
}

export async function loadWaipuLiveStationCatalog({ fetchImpl = fetch } = {}) {
  try {
    const [indexResponse, stationsResponse] = await Promise.all([
      fetchImpl(WAIPU_LIVE_INDEX_URL, { cache: 'no-store' }),
      fetchImpl(WAIPU_LIVE_STATIONS_URL, { cache: 'no-store' }),
    ])
    if (!indexResponse.ok || !stationsResponse.ok) return { status: 'unavailable', stations: [] }
    return normalizeWaipuLiveStationCatalog(
      await indexResponse.json(),
      await stationsResponse.json(),
    ) || { status: 'unavailable', stations: [] }
  } catch {
    return { status: 'unavailable', stations: [] }
  }
}

export function normalizeWaipuStationShard(raw, expectedStation, { now = Date.now() } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const station = normalizeStation(expectedStation)
  if (!station || raw?.schemaVersion !== WAIPU_LIVE_CATALOG_VERSION
      || raw?.kind !== 'waipu-live-station'
      || raw?.station?.id !== station.id) return []
  return (Array.isArray(raw.airings) ? raw.airings : [])
    .map((airing) => normalizeAiring(airing, station, timestamp))
    .filter(Boolean)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
}

async function loadStationShard(station, fetchImpl, now) {
  const cacheKey = station.id
  const cached = stationShardCache.get(cacheKey)
  if (fetchImpl === fetch && cached && Date.now() - cached.loadedAt < STATION_SHARD_CACHE_MS) return cached.promise
  const request = (async () => {
    try {
      const response = await fetchImpl(`/waipu-live/stations/${encodeURIComponent(station.id)}.json`, { cache: 'no-store' })
      if (!response.ok) return []
      return normalizeWaipuStationShard(await response.json(), station, { now })
    } catch {
      return []
    }
  })()
  if (fetchImpl === fetch) stationShardCache.set(cacheKey, { loadedAt: Date.now(), promise: request })
  return request
}

export async function loadWaipuTvAirings(stations = [], {
  fetchImpl = fetch,
  now = Date.now,
  concurrency = WAIPU_TV_LOAD_CONCURRENCY,
} = {}) {
  const queue = (Array.isArray(stations) ? stations : []).map(normalizeStation).filter(Boolean)
  const results = new Array(queue.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(queue.length || 1, Number(concurrency) || 1))
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < queue.length) {
      const index = cursor
      cursor += 1
      results[index] = await loadStationShard(queue[index], fetchImpl, now)
    }
  }))
  return results.flat().sort((left, right) => left.startTime.localeCompare(right.startTime))
}

function zonedDateKey(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
  }).formatToParts(new Date(value))
  const get = (type) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function dayTitle(key, now, timeZone) {
  const midday = new Date(`${key}T12:00:00Z`)
  const today = zonedDateKey(now, timeZone)
  const tomorrowDate = new Date(now)
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
  const tomorrow = zonedDateKey(tomorrowDate, timeZone)
  const date = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC',
  }).format(midday)
  if (key === today) return `Heute · ${date}`
  if (key === tomorrow) return `Morgen · ${date}`
  return date
}

function fallbackTitle(airing, entry) {
  const type = airing.type
  const title = entry?.title || airing.title || `TMDB #${airing.tmdbId}`
  return {
    id: `waipu-${type}-${airing.tmdbId}`,
    source: 'tmdb',
    tmdbId: airing.tmdbId,
    mediaType: type === 'series' ? 'tv' : 'movie',
    type,
    title,
    originalTitle: entry?.originalTitle || title,
    description: '',
    year: entry?.year || null,
    posterUrl: entry?.posterUrl || airing.imageUrl || null,
    neutralPosterUrl: entry?.posterUrl || airing.imageUrl || null,
    backdropUrl: null,
    artwork: { posterPaths: [], heroBackdropPaths: [] },
    genre: 'TV-Programm',
    meta: type === 'series' ? 'Serie' : 'Film',
    score: '–',
    providerIds: ['waipu'],
    accent: '#657184',
    accent2: '#1c2531',
  }
}

export function buildWaipuTvRows({
  airings = [],
  titles = [],
  titleEntries = [],
  now = Date.now(),
  timeZone = 'Europe/Berlin',
} = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const titleByKey = new Map((Array.isArray(titles) ? titles : [])
    .map((title) => [titleKey(title), title])
    .filter(([key]) => key))
  const entryByKey = new Map((Array.isArray(titleEntries) ? titleEntries : [])
    .map((entry) => [entry.key || titleKey(entry), entry])
    .filter(([key]) => key))
  const groups = new Map()
  const seen = new Set()

  for (const airing of Array.isArray(airings) ? airings : []) {
    if (Date.parse(airing?.stopTime) <= timestamp) continue
    const key = titleKey(airing)
    const airingKey = `${airing.stationId}|${airing.programId || airing.tmdbId}|${airing.startTime}`
    if (!key || seen.has(airingKey)) continue
    seen.add(airingKey)
    const entry = entryByKey.get(key)
    const base = titleByKey.get(key) || fallbackTitle(airing, entry)
    const dayKey = zonedDateKey(airing.startTime, timeZone)
    if (!groups.has(dayKey)) groups.set(dayKey, [])
    groups.get(dayKey).push({
      ...base,
      id: `waipu-airing-${airingKey}`,
      providerIds: [...new Set([...(Array.isArray(base.providerIds) ? base.providerIds : []), 'waipu'])],
      tvAiring: airing,
      waipuLive: {
        nextAiring: airing,
        airingCount: entry?.airingCount || 1,
      },
    })
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, items]) => ({
      id: `tv-${key}`,
      title: dayTitle(key, timestamp, timeZone),
      variant: 'tv',
      items: items.sort((left, right) => left.tvAiring.startTime.localeCompare(right.tvAiring.startTime)
        || left.tvAiring.stationName.localeCompare(right.tvAiring.stationName, 'de')),
    }))
}

export function formatTvAiringCard(airing, {
  locale = 'de-DE',
  timeZone = 'Europe/Berlin',
} = {}) {
  const start = new Date(airing?.startTime)
  if (!Number.isFinite(start.getTime())) return null
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  }).format(start)
  return { time, stationName: String(airing?.stationName || '').trim() }
}

export function resetWaipuTvCacheForTests() {
  stationShardCache.clear()
}
