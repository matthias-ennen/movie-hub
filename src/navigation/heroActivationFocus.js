export const HERO_ACTIVATION_FOCUS_ATTEMPTS = 3

/**
 * Verschiebt den Fokus erst hinter das auslösende Eingabeereignis und prüft,
 * ob der Browser ihn wirklich übernommen hat. Langsame WebViews erhalten
 * einige eng begrenzte Wiederholungen; weitere Nutzereingaben können den
 * Auftrag über die zurückgegebene Abbruchfunktion verwerfen.
 */
export function focusHeroAfterActivation(target, {
  windowRef = window,
  documentRef = document,
  maxAttempts = HERO_ACTIVATION_FOCUS_ATTEMPTS,
  onSettled = () => {},
} = {}) {
  let cancelled = false
  let frameId = null
  let timerId = null
  let attempts = 0

  const finish = (focused) => {
    if (cancelled) return
    cancelled = true
    onSettled({ focused, attempts })
  }

  const attemptFocus = () => {
    if (cancelled) return
    if (!target?.isConnected) {
      finish(false)
      return
    }

    attempts += 1
    target.focus({ preventScroll: true })
    if (documentRef.activeElement === target) {
      finish(true)
      return
    }

    if (attempts >= Math.max(1, maxAttempts)) {
      finish(false)
      return
    }
    timerId = windowRef.setTimeout(attemptFocus, 0)
  }

  frameId = windowRef.requestAnimationFrame(() => {
    frameId = null
    timerId = windowRef.setTimeout(attemptFocus, 0)
  })

  return () => {
    if (cancelled) return
    cancelled = true
    if (frameId !== null) windowRef.cancelAnimationFrame(frameId)
    if (timerId !== null) windowRef.clearTimeout(timerId)
  }
}
