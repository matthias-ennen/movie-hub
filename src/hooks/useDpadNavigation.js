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

function scrollPosterTrackToCandidate(candidate) {
  const track = candidate?.closest?.('.poster-track')
  if (!track) return

  const trackRect = track.getBoundingClientRect()
  const cardRect = candidate.getBoundingClientRect()
  const cardCenterInTrack = (cardRect.left - trackRect.left) + track.scrollLeft + (cardRect.width / 2)
  const targetLeft = cardCenterInTrack - (track.clientWidth / 2)
  const maxLeft = Math.max(0, track.scrollWidth - track.clientWidth)
  const clampedLeft = Math.max(0, Math.min(targetLeft, maxLeft))

  if (Math.abs(track.scrollLeft - clampedLeft) > 1) {
    track.scrollTo({ left: clampedLeft, behavior: 'smooth' })
  }
}

function focusCandidate(candidate) {
  if (!candidate) return
  candidate.focus({ preventScroll: true })
  const isInsideDialog = candidate.closest('.detail-modal, .media-panel, .exit-dialog, .profile-menu')
  const isPoster = candidate.matches?.('.poster-card')

  candidate.scrollIntoView({
    behavior: 'smooth',
    block: isPoster ? 'center' : 'nearest',
    inline: isInsideDialog || isPoster ? 'nearest' : 'center',
  })

  if (isPoster) {
    window.requestAnimationFrame(() => scrollPosterTrackToCandidate(candidate))
  }
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
    const cardIndex = cards.indexOf(active)
    if (direction === 'ArrowLeft') return moveWithin(cards, active, -1, event)
    if (direction === 'ArrowRight') return moveWithin(cards, active, 1, event)

    const tracks = getPosterTracks()
    const rowIndex = tracks.indexOf(currentTrack)
    if (rowIndex < 0) return false

    consume(event)

    if (direction === 'ArrowUp') {
      if (rowIndex > 0) {
        const previousCards = getPosterCards(tracks[rowIndex - 1])
        focusCandidate(previousCards[Math.min(cardIndex, previousCards.length - 1)])
      } else {
        focusCandidate(getHeroActions()[0] || getHeroTarget() || getPreferredTopbarTarget())
      }
      return true
    }

    if (direction === 'ArrowDown' && rowIndex < tracks.length - 1) {
      const nextCards = getPosterCards(tracks[rowIndex + 1])
      focusCandidate(nextCards[Math.min(cardIndex, nextCards.length - 1)])
    }
    return true
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
