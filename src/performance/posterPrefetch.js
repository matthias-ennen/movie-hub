import { posterImageProps, posterSourceUrl } from './posterImages.js'

export const POSTER_PREFETCH_AHEAD = 5
export const POSTER_PREFETCH_BEHIND = 1

const prefetchedPosterUrls = new Set()

export function posterUrlForItem(item) {
  return posterSourceUrl(item)
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
    const sourceUrl = posterUrlForItem(item)
    if (!sourceUrl || prefetchedPosterUrls.has(sourceUrl)) continue

    prefetchedPosterUrls.add(sourceUrl)
    const imageProps = posterImageProps(item, { variant: options.variant || 'standard' })
    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = 'auto'
    if (imageProps.sizes) image.sizes = imageProps.sizes
    if (imageProps.srcSet) image.srcset = imageProps.srcSet
    image.src = imageProps.src
    requested.push(imageProps.src)
  }
  return requested
}

export function resetPosterPrefetchCacheForTests() {
  prefetchedPosterUrls.clear()
}
