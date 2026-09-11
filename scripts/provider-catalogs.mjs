import { TMDB_PROVIDER_REGISTRY } from '../src/providers/providerRegistry.js'
import {
  normalizeTmdbTitle,
  normalizeTmdbVideos,
  normalizeTmdbWatchProviders,
  toMovieHubTitle,
} from '../src/services/tmdb.js'
import { selectNeutralTmdbPosterUrl } from '../src/services/tmdbImages.js'

const token = process.env.TMDB_API_READ_TOKEN
const language = process.env.TMDB_LANGUAGE || 'de-DE'
const country = process.env.TMDB_COUNTRY || 'DE'

export const PROVIDER_CATALOG_SIZE = 100
export const PROVIDER_HOME_SIZE = 20
export const PROVIDER_BROWSE_OFFER_TYPES = ['flatrate', 'free', 'ads']

export const PROVIDER_CATALOG_DEFINITIONS = TMDB_PROVIDER_REGISTRY.map((provider) => ({
  id: provider.id,
  label: provider.label,
  aliases: provider.aliases,
  homeTitle: provider.homeTitle,
  movieTitle: provider.movieTitle,
  seriesTitle: provider.seriesTitle,
}))

const REQUEST_CONCURRENCY = 5
const MAX_RETRIES = 3
const ACCENT_PAIRS = [
  ['#c88953', '#50311f'],
  ['#d45d36', '#23314c'],
  ['#7199a7', '#25353a'],
  ['#6d8291', '#1a212b'],
  ['#b04a35', '#321b18'],
  ['#57777b', '#182628'],
  ['#497ea8', '#16283a'],
  ['#7168a5', '#241f3c'],
]

function normalizeProviderName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function providerKey(mediaType, id) {
  return `${mediaType}-${id}`
}

function movieHubId(mediaType, id) {
  return `tmdb-${mediaType === 'tv' ? 'series' : 'movie'}-${id}`
}

function accentFor(tmdbId) {
  return ACCENT_PAIRS[Math.abs(Number(tmdbId) || 0) % ACCENT_PAIRS.length]
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function tmdbFetch(path, searchParams = {}, attempt = 0) {
  if (!token) throw new Error('TMDB_API_READ_TOKEN is missing.')

  const endpoint = new URL(`https://api.themoviedb.org/3${path}`)
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== '') endpoint.searchParams.set(key, String(value))
  }

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfter = Number(response.headers.get('retry-after'))
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 500 * (2 ** attempt)
    await sleep(delay)
    return tmdbFetch(path, searchParams, attempt + 1)
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`TMDB request failed with HTTP ${response.status}: ${body.slice(0, 300)}`)
  }

  return response.json()
}

