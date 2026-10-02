import { selectProviderMap } from '../sources/providerLiveRoute.js'
import {
  TV_RUNTIME_DAY_KIND,
  TV_RUNTIME_HERO_KIND,
  TV_RUNTIME_SNAPSHOT_KIND,
  TV_RUNTIME_SNAPSHOT_VERSION,
} from './tvRuntimePublication.js'

export const TV_RUNTIME_INDEX_URL = '/tv-runtime/index.json'
export const TV_RUNTIME_HERO_URL = '/tv-runtime/hero.json'
export const TV_RUNTIME_DAY_CACHE_LIMIT = 3

let cachedIndex = null
let indexPromise = null
let cachedHero = null
let heroPromise = null
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

export function normalizeTvRuntimeHero(raw) {
  if (raw?.schemaVersion !== TV_RUNTIME_SNAPSHOT_VERSION
      || raw?.kind !== TV_RUNTIME_HERO_KIND
      || !Array.isArray(raw?.entries)) return null

  const entries = raw.entries
    .map((entry) => {
      const type = mediaType(entry?.type)
      const tmdbId = Number(entry?.tmdbId)
      const airings = (Array.isArray(entry?.airings) ? entry.airings : [])
        .filter((airing) => (
          Array.isArray(airing?.providerIds)
          && airing.providerIds.length > 0
          && Number.isFinite(Date.parse(airing?.startTime))
          && Number.isFinite(Date.parse(airing?.stopTime))
        ))
        .sort((left, right) => String(left.startTime).localeCompare(String(right.startTime)))
      if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0 || !airings.length) return null
      return {
        ...entry,
        id: text(entry?.id) || `tv-runtime-hero-${type}-${tmdbId}`,
        key: text(entry?.key) || `${type}:${tmdbId}`,
        type,
        mediaType: type === 'series' ? 'tv' : 'movie',
        tmdbId,
        airings,
        nextAiring: airings[0],
        airingCount: Number(entry?.airingCount) || airings.length,
      }
    })
    .filter(Boolean)

  return {
    generatedAt: text(raw.generatedAt),
    sourceTitleCount: Number(raw.sourceTitleCount) || entries.length,
    candidateLimit: Number(raw.candidateLimit) || entries.length,
    airingsPerTitleLimit: Number(raw.airingsPerTitleLimit) || null,
    count: entries.length,
    entries,
  }
}

export async function loadTvRuntimeHero({
  fetchImpl = fetch,
  force = false,
  signal = null,
} = {}) {
  const usesDefaultFetch = fetchImpl === fetch
  const sharePendingRequest = usesDefaultFetch && !signal
  if (!force && usesDefaultFetch && cachedHero) return cachedHero
  if (!force && sharePendingRequest && heroPromise) return heroPromise

  const requestOptions = signal ? { cache: 'no-store', signal } : { cache: 'no-store' }
  const request = Promise.resolve(fetchImpl(TV_RUNTIME_HERO_URL, requestOptions))
    .then((response) => {
      if (!response?.ok) throw new Error(`TV-Runtime-Hero konnte nicht geladen werden (${response?.status ?? 'unbekannt'})`)
      return response.json()
    })
    .then((payload) => {
      const normalized = normalizeTvRuntimeHero(payload)
      if (!normalized) throw new Error('TV-Runtime-Hero hat ein ungültiges Format.')
      if (usesDefaultFetch) cachedHero = normalized
      return normalized
    })
    .finally(() => {
      if (sharePendingRequest) heroPromise = null
    })

  if (sharePendingRequest) heroPromise = request
  return request
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

function stationIdForProvider(airing, providerId) {
  const providerStationIds = airing?.providerStationIds || {}
  return String(
    providerStationIds?.[providerId]
    || (providerId === 'joyn' ? airing?.sourceStationId : null)
    || airing?.stationId
    || airing?.canonicalStationId
    || '',
  )
}

function filterAiringByDisabledStations(airing, disabledWaipuIds, disabledJoynIds) {
  const providerIds = (Array.isArray(airing?.providerIds) ? airing.providerIds : [])
    .filter((providerId) => {
      const stationId = stationIdForProvider(airing, providerId)
      if (providerId === 'waipu') return !stationId || !disabledWaipuIds.has(stationId)
      if (providerId === 'joyn') return !stationId || !disabledJoynIds.has(stationId)
      return true
    })
  if (!providerIds.length) return null
  return {
    ...airing,
    providerIds,
    providerStationIds: selectProviderMap(airing?.providerStationIds, providerIds),
    providerProgramIds: selectProviderMap(airing?.providerProgramIds, providerIds),
    playbackRoutes: (Array.isArray(airing?.playbackRoutes) ? airing.playbackRoutes : [])
      .filter((route) => providerIds.includes(route?.providerId)),
  }
}

export function filterTvRuntimeHeroEntriesByStationSelection(entries = [], {
  disabledWaipuStationIds = [],
  disabledJoynStationIds = [],
} = {}) {
  const disabledWaipuIds = new Set((Array.isArray(disabledWaipuStationIds) ? disabledWaipuStationIds : []).map(String))
  const disabledJoynIds = new Set((Array.isArray(disabledJoynStationIds) ? disabledJoynStationIds : []).map(String))

  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const airings = (Array.isArray(entry?.airings) ? entry.airings : [])
        .map((airing) => filterAiringByDisabledStations(airing, disabledWaipuIds, disabledJoynIds))
        .filter(Boolean)
        .sort((left, right) => String(left?.startTime || '').localeCompare(String(right?.startTime || '')))
      if (!airings.length) return null
      return {
        ...entry,
        airings,
        nextAiring: airings[0],
        airingCount: airings.length,
      }
    })
    .filter(Boolean)
}

