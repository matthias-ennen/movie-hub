export const SEARCH_DETAIL_VERSION = 1
export const SEARCH_DETAIL_BUCKET_COUNT = 64
export const SEARCH_DETAIL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SEARCH_DETAIL_CACHE_LIMIT = 100

const STORAGE_KEY = 'movie-hub-search-detail-cache-v1'
const memoryDetails = new Map()
const shardPromises = new Map()

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
    originalLanguage: entry?.originalLanguage || null,
    genres: [],
    genre: entry?.genre || 'Ohne Genreangabe',
    cast: Array.isArray(entry?.cast) ? entry.cast : [],
    videos: Array.isArray(entry?.videos) ? entry.videos : [],
    voteAverage: Number.isFinite(Number(entry?.voteAverage)) ? Number(entry.voteAverage) : null,
    score: entry?.score || '–',
    meta: entry?.meta || (type === 'series' ? 'Serie' : 'Film'),
    detailSource: entry?.detailSource || 'search-index',
  }
}

export function mergeSearchDetail(entry, detail) {
  const fallback = toSearchDetailFallback(entry)
  if (!detail || detail.id !== fallback.id) return fallback

  const genreNames = normaliseGenres(detail)
  const voteAverage = Number.isFinite(Number(detail.voteAverage))
    ? Number(detail.voteAverage)
    : fallback.voteAverage

  return {
    ...fallback,
    ...detail,
    id: fallback.id,
    tmdbId: fallback.tmdbId,
    type: fallback.type,
    providerIds: fallback.providerIds || [],
    providerOffers: fallback.providerOffers || [],
    scope: fallback.scope,
    source: 'tmdb',
    genres: genreNames.map((name) => ({ name })),
    genre: genreNames.join(' · ') || fallback.genre,
    cast: Array.isArray(detail.cast) ? detail.cast : fallback.cast,
    videos: Array.isArray(detail.videos) ? detail.videos : fallback.videos,
    voteAverage,
    score: formatScore(voteAverage),
    meta: detail.meta || fallback.meta,
    artwork: detail.artwork || fallback.artwork || null,
    collectionId: detail.collectionChecked === true
      ? detail.collectionId ?? null
      : fallback.collectionId ?? detail.collectionId ?? null,
    collectionName: detail.collectionChecked === true
      ? detail.collectionName || null
      : fallback.collectionName || detail.collectionName || null,
    collectionChecked: fallback.type === 'movie'
      ? detail.collectionChecked === true || fallback.collectionChecked === true
      : null,
    collectionDetails: detail.collectionDetails || fallback.collectionDetails || null,
    metadataVersion: Math.max(Number(detail.metadataVersion) || 0, Number(fallback.metadataVersion) || 0),
    detailSource: detail.completeness || 'discover',
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

function writePersistentCache(storage, id, value, now) {
  if (!storage?.setItem) return
  try {
    const existing = readPersistentCache(storage, now).filter((entry) => entry.id !== id)
    const next = [{ id, value, cachedAt: now }, ...existing].slice(0, SEARCH_DETAIL_CACHE_LIMIT)
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Public TMDB metadata may be cached, but storage quota/private-mode failures
    // must never prevent opening a title.
  }
}

function getPersistentDetail(storage, id, now) {
  const cached = readPersistentCache(storage, now).find((entry) => entry.id === id)
  return cached?.value || null
}

async function loadShard(bucket, fetchImpl) {
  if (!bucket) return null
  if (!shardPromises.has(bucket)) {
    shardPromises.set(bucket, Promise.resolve(fetchImpl(`/search-details/${bucket}.json`))
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
        shardPromises.delete(bucket)
        throw error
      }))
  }
  return shardPromises.get(bucket)
}

export async function loadSearchDetail(entry, {
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  if (!entry?.id) return toSearchDetailFallback(entry)

  const inMemory = memoryDetails.get(entry.id)
  if (inMemory) return mergeSearchDetail(entry, inMemory)

  const persistent = getPersistentDetail(storage, entry.id, now)
  if (persistent) {
    memoryDetails.set(entry.id, persistent)
    return mergeSearchDetail(entry, persistent)
  }

  if (typeof fetchImpl !== 'function') return toSearchDetailFallback(entry)
  const bucket = searchDetailBucket(entry)
  if (!bucket) return toSearchDetailFallback(entry)

  const shard = await loadShard(bucket, fetchImpl)
  const detail = shard.entries.find((candidate) => candidate?.id === entry.id)
  if (!detail) return toSearchDetailFallback(entry)

  memoryDetails.set(entry.id, detail)
  writePersistentCache(storage, entry.id, detail, now)
  return mergeSearchDetail(entry, detail)
}

export function clearSearchDetailMemoryCache() {
  memoryDetails.clear()
  shardPromises.clear()
}
