const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

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

export function buildTmdbImageUrl(path, size = 'w500') {
  if (!path) return null
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${TMDB_IMAGE_BASE_URL}/${size}${normalizedPath}`
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
    voteAverage: Number.isFinite(Number(payload.vote_average)) ? Number(payload.vote_average) : null,
    voteCount: Number.isFinite(Number(payload.vote_count)) ? Number(payload.vote_count) : null,
    posterPath: payload.poster_path || null,
    backdropPath: payload.backdrop_path || null,
    posterUrl: buildTmdbImageUrl(payload.poster_path, 'w500'),
    backdropUrl: buildTmdbImageUrl(payload.backdrop_path, 'w1280'),
    originalLanguage: payload.original_language || null,
    status: payload.status || null,
  }
}
