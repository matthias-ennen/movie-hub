const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

export function buildTmdbImageUrl(path, size = 'w500') {
  if (!path) return null
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${TMDB_IMAGE_BASE_URL}/${size}${normalizedPath}`
}
