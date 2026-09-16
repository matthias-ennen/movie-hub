export const POSTER_PREFETCH_AHEAD = 5
export const POSTER_PREFETCH_BEHIND = 1

const prefetchedPosterUrls = new Set()

export function posterUrlForItem(item) {
  return item?.displayPosterUrl || item?.neutralPosterUrl || item?.posterUrl || null
}

export function getPosterPrefetchWindow(items, focusIndex, {
  ahead = POSTER_PREFETCH_AHEAD,
  behind = POSTER_PREFETCH_BEHIND,
} = {}) {
  const source = Array.isArray(items) ? items : []
  const index = Math.max(0, Math.min(source.length - 1, Number(focusIndex) || 0))
  const start = Math.max(0, index - Math.max(0, Number(behind) || 0))
  const end = Math.min(source.length, index + Math.max(0, Number(ahead) || 0) + 1)
  return source.slice(start, end)
}

export function prefetchPosterWindow(items, focusIndex, options = {}) {
  if (typeof Image === 'undefined') return []

  const requested = []
  for (const item of getPosterPrefetchWindow(items, focusIndex, options)) {
    const url = posterUrlForItem(item)
    if (!url || prefetchedPosterUrls.has(url)) continue

    prefetchedPosterUrls.add(url)
    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = 'auto'
    image.src = url
    requested.push(url)
  }
  return requested
}

export function resetPosterPrefetchCacheForTests() {
  prefetchedPosterUrls.clear()
}
