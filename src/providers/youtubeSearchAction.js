/**
 * User-initiated YouTube platform search, kept distinct from an availability
 * offer. This performs no YouTube API request or multi-owner aggregation.
 */
export function launchYouTubeTitleSearch(title, {
  nativeBridge = typeof window !== 'undefined' ? window.MovieHubNative : null,
  openWindow = typeof window !== 'undefined'
    ? (url) => window.open(url, '_blank', 'noopener,noreferrer') : null,
} = {}) {
  const query = String(title ?? '').trim()
  if (!query) return false
  const destination = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query)
  if (typeof nativeBridge?.openProvider === 'function') {
    nativeBridge.openProvider('youtube', query, destination)
    return true
  }
  if (typeof nativeBridge?.openExternalUrl === 'function') {
    nativeBridge.openExternalUrl(destination)
    return true
  }
  if (typeof openWindow === 'function') {
    openWindow(destination)
    return true
  }
  return false
}
