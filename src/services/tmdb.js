import { TMDB_PROVIDER_REGISTRY } from '../providers/providerRegistry.js'

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

const TARGET_PROVIDER_IDS = new Map(
  TMDB_PROVIDER_REGISTRY.flatMap((provider) => provider.aliases.map((alias) => [alias, provider.id])),
)

const WATCH_OFFER_TYPES = ['flatrate', 'free', 'ads', 'rent', 'buy']
const SUPPORTED_TMDB_VIDEO_TYPES = new Set(['Trailer', 'Teaser'])
const GERMAN_AGE_RATINGS = new Set([0, 6, 12, 16, 18])
const MOVIE_RELEASE_TYPE_PRIORITY = new Map([
  [3, 0], // theatrical
  [2, 1], // limited theatrical
  [4, 2], // digital
  [5, 3], // physical
  [6, 4], // TV
  [1, 5], // premiere
])

function normalizeProviderName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function normalizeMediaType(mediaType) {
  if (mediaType === 'movie') return 'movie'
  if (mediaType === 'tv' || mediaType === 'series') return 'series'
  throw new Error(`Unsupported TMDB media type: ${mediaType}`)
}

function extractYear(value) {
  if (!value || typeof value !== 'string') return null
  const match = value.match(/^\d{4}/)
  return match ? Number(match[0]) : null
}

function formatRuntime(minutes) {
  if (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return null
  const value = Number(minutes)
  const hours = Math.floor(value / 60)
  const rest = value % 60

  if (!hours) return `${rest} Min.`
  if (!rest) return `${hours} Std.`
  return `${hours} Std. ${rest} Min.`
}

function formatScore(value) {
  if (!Number.isFinite(Number(value))) return '–'
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function parseGermanAgeRating(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = text.match(/(?:^|\D)(0|6|12|16|18)(?:\D|$)/)
  if (!match) return null
  const rating = Number(match[1])
  return GERMAN_AGE_RATINGS.has(rating) ? rating : null
}

export function normalizeGermanAgeRating(payload, mediaType) {
  const type = normalizeMediaType(mediaType)

  if (type === 'movie') {
    const regions = Array.isArray(payload?.release_dates?.results) ? payload.release_dates.results : []
    const german = regions.find((region) => region?.iso_3166_1 === 'DE')
    const releases = Array.isArray(german?.release_dates) ? german.release_dates : []

    const candidates = releases
      .map((release) => ({
        rating: parseGermanAgeRating(release?.certification),
        priority: MOVIE_RELEASE_TYPE_PRIORITY.get(Number(release?.type)) ?? 99,
        date: Date.parse(release?.release_date || ''),
      }))
      .filter((entry) => entry.rating !== null)
      .sort((a, b) => a.priority - b.priority || (Number.isFinite(a.date) ? a.date : Infinity) - (Number.isFinite(b.date) ? b.date : Infinity))

    return candidates[0]?.rating ?? null
  }

  const ratings = Array.isArray(payload?.content_ratings?.results) ? payload.content_ratings.results : []
  const german = ratings.find((rating) => rating?.iso_3166_1 === 'DE')
  return parseGermanAgeRating(german?.rating)
}

export function buildTmdbImageUrl(path, size = 'w500') {
  if (!path) return null
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${TMDB_IMAGE_BASE_URL}/${size}${normalizedPath}`
}

/**
 * Reduce TMDB's regional watch-provider response to the providers Movie Hub
 * currently supports. The original TMDB link and offer types stay in the
 * catalog so a later UI/Intent step can make an informed choice.
 */
export function normalizeTmdbWatchProviders(payload, countryCode = 'DE') {
  const regional = payload?.results?.[countryCode]
  if (!regional || typeof regional !== 'object') {
    return { providerIds: [], providerOffers: [], watchProviderLink: null }
  }

  const offers = new Map()
  for (const offerType of WATCH_OFFER_TYPES) {
    const providers = Array.isArray(regional[offerType]) ? regional[offerType] : []
    for (const provider of providers) {
      const providerId = TARGET_PROVIDER_IDS.get(normalizeProviderName(provider?.provider_name))
      if (!providerId) continue

      const existing = offers.get(providerId) || {
        id: providerId,
        tmdbProviderId: Number.isFinite(Number(provider?.provider_id)) ? Number(provider.provider_id) : null,
        offerTypes: [],
      }
      if (!existing.offerTypes.includes(offerType)) existing.offerTypes.push(offerType)
      offers.set(providerId, existing)
    }
  }

  const providerOffers = [...offers.values()]
  return {
    providerIds: providerOffers.map((provider) => provider.id),
    providerOffers,
    watchProviderLink: typeof regional.link === 'string' ? regional.link : null,
  }
}

function videoLanguage(video) {
  return String(video?.iso_639_1 || '').toLowerCase()
}

function videoScore(video, preferredLanguage, type) {
  let score = 0
  if (videoLanguage(video) === preferredLanguage) score += 100
  if (video.official) score += 20
  if (video.type === type) score += 10
  if (Number(video.size) >= 1080) score += 2
  const publishedAt = Date.parse(video.published_at)
  if (Number.isFinite(publishedAt)) score += Math.min(publishedAt / 1e15, 1)
  return score
}

/**
 * Select at most one trailer and one teaser from TMDB's public YouTube
 * references. German and official entries win; the title's original language
 * is the next fallback. Movie Hub stores only the public video reference.
 */
export function normalizeTmdbVideos(payloads, originalLanguage = 'en') {
  const candidates = (Array.isArray(payloads) ? payloads : [payloads])
    .flatMap((payload) => Array.isArray(payload?.results) ? payload.results : [])
    .filter((video) => (
      video?.site === 'YouTube'
      && typeof video.key === 'string'
      && /^[A-Za-z0-9_-]{6,20}$/.test(video.key)
      && SUPPORTED_TMDB_VIDEO_TYPES.has(video.type)
    ))

  const unique = [...new Map(candidates.map((video) => [video.key, video])).values()]
  const preferredLanguages = [...new Set(['de', String(originalLanguage || '').toLowerCase(), 'en'].filter(Boolean))]

  function select(type, excludedKeys = new Set()) {
    const matching = unique.filter((video) => video.type === type && !excludedKeys.has(video.key))
    if (!matching.length) return null

    for (const preferredLanguage of preferredLanguages) {
      const localized = matching
        .filter((video) => videoLanguage(video) === preferredLanguage)
        .sort((a, b) => videoScore(b, preferredLanguage, type) - videoScore(a, preferredLanguage, type))
      if (localized[0]) return localized[0]
    }

    return matching.sort((a, b) => videoScore(b, '', type) - videoScore(a, '', type))[0]
  }

  const trailer = select('Trailer')
  const teaser = select('Teaser', new Set(trailer ? [trailer.key] : []))

  return [trailer, teaser].filter(Boolean).map((video) => ({
    id: `youtube-${video.key}`,
    type: video.type.toLowerCase(),
    label: video.type === 'Teaser' ? 'Teaser' : 'Trailer',
    name: video.name || null,
    language: videoLanguage(video) || null,
    official: Boolean(video.official),
    site: 'youtube',
    key: video.key,
    url: `https://www.youtube.com/watch?v=${video.key}`,
  }))
}

