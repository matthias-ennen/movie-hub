import { mergeTvAirings } from '../sources/mergeTvAirings.js'
import { ensureProviderLiveRoute } from '../sources/providerLiveRoute.js'
import { tvDayKey } from '../waipu/waipuTvCatalog.js'

export const TV_RUNTIME_SNAPSHOT_VERSION = 1
export const TV_RUNTIME_SNAPSHOT_KIND = 'moviehub-tv-runtime-index'
export const TV_RUNTIME_DAY_KIND = 'moviehub-tv-runtime-day'
export const TV_RUNTIME_HERO_KIND = 'moviehub-tv-runtime-hero'

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

function compactHeroMetadata(value = {}) {
  const artwork = value?.artwork && typeof value.artwork === 'object' ? value.artwork : {}
  return {
    title: text(value.title),
    originalTitle: text(value.originalTitle),
    description: text(value.description),
    year: finite(value.year),
    runtimeMinutes: finite(value.runtimeMinutes),
    posterUrl: text(value.posterUrl || value.neutralPosterUrl),
    posterPath: text(value.posterPath || value.neutralPosterPath),
    neutralPosterPath: text(value.neutralPosterPath),
    backdropUrl: text(value.displayHeroBackdropUrl || value.backdropUrl),
    backdropPath: text(value.backdropPath),
    artwork: {
      posterPaths: (Array.isArray(artwork.posterPaths) ? artwork.posterPaths : []).map(text).filter(Boolean).slice(0, 3),
      heroBackdropPaths: (Array.isArray(artwork.heroBackdropPaths) ? artwork.heroBackdropPaths : []).map(text).filter(Boolean).slice(0, 3),
    },
    ageRating: finite(value.ageRating),
    voteAverage: finite(value.voteAverage),
    popularity: finite(value.popularity),
    videos: (Array.isArray(value.videos) ? value.videos : []).filter((video) => video?.key).slice(0, 4),
    sourceMetadataComplete: value?.metadataComplete === true,
  }
}

function heroBackdropAvailable(meta) {
  return Boolean(meta?.backdropUrl || meta?.backdropPath || meta?.artwork?.heroBackdropPaths?.length)
}

function heroMetadataScore(meta) {
  return [
    meta?.sourceMetadataComplete,
    meta?.title,
    heroBackdropAvailable(meta),
    meta?.description,
    meta?.posterUrl || meta?.posterPath,
    meta?.year,
    meta?.ageRating,
    meta?.voteAverage,
    meta?.popularity,
    meta?.videos?.length,
  ].filter(Boolean).length
}

function buildHeroMetadataLookup(catalog, searchIndex, sourceCatalogs) {
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
    const candidate = compactHeroMetadata(value)
    if (!candidate.sourceMetadataComplete || !candidate.title || !heroBackdropAvailable(candidate)) continue
    const current = byKey.get(key)
    if (!current || heroMetadataScore(candidate) > heroMetadataScore(current)) byKey.set(key, candidate)
  }
  return byKey
}

function airingStationSignature(airing) {
  const providerStationIds = airing?.providerStationIds && typeof airing.providerStationIds === 'object'
    ? airing.providerStationIds
    : {}
  const providerSides = (Array.isArray(airing?.providerIds) ? airing.providerIds : [])
    .slice()
    .sort()
    .map((providerId) => `${providerId}:${text(providerStationIds[providerId]) || ''}`)
    .join('|')
  return `${text(airing?.canonicalStationId || airing?.stationId) || ''}|${providerSides}`
}

function compactHeroAirings(airings = []) {
  const earliestByStation = new Map()
  for (const airing of [...airings].sort((left, right) => (
    String(left?.startTime || '').localeCompare(String(right?.startTime || ''))
  ))) {
    const signature = airingStationSignature(airing)
    if (!signature || earliestByStation.has(signature)) continue
    earliestByStation.set(signature, compactRuntimeAiring(airing))
  }
  return [...earliestByStation.values()]
}

