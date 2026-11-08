import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { restoreTopScrollForHeaderFocus } from '../src/navigation/headerTopScroll.js'

function headerTarget({ menu = false } = {}) {
  const control = {
    closest: (selector) => selector === '.topbar'
      ? {}
      : selector === '.profile-menu' && menu
        ? {}
        : null,
  }
  return {
    closest: (selector) => selector.includes('.nav-link[data-focusable="true"]')
      ? control
      : null,
  }
}

describe('#740: header focus always reveals the absolute page start', () => {
  it('uses an immediate scroll to zero rather than nearest-element scrolling', () => {
    const scrollingElement = { scrollTop: 680 }
    const documentRef = { scrollingElement }
    const windowRef = {
      scrollY: 680,
      scrollTo: vi.fn(({ top }) => { scrollingElement.scrollTop = top }),
    }

    expect(restoreTopScrollForHeaderFocus(headerTarget(), { documentRef, windowRef })).toBe(true)
    expect(windowRef.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
    expect(scrollingElement.scrollTop).toBe(0)
  })

  it('works when an embedded WebView rejects scrollTo options', () => {
    const scrollingElement = { scrollTop: 910 }
    const windowRef = { scrollY: 910, scrollTo: vi.fn(() => { throw new Error('unsupported') }) }
    const documentRef = { scrollingElement }

    expect(restoreTopScrollForHeaderFocus(headerTarget(), { documentRef, windowRef })).toBe(true)
    expect(scrollingElement.scrollTop).toBe(0)
  })

  it('does not scroll for non-header, menu controls, or when already at top', () => {
    const scrollingElement = { scrollTop: 200 }
    const windowRef = { scrollY: 200, scrollTo: vi.fn() }
    const documentRef = { scrollingElement }
    expect(restoreTopScrollForHeaderFocus({ closest: () => null }, { documentRef, windowRef })).toBe(false)
    expect(restoreTopScrollForHeaderFocus(headerTarget({ menu: true }), { documentRef, windowRef })).toBe(false)
    expect(windowRef.scrollTo).not.toHaveBeenCalled()

    scrollingElement.scrollTop = 0
    windowRef.scrollY = 0
    expect(restoreTopScrollForHeaderFocus(headerTarget(), { documentRef, windowRef })).toBe(true)
    expect(windowRef.scrollTo).not.toHaveBeenCalled()
  })
})

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const nav = readFileSync(new URL('../src/hooks/useDpadNavigation.js', import.meta.url), 'utf8')
const seasonal = readFileSync(new URL('../src/styles/seasonal-atmosphere.css', import.meta.url), 'utf8')

describe('#740: presentation rules stay scoped and non-destructive', () => {
  it('removes only the personal background-loading text, not errors or empty states', () => {
    const start = app.indexOf('function PersonalLibraryView(')
    const end = app.indexOf('function ExitConfirmationDialog(', start)
    const library = app.slice(start, end)
    expect(library).not.toContain('Persönliche Inhalte werden geladen')
    expect(library).toContain('Persönliche Inhalte konnten nicht geladen werden')
    expect(library).toContain('library-empty-state')
    expect(library).toContain('<ProgressiveRows')
  })

  it('handles both D-pad and direct header focus/click without taking over poster scroll', () => {
    expect(nav).toContain("document.addEventListener?.('focusin', revealHeaderOnFocus)")
    expect(nav).toContain("document.addEventListener?.('click', revealHeaderOnFocus, true)")
    expect(nav).toContain('if (restoreTopScrollForHeaderFocus(candidate)) return')
    expect(nav).toContain('scrollPageToPosterCandidate(candidate, scrollBehavior)')
  })

  it('keeps the classic palette and content fully opaque while feathering cinematic background', () => {
    expect(seasonal).toContain(":not([data-season='classic']) .hero-first-page .hero-carousel .hero {")
    expect(seasonal).toContain('rgba(32, 35, 40, 0.30) 70%')
    expect(seasonal).toContain('radial-gradient(ellipse closest-side at 50% 50%')
    expect(seasonal).toContain('transparent 100%')
    expect(seasonal).toContain('.hero-first-page .hero-carousel .hero::after {\n  background: none;')
    expect(seasonal).toContain('.hero-first-page .hero-dots {\n  background: transparent;')
    expect(seasonal).not.toContain('.hero-carousel .hero {\n  opacity:')
  })

  it('moves only the indicator strip by a 27px visual offset', () => {
    expect(seasonal).toContain('.hero-first-page .hero-dots {\n  transform: translateY(-27px);')
    expect(seasonal).not.toContain('margin-top: -12px')
  })
})
