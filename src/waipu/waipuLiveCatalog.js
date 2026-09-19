export const WAIPU_LIVE_TITLES_URL = '/waipu-live/titles.json'
export const WAIPU_LIVE_CATALOG_VERSION = 1

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

function normalizeAiring(raw) {
  const stationId = String(raw?.stationId || '').trim()
  const stationName = String(raw?.stationName || '').trim()
  const startTime = new Date(raw?.startTime)
  const stopTime = new Date(raw?.stopTime)
  if (!stationId || !stationName || !Number.isFinite(startTime.getTime()) || !Number.isFinite(stopTime.getTime())) {
    return null
  }
  if (stopTime <= startTime) return null
  const seasonNumber = raw?.seasonNumber === null || raw?.seasonNumber === undefined
    ? null
    : Number(raw.seasonNumber)
  const episodeNumber = raw?.episodeNumber === null || raw?.episodeNumber === undefined
    ? null
    : Number(raw.episodeNumber)

  return {
    stationId,
    stationName,
    startTime: startTime.toISOString(),
    stopTime: stopTime.toISOString(),
    episodeTitle: String(raw?.episodeTitle || '').trim() || null,
    seasonNumber: Number.isInteger(seasonNumber) ? seasonNumber : null,
    episodeNumber: Number.isInteger(episodeNumber) ? episodeNumber : null,
  }
}

function normalizeEntry(raw, now) {
  const key = titleKey(raw)
  if (!key) return null
  const sourceAirings = Array.isArray(raw?.airings) && raw.airings.length
    ? raw.airings
    : [raw?.nextAiring]
  const airings = sourceAirings
    .map(normalizeAiring)
    .filter(Boolean)
    .filter((airing) => Date.parse(airing.stopTime) > now)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
  if (!airings.length) return null

  const {
    airings: _rawAirings,
    nextAiring: _rawNextAiring,
    airingCount: _rawAiringCount,
    key: _rawKey,
    ...metadata
  } = raw
  return {
    ...metadata,
    key,
    tmdbId: Number(raw.tmdbId),
    type: mediaType(raw.type),
    mediaType: mediaType(raw.type) === 'series' ? 'tv' : 'movie',
    title: String(raw?.title || '').trim(),
    originalTitle: String(raw?.originalTitle || '').trim() || null,
    year: raw?.year !== null && raw?.year !== undefined && Number.isInteger(Number(raw.year))
      ? Number(raw.year)
      : null,
    posterUrl: String(raw?.posterUrl || '').trim() || null,
    providerIds: [...new Set([
      ...(Array.isArray(raw?.providerIds) ? raw.providerIds.map(String) : []),
      'waipu',
    ])],
    airings,
    nextAiring: airings[0],
    airingCount: airings.length,
  }
}

export function normalizeWaipuLiveTitles(raw, { now = Date.now() } = {}) {
  if (raw?.schemaVersion !== WAIPU_LIVE_CATALOG_VERSION || raw?.kind !== 'waipu-live-titles') return []
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const byKey = new Map()
  for (const rawEntry of Array.isArray(raw.entries) ? raw.entries : []) {
    const entry = normalizeEntry(rawEntry, timestamp)
    if (entry) byKey.set(entry.key, entry)
  }
  return [...byKey.values()]
}

export function advanceWaipuLiveTitles(entries = [], { now = Date.now() } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const airings = (Array.isArray(entry?.airings) ? entry.airings : [entry?.nextAiring])
      .filter(Boolean)
      .filter((airing) => Date.parse(airing.stopTime) > timestamp)
    if (!airings.length) return null
    if (airings.length === entry.airingCount && airings[0] === entry.nextAiring) return entry
    return {
      ...entry,
      airings,
      nextAiring: airings[0],
      airingCount: airings.length,
    }
  }).filter(Boolean)
}

export function mergeWaipuLiveAvailability(titles = [], entries = []) {
  const byKey = new Map((Array.isArray(entries) ? entries : []).map((entry) => [entry.key || titleKey(entry), entry]))
  return (Array.isArray(titles) ? titles : []).map((title) => {
    const entry = byKey.get(titleKey(title))
    if (!entry) return title
    return {
      ...title,
      providerIds: [...new Set([...(Array.isArray(title.providerIds) ? title.providerIds : []), 'waipu'])],
      waipuLive: {
        nextAiring: entry.nextAiring,
        airingCount: entry.airingCount,
      },
    }
  })
}

export async function loadWaipuLiveTitles({ fetchImpl = fetch, now = Date.now } = {}) {
  try {
    const response = await fetchImpl(WAIPU_LIVE_TITLES_URL, { cache: 'no-store' })
    if (!response.ok) return []
    return normalizeWaipuLiveTitles(await response.json(), { now })
  } catch {
    return []
  }
}

export function formatWaipuLiveAiring(airing, {
  locale = 'de-DE',
  timeZone = 'Europe/Berlin',
} = {}) {
  const start = new Date(airing?.startTime)
  const stop = new Date(airing?.stopTime)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(stop.getTime())) return null
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).format(start)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })
  return `${date} · ${time.format(start)}–${time.format(stop)} Uhr · ${airing.stationName}`
}
