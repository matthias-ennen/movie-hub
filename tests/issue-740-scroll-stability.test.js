import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { restoreTopScrollForHeroAction } from '../src/navigation/headerTopScroll.js'
import {
  calculatePosterScrollTop,
  calculateTvPairScrollTop,
  alignPosterVertically,
  alignTvFirstRowAndPeriod,
} from '../src/navigation/pageRowScroll.js'

function mockViewport({ viewportHeight = 900, initialTop = 0, dateY = 790, posterY = 930, posterHeight = 250, posterExists = true } = {}) {
  const scroller = { scrollTop: initialTop, scrollHeight: 3500 }
  const period = {
    getBoundingClientRect: () => ({ top: dateY - scroller.scrollTop, height: 70, bottom: dateY + 70 - scroller.scrollTop }),
  }
  const row = { dataset: { rowIndex: '0' }, closest: selector => selector === '.tv-program-rows' ? {} : null }
  const poster = {
    getBoundingClientRect: () => ({
      top: posterY - scroller.scrollTop, bottom: posterY + posterHeight - scroller.scrollTop,
      height: posterHeight,
    }),
    closest: selector => selector === '.content-row' ? row : null,
  }
  const documentRef = {
    scrollingElement: scroller,
    documentElement: { clientHeight: viewportHeight },
    querySelector: selector => {
      if (selector === '.topbar') return { getBoundingClientRect: () => ({ bottom: 88 }) }
      if (selector === '.tv-program-page .tv-period-shell') return period
      if (selector.includes('.tv-program-rows .content-row[data-row-index="0"]')) return posterExists ? poster : null
      return null
    },
  }
  const windowRef = {
    innerHeight: viewportHeight,
    get scrollY() { return scroller.scrollTop },
    scrollTo: vi.fn(({ top }) => { scroller.scrollTop = top }),
  }
  return { documentRef, windowRef, scroller, poster, period }
}

describe('#740 E: Hero action focus reveals the top without activating anything', () => {
  it('targets all three shared Hero action controls identically', () => {
    const scroller = { scrollTop: 820 }
    const documentRef = { scrollingElement: scroller }
    const windowRef = { scrollY: 820, scrollTo: vi.fn(({ top }) => { scroller.scrollTop = top }) }
    for (const name of ['Ansehen', 'Details', 'Trailer']) {
      scroller.scrollTop = 820
      const target = { matches: selector => selector.includes('.hero-actions') && Boolean(name) }
      expect(restoreTopScrollForHeroAction(target, { documentRef, windowRef })).toBe(true)
      expect(scroller.scrollTop).toBe(0)
    }
    expect(windowRef.scrollTo).toHaveBeenCalledTimes(3)
  })

  it('does not interfere with unrelated controls', () => {
    const scroller = { scrollTop: 640 }
    const windowRef = { scrollY: 640, scrollTo: vi.fn() }
    expect(restoreTopScrollForHeroAction({ matches: () => false }, {
      documentRef: { scrollingElement: scroller }, windowRef,
    })).toBe(false)
    expect(scroller.scrollTop).toBe(640)
    expect(windowRef.scrollTo).not.toHaveBeenCalled()
  })
})

