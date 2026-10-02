import { mergeTvAirings } from '../sources/mergeTvAirings.js'
import { ensureProviderLiveRoute } from '../sources/providerLiveRoute.js'
import { tvDayKey } from '../waipu/waipuTvCatalog.js'

export const TV_RUNTIME_SNAPSHOT_VERSION = 1
export const TV_RUNTIME_SNAPSHOT_KIND = 'moviehub-tv-runtime-index'
export const TV_RUNTIME_DAY_KIND = 'moviehub-tv-runtime-day'
export const TV_RUNTIME_HERO_KIND = 'moviehub-tv-runtime-hero'
export const TV_RUNTIME_HERO_CANDIDATE_LIMIT = 50
export const TV_RUNTIME_HERO_AIRINGS_PER_TITLE_LIMIT = 12

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

function stringArray(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(text)
    .filter(Boolean))]
}

function compactHeroArtwork(value = {}) {
  const artwork = value?.artwork && typeof value.artwork === 'object' ? value.artwork : {}
  return {
    posterPaths: stringArray([
      ...(Array.isArray(artwork.posterPaths) ? artwork.posterPaths : []),
      value?.neutralPosterPath,
      value?.posterPath,
    ]),
    heroBackdropPaths: stringArray([
      ...(Array.isArray(artwork.heroBackdropPaths) ? artwork.heroBackdropPaths : []),
      value?.backdropPath,
    ]),
  }
}

function compactHeroVideos(value = {}) {
  return (Array.isArray(value?.videos) ? value.videos : [])
    .map((video) => ({
      id: text(video?.id),
      site: text(video?.site),
      key: text(video?.key),
      type: text(video?.type),
      name: text(video?.name),
      official: video?.official === true,
      publishedAt: text(video?.publishedAt ?? video?.published_at),
    }))
    .filter((video) => video.site && video.key)
    .slice(0, 12)
}

function heroMetadata(value = {}) {
  const type = mediaType(value?.type ?? value?.mediaType)
  const base = compactMetadata(value)
  const artwork = compactHeroArtwork(value)
  const metadataChecks = value?.metadataChecks && typeof value.metadataChecks === 'object'
    ? { ...value.metadataChecks }
    : {}
  const voteAverage = finite(value?.voteAverage)
  return {
    ...base,
    description: text(value?.description ?? value?.overview) || '',
    backdropUrl: text(value?.displayHeroBackdropUrl || value?.backdropUrl),
    backdropPath: text(value?.backdropPath),
    artwork,
    videos: compactHeroVideos(value),
    metadataVersion: finite(value?.metadataVersion),
    metadataChecks,
    metadataComplete: value?.metadataComplete === true,
    metadataUpdatedAt: value?.metadataUpdatedAt || null,
    collectionChecked: value?.collectionChecked === true,
    collectionId: finite(value?.collectionId),
    collectionDetails: value?.collectionDetails && typeof value.collectionDetails === 'object'
      ? value.collectionDetails
      : null,
    score: text(value?.score) || (voteAverage !== null ? voteAverage.toFixed(1) : '–'),
    meta: text(value?.meta) || (type === 'series' ? 'Serie' : 'Film'),
    providerIds: tmdbProviderIds(value),
  }
}

function heroMetadataScore(value = {}) {
  const meta = heroMetadata(value)
  return metadataScore(meta)
    + (meta.metadataComplete ? 20 : 0)
    + (Number(meta.metadataVersion || 0) >= 3 ? 8 : 0)
    + (meta.backdropUrl || meta.backdropPath || meta.artwork.heroBackdropPaths.length ? 10 : 0)
    + (meta.description ? 3 : 0)
    + (meta.videos.length ? 2 : 0)
}

