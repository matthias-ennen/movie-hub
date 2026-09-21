import { WAIPU_LIVE_CATALOG_VERSION } from './waipuLiveCatalog.js'
import {
  isTvAiringOnAir,
  isTvAiringSoon,
} from './waipuAiringStatus.js'

export {
  TV_AIRING_SOON_WINDOW_MS,
  isTvAiringOnAir,
  isTvAiringSoon,
  nextTvAiringTransition,
} from './waipuAiringStatus.js'

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
    source: 'waipu',
    programId: String(raw?.programId || '').trim() || null,
    seriesId: String(raw?.seriesId || '').trim() || null,
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

export const TV_TIME_ZONE = 'Europe/Berlin'
export const TV_DAY_START_HOUR = 6
export const TV_PERIOD_ALL = '14-days'

export const TV_GENRE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'action-adventure', title: 'Action & Abenteuer', genreIds: Object.freeze([12, 28, 10759]) }),
  Object.freeze({ id: 'comedy', title: 'Komödie', genreIds: Object.freeze([35]) }),
  Object.freeze({ id: 'crime-thriller', title: 'Krimi & Thriller', genreIds: Object.freeze([53, 80, 9648]) }),
  Object.freeze({ id: 'science-fiction-fantasy', title: 'Science-Fiction & Fantasy', genreIds: Object.freeze([14, 878, 10765]) }),
  Object.freeze({ id: 'drama-romance', title: 'Drama & Romantik', genreIds: Object.freeze([18, 10749]) }),
  Object.freeze({ id: 'family-animation', title: 'Kinder, Familie & Animation', genreIds: Object.freeze([16, 10751, 10762]) }),
  Object.freeze({ id: 'documentary', title: 'Dokumentation', genreIds: Object.freeze([99]) }),
])

function zonedParts(value, timeZone = TV_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZone,
  }).formatToParts(new Date(value))
  return Object.fromEntries(parts
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]))
}

function shiftDateKey(key, days) {
  const [year, month, day] = String(key).split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

function zonedDateTimeEpoch(key, hour, timeZone = TV_TIME_ZONE) {
  const [year, month, day] = String(key).split('-').map(Number)
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, 0, 0)
  let candidate = desiredWallClock
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(candidate, timeZone)
    const actualWallClock = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    const correction = desiredWallClock - actualWallClock
    candidate += correction
    if (correction === 0) break
  }
  return candidate
}

export function tvDayKey(value, timeZone = TV_TIME_ZONE) {
  const parts = zonedParts(value, timeZone)
  const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
  return parts.hour < TV_DAY_START_HOUR ? shiftDateKey(key, -1) : key
}

export function tvDayRange(key, timeZone = TV_TIME_ZONE) {
  return {
    start: zonedDateTimeEpoch(key, TV_DAY_START_HOUR, timeZone),
    endExclusive: zonedDateTimeEpoch(shiftDateKey(key, 1), TV_DAY_START_HOUR, timeZone),
  }
}

function shortDate(key) {
  const [year, month, day] = String(key).split('-')
  return `${day}.${month}.${year.slice(-2)}`
}

export function buildTvPeriodOptions(airings = [], {
  now = Date.now(),
  timeZone = TV_TIME_ZONE,
} = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const todayKey = tvDayKey(timestamp, timeZone)
  const tomorrowKey = shiftDateKey(todayKey, 1)
  const keys = new Set([todayKey])
  for (const airing of Array.isArray(airings) ? airings : []) {
    const start = Date.parse(airing?.startTime)
    const stop = Date.parse(airing?.stopTime)
    if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= timestamp) continue
    keys.add(tvDayKey(start, timeZone))
  }
  const sortedKeys = [...keys].filter((key) => key >= todayKey).sort()
  return [
    { id: TV_PERIOD_ALL, kind: 'all', label: '14 Tage' },
    ...sortedKeys.map((key) => ({
      id: `day:${key}`,
      kind: 'day',
      key,
      label: key === todayKey ? 'Heute' : key === tomorrowKey ? 'Morgen' : shortDate(key),
    })),
  ]
}

function finiteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function canonicalKey(item) {
  return titleKey(item) || String(item?.id || '')
}

function stableAiringIdentity(airing) {
  return `${airing?.stationId || ''}|${airing?.programId || airing?.tmdbId || ''}|${airing?.startTime || ''}`
}

