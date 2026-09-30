import { isTvAiringOnAir, isTvAiringSoon } from '../waipu/waipuAiringStatus.js'

export const LIVE_AVAILABILITY_INDEX_VERSION = 1
export const LIVE_AVAILABILITY_INDEX_URL = '/live-availability-index.json'
export const DEFAULT_AIRINGS_PER_PROVIDER = 2

function text(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
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

function routeKey(route) {
  return [text(route?.providerId), text(route?.mode), text(route?.target)].join('|')
}

function compactRoute(route, providerId) {
  const target = text(route?.target)
  const mode = text(route?.mode)
  if (!target || !mode) return null
  return {
    providerId: text(route?.providerId) || providerId,
    mode,
    target,
  }
}

function compactAiring(raw, providerId) {
  const startTime = text(raw?.startTime ?? raw?.startAt)
  const stopTime = text(raw?.stopTime ?? raw?.endAt)
  if (!startTime || !stopTime || !Number.isFinite(Date.parse(startTime)) || !Number.isFinite(Date.parse(stopTime))) {
    return null
  }

  const routes = new Map()
  for (const rawRoute of Array.isArray(raw?.playbackRoutes) ? raw.playbackRoutes : []) {
    const route = compactRoute(rawRoute, providerId)
    if (route) routes.set(routeKey(route), route)
  }

  const playbackTarget = text(raw?.playbackTarget ?? raw?.deepLink)
  if (playbackTarget) {
    const route = {
      providerId,
      mode: 'APP_DEEP_LINK',
      target: playbackTarget,
    }
    routes.set(routeKey(route), route)
  }

  return {
    stationId: text(raw?.stationId),
    sourceStationId: text(raw?.sourceStationId),
    canonicalStationId: text(raw?.canonicalStationId),
    stationName: text(raw?.stationName),
    programId: text(raw?.programId),
    startTime,
    stopTime,
    providerIds: [providerId],
    source: providerId,
    playbackRoutes: [...routes.values()],
  }
}

function normalizeProviderEntry(raw, nowMs) {
  const providerId = text(raw?.providerId)
  if (!providerId) return null
  const airings = (Array.isArray(raw?.airings) ? raw.airings : [raw?.nextAiring])
    .map((airing) => compactAiring(airing, providerId))
    .filter(Boolean)
    .filter((airing) => Date.parse(airing.stopTime) > nowMs)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
  if (!airings.length) return null
  return {
    providerId,
    airings,
    nextAiring: airings[0],
    airingCount: airings.length,
  }
}

export function buildLiveAvailabilityIndex(sourceCatalogs = [], {
  now = Date.now(),
  maxAiringsPerProvider = DEFAULT_AIRINGS_PER_PROVIDER,
} = {}) {
  const nowMs = typeof now === 'function' ? Number(now()) : Number(now)
  const limit = Math.max(1, Number(maxAiringsPerProvider) || DEFAULT_AIRINGS_PER_PROVIDER)
  const byTitle = new Map()
  const sources = []

  for (const source of Array.isArray(sourceCatalogs) ? sourceCatalogs : []) {
    const providerId = text(source?.providerId)
    if (!providerId) continue
    const entries = Array.isArray(source?.entries) ? source.entries : []
    let accepted = 0

    for (const raw of entries) {
      const key = titleKey(raw)
      if (!key) continue
      const type = mediaType(raw?.type ?? raw?.mediaType)
      const tmdbId = Number(raw?.tmdbId)
      const airings = (Array.isArray(raw?.airings) ? raw.airings : [raw?.nextAiring])
        .map((airing) => compactAiring(airing, providerId))
        .filter(Boolean)
        .filter((airing) => Date.parse(airing.stopTime) > nowMs)
        .sort((left, right) => left.startTime.localeCompare(right.startTime))
        .slice(0, limit)
      if (!airings.length) continue

      if (!byTitle.has(key)) {
        byTitle.set(key, { key, type, tmdbId, providers: new Map() })
      }
      byTitle.get(key).providers.set(providerId, {
        providerId,
        airings,
        nextAiring: airings[0],
        airingCount: airings.length,
      })
      accepted += 1
    }
    sources.push({ providerId, titleCount: accepted })
  }

  const entries = [...byTitle.values()]
    .map((entry) => {
      const providers = [...entry.providers.values()]
        .sort((left, right) => left.providerId.localeCompare(right.providerId))
      return {
        key: entry.key,
        type: entry.type,
        tmdbId: entry.tmdbId,
        providerIds: providers.map(({ providerId }) => providerId),
        providers,
      }
    })
    .sort((left, right) => left.key.localeCompare(right.key))

  return {
    schemaVersion: LIVE_AVAILABILITY_INDEX_VERSION,
    kind: 'moviehub-live-availability-index',
    generatedAt: new Date(nowMs).toISOString(),
    maxAiringsPerProvider: limit,
    sourceCount: sources.length,
    sources,
    count: entries.length,
    entries,
  }
}

export function normalizeLiveAvailabilityIndex(raw, { now = Date.now() } = {}) {
  if (raw?.schemaVersion !== LIVE_AVAILABILITY_INDEX_VERSION
      || raw?.kind !== 'moviehub-live-availability-index') return []
  const nowMs = typeof now === 'function' ? Number(now()) : Number(now)
  return (Array.isArray(raw?.entries) ? raw.entries : [])
    .map((rawEntry) => {
      const key = titleKey(rawEntry)
      if (!key) return null
      const providers = (Array.isArray(rawEntry?.providers) ? rawEntry.providers : [])
        .map((provider) => normalizeProviderEntry(provider, nowMs))
        .filter(Boolean)
      if (!providers.length) return null
      const airings = providers.flatMap((provider) => provider.airings)
        .sort((left, right) => left.startTime.localeCompare(right.startTime))
      return {
        key,
        type: mediaType(rawEntry.type),
        tmdbId: Number(rawEntry.tmdbId),
        providerIds: providers.map(({ providerId }) => providerId),
        providers,
        airings,
        nextAiring: airings[0] || null,
        airingCount: airings.length,
      }
    })
    .filter(Boolean)
}

export function advanceLiveAvailabilityEntries(entries = [], { now = Date.now() } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const providers = (Array.isArray(entry?.providers) ? entry.providers : [])
        .map((provider) => normalizeProviderEntry(provider, timestamp))
        .filter(Boolean)
      if (!providers.length) return null
      const airings = providers.flatMap((provider) => provider.airings)
        .sort((left, right) => left.startTime.localeCompare(right.startTime))
      return {
        ...entry,
        providerIds: providers.map(({ providerId }) => providerId),
        providers,
        airings,
        nextAiring: airings[0] || null,
        airingCount: airings.length,
      }
    })
    .filter(Boolean)
}

