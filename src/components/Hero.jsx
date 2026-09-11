import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles/issue128.css'

const MAX_HEROES = 5
const SWIPE_MIN_DISTANCE = 48

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
  const touchStartRef = useRef(null)

  useEffect(() => {
    setActiveIndex(0)
  }, [signature])

  if (!slides.length) return null

  const safeIndex = Math.min(activeIndex, slides.length - 1)
  const activeItem = slides[safeIndex]
  const heroBackdropUrl = activeItem.backdropUrl || null

  function selectHero(index) {
    if (index < 0 || index >= slides.length) return
    setActiveIndex(index)
  }

  function stepHero(direction) {
    const nextIndex = Math.max(0, Math.min(slides.length - 1, safeIndex + direction))
    if (nextIndex !== safeIndex) selectHero(nextIndex)
  }

  function handleCarouselKeyDown(event) {
    if (event.target.closest?.('.hero-dot')) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    event.preventDefault()
    event.stopPropagation()
    stepHero(event.key === 'ArrowRight' ? 1 : -1)
  }

  function handleDotKeyDown(event, index) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()

    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index + direction))
    if (nextIndex === index) return

    selectHero(nextIndex)
    const dots = event.currentTarget.parentElement?.querySelectorAll('.hero-dot')
    dots?.[nextIndex]?.focus({ preventScroll: true })
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

  return (
    <section
      className="hero-carousel"
      aria-label={`${eyebrow}: ${activeItem.title}`}
      aria-roledescription="Karussell"
      tabIndex={0}
      data-focusable="true"
      onKeyDown={handleCarouselKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null }}
    >
      <div className="hero" style={{ '--poster-accent': activeItem.accent, '--poster-accent-2': activeItem.accent2 }}>
        <div className="hero-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{activeItem.title}</h1>
          <div className="hero-meta">
            <strong>{activeItem.score}</strong>
            <span>{activeItem.year || '–'}</span>
            <span>{activeItem.meta}</span>
          </div>
          <p className="hero-description">{activeItem.description || 'Für diesen Titel liegt noch keine deutsche Beschreibung vor.'}</p>
          <div className="hero-actions">
            <button type="button" className="action-button action-button-primary" onClick={() => onOpen(activeItem)} data-focusable="true">
              ▶ Ansehen
            </button>
            <button type="button" className="action-button action-button-secondary" onClick={() => onOpen(activeItem)} data-focusable="true">
              ⓘ Details
            </button>
          </div>
        </div>
        <div className={heroBackdropUrl ? 'hero-art has-image' : 'hero-art'} aria-hidden="true">
          {heroBackdropUrl && <img className="hero-art-image" src={heroBackdropUrl} alt="" />}
        </div>
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
              data-focusable="true"
              onClick={() => selectHero(index)}
              onFocus={() => selectHero(index)}
              onKeyDown={(event) => handleDotKeyDown(event, index)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
