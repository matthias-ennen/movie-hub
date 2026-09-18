import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../styles/issue128.css'
import '../styles/issue128-hero-boundary.css'
import { HERO_READY_TIMEOUT_MS } from '../performance/progressiveRendering.js'
import {
  getActiveHeroCount,
  getActiveHeroTrailerSettings,
  isExperienceModuleVisible,
} from '../profiles/profileExperienceRuntime.js'
import AgeRatingBadge from './AgeRatingBadge.jsx'
import {
  didTrailerComplete,
  getNextAutomaticHeroIndex,
  HERO_POST_TRAILER_DELAY_MS,
  HERO_TRAILER_RESULT_EVENT,
  resolveHeroTimerAction,
  shouldPreserveHeroSessionOnBlur,
} from './heroAutoplay.js'
import { selectHeroTrailer, selectHeroVideo } from './heroTrailer.js'

const SWIPE_MIN_DISTANCE = 48
const HERO_PHASE_MS = 170

function visibilityPage(eyebrow) {
  if (eyebrow === 'Filme') return 'movies'
  if (eyebrow === 'Serien') return 'series'
  if (eyebrow === 'Meine Inhalte') return 'myContent'
  return 'home'
}

function launchNativeTrailer(video, title, soundEnabled, requestId = '') {
  const bridge = window.MovieHubTrailer
  if (!bridge || typeof bridge.playHeroTrailer !== 'function') return false
  try {
    if (requestId && typeof bridge.playHeroTrailerWithResult === 'function') {
      bridge.playHeroTrailerWithResult(
        String(video.key || ''),
        String(title || 'Trailer'),
        Boolean(soundEnabled),
        requestId,
      )
      return true
    }
    bridge.playHeroTrailer(String(video.key || ''), String(title || 'Trailer'), Boolean(soundEnabled))
    return true
  } catch {
    return false
  }
}

