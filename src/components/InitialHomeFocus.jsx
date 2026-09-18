import { useEffect } from 'react'

export const INITIAL_HOME_FOCUS_EVENT = 'moviehub:startup-focus-ready'

export function getInitialHomeFocusTarget(root = document) {
  return root.querySelector('.hero-carousel[data-focusable="true"]')
    || root.querySelector('.main-nav .nav-link:first-child')
}

/**
 * Setzt den initialen Fokus auf den ersten Home-Hero. Im nativen Wrapper wartet
 * die Weboberfläche damit bis die Startsequenz vollständig entfernt wurde,
 * damit der Hero-Timer nicht verdeckt hinter dem Intro beginnt. Ohne Hero dient
 * der Navigationspunkt Home als kontrollierter Rückfall.
 */
export default function InitialHomeFocus() {
  useEffect(() => {
    let done = false
    let frame = null
    let observer = null

    const focusInitialTarget = () => {
      if (done) return true
      const target = getInitialHomeFocusTarget()
      if (!(target instanceof HTMLElement)) return false

      done = true
      frame = window.requestAnimationFrame(() => {
        if (target.isConnected) target.focus({ preventScroll: true })
      })
      return true
    }

    const nativeStartup = typeof window.MovieHubNative?.notifyStartupReady === 'function'
    const observeUntilTargetExists = () => {
      if (done || observer) return
      observer = new MutationObserver(() => {
        if (focusInitialTarget()) {
          observer.disconnect()
          observer = null
        }
      })
      observer.observe(document.getElementById('root') ?? document.body, {
        childList: true,
        subtree: true,
      })
    }
    const handleNativeStartupFocus = () => {
      if (!focusInitialTarget()) observeUntilTargetExists()
    }

    if (nativeStartup) {
      window.addEventListener(INITIAL_HOME_FOCUS_EVENT, handleNativeStartupFocus)
      if (window.__movieHubStartupFocusReady) handleNativeStartupFocus()
    } else if (!focusInitialTarget()) {
      observeUntilTargetExists()
    }

    return () => {
      observer?.disconnect()
      window.removeEventListener(INITIAL_HOME_FOCUS_EVENT, handleNativeStartupFocus)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
