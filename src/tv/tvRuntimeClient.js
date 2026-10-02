import { selectProviderMap } from '../sources/providerLiveRoute.js'
import {
  TV_RUNTIME_DAY_KIND,
  TV_RUNTIME_SNAPSHOT_KIND,
  TV_RUNTIME_SNAPSHOT_VERSION,
} from './tvRuntimePublication.js'

export const TV_RUNTIME_INDEX_URL = '/tv-runtime/index.json'
export const TV_RUNTIME_DAY_CACHE_LIMIT = 3

let cachedIndex = null
let indexPromise = null
const dayCache = new Map()
const dayPromises = new Map()

function getCachedDay(cacheKey) {
  if (!dayCache.has(cacheKey)) return null
  const value = dayCache.get(cacheKey)
  dayCache.delete(cacheKey)
  dayCache.set(cacheKey, value)
  return value
}

function cacheDay(cacheKey, value) {
  dayCache.delete(cacheKey)
  dayCache.set(cacheKey, value)
  while (dayCache.size > TV_RUNTIME_DAY_CACHE_LIMIT) {
    const oldestKey = dayCache.keys().next().value
    dayCache.delete(oldestKey)
  }
}

function text(value) {
  const result = String(value ?? '').trim()
  return result || null
}

function mediaType(value) {
  if (value === 'series' || value === 'tv') return 'series'
  if (value === 'movie') return 'movie'
  return null
}

function validDayKey(value) {
  const key = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null
}

export function normalizeTvRuntimeIndex(raw) {
  if (raw?.schemaVersion !== TV_RUNTIME_SNAPSHOT_VERSION
      || raw?.kind !== TV_RUNTIME_SNAPSHOT_KIND
      || !Array.isArray(raw?.days)) return null
  return {
    generatedAt: text(raw.generatedAt),
    providers: Array.isArray(raw.providers) ? raw.providers.map(String).filter(Boolean) : [],
    days: raw.days
      .map((day) => ({
        key: validDayKey(day?.key),
        count: Number(day?.count) || 0,
        airingCount: Number(day?.airingCount) || 0,
      }))
      .filter((day) => day.key)
      .sort((left, right) => left.key.localeCompare(right.key)),
  }
}

export function normalizeTvRuntimeDay(raw, expectedKey = null) {
  const key = validDayKey(raw?.key)
  if (raw?.schemaVersion !== TV_RUNTIME_SNAPSHOT_VERSION
      || raw?.kind !== TV_RUNTIME_DAY_KIND
      || !key
      || (expectedKey && key !== expectedKey)
      || !Array.isArray(raw?.entries)) return null
  return {
    generatedAt: text(raw.generatedAt),
    key,
    entries: raw.entries.filter((entry) => {
      const type = mediaType(entry?.type)
      const tmdbId = Number(entry?.tmdbId)
      return type && Number.isInteger(tmdbId) && tmdbId > 0 && Array.isArray(entry?.airings)
    }),
  }
}

export async function loadTvRuntimeIndex({
  fetchImpl = fetch,
  force = false,
} = {}) {
  if (!force && fetchImpl === fetch && cachedIndex) return cachedIndex
  if (!force && fetchImpl === fetch && indexPromise) return indexPromise
  const request = Promise.resolve(fetchImpl(TV_RUNTIME_INDEX_URL, { cache: 'no-store' }))
    .then((response) => {
      if (!response?.ok) throw new Error(`TV-Runtime-Index konnte nicht geladen werden (${response?.status ?? 'unbekannt'})`)
      return response.json()
    })
    .then((payload) => {
      const normalized = normalizeTvRuntimeIndex(payload)
      if (!normalized) throw new Error('TV-Runtime-Index hat ein ungültiges Format.')
      if (fetchImpl === fetch) cachedIndex = normalized
      return normalized
    })
    .finally(() => {
      if (fetchImpl === fetch) indexPromise = null
    })
  if (fetchImpl === fetch) indexPromise = request
  return request
}

export async function loadTvRuntimeDay(key, {
  fetchImpl = fetch,
  generation = null,
  force = false,
  signal = null,
} = {}) {
  const dayKey = validDayKey(key)
  if (!dayKey) throw new Error('Ungültiger TV-Runtime-Tag.')
  const cacheKey = `${generation || 'unversioned'}:${dayKey}`
  const usesDefaultFetch = fetchImpl === fetch
  const sharePendingRequest = usesDefaultFetch && !signal

  if (!force && usesDefaultFetch) {
    const cached = getCachedDay(cacheKey)
    if (cached) return cached
  }
  if (!force && sharePendingRequest && dayPromises.has(cacheKey)) return dayPromises.get(cacheKey)

  const query = generation ? `?v=${encodeURIComponent(generation)}` : ''
  const requestOptions = signal ? { cache: 'no-store', signal } : { cache: 'no-store' }
  const request = Promise.resolve(fetchImpl(`/tv-runtime/days/${dayKey}.json${query}`, requestOptions))
    .then((response) => {
      if (!response?.ok) throw new Error(`TV-Runtime-Tag konnte nicht geladen werden (${response?.status ?? 'unbekannt'})`)
      return response.json()
    })
    .then((payload) => {
      const normalized = normalizeTvRuntimeDay(payload, dayKey)
      if (!normalized) throw new Error('TV-Runtime-Tag hat ein ungültiges Format.')
      if (usesDefaultFetch) cacheDay(cacheKey, normalized)
      return normalized
    })
    .finally(() => {
      if (sharePendingRequest) dayPromises.delete(cacheKey)
    })

  if (sharePendingRequest) dayPromises.set(cacheKey, request)
  return request
}