function episodeKey(item) {
  const airing = item?.tvAiring || {}
  const season = Number.isInteger(airing.seasonNumber) ? airing.seasonNumber : null
  const episode = Number.isInteger(airing.episodeNumber) ? airing.episodeNumber : null
  if (season !== null || episode !== null) return `${canonicalKey(item)}:s${season ?? '-'}e${episode ?? '-'}`
  if (airing.programId) return `${canonicalKey(item)}:program:${airing.programId}`
  return `${canonicalKey(item)}:airing:${stableAiringIdentity(airing)}`
}

function attachAiring(base, airing, entry, timestamp) {
  const airingKey = stableAiringIdentity(airing)
  return {
    ...base,
    id: `waipu-airing-${airingKey}`,
    providerIds: [...new Set([...(Array.isArray(base.providerIds) ? base.providerIds : []), 'waipu'])],
    tvAiring: airing,
    tvAiringOnAir: isTvAiringOnAir(airing, timestamp),
    tvAiringSoon: isTvAiringSoon(airing, timestamp),
    waipuLive: {
      airings: [airing],
      nextAiring: airing,
      airingCount: entry?.airingCount || 1,
    },
  }
}

function buildAiringItems({ airings, titles, titleEntries, now }) {
  const titleByKey = new Map((Array.isArray(titles) ? titles : [])
    .map((title) => [titleKey(title), title])
    .filter(([key]) => key))
  const entryByKey = new Map((Array.isArray(titleEntries) ? titleEntries : [])
    .map((entry) => [entry.key || titleKey(entry), entry])
    .filter(([key]) => key))
  const seen = new Set()
  const items = []
  for (const airing of Array.isArray(airings) ? airings : []) {
    const key = titleKey(airing)
    const airingKey = stableAiringIdentity(airing)
    const stop = Date.parse(airing?.stopTime)
    if (!key || !airingKey || seen.has(airingKey) || !Number.isFinite(stop) || stop <= now) continue
    seen.add(airingKey)
    const entry = entryByKey.get(key)
    items.push(attachAiring(titleByKey.get(key) || fallbackTitle(airing, entry), airing, entry, now))
  }
  return items
}

function earliestUnique(items, keyForItem = canonicalKey) {
  const unique = new Map()
  for (const item of items) {
    const key = keyForItem(item)
    if (!key || unique.has(key)) continue
    unique.set(key, item)
  }
  return [...unique.values()]
}

function compareChronological(left, right, stationRank = new Map()) {
  return String(left?.tvAiring?.startTime || '').localeCompare(String(right?.tvAiring?.startTime || ''))
    || (stationRank.get(left?.tvAiring?.stationId) ?? Number.MAX_SAFE_INTEGER)
      - (stationRank.get(right?.tvAiring?.stationId) ?? Number.MAX_SAFE_INTEGER)
    || String(left?.title || '').localeCompare(String(right?.title || ''), 'de')
}

function comparePopularity(left, right) {
  return finiteNumber(right?.popularity) - finiteNumber(left?.popularity)
    || String(left?.tvAiring?.startTime || '').localeCompare(String(right?.tvAiring?.startTime || ''))
    || canonicalKey(left).localeCompare(canonicalKey(right), 'de')
}

function genreIdSet(item) {
  return new Set((Array.isArray(item?.genres) ? item.genres : [])
    .map((genre) => Number(genre?.id ?? genre))
    .filter(Number.isFinite))
}

function matchesTvCategory(item, category) {
  const ids = genreIdSet(item)
  return category.genreIds.some((id) => ids.has(id))
}

function startsInLocalWindow(item, startHour, endHour, timeZone) {
  const parts = zonedParts(item?.tvAiring?.startTime, timeZone)
  return parts.hour >= startHour && parts.hour < endHour
}

function normalRow(id, title, items) {
  return { id, title, variant: 'tv', items }
}

function insertTvTopTen(rows, items) {
  if (!items.length) return rows.filter((row) => row.items.length)
  const visible = rows.filter((row) => row.items.length)
  const index = Math.min(3, visible.length)
  return [
    ...visible.slice(0, index),
    { id: 'top-ten-tv', title: 'TV Top 10', variant: 'top-ten', items },
    ...visible.slice(index),
  ]
}