export function normalizeTmdbTitle(payload, mediaType) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('TMDB payload must be an object')
  }

  if (!Number.isFinite(Number(payload.id))) {
    throw new Error('TMDB payload is missing a valid id')
  }

  const type = normalizeMediaType(mediaType)
  const isMovie = type === 'movie'
  const title = isMovie ? payload.title : payload.name
  const originalTitle = isMovie ? payload.original_title : payload.original_name
  const releaseDate = isMovie ? payload.release_date : payload.first_air_date
  const runtimeMinutes = isMovie
    ? payload.runtime ?? null
    : Array.isArray(payload.episode_run_time) && payload.episode_run_time.length
      ? payload.episode_run_time[0]
      : null

  const fullCast = Array.isArray(payload.credits?.cast)
    ? payload.credits.cast
      .filter((person) => person?.name && Number.isFinite(Number(person.id)))
      .map((person) => ({
        id: Number.isFinite(Number(person.id)) ? Number(person.id) : null,
        name: person.name,
        character: person.character || null,
        profileUrl: buildTmdbImageUrl(person.profile_path, 'w185'),
      }))
    : []
  const cast = fullCast.slice(0, 8)
  const movieDirectors = Array.isArray(payload.credits?.crew)
    ? payload.credits.crew.filter((person) => person?.job === 'Director')
    : []
  const tvCreators = Array.isArray(payload.created_by) ? payload.created_by : []
  const creators = [...new Map([...movieDirectors, ...tvCreators]
    .filter((person) => person?.name && Number.isFinite(Number(person.id)))
    .map((person) => [Number(person.id), {
      id: Number(person.id),
      name: person.name,
      profileUrl: buildTmdbImageUrl(person.profile_path, 'w185'),
    }])).values()]
  const keywordPayload = isMovie ? payload.keywords?.keywords : payload.keywords?.results
  const keywords = Array.isArray(keywordPayload)
    ? keywordPayload
      .filter((keyword) => keyword?.name && Number.isFinite(Number(keyword.id)))
      .map((keyword) => ({ id: Number(keyword.id), name: keyword.name }))
    : []
  const collection = isMovie && payload.belongs_to_collection?.name && Number.isFinite(Number(payload.belongs_to_collection.id))
    ? { id: Number(payload.belongs_to_collection.id), name: payload.belongs_to_collection.name }
    : null

  return {
    source: 'tmdb',
    tmdbId: Number(payload.id),
    type,
    title: title || originalTitle || `TMDB #${payload.id}`,
    originalTitle: originalTitle || title || null,
    description: payload.overview || '',
    year: extractYear(releaseDate),
    releaseDate: releaseDate || null,
    runtimeMinutes,
    numberOfSeasons: type === 'series' ? payload.number_of_seasons ?? null : null,
    numberOfEpisodes: type === 'series' ? payload.number_of_episodes ?? null : null,
    genres: Array.isArray(payload.genres)
      ? payload.genres.map((genre) => ({ id: genre.id ?? null, name: genre.name || '' })).filter((genre) => genre.name)
      : [],
    cast,
    smartFacets: {
      cast: fullCast,
      creators,
      keywords,
      collection,
    },
    voteAverage: Number.isFinite(Number(payload.vote_average)) ? Number(payload.vote_average) : null,
    voteCount: Number.isFinite(Number(payload.vote_count)) ? Number(payload.vote_count) : null,
    popularity: Number.isFinite(Number(payload.popularity)) ? Number(payload.popularity) : null,
    posterPath: payload.poster_path || null,
    backdropPath: payload.backdrop_path || null,
    posterUrl: buildTmdbImageUrl(payload.poster_path, 'w500'),
    backdropUrl: buildTmdbImageUrl(payload.backdrop_path, 'w1280'),
    originalLanguage: payload.original_language || null,
    status: payload.status || null,
    ageRating: normalizeGermanAgeRating(payload, type),
  }
}

