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

function focusCandidate(candidate) {
  if (!candidate) return
  candidate.focus({ preventScroll: true })
  candidate.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

export function useDpadNavigation({ detailOpen, profileMenuOpen, exitDialogOpen, onBack }) {
  useEffect(() => {
    const initialFocus = window.requestAnimationFrame(() => {
      const active = document.activeElement
      if (!active || active === document.body) {
        focusCandidate(getFocusableCandidates(null)[0])
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

          // Bevorzuge Ziele in derselben visuellen Spur. Dadurch springt der
          // Fokus in Posterreihen horizontal und zwischen Reihen möglichst
          // senkrecht, statt diagonal zu weit entfernten Elementen zu wandern.
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
