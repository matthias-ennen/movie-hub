import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles/issue128.css'
import AgeRatingBadge from './AgeRatingBadge.jsx'

const MAX_HEROES = 5
const SWIPE_MIN_DISTANCE = 48
const HERO_TRANSITION_MS = 360

export default function Hero({ item, items, onOpen, eyebrow = 'Heute im Fokus' }) {
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
  const transitionTimerRef = useRef(null)

  useEffect(() => {
    setActiveIndex(0)
    setTransition(null)
  }, [signature])

  useEffect(() => () => {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current)
  }, [])

  if (!slides.length) return null

  const safeIndex = Math.min(activeIndex, slides.length - 1)
  const activeItem = slides[safeIndex]

  function selectHero(index, direction = null) {
    if (index < 0 || index >= slides.length || index === safeIndex) return

    const resolvedDirection = direction || (index > safeIndex ? 'left' : 'right')
    setTransition({ fromIndex: safeIndex, toIndex: index, direction: resolvedDirection })
    setActiveIndex(index)

    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current)
    transitionTimerRef.current = window.setTimeout(() => {
      setTransition(null)
      transitionTimerRef.current = null
    }, HERO_TRANSITION_MS)
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
    if (!start || !touch) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    const horizontalDistance = Math.abs(deltaX)
    const verticalDistance = Math.abs(deltaY)

    if (horizontalDistance < SWIPE_MIN_DISTANCE || horizontalDistance <= verticalDistance * 1.15) return
    stepHero(deltaX < 0 ? 1 : -1)
  }

  function renderHeroPanel(entry, interactive, className = '') {
    const heroBackdropUrl = entry.backdropUrl || null

    return (
      <div
        key={`${entry.id}-${interactive ? 'active' : 'outgoing'}`}
        className={`hero hero-slide ${className}`.trim()}
        style={{ '--poster-accent': entry.accent, '--poster-accent-2': entry.accent2 }}
        aria-hidden={interactive ? undefined : true}
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
            {interactive ? (
              <>
                <button type="button" className="action-button action-button-primary" onClick={() => onOpen(entry)} data-focusable="true">
                  ▶ Ansehen
                </button>
                <button type="button" className="action-button action-button-secondary" onClick={() => onOpen(entry)} data-focusable="true">
                  ⓘ Details
                </button>
              </>
            ) : (
              <>
                <span className="action-button action-button-primary hero-action-ghost">▶ Ansehen</span>
                <span className="action-button action-button-secondary hero-action-ghost">ⓘ Details</span>
              </>
            )}
          </div>
        </div>
        <div className={heroBackdropUrl ? 'hero-art has-image' : 'hero-art'} aria-hidden="true">
          {heroBackdropUrl && <img className="hero-art-image" src={heroBackdropUrl} alt="" draggable="false" />}
        </div>
      </div>
    )
  }

  const stageClassName = transition
    ? `hero-stage is-transitioning direction-${transition.direction}`
    : 'hero-stage'

  return (
    <section
      className="hero-carousel"
      aria-label={`${eyebrow}: ${activeItem.title}`}
      aria-roledescription="Karussell"
      tabIndex={0}
      data-focusable="true"
      onKeyDown={handleCarouselKeyDown}
    >
      <p className="eyebrow hero-carousel-eyebrow">{eyebrow}</p>

      <div
        className={stageClassName}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchStartRef.current = null }}
      >
        {transition && renderHeroPanel(slides[transition.fromIndex], false, 'hero-slide-outgoing')}
        {renderHeroPanel(activeItem, true, transition ? 'hero-slide-incoming' : 'hero-slide-current')}
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
        </>
      )}
    </section>
  )
}
