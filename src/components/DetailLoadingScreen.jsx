import { useEffect, useRef } from 'react'

export default function DetailLoadingScreen({ item, error = null, onRetry, onClose }) {
  const closeRef = useRef(null)
  const retryRef = useRef(null)

  useEffect(() => {
    const target = error ? retryRef.current : closeRef.current
    target?.focus({ preventScroll: true })
  }, [error])

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
        <div className={`detail-copy detail-loading-copy${error ? ' detail-loading-error-copy' : ''}`}>
          <button
            ref={closeRef}
            className="icon-button detail-close"
            type="button"
            onClick={onClose}
            data-focusable="true"
            aria-label="Details schließen"
          >×</button>
          {error ? (
            <section className="library-empty-state detail-loading-error" role="alert">
              <p className="settings-kicker">Details nicht erreichbar</p>
              <h2>Die vollständigen Titeldetails konnten nicht geladen werden.</h2>
              <p>Prüfe deine Verbindung und den TMDB API Read Access Token in den Einstellungen.</p>
              <div className="detail-loading-actions">
                <button
                  ref={retryRef}
                  type="button"
                  className="action-button action-button-primary"
                  data-focusable="true"
                  onClick={onRetry}
                >
                  Erneut versuchen
                </button>
                <button
                  type="button"
                  className="action-button action-button-secondary"
                  data-focusable="true"
                  onClick={onClose}
                >
                  Zurück zur Suche
                </button>
              </div>
            </section>
          ) : (
            <p className="loading-copy" role="status" aria-live="polite">Details werden geladen …</p>
          )}
        </div>
      </section>
    </div>
  )
}
