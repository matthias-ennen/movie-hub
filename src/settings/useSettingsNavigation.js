import { useLayoutEffect, useRef } from 'react'

// UI state only: no saved profile values and no per-scroll React updates.
export function useSettingsNavigation(page, onNavigate, profileId) {
  const mainRef = useRef(null)
  const headerRef = useRef(null)
  const overviewPosition = useRef(null)

  useLayoutEffect(() => {
    const main = mainRef.current
    const header = headerRef.current
    const topbar = document.querySelector('.topbar')
    const measure = () => {
      main?.style.setProperty('--settings-topbar-height', `${topbar?.getBoundingClientRect().height || 0}px`)
      main?.style.setProperty('--settings-header-height', `${header?.getBoundingClientRect().height || 0}px`)
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    if (topbar) observer?.observe(topbar)
    if (header) observer?.observe(header)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const main = mainRef.current
      const saved = page === 'overview' ? overviewPosition.current : null
      const returnTarget = saved && main?.querySelector(`[data-settings-entry="${saved.entry}"]`)
      const target = returnTarget || main?.querySelector('[data-settings-content] [data-focusable="true"]')
        || main?.querySelector('[data-settings-back]')
      // Focus with preventScroll first, then restore the exact overview position.
      target?.focus({ preventScroll: true })
      window.scrollTo({ top: returnTarget ? saved.scrollY : 0, behavior: 'instant' })
      if (returnTarget) {
        const rect = returnTarget.getBoundingClientRect()
        const headerBottom = headerRef.current?.getBoundingClientRect().bottom || 0
        // A resize/orientation change may have moved the stored tile offscreen.
        if (rect.top < headerBottom || rect.bottom > window.innerHeight) {
          returnTarget.scrollIntoView({ block: 'nearest', behavior: 'instant' })
        }
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [page, profileId])

  const navigate = (nextPage) => {
    if (page === 'overview') overviewPosition.current = { entry: nextPage, scrollY: window.scrollY }
    onNavigate(nextPage)
  }

  return { mainRef, headerRef, navigate }
}
