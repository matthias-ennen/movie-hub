import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
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
  consumeHeroAutoplayActivation,
  didTrailerComplete,
  getNextAutomaticHeroIndex,
  HERO_AUTOPLAY_SESSION,
  HERO_AUTOPLAY_SESSION_EVENT,
  HERO_POST_TRAILER_DELAY_MS,
  HERO_TRAILER_RESULT_EVENT,
  listenForHeroAutoplayUserIntent,
  reduceHeroAutoplaySession,
  resolveHeroTimerAction,
  shouldPreserveHeroSessionOnBlur,
} from './heroAutoplay.js'
import { selectHeroTrailer, selectHeroVideo } from './heroTrailer.js'
import { heroNeedsCanonicalMetadata, resolveHeroMetadata } from './heroMetadata.js'
import { focusHeroAfterActivation } from '../navigation/heroActivationFocus.js'

const SWIPE_MIN_DISTANCE = 48
const HERO_PHASE_MS = 170

function visibilityPage(eyebrow) {
  if (eyebrow === 'Filme') return 'movies'
  if (eyebrow === 'Serien') return 'series'
  if (eyebrow === 'TV') return 'tv'
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

function acknowledgeNativeTrailerResult(requestId) {
  const bridge = window.MovieHubTrailer
  if (!requestId || typeof bridge?.acknowledgeHeroTrailerResult !== 'function') return
  try {
    bridge.acknowledgeHeroTrailerResult(requestId)
  } catch {
    // Android retries unconfirmed results after the WebView resumes.
  }
}

export default function Hero({
  item,
  items,
  onOpen,
  eyebrow = 'Heute im Fokus',
  onReady,
  activationRequest = null,
  activationAvailabilitySettled = true,
  onActivationUnavailable,
}) {
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
  const [autoplaySession, updateAutoplaySession] = useReducer(
    reduceHeroAutoplaySession,
    HERO_AUTOPLAY_SESSION.DISARMED,
  )
  const [readySignature, setReadySignature] = useState(null)
  const [resolvedMetadataById, setResolvedMetadataById] = useState({})
  const [settledMetadataIds, setSettledMetadataIds] = useState(() => new Set())
  const carouselRef = useRef(null)
  const touchStartRef = useRef(null)
  const transitionTimerRef = useRef([])
  const transitionLockRef = useRef(false)
  const postTrailerTimerRef = useRef(null)
  const autoplayTimerRef = useRef(null)
  const trailerRequestRef = useRef(null)
  const trailerRequestSequenceRef = useRef(0)
  const activeImageRef = useRef(null)
  const readyReportedRef = useRef(false)
  const handledActivationRef = useRef(null)

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

  const armAutoplaySession = useCallback(() => {
    updateAutoplaySession(HERO_AUTOPLAY_SESSION_EVENT.ACTIVATE)
    setHeroVisit((value) => value + 1)
    setAttemptedVisit(null)
  }, [])

  const disarmAutoplaySession = useCallback(() => {
    if (autoplayTimerRef.current !== null) {
      window.clearTimeout(autoplayTimerRef.current)
      autoplayTimerRef.current = null
    }
    clearPostTrailerTimer()
    updateAutoplaySession(HERO_AUTOPLAY_SESSION_EVENT.USER_INTENT)
    setAttemptedVisit(null)
  }, [])

  useEffect(() => {
    clearTransitionTimers()
    invalidateTrailerRequest()
    transitionLockRef.current = false
    readyReportedRef.current = false
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
    if (autoplayTimerRef.current !== null) window.clearTimeout(autoplayTimerRef.current)
  }, [])

  const safeIndex = Math.min(activeIndex, Math.max(0, slides.length - 1))
  const activeBaseItem = slides[safeIndex] || null
  const activeItem = activeBaseItem
    ? resolvedMetadataById[activeBaseItem.id] || activeBaseItem
    : null
  const activeMetadataSettled = !heroNeedsCanonicalMetadata(activeBaseItem)
    || settledMetadataIds.has(activeBaseItem?.id)
  const activeBackdropUrl = activeItem?.displayHeroBackdropUrl || activeItem?.backdropUrl || null
  const activeHeroVideo = useMemo(() => selectHeroVideo(activeItem?.videos), [activeItem?.videos])
  const activeAutoTrailer = useMemo(() => selectHeroTrailer(activeItem?.videos), [activeItem?.videos])

  useEffect(() => {
    if (!activeBaseItem || !heroNeedsCanonicalMetadata(activeBaseItem)) return undefined

    let cancelled = false
    resolveHeroMetadata(activeBaseItem)
      .then((resolved) => {
        if (cancelled) return
        setResolvedMetadataById((current) => ({ ...current, [activeBaseItem.id]: resolved }))
      })
      .catch((error) => {
        console.warn(`Hero-Metadaten für ${activeBaseItem.id} konnten nicht vollständig geladen werden.`, error)
      })
      .finally(() => {
        if (cancelled) return
        setSettledMetadataIds((current) => {
          const next = new Set(current)
          next.add(activeBaseItem.id)
          return next
        })
      })

    return () => { cancelled = true }
  }, [
    activeBaseItem?.id,
    activeBaseItem?.metadataUpdatedAt,
    activeBaseItem?.metadataVersion,
  ])

  useEffect(() => {
    if (
      !heroFocused
      || autoplaySession !== HERO_AUTOPLAY_SESSION.ARMED
      || !heroTrailerSettings.enabled
      || !activeItem
      || !activeMetadataSettled
      || transition
      || attemptedVisit === heroVisit
    ) return undefined

    autoplayTimerRef.current = window.setTimeout(() => {
      autoplayTimerRef.current = null
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
      trailerRequestRef.current = {
        requestId,
        heroVisit,
        index: safeIndex,
        signature,
      }
      const launched = launchNativeTrailer(
        activeAutoTrailer,
        activeItem.title,
        heroTrailerSettings.soundEnabled,
        requestId,
      )

      if (!launched) {
        trailerRequestRef.current = null
        if (action.nextIndex !== null) selectHero(action.nextIndex, 'left')
      }
    }, heroTrailerSettings.delaySeconds * 1000)

    return () => {
      if (autoplayTimerRef.current !== null) {
        window.clearTimeout(autoplayTimerRef.current)
        autoplayTimerRef.current = null
      }
    }
  }, [
    activeAutoTrailer,
    activeItem,
    activeMetadataSettled,
    attemptedVisit,
    autoplaySession,
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
    if (autoplaySession !== HERO_AUTOPLAY_SESSION.ARMED) return undefined

    return listenForHeroAutoplayUserIntent(disarmAutoplaySession)
  }, [autoplaySession, disarmAutoplaySession])

  useEffect(() => {
    function handleTrailerResult(event) {
      const detail = event?.detail || {}
      const request = trailerRequestRef.current
      if (!request || detail.requestId !== request.requestId) return

      acknowledgeNativeTrailerResult(detail.requestId)
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
    setReadySignature(signature)
    if (readyReportedRef.current) return
    readyReportedRef.current = true
    onReady?.({ item: activeItem, reason })
  }, [activeItem, onReady, signature])

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

  useEffect(() => {
    const requestId = activationRequest?.id
    if (!requestId || handledActivationRef.current === requestId) return undefined

    if ((!heroVisible || !slides.length) && activationAvailabilitySettled) {
      handledActivationRef.current = requestId
      updateAutoplaySession(HERO_AUTOPLAY_SESSION_EVENT.UNAVAILABLE)
      onActivationUnavailable?.(activationRequest)
      return undefined
    }

    if (!slides.length || readySignature !== signature) return undefined

    let cancelledByUser = false
    const cancelForUserIntent = () => {
      cancelledByUser = true
      stopFocus?.()
      removeIntentListeners()
      handledActivationRef.current = requestId
    }
    const removeIntentListeners = () => {
      window.removeEventListener('keydown', cancelForUserIntent, true)
      window.removeEventListener('pointerdown', cancelForUserIntent, true)
      window.removeEventListener('touchstart', cancelForUserIntent, true)
    }

    window.addEventListener('keydown', cancelForUserIntent, true)
    window.addEventListener('pointerdown', cancelForUserIntent, true)
    window.addEventListener('touchstart', cancelForUserIntent, true)

    const stopFocus = focusHeroAfterActivation(carouselRef.current, {
      onSettled: ({ focused }) => {
        removeIntentListeners()
        if (cancelledByUser) return
        handledActivationRef.current = requestId
        if (focused) armAutoplaySession()
        else onActivationUnavailable?.(activationRequest)
      },
    })

    return () => {
      stopFocus()
      removeIntentListeners()
    }
  }, [
    activationAvailabilitySettled,
    activationRequest,
    armAutoplaySession,
    heroVisible,
    onActivationUnavailable,
    readySignature,
    signature,
    slides.length,
  ])

  useEffect(() => {
    const carousel = carouselRef.current
    if (document.activeElement !== carousel) return
    setHeroFocused(true)
    if (consumeHeroAutoplayActivation(carousel)) armAutoplaySession()
  }, [armAutoplaySession, readySignature])

  if (!slides.length) return null

  function resetTrailerIdleTimer() {
    setHeroVisit((value) => value + 1)
    setAttemptedVisit(null)
  }

  function handleHeroFocus(event) {
    setHeroFocused(true)
    if (consumeHeroAutoplayActivation(event.currentTarget)) armAutoplaySession()
  }

  function handleHeroBlur(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return
    if (shouldPreserveHeroSessionOnBlur(trailerRequestRef.current)) return
    invalidateTrailerRequest()
    disarmAutoplaySession()
    setHeroFocused(false)
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
    disarmAutoplaySession()
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
      ref={carouselRef}
      className={heroFocused ? 'hero-carousel is-focused' : 'hero-carousel'}
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
