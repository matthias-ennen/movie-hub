const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

function imageScore(image) {
  const voteAverage = Number.isFinite(Number(image?.vote_average)) ? Number(image.vote_average) : 0
  const voteCount = Number.isFinite(Number(image?.vote_count)) ? Number(image.vote_count) : 0
  const width = Number.isFinite(Number(image?.width)) ? Number(image.width) : 0
  return (voteAverage * 1000000) + (Math.min(voteCount, 9999) * 1000) + width
}

export function selectNeutralTmdbPosterPath(payload) {
  const posters = Array.isArray(payload?.posters)
    ? payload.posters
    : Array.isArray(payload?.images?.posters)
      ? payload.images.posters
      : []

  const neutral = posters
    .filter((image) => image?.file_path && image.iso_639_1 == null)
    .sort((left, right) => imageScore(right) - imageScore(left))

  return neutral[0]?.file_path || null
}

export function selectNeutralTmdbPosterUrl(payload, size = 'w500') {
  const path = selectNeutralTmdbPosterPath(payload)
  if (!path) return null
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${TMDB_IMAGE_BASE_URL}/${size}${normalizedPath}`
}