async function mapWithConcurrency(values, limit, callback) {
  const results = new Array(values.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++
      results[index] = await callback(values[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return results
}

function findProviderIds(providerDirectory, definition) {
  const aliases = new Set(definition.aliases)
  return [...new Set(providerDirectory
    .filter((provider) => aliases.has(normalizeProviderName(provider?.provider_name)))
    .map((provider) => Number(provider?.provider_id))
    .filter((providerId) => Number.isFinite(providerId)))]
}

async function loadProviderDirectory(mediaType) {
  const payload = await tmdbFetch(`/watch/providers/${mediaType}`, {
    language,
    watch_region: country,
  })
  return Array.isArray(payload?.results) ? payload.results : []
}

function normalizeDiscoverCandidate(raw, mediaType) {
  const id = Number(raw?.id)
  if (!Number.isFinite(id)) return null
  return {
    id,
    mediaType,
    popularity: Number.isFinite(Number(raw?.popularity)) ? Number(raw.popularity) : 0,
  }
}

export function buildProviderDiscoverParams(tmdbProviderIds, mediaType, page = 1) {
  const providerIds = (Array.isArray(tmdbProviderIds) ? tmdbProviderIds : [tmdbProviderIds])
    .map(Number)
    .filter(Number.isFinite)

  return {
    language,
    region: mediaType === 'movie' ? country : undefined,
    watch_region: country,
    with_watch_providers: providerIds.join('|'),
    with_watch_monetization_types: PROVIDER_BROWSE_OFFER_TYPES.join('|'),
    sort_by: 'popularity.desc',
    include_adult: false,
    page,
  }
}

async function discoverProviderCandidates(tmdbProviderIds, mediaType) {
  const providerIds = Array.isArray(tmdbProviderIds) ? tmdbProviderIds : [tmdbProviderIds]
  if (!providerIds.filter(Boolean).length) return []

  const results = []
  let page = 1
  let totalPages = 1

  while (results.length < PROVIDER_CATALOG_SIZE && page <= totalPages) {
    const path = mediaType === 'movie' ? '/discover/movie' : '/discover/tv'
    const payload = await tmdbFetch(path, buildProviderDiscoverParams(providerIds, mediaType, page))

    totalPages = Math.min(Number(payload?.total_pages) || 1, 500)
    const pageCandidates = (Array.isArray(payload?.results) ? payload.results : [])
      .map((item) => normalizeDiscoverCandidate(item, mediaType))
      .filter(Boolean)

    for (const candidate of pageCandidates) {
      if (!results.some((current) => current.id === candidate.id)) results.push(candidate)
      if (results.length >= PROVIDER_CATALOG_SIZE) break
    }
    page += 1
  }

  return results.slice(0, PROVIDER_CATALOG_SIZE)
}

function addMembership(memberships, candidate, definition) {
  const key = providerKey(candidate.mediaType, candidate.id)
  const current = memberships.get(key) || new Map()
  current.set(definition.id, {
    id: definition.id,
    tmdbProviderId: null,
    offerTypes: ['catalog'],
  })
  memberships.set(key, current)
}

function mergeProviderOffers(primary = [], membershipOffers = []) {
  const merged = new Map()
  for (const offer of [...primary, ...membershipOffers]) {
    if (!offer?.id) continue
    const current = merged.get(offer.id)
    if (!current) {
      merged.set(offer.id, {
        ...offer,
        offerTypes: Array.isArray(offer.offerTypes) ? [...offer.offerTypes] : [],
      })
      continue
    }
    const offerTypes = [...new Set([
      ...(Array.isArray(current.offerTypes) ? current.offerTypes : []),
      ...(Array.isArray(offer.offerTypes) ? offer.offerTypes : []),
    ])]
    merged.set(offer.id, {
      ...current,
      ...offer,
      tmdbProviderId: current.tmdbProviderId ?? offer.tmdbProviderId ?? null,
      offerTypes,
    })
  }
  return [...merged.values()]
}

async function resolveCatalogTitle(candidate, membershipOffers) {
  const path = candidate.mediaType === 'movie' ? `/movie/${candidate.id}` : `/tv/${candidate.id}`
  const payload = await tmdbFetch(path, {
    language,
    append_to_response: 'credits,videos,watch/providers,images',
    include_image_language: 'null',
  })

  const normalized = {
    ...normalizeTmdbTitle(payload, candidate.mediaType),
    neutralPosterUrl: selectNeutralTmdbPosterUrl(payload?.images),
  }
  const providerData = normalizeTmdbWatchProviders(payload?.['watch/providers'], country)
  const videos = normalizeTmdbVideos([payload?.videos], normalized.originalLanguage)
  const providerOffers = mergeProviderOffers(providerData.providerOffers, membershipOffers)
  const [accent, accent2] = accentFor(normalized.tmdbId)

  return toMovieHubTitle(normalized, {
    id: movieHubId(candidate.mediaType, normalized.tmdbId),
    accent,
    accent2,
    videos,
    ...providerData,
    providerOffers,
    providerIds: providerOffers.map((offer) => offer.id),
  })
}

export function mergeProviderCatalogTitle(existing, incoming) {
  if (!existing) return incoming
  if (!incoming) return existing

  const providerOffers = mergeProviderOffers(existing.providerOffers, incoming.providerOffers)
  return {
    ...incoming,
    ...existing,
    providerIds: providerOffers.map((offer) => offer.id),
    providerOffers,
    neutralPosterUrl: existing.neutralPosterUrl || incoming.neutralPosterUrl || null,
    videos: Array.isArray(existing.videos) && existing.videos.length ? existing.videos : incoming.videos,
    cast: Array.isArray(existing.cast) && existing.cast.length ? existing.cast : incoming.cast,
  }
}

export function buildHomeIds(movieCandidates, seriesCandidates, limit = PROVIDER_HOME_SIZE) {
  return [...movieCandidates, ...seriesCandidates]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit)
    .map((candidate) => movieHubId(candidate.mediaType, candidate.id))
}

export function buildProviderHomeRows(providerCatalogs) {
  return PROVIDER_CATALOG_DEFINITIONS
    .map((definition) => {
      const catalog = providerCatalogs?.[definition.id]
      if (!catalog?.homeIds?.length) return null
      return {
        id: `provider-${definition.id}-home`,
        providerId: definition.id,
        title: catalog.homeTitle || definition.homeTitle,
        ids: catalog.homeIds,
      }
    })
    .filter(Boolean)
}

export async function generateProviderCatalogs() {
  if (!token) throw new Error('TMDB_API_READ_TOKEN is missing. Provider catalogs run only in trusted CI.')

  const [movieDirectory, tvDirectory] = await Promise.all([
    loadProviderDirectory('movie'),
    loadProviderDirectory('tv'),
  ])

  const providerCatalogs = {}
  const memberships = new Map()
  const allCandidates = new Map()

  for (const definition of PROVIDER_CATALOG_DEFINITIONS) {
    const movieProviderIds = findProviderIds(movieDirectory, definition)
    const tvProviderIds = findProviderIds(tvDirectory, definition)
    const [movies, series] = await Promise.all([
      discoverProviderCandidates(movieProviderIds, 'movie'),
      discoverProviderCandidates(tvProviderIds, 'tv'),
    ])

    for (const candidate of [...movies, ...series]) {
      allCandidates.set(providerKey(candidate.mediaType, candidate.id), candidate)
      addMembership(memberships, candidate, definition)
    }

    providerCatalogs[definition.id] = {
      id: definition.id,
      label: definition.label,
      source: 'tmdb-watch-providers',
      browseOfferTypes: [...PROVIDER_BROWSE_OFFER_TYPES],
      homeTitle: definition.homeTitle,
      movieTitle: definition.movieTitle,
      seriesTitle: definition.seriesTitle,
      movieTmdbProviderId: movieProviderIds.length === 1 ? movieProviderIds[0] : null,
      seriesTmdbProviderId: tvProviderIds.length === 1 ? tvProviderIds[0] : null,
      movieTmdbProviderIds: movieProviderIds,
      seriesTmdbProviderIds: tvProviderIds,
      movieIds: movies.map((candidate) => movieHubId('movie', candidate.id)),
      seriesIds: series.map((candidate) => movieHubId('tv', candidate.id)),
      homeIds: buildHomeIds(movies, series),
      movieCount: movies.length,
      seriesCount: series.length,
    }

    const exposed = movieProviderIds.length || tvProviderIds.length
    console.log(
      `Provider catalog ${definition.label}: ${movies.length} movies · ${series.length} series`
      + `${exposed ? ` · TMDB ${[...new Set([...movieProviderIds, ...tvProviderIds])].join(',')}` : ' (provider not exposed by TMDB for this region)'}`,
    )
  }

  const uniqueCandidates = [...allCandidates.values()]
  console.log(`Provider catalogs: resolving ${uniqueCandidates.length} unique titles`)
  const titles = await mapWithConcurrency(uniqueCandidates, REQUEST_CONCURRENCY, async (candidate) => {
    const offers = [...(memberships.get(providerKey(candidate.mediaType, candidate.id))?.values() || [])]
    return resolveCatalogTitle(candidate, offers)
  })

  return {
    providerCatalogs,
    titles,
  }
}
