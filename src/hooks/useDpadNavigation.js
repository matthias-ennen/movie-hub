import { useEffect } from 'react'

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
const BACK_KEYS = new Set(['Escape', 'BrowserBack', 'GoBack'])

function isEditable(element) {
  if (!element) return false
  return element.matches?.('input, textarea, select, [contenteditable="true"]') ?? false
}

function isVisibleFocusable(element) {
  return !element.disabled && element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null
}

function getFocusableCandidates(scopeSelector) {
  const root = scopeSelector ? document.querySelector(scopeSelector) : document
  if (!root) return []

  return [...root.querySelectorAll('[data-focusable="true"]')].filter(isVisibleFocusable)
}

function getTrackVisibleBounds(track, padding = 0) {
  const trackRect = track.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth
  const left = Math.max(0, trackRect.left) + padding
  const right = Math.min(viewportWidth, trackRect.right) - padding

  if (right <= left) {
    return {
      left: Math.max(0, trackRect.left),
      right: Math.min(viewportWidth, trackRect.right),
    }
  }

  return { left, right }
}

function scrollPosterTrackToCandidate(candidate, mode = 'center') {
  const track = candidate?.closest?.('.poster-track')
  if (!track) return

  const trackRect = track.getBoundingClientRect()
  const cardRect = candidate.getBoundingClientRect()
  const maxLeft = Math.max(0, track.scrollWidth - track.clientWidth)
  let targetLeft = track.scrollLeft

  if (mode === 'nearest') {
    const bounds = getTrackVisibleBounds(track, 20)

    if (cardRect.left < bounds.left) {
      targetLeft -= bounds.left - cardRect.left
    } else if (cardRect.right > bounds.right) {
      targetLeft += cardRect.right - bounds.right
    } else {
      return
    }
  } else {
    const cardCenterInTrack = (cardRect.left - trackRect.left) + track.scrollLeft + (cardRect.width / 2)
    targetLeft = cardCenterInTrack - (track.clientWidth / 2)
  }

  const clampedLeft = Math.max(0, Math.min(targetLeft, maxLeft))
  if (Math.abs(track.scrollLeft - clampedLeft) > 1) {
    track.scrollTo({ left: clampedLeft, behavior: 'smooth' })
  }
}

function getPosterClosestToViewportX(cards, sourceCenterX) {
  if (!cards.length) return null

  const fullyVisible = []
  const partiallyVisible = []

  cards.forEach((card) => {
    const track = card.closest?.('.poster-track')
    if (!track) return

    const rect = card.getBoundingClientRect()
    const bounds = getTrackVisibleBounds(track, 12)

    if (rect.left >= bounds.left && rect.right <= bounds.right) {
      fullyVisible.push(card)
    } else if (rect.right > bounds.left && rect.left < bounds.right) {
      partiallyVisible.push(card)
    }
  })

  const pool = fullyVisible.length
    ? fullyVisible
    : partiallyVisible.length
      ? partiallyVisible
      : cards

  return pool.reduce((best, candidate) => {
    const rect = candidate.getBoundingClientRect()
    const centerX = rect.left + (rect.width / 2)
    const distance = Math.abs(centerX - sourceCenterX)

    if (!best || distance < best.distance) {
      return { candidate, distance }
    }
    return best
  }, null)?.candidate || null
}

function scrollPageToPosterCandidate(candidate) {
  if (!candidate) return

  const scrollingElement = document.scrollingElement || document.documentElement
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  if (!scrollingElement || !viewportHeight) return

  const cardRect = candidate.getBoundingClientRect()
  const topbarRect = document.querySelector('.topbar')?.getBoundingClientRect()
  const safeTop = Math.max(0, topbarRect?.bottom || 0) + 24
  const safeBottom = Math.max(safeTop, viewportHeight - 32)
  const targetCenterY = safeTop + ((safeBottom - safeTop) / 2)
  const cardCenterY = cardRect.top + (cardRect.height / 2)
  const deltaY = cardCenterY - targetCenterY

  if (Math.abs(deltaY) <= 1) return

  const currentTop = scrollingElement.scrollTop || window.scrollY || 0
  const maxTop = Math.max(0, scrollingElement.scrollHeight - viewportHeight)
  const targetTop = Math.max(0, Math.min(currentTop + deltaY, maxTop))

  window.scrollTo({ top: targetTop, behavior: 'smooth' })
}