function heroRank(entry, nowMs) {
  const airings = Array.isArray(entry?.airings) ? entry.airings : []
  const onAir = airings.find((airing) => (
    Date.parse(airing?.startTime) <= nowMs && Date.parse(airing?.stopTime) > nowMs
  ))
  const next = onAir || airings.find((airing) => Date.parse(airing?.startTime) > nowMs) || airings[0]
  const start = Date.parse(next?.startTime)
  const tier = onAir ? 0 : Number.isFinite(start) && start < nowMs + 24 * 60 * 60 * 1_000 ? 1 : 2
  return { tier, start: Number.isFinite(start) ? start : Number.MAX_SAFE_INTEGER }
}

function buildHeroPayload(dayPayloads, metadataByKey, nowMs) {
  const airingsByKey = new Map()
  for (const day of dayPayloads) {
    for (const entry of Array.isArray(day?.entries) ? day.entries : []) {
      if (!airingsByKey.has(entry.key)) airingsByKey.set(entry.key, [])
      airingsByKey.get(entry.key).push(...(Array.isArray(entry.airings) ? entry.airings : []))
    }
  }

  const entries = []
  for (const [key, airings] of airingsByKey.entries()) {
    const meta = metadataByKey.get(key)
    if (!meta) continue
    const [type, tmdbIdText] = key.split(':')
    const heroAirings = compactHeroAirings(airings)
      .filter((airing) => Date.parse(airing?.stopTime) > nowMs)
    if (!heroAirings.length) continue
    entries.push({
      key,
      type,
      tmdbId: Number(tmdbIdText),
      ...meta,
      airings: heroAirings,
    })
  }

  entries.sort((left, right) => {
    const leftRank = heroRank(left, nowMs)
    const rightRank = heroRank(right, nowMs)
    return leftRank.tier - rightRank.tier
      || finite(right?.popularity) - finite(left?.popularity)
      || leftRank.start - rightRank.start
      || String(left.key).localeCompare(String(right.key))
  })

  return {
    schemaVersion: TV_RUNTIME_SNAPSHOT_VERSION,
    kind: TV_RUNTIME_HERO_KIND,
    generatedAt: new Date(nowMs).toISOString(),
    count: entries.length,
    entries,
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
  const rightPreferred = metadataScore(right) >= metadataScore(left)
  const preferred = rightPreferred ? rightMeta : leftMeta
  const fallback = rightPreferred ? leftMeta : rightMeta
  const pickText = (key) => preferred[key] || fallback[key] || null
  const pickValue = (key) => preferred[key] ?? fallback[key] ?? null
  return {
    title: pickText('title'),
    originalTitle: pickText('originalTitle'),
    year: pickValue('year'),
    posterUrl: pickText('posterUrl'),
    posterPath: pickText('posterPath'),
    ageRating: pickValue('ageRating'),
    voteAverage: pickValue('voteAverage'),
    voteCount: pickValue('voteCount'),
    popularity: pickValue('popularity'),
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
  const programId = text(raw?.programId)
  return {
    providerId,
    providerIds: [providerId],
    type,
    tmdbId,
    stationId,
    canonicalStationId,
    sourceStationId,
    providerStationIds: providerStationId ? { [providerId]: providerStationId } : {},
    providerProgramIds: programId ? { [providerId]: programId } : {},
    stationName: text(raw?.stationName),
    programId,
    startTime,
    stopTime,
    playbackRoutes: ensureProviderLiveRoute(raw?.playbackRoutes, providerId, {
      stationId: providerStationId,
      programId,
      verifiedAt: raw?.verifiedAt || null,
    }),
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
    providerProgramIds: airing?.providerProgramIds && typeof airing.providerProgramIds === 'object'
      ? airing.providerProgramIds
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
  const heroMetadataByKey = buildHeroMetadataLookup(catalog, searchIndex, sourceCatalogs)
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

  const hero = buildHeroPayload(dayPayloads, heroMetadataByKey, nowMs)

  const providers = (Array.isArray(sourceCatalogs) ? sourceCatalogs : [])
    .map((source) => text(source?.providerId))
    .filter(Boolean)
    .sort()

  return {
    hero,
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
