import { useEffect, useRef } from 'react'

export default function DetailLoadingScreen({ item, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      className="detail-backdrop primary-detail-backdrop detail-loading-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="detail-modal detail-loading-panel" role="dialog" aria-modal="true" aria-label={`Details zu ${item?.title || 'Titel'} werden geladen`}>
        <div
          className="detail-art detail-loading-art"
          style={{ '--poster-accent': item?.accent, '--poster-accent-2': item?.accent2 }}
        >
          <span className="detail-type">{item?.type === 'series' ? 'SERIE' : 'FILM'}</span>
        </div>
        <div className="detail-copy detail-loading-copy">
          <button
            ref={closeRef}
            className="icon-button detail-close"
            type="button"
            onClick={onClose}
            data-focusable="true"
            aria-label="Details schließen"
          >×</button>
          <p className="loading-copy" role="status" aria-live="polite">Details werden geladen …</p>
        </div>
      </section>
    </div>
  )
}