function tmdbProviderIds(item) {
  if (Array.isArray(item?.tmdbProviderIds)) {
    return [...new Set(item.tmdbProviderIds.map(String).filter(Boolean))]
  }
  const offers = Array.isArray(item?.tmdbProviderOffers)
    ? item.tmdbProviderOffers
    : Array.isArray(item?.providerOffers)
      ? item.providerOffers
      : []
  const fromOffers = offers
    .filter((offer) => Number.isFinite(Number(offer?.tmdbProviderId)))
    .map((offer) => text(offer?.id))
    .filter(Boolean)
  if (fromOffers.length) return [...new Set(fromOffers)]
  if (Array.isArray(item?.providerIds)) {
    const liveIds = new Set(Object.keys(item?.liveAvailability || {}))
    return [...new Set(item.providerIds
      .map(String)
      .filter((providerId) => providerId
        && providerId !== 'moviehub'
        && providerId !== 'waipu'
        && !liveIds.has(providerId)))]
  }
  return []
}

function buildProviderEvidence(title, liveAvailability) {
  const evidence = {}
  const observedAt = text(title?.providerMetadataUpdatedAt || title?.metadataUpdatedAt)
  for (const providerId of tmdbProviderIds(title)) {
    evidence[providerId] = [{ source: 'tmdb', region: 'DE', observedAt }]
  }
  if (title?.movieHubCatalog === true) {
    evidence.moviehub = [{ source: 'moviehub', observedAt: null }]
  }
  for (const [providerId, availability] of Object.entries(liveAvailability || {})) {
    evidence[providerId] = [
      ...(evidence[providerId] || []),
      { source: `live:${providerId}`, observedAt: null, nextAiring: availability?.nextAiring || null },
    ]
  }
  return evidence
}