describe('#740 G/H: deterministic vertical navigation', () => {
  it('centers a normal poster directly in the viewport below the sticky topbar', () => {
    expect(calculatePosterScrollTop({
      currentTop: 0, scrollHeight: 3500, viewportHeight: 900, topbarBottom: 88,
      posterRect: { top: 950, height: 250 },
    })).toBe(585)
  })

  it('keeps date controls under the header and the first TV row in view', () => {
    const env = mockViewport()
    expect(alignTvFirstRowAndPeriod(env)).toBe(true)
    expect(env.scroller.scrollTop).toBe(565)
    expect(env.period.getBoundingClientRect().top).toBe(225)
    expect(env.poster.getBoundingClientRect().top).toBe(365)
    expect(env.poster.getBoundingClientRect().bottom).toBe(615)
  })

  it('treats TV dates and the first poster as ONE scroll anchor', () => {
    const env = mockViewport()
    alignTvFirstRowAndPeriod(env)
    expect(env.windowRef.scrollTo).toHaveBeenCalledTimes(1)
    // Switching from the date bar to the focused first poster does not
    // request an additional vertical scroll, and the same is true in reverse.
    expect(alignPosterVertically(env.poster, env)).toBe(true)
    expect(alignTvFirstRowAndPeriod(env)).toBe(true)
    expect(env.windowRef.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('prioritizes the date bar on narrow screens where both cannot fit', () => {
    const env = mockViewport({ viewportHeight: 360, dateY: 700, posterY: 820, posterHeight: 320 })
    alignTvFirstRowAndPeriod(env)
    expect(env.period.getBoundingClientRect().top).toBe(112)
    alignPosterVertically(env.poster, env)
    expect(env.windowRef.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('uses the identical TV anchor before and after the first progressive row is mounted', () => {
    const pending = mockViewport({ posterExists: false })
    const ready = mockViewport({ posterExists: true })
    expect(alignTvFirstRowAndPeriod(pending)).toBe(true)
    expect(alignTvFirstRowAndPeriod(ready)).toBe(true)
    expect(pending.scroller.scrollTop).toBe(565)
    expect(ready.scroller.scrollTop).toBe(pending.scroller.scrollTop)

    // A changed/removed first poster must not re-target the date strip.
    expect(calculateTvPairScrollTop({
      currentTop: 0, scrollHeight: 3500, viewportHeight: 900, topbarBottom: 88,
      periodRect: { top: 790, height: 70 },
      posterRect: { top: 940, height: 300 },
    })).toBe(pending.scroller.scrollTop)
    expect(alignTvFirstRowAndPeriod(pending)).toBe(true)
    expect(pending.windowRef.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('respects page boundaries when the target is impossible', () => {
    expect(calculateTvPairScrollTop({
      currentTop: 0, scrollHeight: 1100, viewportHeight: 900, topbarBottom: 88,
      periodRect: { top: 790, height: 70 },
      posterRect: { top: 930, bottom: 1180, height: 250 },
    })).toBe(200)
  })
})

const dpad = readFileSync(new URL('../src/hooks/useDpadNavigation.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles/seasonal-atmosphere.css', import.meta.url), 'utf8')
const tvView = readFileSync(new URL('../src/components/TvView.jsx', import.meta.url), 'utf8')
const tvAnchorCss = readFileSync(new URL('../src/styles/tv-period-anchor.css', import.meta.url), 'utf8')

describe('#740 follow-up integration contracts', () => {
  it('does not issue vertical centering on every left/right step inside one poster row', () => {
    expect(dpad).toContain('const sameRow = previous?.matches?.(\'.poster-card\')')
    expect(dpad).toContain('if (!sameRow) scrollPageToPosterCandidate(candidate, scrollBehavior)')
    expect(dpad).toContain('scrollPosterTrackToCandidate(candidate, posterHorizontal, scrollBehavior)')
  })

  it('keeps the period track mounted and enough scroll range when daily rows reload', () => {
    expect(tvView).toContain('<PeriodSelector periods={periods}')
    expect(tvView).toContain('<div className="tv-program-results">')
    expect(tvView).toContain("status === 'loading'")
    expect(tvAnchorCss).toContain('min-height: 115vh')
    expect(tvAnchorCss).not.toContain('position: fixed')
  })

  it('uses TV pair alignment on entry but not when switching date buttons horizontally', () => {
    expect(dpad).toContain("candidate.matches?.('.tv-period-button')")
    expect(dpad).toContain("previous?.closest?.('.tv-period-track') !== track")
    expect(dpad).toContain('alignTvFirstRowAndPeriod()')
    expect(dpad).toContain('scrollTvPeriodTrackToCandidate(candidate, scrollBehavior)')
  })

  it('keeps a central opaque-looking 30% anthracite area with transparent feathered edges', () => {
    expect(css).toContain('rgba(32, 35, 40, 0.40) 0%')
    expect(css).toContain('rgba(32, 35, 40, 0.40) 70%')
    expect(css).toContain('radial-gradient(ellipse closest-side at 50% 50%')
    expect(css).toContain('transparent 100%')
    expect(css).toContain('transform: translateY(-27px)')
  })
})