function focusCandidate(candidate, { posterHorizontal = 'center' } = {}) {
  if (!candidate) return
  candidate.focus({ preventScroll: true })
  const isInsideDialog = candidate.closest('.detail-modal, .media-panel, .exit-dialog, .profile-menu')
  const isPoster = candidate.matches?.('.poster-card')

  // Fire TV/WebView kann einen verschachtelten scrollIntoView()-Aufruf für das
  // Dokument und den separaten horizontalen Poster-Track-Scroll verlieren.
  // Poster werden deshalb auf Seitenebene explizit vertikal positioniert und
  // der innere Track anschließend unabhängig horizontal geführt.
  if (isPoster && !isInsideDialog) {
    scrollPageToPosterCandidate(candidate)
    window.requestAnimationFrame(() => scrollPosterTrackToCandidate(candidate, posterHorizontal))
    return
  }

  candidate.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: isInsideDialog ? 'nearest' : 'center',
  })
}

function consume(event) {
  event.preventDefault()
  event.stopPropagation()
}

function moveWithin(candidates, active, delta, event) {
  const index = candidates.indexOf(active)
  if (index < 0) return false

  consume(event)
  const nextIndex = index + delta
  if (nextIndex >= 0 && nextIndex < candidates.length) {
    focusCandidate(candidates[nextIndex])
  }
  return true
}

function getTopbarCandidates() {
  return [...document.querySelectorAll(
    '.topbar .nav-link[data-focusable="true"], .topbar .icon-button[data-focusable="true"], .topbar .profile-button[data-focusable="true"]',
  )].filter(isVisibleFocusable)
}

function getPreferredTopbarTarget() {
  return document.querySelector(
    '.topbar .nav-link.active[data-focusable="true"], .topbar .icon-button.active[data-focusable="true"], .topbar .profile-button.active[data-focusable="true"]',
  ) || getTopbarCandidates()[0] || null
}

function getHeroTarget() {
  const hero = document.querySelector('.hero-carousel[data-focusable="true"]')
  return hero && isVisibleFocusable(hero) ? hero : null
}

function getHeroActions() {
  return [...document.querySelectorAll('.hero-actions [data-focusable="true"]')].filter(isVisibleFocusable)
}

function getPosterTracks() {
  return [...document.querySelectorAll('.poster-track')]
    .filter((track) => track.offsetParent !== null)
    .filter((track) => [...track.querySelectorAll('.poster-card[data-focusable="true"]')].some(isVisibleFocusable))
}

function getPosterCards(track) {
  if (!track) return []
  return [...track.querySelectorAll('.poster-card[data-focusable="true"]')].filter(isVisibleFocusable)
}

function getFirstPageTarget() {
  const hero = getHeroTarget()
  if (hero) return hero

  const firstPoster = getPosterCards(getPosterTracks()[0])[0]
  if (firstPoster) return firstPoster

  return getFocusableCandidates(null).find((candidate) => !candidate.closest('.topbar')) || null
}

function focusAdjacentPosterRow(tracks, rowIndex, direction, active) {
  const targetRowIndex = rowIndex + direction
  if (targetRowIndex < 0 || targetRowIndex >= tracks.length) return false

  const targetCards = getPosterCards(tracks[targetRowIndex])
  if (!targetCards.length) return false

  const sourceRect = active.getBoundingClientRect()
  const sourceCenterX = sourceRect.left + (sourceRect.width / 2)
  const target = getPosterClosestToViewportX(targetCards, sourceCenterX)

  // Hoch/Runter verhält sich wie ein zweidimensionales Raster: gewählt wird die
  // optisch nächstgelegene sichtbare Karte über/unter der aktuellen X-Position.
  // Die Zielreihe behält ihren horizontalen Stand; nur angeschnittene Karten
  // werden minimal nachgeführt statt jedes Mal wieder in die Mitte zu springen.
  focusCandidate(target, { posterHorizontal: 'nearest' })
  return true
}

