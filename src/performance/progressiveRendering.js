export const HERO_READY_TIMEOUT_MS = 1600
export const INITIAL_VISIBLE_ROWS = 1
export const ROW_REVEAL_BATCH_SIZE = 1
export const INITIAL_VISIBLE_POSTERS = 12
export const POSTER_REVEAL_BATCH_SIZE = 12
export const PROGRESSIVE_ROW_REQUEST_EVENT = 'moviehub:request-next-row'
export const HERO_PRELOAD_INTENT_DELAY_MS = 275

export function initialVisibleCount(total, ready, initialCount) {
  if (!ready || total <= 0) return 0
  return Math.min(total, Math.max(1, initialCount))
}

export function nextVisibleCount(current, total, batchSize) {
  if (total <= 0) return 0
  return Math.min(total, Math.max(0, current) + Math.max(1, batchSize))
}

const preloadedHeroImages = new Set()
let pendingHeroPreloadTimer = null
let pendingHeroPreloadUrl = null

function heroImageUrl(items) {
  const firstItem = Array.isArray(items) ? items[0] : items
  return firstItem?.displayHeroBackdropUrl || firstItem?.backdropUrl || null
}

function startHeroImagePreload(url) {
  if (!url || preloadedHeroImages.has(url)) return false
  preloadedHeroImages.add(url)
  const image = new Image()
  image.decoding = 'async'
  image.fetchPriority = 'high'
  image.src = url
  return true
}

export function cancelHeroImagePreload() {
  if (pendingHeroPreloadTimer !== null && typeof clearTimeout === 'function') {
    clearTimeout(pendingHeroPreloadTimer)
  }
  pendingHeroPreloadTimer = null
  pendingHeroPreloadUrl = null
}

/**
 * Main-navigation focus is only an intent signal. Delay the speculative image
 * request slightly so quickly traversing Home/Movies/Series/Library does not
 * start several large backdrop downloads. Opening the page itself remains
 * immediate because Hero renders independently of this speculative preload.
 */
export function preloadHeroImage(items, { delayMs = HERO_PRELOAD_INTENT_DELAY_MS } = {}) {
  if (typeof Image === 'undefined' || typeof setTimeout !== 'function') return false

  const url = heroImageUrl(items)
  if (!url || preloadedHeroImages.has(url)) return false
  if (pendingHeroPreloadUrl === url && pendingHeroPreloadTimer !== null) return true

  cancelHeroImagePreload()
  pendingHeroPreloadUrl = url
  pendingHeroPreloadTimer = setTimeout(() => {
    pendingHeroPreloadTimer = null
    pendingHeroPreloadUrl = null
    startHeroImagePreload(url)
  }, Math.max(0, Number(delayMs) || 0))
  return true
}
