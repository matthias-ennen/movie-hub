import { useEffect } from 'react'

export function useDpadNavigation(detailOpen, onBack) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        if (detailOpen) {
          event.preventDefault()
          onBack()
        }
        return
      }

      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return

      const active = document.activeElement
      if (!active || active.tagName === 'INPUT') return

      const scope = detailOpen ? '.detail-modal ' : ''
      const candidates = [...document.querySelectorAll(`${scope}[data-focusable="true"]`)]
        .filter((element) => !element.disabled && element.offsetParent !== null)

      if (!candidates.includes(active)) return

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
          return { candidate, score: primary + secondary * 2.4 }
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)

      if (ranked[0]) {
        event.preventDefault()
        ranked[0].candidate.focus()
        ranked[0].candidate.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailOpen, onBack])
}
