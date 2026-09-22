import { normalizeSeriesSeasons } from '../catalog/seriesNavigation.js'
import { mergeEnrichedTitle } from '../catalog/titleMetadata.js'

export const SEARCH_DETAIL_VERSION = 1
export const SEARCH_DETAIL_BUCKET_COUNT = 64
export const SEARCH_DETAIL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SEARCH_DETAIL_CACHE_LIMIT = 100
export const SEARCH_DETAIL_MANIFEST_TTL_MS = 5 * 60 * 1000

const STORAGE_KEY = 'movie-hub-search-detail-cache-v1'
const memoryDetails = new Map()
const shardPromises = new Map()
let manifestState = null
let manifestPromise = null
let manifestFetchImpl = null

function numericTmdbId(entry) {
  const value = Number(entry?.tmdbId)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function searchDetailBucket(entry) {
  const tmdbId = numericTmdbId(entry)
  if (!tmdbId) return null
  return (Math.abs(tmdbId) % SEARCH_DETAIL_BUCKET_COUNT).toString(16).padStart(2, '0')
}

function formatScore(value) {
  if (!Number.isFinite(Number(value))) return '–'
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function normaliseGenres(detail) {
  if (Array.isArray(detail?.genreNames)) return detail.genreNames.filter(Boolean)
  if (Array.isArray(detail?.genres)) {
    return detail.genres
      .map((genre) => typeof genre === 'string' ? genre : genre?.name)
      .filter(Boolean)
  }
  return []
}

export function toSearchDetailFallback(entry) {
  const type = entry?.type === 'series' ? 'series' : 'movie'
  const numberOfSeasons = type === 'series' && Number.isInteger(Number(entry?.numberOfSeasons))
    ? Number(entry.numberOfSeasons)
    : null
  return {
    ...entry,
    source: 'tmdb',
    type,
    description: entry?.description || '',
    releaseDate: entry?.releaseDate || null,
    backdropUrl: entry?.backdropUrl || null,
    artwork: entry?.artwork || null,
    collectionId: entry?.collectionId ?? null,
    collectionName: entry?.collectionName || null,
    collectionChecked: type === 'movie' ? entry?.collectionChecked === true : null,
    collectionDetails: entry?.collectionDetails || null,
    metadataVersion: Number(entry?.metadataVersion) || 1,
    metadataComplete: entry?.metadataComplete === true,
    metadataChecks: entry?.metadataChecks && typeof entry.metadataChecks === 'object' ? entry.metadataChecks : {},
    originalLanguage: entry?.originalLanguage || null,
    runtimeMinutes: Number.isFinite(Number(entry?.runtimeMinutes)) ? Number(entry.runtimeMinutes) : null,
    numberOfSeasons,
    numberOfEpisodes: type === 'series' && Number.isInteger(Number(entry?.numberOfEpisodes))
      ? Number(entry.numberOfEpisodes)
      : null,
    seasons: type === 'series'
      ? normalizeSeriesSeasons(entry?.seasons, { seriesTmdbId: entry?.tmdbId, numberOfSeasons })
      : [],
    genres: Array.isArray(entry?.genres) ? entry.genres : [],
    genreNames: Array.isArray(entry?.genreNames) ? entry.genreNames : [],
    genre: entry?.genre || 'Ohne Genreangabe',
    cast: Array.isArray(entry?.cast) ? entry.cast : [],
    videos: Array.isArray(entry?.videos) ? entry.videos : [],
    smartFacets: entry?.smartFacets && typeof entry.smartFacets === 'object' ? entry.smartFacets : {},
    ageRating: Number.isFinite(Number(entry?.ageRating)) ? Number(entry.ageRating) : null,
    voteAverage: Number.isFinite(Number(entry?.voteAverage)) ? Number(entry.voteAverage) : null,
    score: entry?.score || '–',
    meta: entry?.meta || (type === 'series' ? 'Serie' : 'Film'),
    detailSource: entry?.detailSource || 'search-index',
  }
}

export function mergeSearchDetail(entry, detail) {
  const fallback = toSearchDetailFallback(entry)
  const sameIdentity = detail?.id === fallback.id
    || (Number(detail?.tmdbId) === Number(fallback.tmdbId)
      && (detail?.type === 'series' ? 'series' : 'movie') === fallback.type)
  if (!detail || !sameIdentity) return fallback

  const genreNames = normaliseGenres(detail)
  const enriched = mergeEnrichedTitle(fallback, {
    ...detail,
    tmdbId: detail.tmdbId ?? fallback.tmdbId,
    type: detail.type ?? fallback.type,
    genreNames,
  })
  const voteAverage = Number.isFinite(Number(enriched.voteAverage))
    ? Number(enriched.voteAverage)
    : fallback.voteAverage

  return {
    ...enriched,
    id: fallback.id,
    tmdbId: fallback.tmdbId,
    type: fallback.type,
    providerIds: fallback.providerIds || [],
    providerOffers: fallback.providerOffers || [],
    scope: fallback.scope,
    source: 'tmdb',
    voteAverage,
    score: formatScore(voteAverage),
    detailSource: detail.completeness || 'discover',
    canonicalPublished: true,
  }
}

function readPersistentCache(storage, now) {
  if (!storage?.getItem) return []
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) => (
      entry?.id
      && entry?.value
      && Number.isFinite(Number(entry?.cachedAt))
      && now - Number(entry.cachedAt) <= SEARCH_DETAIL_CACHE_TTL_MS
    ))
  } catch {
    return []
  }
}