function dailyHeading(kind, period) {
  if (period.label === 'Heute') return `${kind} heute im Fernsehen`
  if (period.label === 'Morgen') return `${kind} morgen im Fernsehen`
  return `${kind} am ${shortDate(period.key)} im Fernsehen`
}

function buildRowsForAll(items, stationRank, timeZone) {
  const canonical = earliestUnique(items).sort((a, b) => compareChronological(a, b, stationRank))
  const primeTime = earliestUnique(items.filter((item) => startsInLocalWindow(item, 20, 23, timeZone)))
    .sort((a, b) => compareChronological(a, b, stationRank))
  const rows = [
    normalRow('tv-14-days-movies', 'Filme in den nächsten 14 Tagen', canonical.filter((item) => item.type === 'movie')),
    normalRow('tv-14-days-series', 'Serien in den nächsten 14 Tagen', canonical.filter((item) => item.type === 'series')),
    normalRow('tv-14-days-prime-time', 'Prime-Time-Highlights', primeTime),
    ...TV_GENRE_CATEGORIES.map((category) => normalRow(
      `tv-14-days-category-${category.id}`,
      category.title,
      canonical.filter((item) => matchesTvCategory(item, category)),
    )),
  ]
  const topTen = [...canonical].sort(comparePopularity).slice(0, 10)
  return insertTvTopTen(rows, topTen)
}

function buildRowsForDay(items, period, stationRank, timeZone) {
  const chronological = [...items].sort((a, b) => compareChronological(a, b, stationRank))
  const dedupeDaily = (candidates) => {
    const movies = earliestUnique(candidates.filter((item) => item.type === 'movie'))
    const series = earliestUnique(candidates.filter((item) => item.type === 'series'), episodeKey)
    return [...movies, ...series].sort((a, b) => compareChronological(a, b, stationRank))
  }
  const daily = dedupeDaily(chronological)
  const rows = [
    normalRow(`tv-${period.key}-movies`, dailyHeading('Filme', period), daily.filter((item) => item.type === 'movie')),
    normalRow(`tv-${period.key}-series`, dailyHeading('Serien', period), daily.filter((item) => item.type === 'series')),
    normalRow(`tv-${period.key}-prime-time`, 'Zur Prime Time', dedupeDaily(chronological.filter((item) => startsInLocalWindow(item, 20, 23, timeZone)))),
    normalRow(`tv-${period.key}-night`, 'Nachtprogramm', dedupeDaily(chronological.filter((item) => {
      const hour = zonedParts(item?.tvAiring?.startTime, timeZone).hour
      return hour >= 23 || hour < TV_DAY_START_HOUR
    }))),
    ...TV_GENRE_CATEGORIES.map((category) => normalRow(
      `tv-${period.key}-category-${category.id}`,
      category.title,
      daily.filter((item) => matchesTvCategory(item, category)),
    )),
  ]
  const topTen = earliestUnique(chronological).sort(comparePopularity).slice(0, 10)
  return insertTvTopTen(rows, topTen)
}

export function selectWaipuTvHeroItems(items = [], {
  now = Date.now(),
  limit = Number.MAX_SAFE_INTEGER,
} = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const nextDay = timestamp + 24 * 60 * 60 * 1_000
  return earliestUnique((Array.isArray(items) ? items : [])
    .filter((item) => item?.metadataComplete === true)
    .filter((item) => item?.displayHeroBackdropUrl || item?.backdropUrl)
    .sort((left, right) => {
      const tier = (item) => isTvAiringOnAir(item.tvAiring, timestamp)
        ? 0
        : Date.parse(item?.tvAiring?.startTime) < nextDay ? 1 : 2
      return tier(left) - tier(right) || comparePopularity(left, right)
    }))
    .slice(0, Math.max(0, Number(limit) || 0))
}

/**
 * Erstellt den TV-Hero aus dem kompakten Titelbestand. Dafür müssen die
 * einzelnen Senderdateien noch nicht geladen sein; sie bleiben ausschließlich
 * für Zeitraumwahl und Posterreihen zuständig.
 */
