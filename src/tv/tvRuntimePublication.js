import { mergeTvAirings } from '../sources/mergeTvAirings.js'
import { tvDayKey } from '../waipu/waipuTvCatalog.js'

export const TV_RUNTIME_SNAPSHOT_VERSION = 1
export const TV_RUNTIME_SNAPSHOT_KIND = 'moviehub-tv-runtime-index'
export const TV_RUNTIME_DAY_KIND = 'moviehub-tv-runtime-day'

function text(value) {
  const result = String(value ?? '').trim()
  return result || null
}

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function mediaType(value) {
  if (value === 'series' || value === 'tv') return 'series'
  if (value === 'movie') return 'movie'
  return null
}

export function tvRuntimeTitleKey(value) {
  const type = mediaType(value?.type ?? value?.mediaType)
  const tmdbId = Number(value?.tmdbId)
  return type && Number.isInteger(tmdbId) && tmdbId > 0 ? `${type}:${tmdbId}` : null
}

function tmdbProviderIds(value) {
  if (Array.isArray(value?.tmdbProviderIds)) {
    return [...new Set(value.tmdbProviderIds.map(String).filter(Boolean))]
  }
  const offers = Array.isArray(value?.tmdbProviderOffers)
    ? value.tmdbProviderOffers
    : Array.isArray(value?.providerOffers)
      ? value.providerOffers
      : []
  const fromOffers = offers
    .filter((offer) => Number.isFinite(Number(offer?.tmdbProviderId)))
    .map((offer) => text(offer?.id))
    .filter(Boolean)
  if (fromOffers.length) return [...new Set(fromOffers)]
  return [...new Set((Array.isArray(value?.providerIds) ? value.providerIds : [])
    .map(String)
    .filter((providerId) => providerId
      && providerId !== 'moviehub'
      && providerId !== 'waipu'
      && providerId !== 'joyn'))]
}

function genreIds(value) {
  return [...new Set([
    ...(Array.isArray(value?.genreIds) ? value.genreIds : []),
    ...(Array.isArray(value?.genres) ? value.genres.map((genre) => genre?.id ?? genre) : []),
  ].map(Number).filter(Number.isFinite))]
}

function genreNames(value) {
  return [...new Set([
    ...(Array.isArray(value?.genreNames) ? value.genreNames : []),
    ...(Array.isArray(value?.genres)
      ? value.genres.map((genre) => typeof genre === 'string' ? genre : genre?.name)
      : []),
  ].map(text).filter(Boolean))]
}

function compactMetadata(value = {}) {
  return {
    title: text(value.title),
    originalTitle: text(value.originalTitle),
    year: finite(value.year),
    posterUrl: text(value.posterUrl || value.neutralPosterUrl),
    posterPath: text(value.posterPath || value.neutralPosterPath),
    ageRating: finite(value.ageRating),
    voteAverage: finite(value.voteAverage),
    voteCount: finite(value.voteCount),
    popularity: finite(value.popularity),
    genreIds: genreIds(value),
    genreNames: genreNames(value),
    tmdbProviderIds: tmdbProviderIds(value),
  }
}

function metadataScore(value) {
  const meta = compactMetadata(value)
  return [
    meta.title,
    meta.posterUrl || meta.posterPath,
    meta.year,
    meta.ageRating,
    meta.voteAverage,
    meta.voteCount,
    meta.popularity,
    meta.genreIds.length,
    meta.tmdbProviderIds.length,
  ].filter((item) => item !== null && item !== false && item !== 0 && item !== '').length
}

function mergeMetadata(left = {}, right = {}) {
  const leftMeta = compactMetadata(left)
  const rightMeta = compactMetadata(right)
  const preferred = metadataScore(right) >= metadataScore(left) ? rightMeta : leftMeta
  return {
    ...leftMeta,
    ...rightMeta,
    ...preferred,
    genreIds: [...new Set([...leftMeta.genreIds, ...rightMeta.genreIds])],
    genreNames: [...new Set([...leftMeta.genreNames, ...rightMeta.genreNames])],
    tmdbProviderIds: [...new Set([...leftMeta.tmdbProviderIds, ...rightMeta.tmdbProviderIds])],
  }
}

function buildMetadataLookup(catalog, searchIndex, sourceCatalogs) {
  const byKey = new Map()
  for (const value of [
    ...(Array.isArray(catalog?.titles) ? catalog.titles : []),
    ...(Array.isArray(searchIndex?.entries) ? searchIndex.entries : []),
    ...(Array.isArray(sourceCatalogs) ? sourceCatalogs.flatMap((source) => (
      Array.isArray(source?.entries) ? source.entries : []
    )) : []),
  ]) {
    const key = tvRuntimeTitleKey(value)
    if (!key) continue
    byKey.set(key, mergeMetadata(byKey.get(key), value))
  }
  return byKey
}