export default function Hero({ item, items, onOpen, eyebrow = 'Heute im Fokus', onReady }) {
  const page = visibilityPage(eyebrow)
  const heroCount = getActiveHeroCount()
  const heroTrailerSettings = getActiveHeroTrailerSettings()
  const heroVisible = isExperienceModuleVisible(page, 'hero')
  const slides = useMemo(() => {
    if (!heroVisible) return []
    const source = Array.isArray(items) && items.length ? items : item ? [item] : []
    const seen = new Set()
    return source.filter((entry) => {
      if (!entry?.id || seen.has(entry.id)) return false
      seen.add(entry.id)
      return true
    }).slice(0, heroCount)
  }, [heroCount, heroVisible, item, items])

  const signature = slides.map((entry) => entry.id).join('|')
  const [activeIndex, setActiveIndex] = useState(0)
  const [transition, setTransition] = useState(null)
  const [heroVisit, setHeroVisit] = useState(0)
  const [attemptedVisit, setAttemptedVisit] = useState(null)
  const [heroFocused, setHeroFocused] = useState(false)
  const touchStartRef = useRef(null)
  const transitionTimerRef = useRef([])
  const transitionLockRef = useRef(false)
  const postTrailerTimerRef = useRef(null)
  const trailerRequestRef = useRef(null)
  const trailerRequestSequenceRef = useRef(0)
  const activeImageRef = useRef(null)
  const readyReportedRef = useRef(false)
  const focusedElementRef = useRef(null)

  function clearTransitionTimers() {
    transitionTimerRef.current.forEach((timer) => window.clearTimeout(timer))
    transitionTimerRef.current = []
  }

  function clearPostTrailerTimer() {
    if (postTrailerTimerRef.current !== null) {
      window.clearTimeout(postTrailerTimerRef.current)
      postTrailerTimerRef.current = null
    }
  }

  function invalidateTrailerRequest() {
    clearPostTrailerTimer()
    trailerRequestRef.current = null
  }

  useEffect(() => {
    clearTransitionTimers()
    invalidateTrailerRequest()
    transitionLockRef.current = false
    readyReportedRef.current = false
    focusedElementRef.current = null
    setActiveIndex(0)
    setTransition(null)
    setHeroVisit((value) => value + 1)
    setAttemptedVisit(null)
    setHeroFocused(false)
  }, [signature])

  useEffect(() => () => {
    clearTransitionTimers()
    invalidateTrailerRequest()
    transitionLockRef.current = false
  }, [])

  const safeIndex = Math.min(activeIndex, Math.max(0, slides.length - 1))
  const activeItem = slides[safeIndex] || null
  const activeBackdropUrl = activeItem?.displayHeroBackdropUrl || activeItem?.backdropUrl || null
  const activeHeroVideo = useMemo(() => selectHeroVideo(activeItem?.videos), [activeItem?.videos])
  const activeAutoTrailer = useMemo(() => selectHeroTrailer(activeItem?.videos), [activeItem?.videos])

  useEffect(() => {
    if (
      !heroFocused
      || !heroTrailerSettings.enabled
      || !activeItem
      || transition
      || attemptedVisit === heroVisit
    ) return undefined

    const timer = window.setTimeout(() => {
      setAttemptedVisit(heroVisit)
      const action = resolveHeroTimerAction(
        safeIndex,
        slides.length,
        Boolean(activeAutoTrailer),
      )

      if (action.type !== 'play-trailer') {
        if (action.type === 'advance') selectHero(action.nextIndex, 'left')
        return
      }

      trailerRequestSequenceRef.current += 1
      const requestId = `hero-${Date.now()}-${trailerRequestSequenceRef.current}`
      const launched = launchNativeTrailer(
        activeAutoTrailer,
        activeItem.title,
        heroTrailerSettings.soundEnabled,
        requestId,
      )

      if (launched) {
        trailerRequestRef.current = {
          requestId,
          heroVisit,
          index: safeIndex,
          signature,
        }
      } else if (action.nextIndex !== null) {
        selectHero(action.nextIndex, 'left')
      }
    }, heroTrailerSettings.delaySeconds * 1000)

    return () => window.clearTimeout(timer)
  }, [
    activeAutoTrailer,
    activeItem,
    attemptedVisit,
    heroFocused,
    heroTrailerSettings.delaySeconds,
    heroTrailerSettings.enabled,
    heroTrailerSettings.soundEnabled,
    heroVisit,
    safeIndex,
    signature,
    slides.length,
    transition,
  ])

  useEffect(() => {
    function handleTrailerResult(event) {
      const detail = event?.detail || {}
      const request = trailerRequestRef.current
      if (!request || detail.requestId !== request.requestId) return

      trailerRequestRef.current = null
      if (
        !didTrailerComplete(detail.outcome)
        || request.signature !== signature
        || request.heroVisit !== heroVisit
        || request.index !== safeIndex
      ) return

      const nextIndex = getNextAutomaticHeroIndex(request.index, slides.length)
      if (nextIndex === null) return

      clearPostTrailerTimer()
      postTrailerTimerRef.current = window.setTimeout(() => {
        postTrailerTimerRef.current = null
        selectHero(nextIndex, 'left')
      }, HERO_POST_TRAILER_DELAY_MS)
    }

    window.addEventListener(HERO_TRAILER_RESULT_EVENT, handleTrailerResult)
    return () => window.removeEventListener(HERO_TRAILER_RESULT_EVENT, handleTrailerResult)
  }, [heroVisit, safeIndex, signature, slides.length])

  const reportReady = useCallback((reason) => {
    if (!onReady || readyReportedRef.current) return
    readyReportedRef.current = true
    onReady({ item: activeItem, reason })
  }, [activeItem, onReady])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const image = activeImageRef.current
      if (!activeBackdropUrl) {
        reportReady(slides.length ? 'no-image' : heroVisible ? 'no-hero' : 'hidden')
      } else if (image?.complete) {
        reportReady(image.naturalWidth > 0 ? 'cached' : 'error')
      }
    })
    const timeout = window.setTimeout(() => reportReady('timeout'), HERO_READY_TIMEOUT_MS)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [activeBackdropUrl, heroVisible, reportReady, slides.length])

  if (!slides.length) return null

  function resetTrailerIdleTimer() {
    setHeroVisit((value) => value + 1)
    setAttemptedVisit(null)
  }

  function handleHeroFocus(event) {
    setHeroFocused(true)
    if (focusedElementRef.current !== event.target) {
      focusedElementRef.current = event.target
      resetTrailerIdleTimer()
    }
  }

  function handleHeroBlur(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return
    if (shouldPreserveHeroSessionOnBlur(trailerRequestRef.current)) return
    invalidateTrailerRequest()
    focusedElementRef.current = null
    setHeroFocused(false)
    setAttemptedVisit(null)
  }

  function startTrailerNow() {
    if (!activeHeroVideo || !activeItem) return
    setAttemptedVisit(heroVisit)
    launchNativeTrailer(activeHeroVideo, activeItem.title, heroTrailerSettings.soundEnabled)
  }

  function selectHero(index, direction = null) {
    if (transitionLockRef.current || index < 0 || index >= slides.length || index === safeIndex) return

    transitionLockRef.current = true
    invalidateTrailerRequest()
    const resolvedDirection = direction || (index > safeIndex ? 'left' : 'right')
    clearTransitionTimers()
    resetTrailerIdleTimer()
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
            <button
              type="button"
              className="action-button action-button-secondary"
              onClick={startTrailerNow}
              disabled={!activeHeroVideo}
              data-focusable={activeHeroVideo ? 'true' : undefined}
              aria-label={activeHeroVideo ? 'Trailer abspielen' : 'Kein Trailer verfügbar'}
            >
              ▶ Trailer
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
      onFocusCapture={handleHeroFocus}
      onBlurCapture={handleHeroBlur}
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
