const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

const PREFERRED_IMAGE_LANGUAGES = new Map([
  [null, 0],
  ['de', 1],
  ['en', 2],
])

const ALLOWED_ARTWORK_EXTENSIONS = new Set(['jpg', 'jpeg'])

const POSTER_MIN_WIDTH = 500
const POSTER_MIN_HEIGHT = 750
const POSTER_MIN_ASPECT_RATIO = 0.55
const POSTER_MAX_ASPECT_RATIO = 0.8

const BACKDROP_MIN_WIDTH = 1280
const BACKDROP_MIN_HEIGHT = 720
const BACKDROP_MIN_ASPECT_RATIO = 1.6
const BACKDROP_MAX_ASPECT_RATIO = 2.0

function normalizedPath(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const path = value.trim()
  return path.startsWith('/') ? path : `/${path}`
}

function artworkExtension(path) {
  const normalized = normalizedPath(path)
  const match = normalized?.match(/\.([a-z0-9]+)(?:\?.*)?$/i)
  return match ? match[1].toLowerCase() : null
}

function supportedArtworkPath(path) {
  const extension = artworkExtension(path)
  return Boolean(extension && ALLOWED_ARTWORK_EXTENSIONS.has(extension))
}

function imageScore(image) {
  const voteAverage = Number.isFinite(Number(image?.vote_average)) ? Number(image.vote_average) : 0
  const voteCount = Number.isFinite(Number(image?.vote_count)) ? Number(image.vote_count) : 0
  const width = Number.isFinite(Number(image?.width)) ? Number(image.width) : 0
  const height = Number.isFinite(Number(image?.height)) ? Number(image.height) : 0
  return (voteAverage * 1000000) + (Math.min(voteCount, 9999) * 1000) + Math.max(width, height)
}

function languageRank(value) {
  return PREFERRED_IMAGE_LANGUAGES.get(value ?? null) ?? 3
}

function imageList(payload, key) {
  if (Array.isArray(payload?.[key])) return payload[key]
  if (Array.isArray(payload?.images?.[key])) return payload.images[key]
  return []
}

function imageDimensions(image) {
  const width = Number(image?.width)
  const height = Number(image?.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { width, height, ratio: width / height }
}

function suitablePoster(image) {
  if (!supportedArtworkPath(image?.file_path)) return false
  const dimensions = imageDimensions(image)
  if (!dimensions) return false
  return dimensions.width >= POSTER_MIN_WIDTH
    && dimensions.height >= POSTER_MIN_HEIGHT
    && dimensions.height > dimensions.width
    && dimensions.ratio >= POSTER_MIN_ASPECT_RATIO
    && dimensions.ratio <= POSTER_MAX_ASPECT_RATIO
}

function suitableBackdrop(image) {
  if (!supportedArtworkPath(image?.file_path)) return false
  const dimensions = imageDimensions(image)
  if (!dimensions) return false
  return dimensions.width >= BACKDROP_MIN_WIDTH
    && dimensions.height >= BACKDROP_MIN_HEIGHT
    && dimensions.width > dimensions.height
    && dimensions.ratio >= BACKDROP_MIN_ASPECT_RATIO
    && dimensions.ratio <= BACKDROP_MAX_ASPECT_RATIO
}

function rankedPaths(images, { limit, suitable }) {
  const sorted = images
    .filter((image) => normalizedPath(image?.file_path) && suitable(image))
    .sort((left, right) => languageRank(left?.iso_639_1) - languageRank(right?.iso_639_1)
      || imageScore(right) - imageScore(left)
      || normalizedPath(left.file_path).localeCompare(normalizedPath(right.file_path)))

  return [...new Set(sorted.map((image) => normalizedPath(image.file_path)))].slice(0, limit)
}

function withPrimaryFallback(paths, primaryPath, limit) {
  if (paths.length) return paths.slice(0, limit)
  const primary = normalizedPath(primaryPath)
  if (!primary || !supportedArtworkPath(primary)) return []
  return [primary].slice(0, limit)
}

export function selectTmdbPosterPaths(payload, { primaryPath = null, limit = 3 } = {}) {
  return withPrimaryFallback(
    rankedPaths(imageList(payload, 'posters'), { limit, suitable: suitablePoster }),
    primaryPath,
    limit,
  )
}

export function selectTmdbBackdropPaths(payload, { primaryPath = null, limit = 3 } = {}) {
  return withPrimaryFallback(
    rankedPaths(imageList(payload, 'backdrops'), { limit, suitable: suitableBackdrop }),
    primaryPath,
    limit,
  )
}

export function selectTmdbArtwork(payload, {
  primaryPosterPath = null,
  primaryBackdropPath = null,
  limit = 3,
} = {}) {
  return {
    posterPaths: selectTmdbPosterPaths(payload, { primaryPath: primaryPosterPath, limit }),
    heroBackdropPaths: selectTmdbBackdropPaths(payload, { primaryPath: primaryBackdropPath, limit }),
  }
}

export function tmdbImageUrl(path, size) {
  const normalized = normalizedPath(path)
  return normalized ? `${TMDB_IMAGE_BASE_URL}/${size}${normalized}` : null
}

function tmdbImagePathFromUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'image.tmdb.org') return null
    const match = url.pathname.match(/^\/t\/p\/[^/]+(\/.*)$/)
    if (!match?.[1]) return null
    return {
      path: match[1],
      search: url.search || '',
    }
  } catch {
    return null
  }
}

export function resizeTmdbImageUrl(value, size) {
  const parsed = tmdbImagePathFromUrl(value)
  if (!parsed || typeof size !== 'string' || !size.trim()) return value || null
  return `${TMDB_IMAGE_BASE_URL}/${size.trim()}${parsed.path}${parsed.search}`
}

export function responsiveTmdbImageProps(value, {
  candidates = ['w342', 'w500'],
  fallbackSize = candidates[0] || 'w500',
  sizes = null,
} = {}) {
  const parsed = tmdbImagePathFromUrl(value)
  if (!parsed) return { src: value || null }

  const normalizedCandidates = [...new Set((Array.isArray(candidates) ? candidates : [])
    .map((candidate) => String(candidate || '').trim())
    .filter((candidate) => /^w\d+$/.test(candidate)))]
  const fallback = /^w\d+$/.test(String(fallbackSize || ''))
    ? String(fallbackSize)
    : normalizedCandidates[0] || 'w500'
  const src = resizeTmdbImageUrl(value, fallback)
  const srcSet = normalizedCandidates
    .map((candidate) => {
      const width = Number(candidate.slice(1))
      return `${resizeTmdbImageUrl(value, candidate)} ${width}w`
    })
    .join(', ')

  return {
    src,
    ...(srcSet ? { srcSet } : {}),
    ...(srcSet && sizes ? { sizes } : {}),
  }
}

export function selectNeutralTmdbPosterPath(payload) {
  const neutral = imageList(payload, 'posters')
    .filter((image) => image?.iso_639_1 == null)
  return rankedPaths(neutral, { limit: 1, suitable: suitablePoster })[0] || null
}

export function selectNeutralTmdbPosterUrl(payload, size = 'w500') {
  return tmdbImageUrl(selectNeutralTmdbPosterPath(payload), size)
}