function normalizeProviderAiring(raw, providerId, type, tmdbId) {
  const startTime = text(raw?.startTime ?? raw?.startAt)
  const stopTime = text(raw?.stopTime ?? raw?.endAt)
  if (!startTime || !stopTime || !Number.isFinite(Date.parse(startTime)) || !Number.isFinite(Date.parse(stopTime))) {
    return null
  }

  const stationId = text(raw?.stationId)
  const canonicalStationId = text(raw?.canonicalStationId)
  const sourceStationId = text(raw?.sourceStationId)
  const providerStationId = sourceStationId || stationId || canonicalStationId
  return {
    providerId,
    providerIds: [providerId],
    type,
    tmdbId,
    stationId,
    canonicalStationId,
    sourceStationId,
    providerStationIds: providerStationId ? { [providerId]: providerStationId } : {},
    stationName: text(raw?.stationName),
    programId: text(raw?.programId),
    startTime,
    stopTime,
    playbackRoutes: Array.isArray(raw?.playbackRoutes) ? raw.playbackRoutes : [],
    episode: raw?.episode || (
      type === 'series'
        ? {
            seasonNumber: Number.isInteger(Number(raw?.seasonNumber)) ? Number(raw.seasonNumber) : null,
            episodeNumber: Number.isInteger(Number(raw?.episodeNumber)) ? Number(raw.episodeNumber) : null,
            title: text(raw?.episodeTitle),
          }
        : null
    ),
  }
}

function sourceAirings(sourceCatalogs = [], nowMs) {
  const byTitle = new Map()
  for (const source of Array.isArray(sourceCatalogs) ? sourceCatalogs : []) {
    const providerId = text(source?.providerId)
    if (!providerId) continue
    for (const entry of Array.isArray(source?.entries) ? source.entries : []) {
      const key = tvRuntimeTitleKey(entry)
      const type = mediaType(entry?.type ?? entry?.mediaType)
      const tmdbId = Number(entry?.tmdbId)
      if (!key || !type || !Number.isInteger(tmdbId) || tmdbId <= 0) continue
      const airings = (Array.isArray(entry?.airings) ? entry.airings : [entry?.nextAiring].filter(Boolean))
        .map((airing) => normalizeProviderAiring(airing, providerId, type, tmdbId))
        .filter(Boolean)
        .filter((airing) => Date.parse(airing.stopTime) > nowMs)
      if (!airings.length) continue
      if (!byTitle.has(key)) byTitle.set(key, [])
      byTitle.get(key).push(...airings)
    }
  }
  return byTitle
}

function compactRuntimeAiring(airing) {
  return {
    providerIds: Array.isArray(airing?.providerIds) ? [...new Set(airing.providerIds)] : [],
    stationId: text(airing?.canonicalStationId || airing?.stationId),
    canonicalStationId: text(airing?.canonicalStationId),
    sourceStationId: text(airing?.sourceStationId),
    sourceStationIds: Array.isArray(airing?.sourceStationIds) ? airing.sourceStationIds : [],
    providerStationIds: airing?.providerStationIds && typeof airing.providerStationIds === 'object'
      ? airing.providerStationIds
      : {},
    stationName: text(airing?.stationName),
    programId: text(airing?.programId),
    startTime: text(airing?.startTime),
    stopTime: text(airing?.stopTime),
    playbackRoutes: Array.isArray(airing?.playbackRoutes) ? airing.playbackRoutes : [],
    episode: airing?.episode || null,
  }
}

export function buildTvRuntimeSnapshot({
  sourceCatalogs = [],
  catalog = null,
  searchIndex = null,
  now = Date.now(),
} = {}) {
  const nowMs = typeof now === 'function' ? Number(now()) : Number(now)
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a finite timestamp.')

  const metadataByKey = buildMetadataLookup(catalog, searchIndex, sourceCatalogs)
  const airingsByTitle = sourceAirings(sourceCatalogs, nowMs)
  const days = new Map()

  for (const [key, rawAirings] of airingsByTitle.entries()) {
    const merged = mergeTvAirings(rawAirings)
    const [type, tmdbIdText] = key.split(':')
    const metadata = metadataByKey.get(key) || compactMetadata({})
    for (const airing of merged) {
      const dayKey = tvDayKey(Date.parse(airing.startTime))
      if (!days.has(dayKey)) days.set(dayKey, new Map())
      const titles = days.get(dayKey)
      if (!titles.has(key)) {
        titles.set(key, {
          key,
          type,
          tmdbId: Number(tmdbIdText),
          ...metadata,
          airings: [],
        })
      }
      titles.get(key).airings.push(compactRuntimeAiring(airing))
    }
  }

  const dayPayloads = [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, titles]) => {
      const entries = [...titles.values()]
        .map((entry) => ({
          ...entry,
          airings: entry.airings.sort((left, right) => String(left.startTime).localeCompare(String(right.startTime))),
        }))
        .sort((left, right) => (
          String(left.airings[0]?.startTime || '').localeCompare(String(right.airings[0]?.startTime || ''))
          || left.key.localeCompare(right.key)
        ))
      return {
        schemaVersion: TV_RUNTIME_SNAPSHOT_VERSION,
        kind: TV_RUNTIME_DAY_KIND,
        generatedAt: new Date(nowMs).toISOString(),
        key,
        count: entries.length,
        airingCount: entries.reduce((total, entry) => total + entry.airings.length, 0),
        entries,
      }
    })

  const providers = (Array.isArray(sourceCatalogs) ? sourceCatalogs : [])
    .map((source) => text(source?.providerId))
    .filter(Boolean)
    .sort()

  return {
    index: {
      schemaVersion: TV_RUNTIME_SNAPSHOT_VERSION,
      kind: TV_RUNTIME_SNAPSHOT_KIND,
      generatedAt: new Date(nowMs).toISOString(),
      providers,
      dayCount: dayPayloads.length,
      titleCount: dayPayloads.reduce((total, day) => total + day.count, 0),
      airingCount: dayPayloads.reduce((total, day) => total + day.airingCount, 0),
      days: dayPayloads.map((day) => ({
        key: day.key,
        count: day.count,
        airingCount: day.airingCount,
      })),
    },
    days: dayPayloads,
  }
}
