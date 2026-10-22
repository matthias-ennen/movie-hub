/**
 * User-supplied YouTube VIDEO links only.
 *
 * This module does not request or store YouTube API Data, infer a movie
 * identity/entitlement, or merge content from different channel owners.
 * Android/Fire TV accepts the canonical watch URL in YouTubeUrlResolver.
 */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const EXACT_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be',
])

export function youtubeVideoIdFromUrl(input) {
  if (typeof input !== 'string' || input.length > 4096) return null
  let url
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (!['https:', 'http:'].includes(url.protocol)
    || url.username || url.password || url.port
    || !EXACT_HOSTS.has(url.hostname.toLowerCase())) return null

  let id = null
  if (url.hostname.toLowerCase() === 'youtu.be') {
    const path = url.pathname.split('/').filter(Boolean)
    if (path.length !== 1) return null
    id = path[0]
  } else if (url.pathname === '/watch') {
    const ids = url.searchParams.getAll('v')
    if (ids.length !== 1) return null
    id = ids[0]
  }
  return VIDEO_ID.test(id || '') ? id : null
}

export function canonicalYouTubeWatchUrl(input) {
  const id = youtubeVideoIdFromUrl(input)
  return id ? 'https://www.youtube.com/watch?v=' + id : null
}

export function requireYouTubeWatchUrl(input) {
  const canonical = canonicalYouTubeWatchUrl(input)
  if (!canonical) {
    throw new Error('Bitte einen gültigen YouTube-Videolink (youtu.be/… oder youtube.com/watch?v=…) eingeben.')
  }
  return canonical
}