function handlePageNavigation(event, active) {
  const direction = event.key

  if (active.closest?.('.topbar')) {
    const topbarCandidates = getTopbarCandidates()
    if (direction === 'ArrowLeft') return moveWithin(topbarCandidates, active, -1, event)
    if (direction === 'ArrowRight') return moveWithin(topbarCandidates, active, 1, event)

    consume(event)
    if (direction === 'ArrowDown') focusCandidate(getFirstPageTarget())
    return true
  }

  if (active.matches?.('.hero-carousel')) {
    if (direction === 'ArrowUp') {
      consume(event)
      focusCandidate(getPreferredTopbarTarget())
      return true
    }

    if (direction === 'ArrowDown') {
      consume(event)
      focusCandidate(getHeroActions()[0] || getPosterCards(getPosterTracks()[0])[0])
      return true
    }

    // Links/Rechts verarbeitet Hero selbst, damit der sichtbare Slide-Wechsel
    // und der zyklische Vorwärtslauf an einer Stelle bleiben.
    return false
  }

  const heroActions = active.closest?.('.hero-actions')
  if (heroActions) {
    const actionCandidates = [...heroActions.querySelectorAll('[data-focusable="true"]')].filter(isVisibleFocusable)
    if (direction === 'ArrowLeft') return moveWithin(actionCandidates, active, -1, event)
    if (direction === 'ArrowRight') return moveWithin(actionCandidates, active, 1, event)

    consume(event)
    if (direction === 'ArrowUp') {
      focusCandidate(getHeroTarget())
    } else if (direction === 'ArrowDown') {
      focusCandidate(getPosterCards(getPosterTracks()[0])[0])
    }
    return true
  }

  if (active.matches?.('.poster-card')) {
    const currentTrack = active.closest('.poster-track')
    if (!currentTrack) return false

    const cards = getPosterCards(currentTrack)
    if (direction === 'ArrowLeft') return moveWithin(cards, active, -1, event)
    if (direction === 'ArrowRight') return moveWithin(cards, active, 1, event)

    const tracks = getPosterTracks()
    const rowIndex = tracks.indexOf(currentTrack)
    if (rowIndex < 0) return false

    consume(event)

    if (direction === 'ArrowUp') {
      if (rowIndex > 0) {
        focusAdjacentPosterRow(tracks, rowIndex, -1, active)
      } else {
        focusCandidate(getHeroActions()[0] || getHeroTarget() || getPreferredTopbarTarget())
      }
      return true
    }

    if (direction === 'ArrowDown') {
      focusAdjacentPosterRow(tracks, rowIndex, 1, active)
      return true
    }
  }

  return false
}

export function useDpadNavigation({ detailOpen, profileMenuOpen, exitDialogOpen, onBack }) {
  useEffect(() => {
    const initialFocus = window.requestAnimationFrame(() => {
      const active = document.activeElement
      if (!active || active === document.body) {
        focusCandidate(getPreferredTopbarTarget() || getFocusableCandidates(null)[0])
      }
    })

    function handleKeyDown(event) {
      const active = document.activeElement
      const editable = isEditable(active)
      const isBackspaceNavigation = event.key === 'Backspace' && !editable
      const isAndroidBack = event.keyCode === 461

      if (BACK_KEYS.has(event.key) || isBackspaceNavigation || isAndroidBack) {
        const handled = onBack?.() !== false
        if (handled) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }

      if (!ARROW_KEYS.has(event.key)) return

      // In Texteingaben bleiben Links/Rechts für die Cursorbewegung reserviert.
      // Hoch/Runter dürfen den Fokus dagegen zurück in die TV-Oberfläche führen.
      if (editable && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return

      const scopeSelector = document.querySelector('.media-panel')
        ? '.media-panel'
        : exitDialogOpen
          ? '.exit-dialog'
          : detailOpen
            ? '.detail-modal'
            : profileMenuOpen
              ? '.profile-wrap'
              : null

      if (!scopeSelector && active && handlePageNavigation(event, active)) return

      const candidates = getFocusableCandidates(scopeSelector)
      if (!candidates.length) return

      if (!active || !candidates.includes(active)) {
        event.preventDefault()
        focusCandidate(candidates[0])
        return
      }

      const current = active.getBoundingClientRect()
      const currentX = current.left + current.width / 2
      const currentY = current.top + current.height / 2
      const direction = event.key

      const ranked = candidates
        .filter((candidate) => candidate !== active)
        .map((candidate) => {
          const rect = candidate.getBoundingClientRect()
          const x = rect.left + rect.width / 2
          const y = rect.top + rect.height / 2
          const dx = x - currentX
          const dy = y - currentY
          const valid =
            (direction === 'ArrowLeft' && dx < -4) ||
            (direction === 'ArrowRight' && dx > 4) ||
            (direction === 'ArrowUp' && dy < -4) ||
            (direction === 'ArrowDown' && dy > 4)

          if (!valid) return null

          const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight'
          const primary = horizontal ? Math.abs(dx) : Math.abs(dy)
          const secondary = horizontal ? Math.abs(dy) : Math.abs(dx)

          return { candidate, score: primary + secondary * 2.7 }
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)

      if (ranked[0]) {
        event.preventDefault()
        focusCandidate(ranked[0].candidate)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(initialFocus)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [detailOpen, profileMenuOpen, exitDialogOpen, onBack])
}
