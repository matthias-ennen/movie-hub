export const HERO_POST_TRAILER_DELAY_MS = 3_000
export const HERO_TRAILER_RESULT_EVENT = 'moviehub:hero-trailer-result'

export function getNextAutomaticHeroIndex(currentIndex, heroCount) {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(heroCount)) return null
  if (currentIndex < 0 || currentIndex + 1 >= heroCount) return null
  return currentIndex + 1
}

export function resolveHeroTimerAction(currentIndex, heroCount, hasTrailer) {
  const nextIndex = getNextAutomaticHeroIndex(currentIndex, heroCount)
  if (hasTrailer) return { type: 'play-trailer', nextIndex }
  if (nextIndex !== null) return { type: 'advance', nextIndex }
  return { type: 'stop', nextIndex: null }
}

export function didTrailerComplete(outcome) {
  return outcome === 'completed'
}

export function shouldPreserveHeroSessionOnBlur(pendingTrailerRequest) {
  return Boolean(pendingTrailerRequest)
}