function mergeHeroMetadata(left = {}, right = {}) {
  const leftMeta = heroMetadata(left)
  const rightMeta = heroMetadata(right)
  const rightPreferred = heroMetadataScore(rightMeta) >= heroMetadataScore(leftMeta)
  const preferred = rightPreferred ? rightMeta : leftMeta
  const fallback = rightPreferred ? leftMeta : rightMeta
  const base = mergeMetadata(leftMeta, rightMeta)
  return {
    ...base,
    description: preferred.description || fallback.description || '',
    backdropUrl: preferred.backdropUrl || fallback.backdropUrl || null,
    backdropPath: preferred.backdropPath || fallback.backdropPath || null,
    artwork: {
      posterPaths: stringArray([
        ...preferred.artwork.posterPaths,
        ...fallback.artwork.posterPaths,
      ]),
      heroBackdropPaths: stringArray([
        ...preferred.artwork.heroBackdropPaths,
        ...fallback.artwork.heroBackdropPaths,
      ]),
    },
    videos: preferred.videos.length ? preferred.videos : fallback.videos,
    metadataVersion: Math.max(Number(leftMeta.metadataVersion || 0), Number(rightMeta.metadataVersion || 0)) || null,
    metadataChecks: Object.keys(preferred.metadataChecks).length
      ? preferred.metadataChecks
      : fallback.metadataChecks,
    metadataComplete: leftMeta.metadataComplete || rightMeta.metadataComplete,
    metadataUpdatedAt: preferred.metadataUpdatedAt || fallback.metadataUpdatedAt || null,
    collectionChecked: leftMeta.collectionChecked || rightMeta.collectionChecked,
    collectionId: preferred.collectionId ?? fallback.collectionId ?? null,
    collectionDetails: preferred.collectionDetails || fallback.collectionDetails || null,
    score: preferred.score || fallback.score || '–',
    meta: preferred.meta || fallback.meta || null,
    providerIds: [...new Set([...leftMeta.providerIds, ...rightMeta.providerIds])],
  }
}

function buildHeroMetadataLookup(catalog, searchIndex, sourceCatalogs) {
  const byKey = new Map()
  const values = [
    ...(Array.isArray(sourceCatalogs) ? sourceCatalogs.flatMap((source) => (
      Array.isArray(source?.entries) ? source.entries : []
    )) : []),
    ...(Array.isArray(searchIndex?.entries) ? searchIndex.entries : []),
    ...(Array.isArray(catalog?.titles) ? catalog.titles : []),
  ]
  for (const value of values) {
    const key = tvRuntimeTitleKey(value)
    if (!key) continue
    byKey.set(key, mergeHeroMetadata(byKey.get(key), value))
  }
  return byKey
}

function hasHeroBackdrop(value) {
  const meta = heroMetadata(value)
  return Boolean(meta.backdropUrl || meta.backdropPath || meta.artwork.heroBackdropPaths.length)
}

function heroAiringIdentity(airing) {
  return [
    text(airing?.canonicalStationId || airing?.stationId),
    text(airing?.startTime),
    text(airing?.stopTime),
    ...(Array.isArray(airing?.providerIds) ? airing.providerIds.map(String).sort() : []),
  ].join('|')
}

function providerStationKeys(airing) {
  const map = airing?.providerStationIds && typeof airing.providerStationIds === 'object'
    ? airing.providerStationIds
    : {}
  return (Array.isArray(airing?.providerIds) ? airing.providerIds : [])
    .map((providerId) => {
      const stationId = text(map?.[providerId])
        || (providerId === 'joyn' ? text(airing?.sourceStationId) : null)
        || text(airing?.stationId)
        || text(airing?.canonicalStationId)
      return stationId ? `${providerId}:${stationId}` : null
    })
    .filter(Boolean)
}

function selectHeroAirings(airings = [], limit = TV_RUNTIME_HERO_AIRINGS_PER_TITLE_LIMIT) {
  const chronological = [...new Map((Array.isArray(airings) ? airings : [])
    .map((airing) => [heroAiringIdentity(airing), airing])
    .filter(([key]) => key)).values()]
    .sort((left, right) => String(left?.startTime || '').localeCompare(String(right?.startTime || '')))
  const selected = []
  const selectedKeys = new Set()
  const seenStations = new Set()

  for (const airing of chronological) {
    if (selected.length >= limit) break
    const stationKeys = providerStationKeys(airing)
    if (!stationKeys.some((key) => !seenStations.has(key))) continue
    selected.push(airing)
    selectedKeys.add(heroAiringIdentity(airing))
    stationKeys.forEach((key) => seenStations.add(key))
  }

  for (const airing of chronological) {
    if (selected.length >= limit) break
    const key = heroAiringIdentity(airing)
    if (selectedKeys.has(key)) continue
    selected.push(airing)
    selectedKeys.add(key)
  }

  return selected.sort((left, right) => String(left?.startTime || '').localeCompare(String(right?.startTime || '')))
}

