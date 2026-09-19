import { buildFilmCollection } from '../src/catalog/filmCollections.js'
import {
  CURRENT_TITLE_METADATA_VERSION,
  titleNeedsMetadataEnrichment,
} from '../src/catalog/titleMetadata.js'
import {
  normalizeTmdbTitle,
  normalizeTmdbVideos,
  normalizeTmdbWatchProviders,
  toMovieHubTitle,
} from '../src/services/tmdb.js'

const DEFAULT_CONCURRENCY = 3
const DEFAULT_MAX_REQUESTS = 4000
const DEFAULT_MAX_RETRIES = 4

function canonicalTitleKey(value) {
  const type = value?.type === 'series' || value?.mediaType === 'tv' ? 'series' : 'movie'
  const tmdbId = Number(value?.tmdbId)
  return Number.isInteger(tmdbId) && tmdbId > 0 ? `${type}:${tmdbId}` : null
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function completeMetadata(value, options = {}) {
  return Boolean(canonicalTitleKey(value)) && !titleNeedsMetadataEnrichment(value, options)
}

function mergeAiringMetadata(entry, metadata) {
  const type = entry.type === 'series' ? 'series' : 'movie'
  const { smartFacets: _smartFacets, ...displayMetadata } = metadata
  return {
    ...displayMetadata,
    id: metadata.id || `tmdb-${type}-${entry.tmdbId}`,
    source: 'tmdb',
    tmdbId: Number(entry.tmdbId),
    type,
    mediaType: type === 'series' ? 'tv' : 'movie',
    providerIds: [...new Set([
      ...(Array.isArray(metadata.providerIds) ? metadata.providerIds : []),
      'waipu',
    ])],
    airings: entry.airings,
    nextAiring: entry.nextAiring,
    airingCount: entry.airingCount,
  }
}

async function mapWithConcurrency(values, limit, callback) {
  let nextIndex = 0
  const results = new Array(values.length)
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++
      results[index] = await callback(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(values.length, limit) }, worker))
  return results
}

export class WaipuTmdbMetadataClient {
  constructor({
    token,
    language = 'de-DE',
    country = 'DE',
    fetchImpl = fetch,
    maxRequests = DEFAULT_MAX_REQUESTS,
    maxRetries = DEFAULT_MAX_RETRIES,
    sleepImpl = sleep,
  } = {}) {
    if (!token) throw new Error('TMDB_API_READ_TOKEN is missing for Waipu title metadata.')
    this.token = token
    this.language = language
    this.country = country
    this.fetchImpl = fetchImpl
    this.maxRequests = Math.max(1, Number(maxRequests) || DEFAULT_MAX_REQUESTS)
    this.maxRetries = Math.max(0, Number(maxRetries) || DEFAULT_MAX_RETRIES)
    this.sleep = sleepImpl
    this.requestsStarted = 0
    this.collectionCache = new Map()
  }