function writePersistentCache(storage, id, value, now, generation) {
  if (!storage?.setItem) return
  try {
    const existing = readPersistentCache(storage, now).filter((entry) => entry.id !== id)
    const next = [{ id, value, cachedAt: now, generation }, ...existing].slice(0, SEARCH_DETAIL_CACHE_LIMIT)
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Public TMDB metadata may be cached, but storage quota/private-mode failures
    // must never prevent opening a title.
  }
}

function cacheMatchesGeneration(cached, generation) {
  return !generation || cached?.generation === generation
}

function getPersistentDetail(storage, id, now, generation) {
  const cached = readPersistentCache(storage, now).find((entry) => entry.id === id)
  return cacheMatchesGeneration(cached, generation) ? cached?.value || null : null
}

function publishedGeneration(payload) {
  if (payload?.kind !== 'search-detail-manifest' || !payload?.generatedAt) return null
  return `${Number(payload.version) || 1}:${String(payload.generatedAt)}`
}

async function loadPublishedGeneration(fetchImpl, now) {
  if (manifestState
    && manifestFetchImpl === fetchImpl
    && now - manifestState.loadedAt < SEARCH_DETAIL_MANIFEST_TTL_MS) {
    return manifestState.generation
  }

  if (manifestPromise && manifestFetchImpl === fetchImpl) return manifestPromise

  manifestFetchImpl = fetchImpl
  manifestPromise = Promise.resolve(fetchImpl(`/search-details/manifest.json?t=${encodeURIComponent(now)}`, {
    cache: 'no-store',
  }))
    .then((response) => {
      if (!response?.ok) throw new Error(`Detail-Manifest konnte nicht geladen werden (${response?.status ?? 'unbekannt'})`)
      return response.json()
    })
    .then((payload) => publishedGeneration(payload))
    .catch(() => null)
    .then((generation) => {
      manifestState = { generation, loadedAt: now }
      manifestPromise = null
      return generation
    })

  return manifestPromise
}

async function loadShard(bucket, fetchImpl, generation) {
  if (!bucket) return null
  const shardKey = `${generation || 'unversioned'}:${bucket}`
  if (!shardPromises.has(shardKey)) {
    const generationQuery = generation ? `?v=${encodeURIComponent(generation)}` : ''
    shardPromises.set(shardKey, Promise.resolve(fetchImpl(`/search-details/${bucket}.json${generationQuery}`, {
      cache: 'no-store',
    }))
      .then((response) => {
        if (!response?.ok) throw new Error(`Detail-Shard konnte nicht geladen werden (${response?.status ?? 'unbekannt'})`)
        return response.json()
      })
      .then((payload) => {
        if (payload?.kind !== 'search-detail-shard' || !Array.isArray(payload?.entries)) {
          throw new Error('Detail-Shard hat ein ungültiges Format.')
        }
        return payload
      })
      .catch((error) => {
        shardPromises.delete(shardKey)
        throw error
      }))
  }
  return shardPromises.get(shardKey)
}

export async function loadSearchDetail(entry, {
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  if (!entry?.id) return toSearchDetailFallback(entry)
  const canFetch = typeof fetchImpl === 'function'
  const generation = canFetch ? await loadPublishedGeneration(fetchImpl, now) : null

  const inMemory = memoryDetails.get(entry.id)
  if (inMemory && cacheMatchesGeneration(inMemory, generation)) {
    return mergeSearchDetail(entry, inMemory.value)
  }

  const persistent = getPersistentDetail(storage, entry.id, now, generation)
  if (persistent) {
    memoryDetails.set(entry.id, { value: persistent, generation })
    return mergeSearchDetail(entry, persistent)
  }

  if (!canFetch) return toSearchDetailFallback(entry)
  const bucket = searchDetailBucket(entry)
  if (!bucket) return toSearchDetailFallback(entry)

  const shard = await loadShard(bucket, fetchImpl, generation)
  const entryType = entry.type === 'series' ? 'series' : 'movie'
  const detail = shard.entries.find((candidate) => candidate?.id === entry.id)
    || shard.entries.find((candidate) => (
      Number(candidate?.tmdbId) === Number(entry.tmdbId)
      && (candidate?.type === 'series' ? 'series' : 'movie') === entryType
    ))
  if (!detail) return toSearchDetailFallback(entry)

  memoryDetails.set(entry.id, { value: detail, generation })
  writePersistentCache(storage, entry.id, detail, now, generation)
  return mergeSearchDetail(entry, detail)
}

export function clearSearchDetailMemoryCache() {
  memoryDetails.clear()
  shardPromises.clear()
  manifestState = null
  manifestPromise = null
  manifestFetchImpl = null
}