export function mergeLiveAvailability(titles = [], entries = [], { now = Date.now() } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const byKey = new Map((Array.isArray(entries) ? entries : [])
    .map((entry) => [entry?.key || titleKey(entry), entry])
    .filter(([key]) => key))

  return (Array.isArray(titles) ? titles : []).map((title) => {
    const entry = byKey.get(titleKey(title))
    if (!entry) return title

    const liveAvailability = { ...(title?.liveAvailability || {}) }
    for (const provider of Array.isArray(entry?.providers) ? entry.providers : []) {
      liveAvailability[provider.providerId] = provider
    }
    const providerEvidence = buildProviderEvidence(title, liveAvailability)
    const providerIds = Object.keys(providerEvidence)
    const nextAirings = Object.values(liveAvailability)
      .map((provider) => provider?.nextAiring)
      .filter(Boolean)

    const merged = {
      ...title,
      providerIds,
      providerEvidence,
      liveAvailability,
      tvAiringOnAir: Boolean(title?.tvAiringOnAir)
        || nextAirings.some((airing) => isTvAiringOnAir(airing, timestamp)),
      tvAiringSoon: Boolean(title?.tvAiringSoon)
        || nextAirings.some((airing) => isTvAiringSoon(airing, timestamp)),
    }

    // Temporary compatibility for existing provider-specific detail helpers.
    if (liveAvailability.waipu) merged.waipuLive = liveAvailability.waipu
    if (liveAvailability.joyn) merged.joynLive = liveAvailability.joyn
    return merged
  })
}

export function getLiveProviderDestination(providerAvailability, {
  now = Date.now(),
  providerId = null,
} = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const requestedProviderId = text(providerId)
  const airings = (Array.isArray(providerAvailability?.airings) && providerAvailability.airings.length
    ? providerAvailability.airings
    : [providerAvailability?.nextAiring])
    .filter(Boolean)
    .filter((airing) => Date.parse(airing.stopTime) > timestamp)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
  const selected = airings.find((airing) => Date.parse(airing.startTime) <= timestamp)
    || airings[0]
    || null
  if (!selected) return null
  const routes = Array.isArray(selected?.playbackRoutes) ? selected.playbackRoutes : []
  const exact = routes.find((route) => (
    (!requestedProviderId || text(route?.providerId) === requestedProviderId)
    && text(route?.target)
  ))
  return exact?.target || null
}

export function getItemLiveProviderDestination(item, providerId, { now = Date.now() } = {}) {
  const requestedProviderId = text(providerId)
  if (!requestedProviderId) return null

  const titleDestination = getLiveProviderDestination(item?.liveAvailability?.[requestedProviderId], {
    now,
    providerId: requestedProviderId,
  })
  if (titleDestination) return titleDestination

  const airing = item?.tvAiring
  if (!airing) return null
  const airingProviderIds = new Set([
    ...(Array.isArray(airing?.providerIds) ? airing.providerIds : []),
    ...(Array.isArray(airing?.playbackRoutes) ? airing.playbackRoutes.map((route) => route?.providerId) : []),
  ].map(text).filter(Boolean))
  if (!airingProviderIds.has(requestedProviderId)) return null

  return getLiveProviderDestination({ airings: [airing] }, {
    now,
    providerId: requestedProviderId,
  })
}

export function formatLiveAiring(providerAvailability, {
  locale = 'de-DE',
  timeZone = 'Europe/Berlin',
} = {}) {
  const airing = providerAvailability?.nextAiring
  const start = new Date(airing?.startTime)
  if (!Number.isFinite(start.getTime())) return null
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long', day: 'numeric', month: 'long', timeZone,
  }).format(start)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  }).format(start)
  return [date, `${time} Uhr`, text(airing?.stationName)]
    .filter(Boolean)
    .join(' · ')
}

export async function loadLiveAvailabilityIndex({ fetchImpl = fetch, now = Date.now } = {}) {
  try {
    const response = await fetchImpl(LIVE_AVAILABILITY_INDEX_URL, { cache: 'no-store' })
    if (!response.ok) return []
    return normalizeLiveAvailabilityIndex(await response.json(), { now })
  } catch {
    return []
  }
}
