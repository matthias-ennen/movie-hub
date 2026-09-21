import { useEffect, useRef } from 'react'

export default function DetailLoadingScreen() {
  const panelRef = useRef(null)

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="detail-loading-backdrop" role="presentation">
      <section
        ref={panelRef}
        className="detail-modal detail-loading-panel"
        role="status"
        aria-live="polite"
        aria-label="Details werden geladen"
        tabIndex={-1}
      >
        <p>Details werden geladen …</p>
      </section>
    </div>
  )
}
