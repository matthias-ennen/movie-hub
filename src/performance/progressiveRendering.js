export const HERO_READY_TIMEOUT_MS = 1600
export const INITIAL_VISIBLE_ROWS = 1
export const ROW_REVEAL_BATCH_SIZE = 1
export const INITIAL_VISIBLE_POSTERS = 12
export const POSTER_REVEAL_BATCH_SIZE = 12
export const PROGRESSIVE_ROW_REQUEST_EVENT = 'moviehub:request-next-row'

export function initialVisibleCount(total, ready, initialCount) {
  if (!ready || total <= 0) return 0
  return Math.min(total, Math.max(1, initialCount))
}

export function nextVisibleCount(current, total, batchSize) {
  if (total <= 0) return 0
  return Math.min(total, Math.max(0, current) + Math.max(1, batchSize))
}

const preloadedHeroImages = new Set()

export function preloadHeroImage(items) {
  if (typeof Image === 'undefined') return false

  const firstItem = Array.isArray(items) ? items[0] : items
  const url = firstItem?.displayHeroBackdropUrl || firstItem?.backdropUrl
  if (!url || preloadedHeroImages.has(url)) return false

  preloadedHeroImages.add(url)
  const image = new Image()
  image.decoding = 'async'
  image.fetchPriority = 'high'
  image.src = url
  return true
}