  async request(path, searchParams = {}, attempt = 0) {
    if (this.requestsStarted >= this.maxRequests) {
      const error = new Error(`TMDB metadata request budget exhausted after ${this.requestsStarted} requests.`)
      error.code = 'TMDB_METADATA_REQUEST_BUDGET'
      throw error
    }
    this.requestsStarted += 1
    const endpoint = new URL(`https://api.themoviedb.org/3${path}`)
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') endpoint.searchParams.set(key, String(value))
    }
    const response = await this.fetchImpl(endpoint, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}` },
    })
    if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
      const retryAfter = Number(response.headers?.get?.('retry-after'))
      await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 500 * (2 ** attempt))
      return this.request(path, searchParams, attempt + 1)
    }
    if (!response.ok) {
      const body = typeof response.text === 'function' ? await response.text() : ''
      const error = new Error(`TMDB metadata request failed with HTTP ${response.status}: ${body.slice(0, 300)}`)
      error.code = 'TMDB_METADATA_REQUEST_FAILED'
      error.status = response.status
      throw error
    }
    return response.json()
  }

  async loadTitle(entry, updatedAt = new Date().toISOString()) {
    const type = entry?.type === 'series' ? 'series' : 'movie'
    const tmdbType = type === 'series' ? 'tv' : 'movie'
    const ratingAppend = type === 'series' ? 'content_ratings' : 'release_dates'
    const detail = await this.request(`/${tmdbType}/${Number(entry.tmdbId)}`, {
      language: this.language,
      append_to_response: `credits,keywords,images,watch/providers,videos,${ratingAppend}`,
      include_image_language: 'null,de,en',
    })
    const normalized = normalizeTmdbTitle(detail, tmdbType)
    const providerData = normalizeTmdbWatchProviders(detail?.['watch/providers'], this.country)
    const videos = normalizeTmdbVideos([detail?.videos], normalized.originalLanguage)
    let collectionDetails = null

    if (normalized.type === 'movie' && normalized.collectionId) {
      if (!this.collectionCache.has(normalized.collectionId)) {
        this.collectionCache.set(normalized.collectionId, this.request(`/collection/${normalized.collectionId}`, {
          language: this.language,
        }).then((collection) => buildFilmCollection(collection, [normalized])))
      }
      collectionDetails = await this.collectionCache.get(normalized.collectionId)
    }

    return {
      ...toMovieHubTitle(normalized, {
        providerIds: providerData.providerIds,
        providerOffers: providerData.providerOffers,
        watchProviderLink: providerData.watchProviderLink,
        videos,
      }),
      collectionDetails,
      metadataVersion: CURRENT_TITLE_METADATA_VERSION,
      metadataComplete: true,
      metadataUpdatedAt: updatedAt,
    }
  }
}

export async function enrichWaipuTitleMetadata(entries, {
  catalogTitles = [],
  cachedTitles = [],
  loadTitleMetadata = null,
  concurrency = DEFAULT_CONCURRENCY,
  cacheMaxAgeDays = 30,
  now = new Date(),
  onProgress = null,
} = {}) {
  const timestamp = now instanceof Date ? now : new Date(now)
  const generatedAt = Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date().toISOString()
  const catalogByKey = new Map((Array.isArray(catalogTitles) ? catalogTitles : [])
    .filter((title) => completeMetadata(title))
    .map((title) => [canonicalTitleKey(title), title]))
  const cachedByKey = new Map((Array.isArray(cachedTitles) ? cachedTitles : [])
    .filter((title) => completeMetadata(title, {
      now: Date.parse(generatedAt),
      maxAgeDays: cacheMaxAgeDays,
    }))
    .map((title) => [canonicalTitleKey(title), title]))
  const metrics = {
    total: Array.isArray(entries) ? entries.length : 0,
    fromCatalog: 0,
    fromCache: 0,
    fetched: 0,
    complete: 0,
  }

  const enriched = await mapWithConcurrency(Array.isArray(entries) ? entries : [], Math.max(1, Number(concurrency) || 1), async (entry) => {
    const key = canonicalTitleKey(entry)
    let metadata = catalogByKey.get(key)
    if (metadata) metrics.fromCatalog += 1
    if (!metadata) {
      metadata = cachedByKey.get(key)
      if (metadata) metrics.fromCache += 1
    }
    if (!metadata) {
      if (typeof loadTitleMetadata !== 'function') {
        const error = new Error(`Complete TMDB metadata is unavailable for ${key}.`)
        error.code = 'WAIPU_TITLE_METADATA_MISSING'
        throw error
      }
      metadata = await loadTitleMetadata(entry, generatedAt)
      metrics.fetched += 1
    }
    const result = mergeAiringMetadata(entry, metadata)
    if (!completeMetadata(result)) {
      const error = new Error(`TMDB metadata is incomplete for ${key}.`)
      error.code = 'WAIPU_TITLE_METADATA_INCOMPLETE'
      throw error
    }
    metrics.complete += 1
    if (typeof onProgress === 'function' && (metrics.complete === 1 || metrics.complete % 100 === 0 || metrics.complete === entries.length)) {
      onProgress({ processed: metrics.complete, total: entries.length, ...metrics })
    }
    return result
  })

  return { entries: enriched, metrics, generatedAt }
}

export function requireCompleteWaipuTitleMetadata(entries) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!completeMetadata(entry)) {
      throw new Error(`Waipu title metadata is incomplete for ${canonicalTitleKey(entry) || 'unknown title'}.`)
    }
  }
  return true
}
