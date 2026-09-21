import { useEffect } from 'react'
import { markHeroForAutoplayActivation } from './heroAutoplay.js'

export const INITIAL_HOME_FOCUS_EVENT = 'moviehub:startup-focus-ready'
export const LEGACY_NATIVE_STARTUP_FOCUS_DELAY_MS = 12_000

export function supportsNativeStartupFocusEvent(bridge) {
  if (!bridge) return false
  try {
    if (typeof bridge.getHeroSequenceContractVersion === 'function') {
      return Number(bridge.getHeroSequenceContractVersion()) >= 1
    }
    return typeof bridge.getAppBuild === 'function' && Number(bridge.getAppBuild()) >= 403
  } catch {
    return false
  }
}

export function getInitialHomeFocusTarget(root = document) {
  const hero = root.querySelector('.hero-carousel[data-focusable="true"]')
  if (hero) return hero

  const homePageReady = root.querySelector('main[data-page-load-state="rows"]')
  if (!homePageReady) return null

  return root.querySelector('.main-nav .nav-link:first-child')
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
    let observer = null
    let legacyFallbackTimer = null

    const focusInitialTarget = () => {
      if (done) return true
      const target = getInitialHomeFocusTarget()
      if (!(target instanceof HTMLElement)) return false
      if (!target.isConnected) return false

      markHeroForAutoplayActivation(target)
      target.focus({ preventScroll: true })
      done = true
      return true
    }

    const nativeBridge = window.MovieHubNative
    const nativeStartup = supportsNativeStartupFocusEvent(nativeBridge)
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
        attributes: true,
        attributeFilter: ['data-page-load-state'],
      })
    }
    const handleNativeStartupFocus = () => {
      if (!focusInitialTarget()) observeUntilTargetExists()
    }

    if (nativeStartup) {
      window.addEventListener(INITIAL_HOME_FOCUS_EVENT, handleNativeStartupFocus)
      if (window.__movieHubStartupFocusReady) handleNativeStartupFocus()
    } else if (nativeBridge) {
      legacyFallbackTimer = window.setTimeout(
        handleNativeStartupFocus,
        LEGACY_NATIVE_STARTUP_FOCUS_DELAY_MS,
      )
    } else if (!focusInitialTarget()) {
      observeUntilTargetExists()
    }

    return () => {
      observer?.disconnect()
      window.removeEventListener(INITIAL_HOME_FOCUS_EVENT, handleNativeStartupFocus)
      if (legacyFallbackTimer !== null) window.clearTimeout(legacyFallbackTimer)
    }
  }, [])

  return null
}
