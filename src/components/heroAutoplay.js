export const HERO_POST_TRAILER_DELAY_MS = 3_000
export const HERO_TRAILER_RESULT_EVENT = 'moviehub:hero-trailer-result'
export const HERO_AUTOPLAY_ARM_ATTRIBUTE = 'data-hero-autoplay-arm'

export const HERO_AUTOPLAY_SESSION = Object.freeze({
  ARMED: 'armed',
  DISARMED: 'disarmed',
})

export const HERO_AUTOPLAY_SESSION_EVENT = Object.freeze({
  ACTIVATE: 'activate',
  USER_INTENT: 'user-intent',
  UNAVAILABLE: 'unavailable',
})

export function reduceHeroAutoplaySession(state, event) {
  if (event === HERO_AUTOPLAY_SESSION_EVENT.ACTIVATE) return HERO_AUTOPLAY_SESSION.ARMED
  if (
    event === HERO_AUTOPLAY_SESSION_EVENT.USER_INTENT
    || event === HERO_AUTOPLAY_SESSION_EVENT.UNAVAILABLE
  ) return HERO_AUTOPLAY_SESSION.DISARMED
  return state
}

export function markHeroForAutoplayActivation(target) {
  if (!target?.matches?.('.hero-carousel')) return false
  target.setAttribute(HERO_AUTOPLAY_ARM_ATTRIBUTE, 'true')
  return true
}

export function consumeHeroAutoplayActivation(target) {
  if (target?.getAttribute?.(HERO_AUTOPLAY_ARM_ATTRIBUTE) !== 'true') return false
  target.removeAttribute(HERO_AUTOPLAY_ARM_ATTRIBUTE)
  return true
}

export function listenForHeroAutoplayUserIntent(onIntent, windowRef = window) {
  let handled = false
  const handleIntent = () => {
    if (handled) return
    handled = true
    onIntent()
  }

  windowRef.addEventListener('keydown', handleIntent, true)
  windowRef.addEventListener('pointerdown', handleIntent, true)
  windowRef.addEventListener('touchstart', handleIntent, { capture: true, passive: true })
  windowRef.addEventListener('wheel', handleIntent, { capture: true, passive: true })

  return () => {
    windowRef.removeEventListener('keydown', handleIntent, true)
    windowRef.removeEventListener('pointerdown', handleIntent, true)
    windowRef.removeEventListener('touchstart', handleIntent, true)
    windowRef.removeEventListener('wheel', handleIntent, true)
  }
}

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
