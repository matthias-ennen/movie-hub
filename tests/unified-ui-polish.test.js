import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { NAVIGATION_MOTION_DURATION_MS, moveScrollCoordinate } from '../src/navigation/navigationMotion.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function makeFrameClock() {
  let nextId = 0
  const pending = new Map()
  const windowRef = {
    requestAnimationFrame: vi.fn(callback => { pending.set(++nextId, callback); return nextId }),
    cancelAnimationFrame: vi.fn(id => pending.delete(id)),
    matchMedia: () => ({ matches: false }),
  }
  const tick = time => {
    const callbacks = [...pending.values()]
    pending.clear()
    callbacks.forEach(callback => callback(time))
  }
  return { windowRef, tick }
}

describe('one 260ms D-pad motion profile for X and Y', () => {
  it('animates horizontal and vertical pixels with the same easing/duration', () => {
    expect(NAVIGATION_MOTION_DURATION_MS).toBe(260)
    const { windowRef, tick } = makeFrameClock()
    const horizontal = { scrollLeft: 0 }, vertical = { scrollTop: 0 }
    moveScrollCoordinate(horizontal, 'x', 300, { windowRef })
    moveScrollCoordinate(vertical, 'y', 300, { windowRef })
    tick(100)
    tick(230)
    expect(horizontal.scrollLeft).toBeGreaterThan(0)
    expect(horizontal.scrollLeft).toBe(vertical.scrollTop)
    tick(360)
    expect(horizontal.scrollLeft).toBe(300)
    expect(vertical.scrollTop).toBe(300)
  })

  it('cancels and retargets old movement instead of queuing frames', () => {
    const { windowRef, tick } = makeFrameClock()
    const track = { scrollLeft: 0 }
    moveScrollCoordinate(track, 'x', 300, { windowRef })
    tick(100)
    tick(200)
    expect(track.scrollLeft).toBeGreaterThan(0)
    moveScrollCoordinate(track, 'x', 160, { windowRef })
    expect(windowRef.cancelAnimationFrame).toHaveBeenCalled()
    tick(300)
    tick(560)
    expect(track.scrollLeft).toBe(160)
    moveScrollCoordinate(track, 'x', 45, { behavior: 'auto', windowRef })
    expect(track.scrollLeft).toBe(45)
  })

  it('respects the reduced-motion user preference', () => {
    const { windowRef } = makeFrameClock()
    windowRef.matchMedia = () => ({ matches: true })
    const page = { scrollTop: 0 }
    moveScrollCoordinate(page, 'y', 400, { windowRef })
    expect(page.scrollTop).toBe(400)
    expect(windowRef.requestAnimationFrame).not.toHaveBeenCalled()
  })
})

describe('seven UI improvements: shared DOM and styling contracts', () => {
  const seasonal = read('../src/styles/seasonal-atmosphere.css')
  const tv = read('../src/styles/waipu-tv.css')
  const hero = read('../src/components/Hero.jsx')
  const poster = read('../src/components/PosterCard.jsx')
  const posterCss = read('../src/styles/poster-unified.css')
  const dpad = read('../src/hooks/useDpadNavigation.js')
  const virtual = read('../src/components/ProgressiveContent.jsx')

  it('includes Classic and every cinematic theme, preserving 40/20/0 percent feather', () => {
    expect(seasonal).toContain("[data-season-media='cinematic'] .hero-first-page .hero-carousel .hero {")
    expect(seasonal).not.toContain(":not([data-season='classic']) .hero-first-page")
    expect(seasonal).toContain('rgba(32, 35, 40, 0.40) 70%')
    expect(seasonal).toContain('rgba(32, 35, 40, 0.20) 88%')
    expect(seasonal).toContain('rgba(232, 237, 243, 0.40) 70%')
    expect(seasonal).toContain('rgba(232, 237, 243, 0.20) 88%')
    expect(seasonal).toContain('.hero-copy::before')
  })

  it('keeps the background fixed to the whole screen without image upscaling', () => {
    expect(seasonal).toContain('  inset: 0;')
    expect(seasonal).toContain('min(100vw, 1600px) auto')
  })

  it('uses inset TV capsule focus, including a visible ring on the selected pill', () => {
    expect(tv).toContain('.tv-period-button:focus-visible {')
    expect(tv).toContain('box-shadow: inset 0 0 0 var(--focus-width-control) var(--color-focus);')
    expect(tv).toContain('.tv-period-button.active:focus-visible {')
    expect(tv).toContain('box-shadow: inset 0 0 0 var(--focus-width-control) var(--color-bg);')
  })

  it('draws missing and failed poster images as the existing detailed art surface', () => {
    expect(posterCss).toContain('.poster-art:not(.has-image),\\n.detail-art:not(.has-image)'.replace('\\n', '\n'))
    expect(poster).toContain('posterImage.src !== failedPosterSrc')
    expect(poster).toContain('onError={() => setFailedPosterSrc(posterImage.src)}')
  })

  it('removes only the Hero chevrons, preserving swipes, D-pad and dot navigation', () => {
    expect(hero).not.toContain('hero-nav hero-nav-prev')
    expect(hero).not.toContain('hero-nav hero-nav-next')
    expect(hero).toContain('onTouchStart={handleTouchStart}')
    expect(hero).toContain('onKeyDown={handleCarouselKeyDown}')
    expect(hero).toContain('className="hero-dots"')
  })

  it('uses shared scroll motion in both directions, including virtual poster rows', () => {
    expect(dpad).toContain("moveScrollCoordinate(track, 'x', clampedLeft, { behavior })")
    expect(dpad).toContain('alignPosterVertically(candidate, { behavior })')
    expect(dpad).toContain('alignTvFirstRowAndPeriod({ behavior: scrollBehavior })')
    expect(virtual).toContain('rowVirtualizer.getOffsetForIndex?.(targetIndex,')
  })
})