function heroAiringRank(airing, nowMs) {
  const start = Date.parse(airing?.startTime)
  const stop = Date.parse(airing?.stopTime)
  const onAir = Number.isFinite(start) && Number.isFinite(stop) && start <= nowMs && stop > nowMs
  const within24Hours = Number.isFinite(start) && start > nowMs && start < nowMs + 24 * 60 * 60 * 1000
  return {
    tier: onAir ? 0 : within24Hours ? 1 : 2,
    start: Number.isFinite(start) ? start : Number.MAX_SAFE_INTEGER,
    onAir,
  }
}

function heroLiveProviderIds(airings = []) {
  return [...new Set((Array.isArray(airings) ? airings : [])
    .flatMap((airing) => Array.isArray(airing?.providerIds) ? airing.providerIds : [])
    .map(String)
    .filter(Boolean))]
}

function heroProviderLive(airings, providerId) {
  const providerAirings = (Array.isArray(airings) ? airings : [])
    .filter((airing) => Array.isArray(airing?.providerIds) && airing.providerIds.includes(providerId))
  if (!providerAirings.length) return null
  return {
    airings: providerAirings,
    nextAiring: providerAirings[0],
    airingCount: providerAirings.length,
  }
}

export function buildTvRuntimeHeroItems(entries = [], {
  disabledWaipuStationIds = [],
  disabledJoynStationIds = [],
  now = Date.now(),
} = {}) {
  const nowMs = typeof now === 'function' ? Number(now()) : Number(now)
  const filtered = filterTvRuntimeHeroEntriesByStationSelection(entries, {
    disabledWaipuStationIds,
    disabledJoynStationIds,
  })

  return filtered
    .map((entry) => {
      const airings = (Array.isArray(entry?.airings) ? entry.airings : [])
        .filter((airing) => Date.parse(airing?.stopTime) > nowMs)
        .sort((left, right) => String(left?.startTime || '').localeCompare(String(right?.startTime || '')))
      if (!airings.length) return null

      const rankedAirings = [...airings].sort((left, right) => {
        const leftRank = heroAiringRank(left, nowMs)
        const rightRank = heroAiringRank(right, nowMs)
        return leftRank.tier - rightRank.tier
          || leftRank.start - rightRank.start
          || String(left?.canonicalStationId || left?.stationId || '')
            .localeCompare(String(right?.canonicalStationId || right?.stationId || ''))
      })
      const tvAiring = rankedAirings[0]
      const liveProviderIds = heroLiveProviderIds(airings)
      const tmdbProviderIds = [...new Set((Array.isArray(entry?.tmdbProviderIds) ? entry.tmdbProviderIds : [])
        .map(String)
        .filter(Boolean))]
      const item = {
        ...entry,
        id: text(entry?.id) || `tv-runtime-hero-${entry?.type}-${entry?.tmdbId}`,
        source: 'tmdb',
        mediaType: entry?.type === 'series' ? 'tv' : 'movie',
        neutralPosterUrl: text(entry?.neutralPosterUrl || entry?.posterUrl),
        neutralPosterPath: text(entry?.neutralPosterPath || entry?.posterPath),
        providerIds: [...new Set([
          ...(Array.isArray(entry?.providerIds) ? entry.providerIds : tmdbProviderIds),
          ...liveProviderIds,
        ])],
        tmdbProviderIds,
        airings,
        tvAiring,
        tvAiringOnAir: heroAiringRank(tvAiring, nowMs).onAir,
        tvLive: {
          airings,
          nextAiring: tvAiring,
          airingCount: Number(entry?.airingCount) || airings.length,
          providerIds: liveProviderIds,
        },
      }
      const waipuLive = heroProviderLive(airings, 'waipu')
      const joynLive = heroProviderLive(airings, 'joyn')
      if (waipuLive) item.waipuLive = waipuLive
      if (joynLive) item.joynLive = joynLive
      return item
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftRank = heroAiringRank(left.tvAiring, nowMs)
      const rightRank = heroAiringRank(right.tvAiring, nowMs)
      return leftRank.tier - rightRank.tier
        || Number(right?.popularity || 0) - Number(left?.popularity || 0)
        || leftRank.start - rightRank.start
        || String(left?.key || left?.id || '').localeCompare(String(right?.key || right?.id || ''))
    })
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
  cachedHero = null
  heroPromise = null
  dayCache.clear()
  dayPromises.clear()
}
