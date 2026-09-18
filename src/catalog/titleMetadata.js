export const CURRENT_TITLE_METADATA_VERSION = 2

const TMDB_PLACEHOLDER_TITLE = /^TMDB\s*#\s*\d+$/i
const LOADING_PLACEHOLDER_TITLE = /^Titel wird geladen\s*…?$/i

export function isUsableTitle(value) {
  const title = String(value ?? '').trim()
  return Boolean(title)
    && !TMDB_PLACEHOLDER_TITLE.test(title)
    && !LOADING_PLACEHOLDER_TITLE.test(title)
}

function timestampMilliseconds(value) {
  if (!value) return null
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function meaningful(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return Boolean(value.trim())
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function stableKey(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object') return String(value).trim().toLocaleLowerCase('de-DE') || null
  if (value.id !== null && value.id !== undefined && String(value.id).trim()) return `id:${String(value.id).trim()}`
  if (value.providerId) return `provider:${value.providerId}`
  if (Number.isFinite(Number(value.tmdbProviderId))) return `tmdb-provider:${Number(value.tmdbProviderId)}`
  if (value.site && value.key) return `video:${value.site}:${value.key}`
  if (value.url) return `url:${value.url}`
  if (Number.isFinite(Number(value.seasonNumber))) return `season:${Number(value.seasonNumber)}`
  if (value.name) return `name:${String(value.name).trim().toLocaleLowerCase('de-DE')}`
  return JSON.stringify(value)
}

function mergeUnique(base, enriched, limit = Infinity) {
  const result = []
  const indexes = new Map()
  for (const value of [...(Array.isArray(base) ? base : []), ...(Array.isArray(enriched) ? enriched : [])]) {
    const key = stableKey(value)
    if (!key) continue
    const existingIndex = indexes.get(key)
    if (existingIndex === undefined) {
      indexes.set(key, result.length)
      result.push(value)
    } else if (typeof value === 'object' && typeof result[existingIndex] === 'object') {
      result[existingIndex] = mergeMeaningfulObject(result[existingIndex], value)
    }
  }
  return result.slice(0, limit)
}

function mergeMeaningfulObject(base, enriched) {
  const result = { ...(base && typeof base === 'object' ? base : {}) }
  for (const [key, value] of Object.entries(enriched && typeof enriched === 'object' ? enriched : {})) {
    if (meaningful(value)) result[key] = value
  }
  return result
}

function moreInformativeText(base, enriched) {
  const baseText = typeof base === 'string' ? base.trim() : ''
  const enrichedText = typeof enriched === 'string' ? enriched.trim() : ''
  if (!baseText) return enrichedText
  if (!enrichedText) return baseText
  return enrichedText.length > baseText.length ? enrichedText : baseText
}

function firstMeaningful(base, enriched, fallback = null) {
  if (meaningful(base)) return base
  if (meaningful(enriched)) return enriched
  return fallback
}

function mergeArtwork(base, enriched) {
  const baseArtwork = base && typeof base === 'object' ? base : {}
  const enrichedArtwork = enriched && typeof enriched === 'object' ? enriched : {}
  return {
    ...mergeMeaningfulObject(baseArtwork, enrichedArtwork),
    posterPaths: mergeUnique(baseArtwork.posterPaths, enrichedArtwork.posterPaths, 3),
    heroBackdropPaths: mergeUnique(baseArtwork.heroBackdropPaths, enrichedArtwork.heroBackdropPaths, 3),
  }
}

function mergeProviderOffers(base, enriched) {
  const candidates = [...(Array.isArray(base) ? base : []), ...(Array.isArray(enriched) ? enriched : [])]
  const keys = [...new Set(candidates.map(stableKey).filter(Boolean))]
  return keys.map((key) => {
    const matching = candidates.filter((candidate) => stableKey(candidate) === key)
    return matching.reduce((result, candidate) => ({
      ...mergeMeaningfulObject(result, candidate),
      offerTypes: mergeUnique(result.offerTypes, candidate.offerTypes),
    }), {})
  })
}

function mergeSmartFacets(base, enriched) {
  const baseFacets = base && typeof base === 'object' ? base : {}
  const enrichedFacets = enriched && typeof enriched === 'object' ? enriched : {}
  return {
    ...mergeMeaningfulObject(baseFacets, enrichedFacets),
    cast: mergeUnique(baseFacets.cast, enrichedFacets.cast),
    creators: mergeUnique(baseFacets.creators, enrichedFacets.creators),
    keywords: mergeUnique(baseFacets.keywords, enrichedFacets.keywords),
    collection: firstMeaningful(baseFacets.collection, enrichedFacets.collection),
  }
}

function latestTimestamp(base, enriched) {
  const baseTime = timestampMilliseconds(base)
  const enrichedTime = timestampMilliseconds(enriched)
  if (baseTime === null) return enriched || base || null
  if (enrichedTime === null) return base || enriched || null
  return enrichedTime > baseTime ? enriched : base
}

export function titleNeedsMetadataEnrichment(item, {
  now = Date.now(),
  maxAgeDays = null,
} = {}) {
  if (!item?.tmdbId) return false
  if (!isUsableTitle(item.title)) return true
  if (Number(item.metadataVersion || 0) < CURRENT_TITLE_METADATA_VERSION) return true
  if (item.metadataComplete !== true) return true
  if (item.type !== 'series' && item.mediaType !== 'tv') {
    if (item.collectionChecked !== true) return true
    if (item.collectionId && !item.collectionDetails) return true
  }

  if (!Number.isFinite(Number(maxAgeDays)) || Number(maxAgeDays) <= 0) return false
  const updatedAt = timestampMilliseconds(item.metadataUpdatedAt)
  if (!updatedAt) return true
  return Number(now) - updatedAt > Number(maxAgeDays) * 86400000
}

export function sameTmdbTitle(left, right) {
  if (!left?.tmdbId || !right?.tmdbId) return false
  const leftType = left.type === 'series' || left.mediaType === 'tv' ? 'series' : 'movie'
  const rightType = right.type === 'series' || right.mediaType === 'tv' ? 'series' : 'movie'
  return leftType === rightType && Number(left.tmdbId) === Number(right.tmdbId)
}

export function mergeEnrichedTitle(base, enriched) {
  if (!sameTmdbTitle(base, enriched)) return base
  const merged = mergeMeaningfulObject(base, enriched)
  const providerIds = mergeUnique(base.providerIds, enriched.providerIds)
  const enrichedCollectionChecked = enriched.type !== 'series' && enriched.collectionChecked === true
  const title = isUsableTitle(base.title)
    ? base.title
    : isUsableTitle(enriched.title)
      ? enriched.title
      : enriched.title || base.title || ''
  const baseVoteCount = Number(base.voteCount)
  const enrichedVoteCount = Number(enriched.voteCount)
  const useEnrichedVote = Number.isFinite(enrichedVoteCount)
    && (!Number.isFinite(baseVoteCount) || enrichedVoteCount >= baseVoteCount)
  const genreNames = mergeUnique(
    base.genreNames || base.genres?.map((genre) => typeof genre === 'string' ? genre : genre?.name),
    enriched.genreNames || enriched.genres?.map((genre) => typeof genre === 'string' ? genre : genre?.name),
  )
  const genres = mergeUnique(
    base.genres?.length ? base.genres : base.genreNames?.map((name) => ({ name })),
    enriched.genres?.length ? enriched.genres : enriched.genreNames?.map((name) => ({ name })),
  )
  const seasons = mergeUnique(base.seasons, enriched.seasons)
  const collectionIdChanged = enrichedCollectionChecked
    && Number(enriched.collectionId) !== Number(base.collectionId)
  const collectionId = enrichedCollectionChecked
    ? enriched.collectionId ?? null
    : base.collectionId ?? enriched.collectionId ?? null
  const collectionDetails = enrichedCollectionChecked
    ? collectionId === null
      ? null
      : enriched.collectionDetails || (collectionIdChanged ? null : base.collectionDetails) || null
    : base.collectionDetails || enriched.collectionDetails || null
  const collectionName = enrichedCollectionChecked
    ? collectionId === null
      ? null
      : enriched.collectionName || (collectionIdChanged ? null : base.collectionName) || null
    : base.collectionName || enriched.collectionName || null
  const smartFacets = mergeSmartFacets(base.smartFacets, enriched.smartFacets)
  if (enrichedCollectionChecked) {
    smartFacets.collection = collectionId === null
      ? null
      : enriched.smartFacets?.collection
        || (collectionIdChanged ? null : base.smartFacets?.collection)
        || { id: collectionId, name: collectionName }
  }

  return {
    ...merged,
    id: base.id,
    tmdbId: base.tmdbId,
    type: base.type,
    mediaType: base.mediaType || enriched.mediaType,
    source: base.source || enriched.source,
    title,
    originalTitle: firstMeaningful(base.originalTitle, enriched.originalTitle, title),
    description: moreInformativeText(base.description, enriched.description),
    releaseDate: firstMeaningful(base.releaseDate, enriched.releaseDate),
    year: firstMeaningful(base.year, enriched.year),
    runtimeMinutes: firstMeaningful(base.runtimeMinutes, enriched.runtimeMinutes),
    originalLanguage: firstMeaningful(base.originalLanguage, enriched.originalLanguage),
    posterPath: firstMeaningful(base.posterPath, enriched.posterPath),
    posterUrl: firstMeaningful(base.posterUrl, enriched.posterUrl),
    neutralPosterPath: firstMeaningful(base.neutralPosterPath, enriched.neutralPosterPath),
    neutralPosterUrl: firstMeaningful(base.neutralPosterUrl, enriched.neutralPosterUrl),
    backdropPath: firstMeaningful(base.backdropPath, enriched.backdropPath),
    backdropUrl: firstMeaningful(base.backdropUrl, enriched.backdropUrl),
    artwork: mergeArtwork(base.artwork, enriched.artwork),
    cast: mergeUnique(base.cast, enriched.cast),
    videos: mergeUnique(base.videos, enriched.videos),
    genres,
    genreNames,
    genre: genreNames.length ? genreNames.join(' · ') : firstMeaningful(base.genre, enriched.genre, 'Ohne Genreangabe'),
    seasons,
    numberOfSeasons: Math.max(Number(base.numberOfSeasons) || 0, Number(enriched.numberOfSeasons) || 0) || null,
    numberOfEpisodes: Math.max(Number(base.numberOfEpisodes) || 0, Number(enriched.numberOfEpisodes) || 0) || null,
    providerIds,
    providerOffers: mergeProviderOffers(base.providerOffers, enriched.providerOffers),
    movieHubCatalog: base.movieHubCatalog === true || enriched.movieHubCatalog === true,
    smartFacets,
    collectionId,
    collectionName,
    collectionChecked: base.type === 'series' ? null : base.collectionChecked === true || enriched.collectionChecked === true,
    collectionDetails,
    ageRating: firstMeaningful(base.ageRating, enriched.ageRating),
    voteAverage: useEnrichedVote
      ? enriched.voteAverage ?? base.voteAverage ?? null
      : base.voteAverage ?? enriched.voteAverage ?? null,
    voteCount: Math.max(baseVoteCount || 0, enrichedVoteCount || 0) || null,
    popularity: Math.max(Number(base.popularity) || 0, Number(enriched.popularity) || 0) || null,
    metadataVersion: Math.max(Number(base.metadataVersion) || 0, Number(enriched.metadataVersion) || 0),
    metadataComplete: isUsableTitle(title) && (base.metadataComplete === true || enriched.metadataComplete === true),
    metadataUpdatedAt: latestTimestamp(base.metadataUpdatedAt, enriched.metadataUpdatedAt),
  }
}