export function buildWaipuTvHeroItems({
  titles = [],
  titleEntries = [],
  stationOrder = [],
  now = Date.now(),
} = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const stationIds = new Set((Array.isArray(stationOrder) ? stationOrder : []).map(String))
  if (!stationIds.size) return []

  const airings = (Array.isArray(titleEntries) ? titleEntries : []).flatMap((entry) => (
    (Array.isArray(entry?.airings) ? entry.airings : [entry?.nextAiring])
      .filter(Boolean)
      .filter((airing) => stationIds.has(String(airing?.stationId || '')))
      .map((airing) => ({
        ...airing,
        tmdbId: entry.tmdbId,
        type: entry.type,
        title: entry.title,
      }))
  ))
  const stationRank = new Map([...stationIds].map((id, index) => [id, index]))
  const items = buildAiringItems({ airings, titles, titleEntries, now: timestamp })
    .sort((left, right) => compareChronological(left, right, stationRank))
  return selectWaipuTvHeroItems(items, { now: timestamp })
}

export function buildWaipuTvViewModel({
  airings = [],
  titles = [],
  titleEntries = [],
  stationOrder = [],
  selectedPeriodId = null,
  now = Date.now(),
  timeZone = TV_TIME_ZONE,
} = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const stationRank = new Map((Array.isArray(stationOrder) ? stationOrder : [])
    .map((id, index) => [id, index]))
  const items = buildAiringItems({ airings, titles, titleEntries, now: timestamp })
    .sort((a, b) => compareChronological(a, b, stationRank))
  const periods = buildTvPeriodOptions(airings, { now: timestamp, timeZone })
  const todayId = `day:${tvDayKey(timestamp, timeZone)}`
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId)
    || periods.find((period) => period.id === todayId)
    || periods[0]
  let periodItems = items
  if (selectedPeriod.kind === 'day') {
    const range = tvDayRange(selectedPeriod.key, timeZone)
    periodItems = items.filter((item) => {
      const start = Date.parse(item?.tvAiring?.startTime)
      return start >= range.start && start < range.endExclusive
    })
    if (selectedPeriod.id === todayId) {
      periodItems = periodItems.filter((item) => Date.parse(item?.tvAiring?.stopTime) > timestamp)
    }
  }
  return {
    periods,
    selectedPeriod,
    heroItems: selectWaipuTvHeroItems(items, { now: timestamp }),
    rows: selectedPeriod.kind === 'all'
      ? buildRowsForAll(periodItems, stationRank, timeZone)
      : buildRowsForDay(periodItems, selectedPeriod, stationRank, timeZone),
  }
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
  const {
    key: _key,
    airings: _airings,
    nextAiring: _nextAiring,
    airingCount: _airingCount,
    ...metadata
  } = entry || {}
  return {
    ...metadata,
    id: `waipu-${type}-${airing.tmdbId}`,
    source: 'tmdb',
    tmdbId: airing.tmdbId,
    mediaType: type === 'series' ? 'tv' : 'movie',
    type,
    title,
    originalTitle: entry?.originalTitle || title,
    description: entry?.description || '',
    year: entry?.year || null,
    posterUrl: entry?.posterUrl || airing.imageUrl || null,
    neutralPosterUrl: entry?.posterUrl || airing.imageUrl || null,
    backdropUrl: entry?.backdropUrl || null,
    artwork: entry?.artwork || { posterPaths: [], heroBackdropPaths: [] },
    genre: entry?.genre || 'TV-Programm',
    meta: entry?.meta || (type === 'series' ? 'Serie' : 'Film'),
    score: entry?.score || '–',
    providerIds: [...new Set([...(Array.isArray(entry?.providerIds) ? entry.providerIds : []), 'waipu'])],
    accent: entry?.accent || '#657184',
    accent2: entry?.accent2 || '#1c2531',
  }
}

export function buildWaipuTvRows({
  airings = [],
  titles = [],
  titleEntries = [],
  stationOrder = [],
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
  const stationRank = new Map((Array.isArray(stationOrder) ? stationOrder : [])
    .map((id, index) => [id, index]))
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
      tvAiringOnAir: isTvAiringOnAir(airing, timestamp),
      tvAiringSoon: isTvAiringSoon(airing, timestamp),
      waipuLive: {
        airings: [airing],
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
        || (stationRank.get(left.tvAiring.stationId) ?? Number.MAX_SAFE_INTEGER)
          - (stationRank.get(right.tvAiring.stationId) ?? Number.MAX_SAFE_INTEGER)
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
