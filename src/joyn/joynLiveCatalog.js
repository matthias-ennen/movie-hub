import { isTvAiringOnAir, isTvAiringSoon } from '../waipu/waipuAiringStatus.js'

export const JOYN_LIVE_TITLES_URL = '/joyn-live/titles.json'
export const JOYN_LIVE_CATALOG_VERSION = 1
export const JOYN_LIVE_URL = 'https://www.joyn.de/live-tv'

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

function normalizeAiring(raw, now) {
  const startTime = String(raw?.startTime || '').trim()
  const stopTime = String(raw?.stopTime || '').trim()
  if (!startTime || !stopTime || Date.parse(stopTime) <= now) return null
  return {
    ...raw,
    stationId: String(raw?.stationId || '').trim() || null,
    stationName: String(raw?.stationName || '').trim() || null,
    programId: String(raw?.programId || '').trim() || null,
    startTime,
    stopTime,
    playbackRoutes: Array.isArray(raw?.playbackRoutes) ? raw.playbackRoutes : [],
    providerIds: ['joyn'],
  }
}

function normalizeEntry(raw, now) {
  const key = titleKey(raw)
  if (!key) return null
  const airings = (Array.isArray(raw?.airings) ? raw.airings : [raw?.nextAiring])
    .map((airing) => normalizeAiring(airing, now))
    .filter(Boolean)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
  if (!airings.length) return null
  return {
    key,
    tmdbId: Number(raw.tmdbId),
    type: mediaType(raw.type),
    mediaType: mediaType(raw.type) === 'series' ? 'tv' : 'movie',
    providerIds: ['joyn'],
    airings,
    nextAiring: airings[0],
    airingCount: airings.length,
  }
}

export function normalizeJoynLiveTitles(raw, { now = Date.now() } = {}) {
  if (raw?.schemaVersion !== JOYN_LIVE_CATALOG_VERSION || raw?.kind !== 'joyn-live-titles') return []
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const byKey = new Map()
  for (const rawEntry of Array.isArray(raw.entries) ? raw.entries : []) {
    const entry = normalizeEntry(rawEntry, timestamp)
    if (entry) byKey.set(entry.key, entry)
  }
  return [...byKey.values()]
}

export function advanceJoynLiveTitles(entries = [], { now = Date.now() } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const airings = (Array.isArray(entry?.airings) ? entry.airings : [entry?.nextAiring])
      .filter(Boolean)
      .filter((airing) => Date.parse(airing.stopTime) > timestamp)
    if (!airings.length) return null
    return {
      ...entry,
      airings,
      nextAiring: airings[0],
      airingCount: airings.length,
    }
  }).filter(Boolean)
}

export function mergeJoynLiveAvailability(titles = [], entries = [], { now = Date.now() } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const byKey = new Map((Array.isArray(entries) ? entries : []).map((entry) => [entry.key || titleKey(entry), entry]))
  return (Array.isArray(titles) ? titles : []).map((title) => {
    const entry = byKey.get(titleKey(title))
    if (!entry) return title
    return {
      ...title,
      providerIds: [...new Set([...(Array.isArray(title.providerIds) ? title.providerIds : []), 'joyn'])],
      tvAiringOnAir: Boolean(title.tvAiringOnAir) || isTvAiringOnAir(entry.nextAiring, timestamp),
      tvAiringSoon: Boolean(title.tvAiringSoon) || isTvAiringSoon(entry.nextAiring, timestamp),
      joynLive: {
        airings: entry.airings,
        nextAiring: entry.nextAiring,
        airingCount: entry.airingCount,
      },
    }
  })
}

export async function loadJoynLiveTitles({ fetchImpl = fetch, now = Date.now } = {}) {
  try {
    const response = await fetchImpl(JOYN_LIVE_TITLES_URL, { cache: 'no-store' })
    if (!response.ok) return []
    return normalizeJoynLiveTitles(await response.json(), { now })
  } catch {
    return []
  }
}

export function getJoynLiveDestination(joynLive, { now = Date.now() } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const airings = (Array.isArray(joynLive?.airings) && joynLive.airings.length
    ? joynLive.airings
    : [joynLive?.nextAiring])
    .filter(Boolean)
    .filter((airing) => Date.parse(airing.stopTime) > timestamp)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))

  const selected = airings.find((airing) => Date.parse(airing.startTime) <= timestamp)
    || airings[0]
    || null
  const routes = Array.isArray(selected?.playbackRoutes) ? selected.playbackRoutes : []
  const exact = routes.find((route) => route?.providerId === 'joyn' && /^https:\/\//.test(String(route?.target || '')))
  return exact?.target || null
}

export function formatJoynLiveAiring(airing, {
  locale = 'de-DE',
  timeZone = 'Europe/Berlin',
} = {}) {
  const start = new Date(airing?.startTime)
  if (!Number.isFinite(start.getTime())) return null
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(start)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(start)
  return [date, `${time} Uhr`, String(airing?.stationName || '').trim() || null]
    .filter(Boolean)
    .join(' · ')
}