export function toMovieHubTitle(normalized, options = {}) {
  if (!normalized || normalized.source !== 'tmdb') {
    throw new Error('Movie Hub catalog items must originate from a normalized TMDB title')
  }

  const seasons = Number(normalized.numberOfSeasons)
  const episodes = Number(normalized.numberOfEpisodes)
  let meta = formatRuntime(normalized.runtimeMinutes)

  if (normalized.type === 'series') {
    const seasonText = Number.isFinite(seasons) && seasons > 0
      ? `${seasons} ${seasons === 1 ? 'Staffel' : 'Staffeln'}`
      : null
    const episodeText = Number.isFinite(episodes) && episodes > 0 ? `${episodes} Folgen` : null
    meta = [seasonText, episodeText].filter(Boolean).join(' · ') || formatRuntime(normalized.runtimeMinutes) || 'Serie'
  }

  const providerOffers = Array.isArray(options.providerOffers) ? options.providerOffers : []
  const providerIds = providerOffers.length
    ? providerOffers.map((provider) => provider.id).filter(Boolean)
    : Array.isArray(options.providerIds) ? options.providerIds : []

  return {
    ...normalized,
    id: options.id || `tmdb-${normalized.type}-${normalized.tmdbId}`,
    meta: meta || (normalized.type === 'series' ? 'Serie' : 'Film'),
    genre: normalized.genres.map((genre) => genre.name).filter(Boolean).join(' · ') || 'Ohne Genreangabe',
    score: formatScore(normalized.voteAverage),
    providerIds,
    providerOffers,
    watchProviderLink: options.watchProviderLink || null,
    videos: Array.isArray(options.videos) ? options.videos : [],
    accent: options.accent || '#657184',
    accent2: options.accent2 || '#1c2531',
  }
}