function heroRank(candidate, nowMs) {
  const airings = (Array.isArray(candidate?.airings) ? candidate.airings : [])
    .filter((airing) => Date.parse(airing?.stopTime) > nowMs)
    .sort((left, right) => String(left?.startTime || '').localeCompare(String(right?.startTime || '')))
  const onAir = airings.find((airing) => {
    const start = Date.parse(airing?.startTime)
    const stop = Date.parse(airing?.stopTime)
    return start <= nowMs && stop > nowMs
  })
  const representative = onAir || airings.find((airing) => Date.parse(airing?.startTime) > nowMs) || airings[0] || null
  const start = Date.parse(representative?.startTime)
  const tier = onAir ? 0 : Number.isFinite(start) && start < nowMs + 24 * 60 * 60 * 1000 ? 1 : 2
  return { tier, start: Number.isFinite(start) ? start : Number.MAX_SAFE_INTEGER }
}

export function buildTvRuntimeHeroSnapshot({
  days = [],
  heroMetadataByKey = new Map(),
  now = Date.now(),
  limit = TV_RUNTIME_HERO_CANDIDATE_LIMIT,
} = {}) {
  const nowMs = typeof now === 'function' ? Number(now()) : Number(now)
  const candidates = new Map()

  for (const day of Array.isArray(days) ? days : []) {
    for (const entry of Array.isArray(day?.entries) ? day.entries : []) {
      const key = tvRuntimeTitleKey(entry)
      if (!key) continue
      const metadata = mergeHeroMetadata(entry, heroMetadataByKey.get(key))
      if (metadata.metadataComplete !== true || !metadata.title || !hasHeroBackdrop(metadata)) continue
      if (!candidates.has(key)) {
        candidates.set(key, {
          key,
          type: mediaType(entry?.type),
          tmdbId: Number(entry?.tmdbId),
          ...metadata,
          airings: [],
        })
      }
      candidates.get(key).airings.push(...(Array.isArray(entry?.airings) ? entry.airings : []))
    }
  }

  const ranked = [...candidates.values()]
    .map((candidate) => {
      const airings = selectHeroAirings(candidate.airings)
      return {
        ...candidate,
        id: `tv-runtime-hero-${candidate.type}-${candidate.tmdbId}`,
        mediaType: candidate.type === 'series' ? 'tv' : 'movie',
        neutralPosterUrl: candidate.posterUrl,
        neutralPosterPath: candidate.posterPath,
        genres: candidate.genreIds.map((id, index) => ({
          id,
          name: candidate.genreNames[index] || null,
        })),
        genre: candidate.genreNames.length ? candidate.genreNames.join(' · ') : 'TV-Programm',
        airingCount: candidate.airings.length,
        airings,
        nextAiring: airings.find((airing) => Date.parse(airing?.stopTime) > nowMs) || null,
      }
    })
    .filter((candidate) => candidate.airings.length)
    .sort((left, right) => {
      const leftRank = heroRank(left, nowMs)
      const rightRank = heroRank(right, nowMs)
      return leftRank.tier - rightRank.tier
        || Number(right.popularity || 0) - Number(left.popularity || 0)
        || leftRank.start - rightRank.start
        || left.key.localeCompare(right.key)
    })

  const entries = ranked.slice(0, Math.max(0, Number(limit) || 0))
  const generatedAt = new Date(nowMs).toISOString()
  return {
    schemaVersion: TV_RUNTIME_SNAPSHOT_VERSION,
    kind: TV_RUNTIME_HERO_KIND,
    generatedAt,
    sourceTitleCount: ranked.length,
    candidateLimit: Math.max(0, Number(limit) || 0),
    airingsPerTitleLimit: TV_RUNTIME_HERO_AIRINGS_PER_TITLE_LIMIT,
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

  const providers = (Array.isArray(sourceCatalogs) ? sourceCatalogs : [])
    .map((source) => text(source?.providerId))
    .filter(Boolean)
    .sort()

  const hero = buildTvRuntimeHeroSnapshot({
    days: dayPayloads,
    heroMetadataByKey,
    now: nowMs,
  })

  return {
    index: {
      schemaVersion: TV_RUNTIME_SNAPSHOT_VERSION,
      kind: TV_RUNTIME_SNAPSHOT_KIND,
      generatedAt: new Date(nowMs).toISOString(),
      providers,
      dayCount: dayPayloads.length,
      titleCount: dayPayloads.reduce((total, day) => total + day.count, 0),
      airingCount: dayPayloads.reduce((total, day) => total + day.airingCount, 0),
      heroCount: hero.count,
      days: dayPayloads.map((day) => ({
        key: day.key,
        count: day.count,
        airingCount: day.airingCount,
      })),
    },
    hero,
    days: dayPayloads,
  }
}
