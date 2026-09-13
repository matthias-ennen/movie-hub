import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../styles/issue128.css'
import '../styles/issue128-hero-boundary.css'
import { HERO_READY_TIMEOUT_MS } from '../performance/progressiveRendering.js'
import AgeRatingBadge from './AgeRatingBadge.jsx'

const MAX_HEROES = 5
const SWIPE_MIN_DISTANCE = 48
const HERO_PHASE_MS = 170
export default function Hero({ item, items, onOpen, eyebrow = 'Heute im Fokus', onReady }) {
  const slides = useMemo(() => {
    const source = Array.isArray(items) && items.length ? items : item ? [item] : []
    const seen = new Set()
    return source.filter((entry) => {
      if (!entry?.id || seen.has(entry.id)) return false
      seen.add(entry.id)
      return true
    }).slice(0, MAX_HEROES)
  }, [item, items])

  const signature = slides.map((entry) => entry.id).join('|')
  const [activeIndex, setActiveIndex] = useState(0)
  const [transition, setTransition] = useState(null)
  const touchStartRef = useRef(null)
  const transitionTimerRef = useRef([])
  const transitionLockRef = useRef(false)
  const activeImageRef = useRef(null)
  const readyReportedRef = useRef(false)

  function clearTransitionTimers() {
    transitionTimerRef.current.forEach((timer) => window.clearTimeout(timer))
    transitionTimerRef.current = []
  }

  useEffect(() => {
    clearTransitionTimers()
    transitionLockRef.current = false
    readyReportedRef.current = false
    setActiveIndex(0)
    setTransition(null)
  }, [signature])

  useEffect(() => () => {
    clearTransitionTimers()
    transitionLockRef.current = false
  }, [])

  const safeIndex = Math.min(activeIndex, Math.max(0, slides.length - 1))
  const activeItem = slides[safeIndex] || null
  const activeBackdropUrl = activeItem?.displayHeroBackdropUrl || activeItem?.backdropUrl || null

  const reportReady = useCallback((reason) => {
    if (!onReady || readyReportedRef.current) return
    readyReportedRef.current = true
    onReady({ item: activeItem, reason })
  }, [activeItem, onReady])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const image = activeImageRef.current
      if (!activeBackdropUrl) {
        reportReady(slides.length ? 'no-image' : 'no-hero')
      } else if (image?.complete) {
        reportReady(image.naturalWidth > 0 ? 'cached' : 'error')
      }
    })
    const timeout = window.setTimeout(() => reportReady('timeout'), HERO_READY_TIMEOUT_MS)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [activeBackdropUrl, reportReady, slides.length])

  if (!slides.length) return null

  function selectHero(index, direction = null) {
    if (transitionLockRef.current || index < 0 || index >= slides.length || index === safeIndex) return

    transitionLockRef.current = true
    const resolvedDirection = direction || (index > safeIndex ? 'left' : 'right')
    clearTransitionTimers()
    setTransition({ phase: 'out', targetIndex: index, direction: resolvedDirection })

    const swapTimer = window.setTimeout(() => {
      setActiveIndex(index)
      setTransition({ phase: 'in', targetIndex: index, direction: resolvedDirection })

      const finishTimer = window.setTimeout(() => {
        transitionLockRef.current = false
        setTransition(null)
        transitionTimerRef.current = []
      }, HERO_PHASE_MS)
      transitionTimerRef.current = [finishTimer]
    }, HERO_PHASE_MS)

    transitionTimerRef.current = [swapTimer]
  }

  function stepHero(direction) {
    let nextIndex = safeIndex

    if (direction > 0) {
      nextIndex = safeIndex === slides.length - 1 ? 0 : safeIndex + 1
    } else if (safeIndex > 0) {
      nextIndex = safeIndex - 1
    }

    if (nextIndex !== safeIndex) {
      selectHero(nextIndex, direction > 0 ? 'left' : 'right')
    }
  }

  function handleCarouselKeyDown(event) {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    event.preventDefault()
    event.stopPropagation()
    stepHero(event.key === 'ArrowRight' ? 1 : -1)
  }

  function handleTouchStart(event) {
    const touch = event.touches?.[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current
    const touch = event.changedTouches?.[0]
    touchStartRef.current = null
    if (!start || !touch || transitionLockRef.current) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    const horizontalDistance = Math.abs(deltaX)
    const verticalDistance = Math.abs(deltaY)

    if (horizontalDistance < SWIPE_MIN_DISTANCE || horizontalDistance <= verticalDistance * 1.15) return
    stepHero(deltaX < 0 ? 1 : -1)
  }

  function renderHeroPanel(entry, className = '') {
    const heroBackdropUrl = entry.displayHeroBackdropUrl || entry.backdropUrl || null

    return (
      <div
        key={entry.id}
        className={`hero hero-slide ${className}`.trim()}
        style={{ '--poster-accent': entry.accent, '--poster-accent-2': entry.accent2 }}
      >
        <div className="hero-copy">
          <h1>{entry.title}</h1>
          <div className="hero-meta">
            <strong>{entry.score}</strong>
            <span>{entry.year || '–'}</span>
            <span>{entry.meta}</span>
            <AgeRatingBadge value={entry.ageRating} className="hero-age-rating" />
          </div>
          <p className="hero-description">{entry.description || 'Für diesen Titel liegt noch keine deutsche Beschreibung vor.'}</p>
          <div className="hero-actions">
            <button type="button" className="action-button action-button-primary" onClick={() => onOpen(entry)} data-focusable="true">
              ▶ Ansehen
            </button>
            <button type="button" className="action-button action-button-secondary" onClick={() => onOpen(entry)} data-focusable="true">
              ⓘ Details
            </button>
          </div>
        </div>
        <div className={heroBackdropUrl ? 'hero-art has-image' : 'hero-art'} aria-hidden="true">
          {heroBackdropUrl && (
            <img
              ref={entry.id === activeItem.id ? activeImageRef : null}
              className="hero-art-image"
              src={heroBackdropUrl}
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
              draggable="false"
              onLoad={() => reportReady('loaded')}
              onError={() => reportReady('error')}
            />
          )}
        </div>
      </div>
    )
  }

  const panelClass = transition
    ? `hero-slide-${transition.phase}-${transition.direction}`
    : 'hero-slide-current'

  return (
    <section
      className="hero-carousel"
      aria-label={`${eyebrow}: ${activeItem.title}`}
      aria-roledescription="Karussell"
      aria-busy={Boolean(transition)}
      tabIndex={0}
      data-focusable="true"
      onKeyDown={handleCarouselKeyDown}
    >
      <p className="eyebrow hero-carousel-eyebrow">{eyebrow}</p>

      <div
        className="hero-viewport"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchStartRef.current = null }}
      >
        <div className="hero-slide-layer">
          {renderHeroPanel(activeItem, panelClass)}
        </div>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              className="hero-nav hero-nav-prev"
              aria-label="Vorherigen Hero anzeigen"
              tabIndex={-1}
              disabled={safeIndex === 0}
              onClick={() => stepHero(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="hero-nav hero-nav-next"
              aria-label="Nächsten Hero anzeigen"
              tabIndex={-1}
              onClick={() => stepHero(1)}
            >
              ›
            </button>
          </>
        )}
      </div>

      {slides.length > 1 && (
        <div className="hero-dots" role="tablist" aria-label="Hero auswählen">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              className={index === safeIndex ? 'hero-dot active' : 'hero-dot'}
              aria-label={`Hero ${index + 1}: ${slide.title}`}
              aria-selected={index === safeIndex}
              role="tab"
              tabIndex={-1}
              onClick={() => selectHero(index)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
