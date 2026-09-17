import { useEffect } from 'react'

/**
 * Setzt genau beim ersten Erscheinen der angemeldeten Hauptnavigation den Fokus
 * auf Home. Danach wird der Observer vollständig entfernt, sodass spätere
 * Re-Renders oder Rückkehr nach Home den aktuellen Fokus nicht überschreiben.
 */
export default function InitialHomeFocus() {
  useEffect(() => {
    let done = false
    let frame = null

    const focusHome = () => {
      if (done) return true
      const homeButton = document.querySelector('.main-nav .nav-link:first-child')
      if (!(homeButton instanceof HTMLElement)) return false

      done = true
      frame = window.requestAnimationFrame(() => {
        if (homeButton.isConnected) homeButton.focus({ preventScroll: true })
      })
      return true
    }

    if (focusHome()) return () => window.cancelAnimationFrame(frame)

    const observer = new MutationObserver(() => {
      if (focusHome()) observer.disconnect()
    })
    observer.observe(document.getElementById('root') ?? document.body, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