function enabledProviderIds(airing, activeWaipuIds, activeJoynIds) {
  const providerStationIds = airing?.providerStationIds || {}
  return (Array.isArray(airing?.providerIds) ? airing.providerIds : [])
    .filter((providerId) => {
      if (providerId === 'waipu') {
        const stationId = String(providerStationIds.waipu || airing?.stationId || '')
        return activeWaipuIds.has(stationId)
      }
      if (providerId === 'joyn') {
        const stationId = String(providerStationIds.joyn || airing?.sourceStationId || airing?.stationId || '')
        return activeJoynIds.has(stationId)
      }
      return true
    })
}

function titleFromEntry(entry) {
  const type = mediaType(entry?.type)
  const tmdbId = Number(entry?.tmdbId)
  const tmdbProviderIds = [...new Set((Array.isArray(entry?.tmdbProviderIds) ? entry.tmdbProviderIds : [])
    .map(String)
    .filter(Boolean))]
  const genreIds = (Array.isArray(entry?.genreIds) ? entry.genreIds : [])
    .map(Number)
    .filter(Number.isFinite)
  const genreNames = (Array.isArray(entry?.genreNames) ? entry.genreNames : [])
    .map(String)
    .filter(Boolean)
  return {
    id: `tv-runtime-${type}-${tmdbId}`,
    source: 'tmdb',
    tmdbId,
    type,
    mediaType: type === 'series' ? 'tv' : 'movie',
    title: text(entry?.title) || `TMDB #${tmdbId}`,
    originalTitle: text(entry?.originalTitle) || text(entry?.title) || '',
    year: Number.isFinite(Number(entry?.year)) ? Number(entry.year) : null,
    posterUrl: text(entry?.posterUrl),
    posterPath: text(entry?.posterPath),
    neutralPosterUrl: text(entry?.posterUrl),
    ageRating: Number.isFinite(Number(entry?.ageRating)) ? Number(entry.ageRating) : null,
    voteAverage: Number.isFinite(Number(entry?.voteAverage)) ? Number(entry.voteAverage) : null,
    voteCount: Number.isFinite(Number(entry?.voteCount)) ? Number(entry.voteCount) : null,
    popularity: Number.isFinite(Number(entry?.popularity)) ? Number(entry.popularity) : null,
    genres: genreIds.map((id) => ({ id })),
    genreNames,
    genre: genreNames.length ? genreNames.join(' · ') : 'TV-Programm',
    tmdbProviderIds,
    providerIds: tmdbProviderIds,
    metadataComplete: false,
  }
}

export function buildTvRuntimeSchedule(day, {
  activeWaipuStationIds = [],
  activeJoynStationIds = [],
} = {}) {
  const activeWaipuIds = new Set((Array.isArray(activeWaipuStationIds) ? activeWaipuStationIds : []).map(String))
  const activeJoynIds = new Set((Array.isArray(activeJoynStationIds) ? activeJoynStationIds : []).map(String))
  const airings = []
  const titles = []

  for (const entry of Array.isArray(day?.entries) ? day.entries : []) {
    const title = titleFromEntry(entry)
    const accepted = []
    for (const airing of Array.isArray(entry?.airings) ? entry.airings : []) {
      const providerIds = enabledProviderIds(airing, activeWaipuIds, activeJoynIds)
      if (!providerIds.length) continue
      accepted.push({
        ...airing,
        tmdbId: title.tmdbId,
        type: title.type,
        title: title.title,
        providerIds,
        providerStationIds: selectProviderMap(airing?.providerStationIds, providerIds),
        providerProgramIds: selectProviderMap(airing?.providerProgramIds, providerIds),
        playbackRoutes: (Array.isArray(airing?.playbackRoutes) ? airing.playbackRoutes : [])
          .filter((route) => providerIds.includes(route?.providerId)),
      })
    }
    if (!accepted.length) continue
    titles.push(title)
    airings.push(...accepted)
  }

  airings.sort((left, right) => (
    String(left?.startTime || '').localeCompare(String(right?.startTime || ''))
    || String(left?.stationId || '').localeCompare(String(right?.stationId || ''))
    || Number(left?.tmdbId) - Number(right?.tmdbId)
  ))

  return { airings, titles }
}

export function getTvRuntimeCacheDiagnostics() {
  return {
    dayCacheLimit: TV_RUNTIME_DAY_CACHE_LIMIT,
    dayCacheKeys: [...dayCache.keys()],
    pendingDayKeys: [...dayPromises.keys()],
  }
}

export function clearTvRuntimeCache() {
  cachedIndex = null
  indexPromise = null
  dayCache.clear()
  dayPromises.clear()
}
