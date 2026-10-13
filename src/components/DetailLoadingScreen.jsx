import DetailDialog from './detail/DetailDialog.jsx'
import DetailActions from './detail/DetailActions.jsx'

export default function DetailLoadingScreen({ item, error = null, onRetry, onClose }) {
  return (
    <DetailDialog primary className="detail-modal detail-loading-panel" backdropClassName="detail-backdrop primary-detail-backdrop detail-loading-backdrop"
      label={`Details zu ${item?.title || 'Titel'} werden geladen`} onClose={onClose}>
        <div
          className="detail-art detail-loading-art"
          style={{ '--poster-accent': item?.accent, '--poster-accent-2': item?.accent2 }}
        >
          <span className="detail-type">{item?.type === 'series' ? 'SERIE' : 'FILM'}</span>
        </div>
        <div className={`detail-copy detail-loading-copy${error ? ' detail-loading-error-copy' : ''}`}>
          <DetailActions onClose={onClose} />
          {error ? (
            <section className="library-empty-state detail-loading-error" role="alert">
              <p className="settings-kicker">Details nicht erreichbar</p>
              <h2>Die vollständigen Titeldetails konnten nicht geladen werden.</h2>
              <p>Prüfe deine Verbindung und den TMDB API Read Access Token in den Einstellungen.</p>
              <div className="detail-loading-actions">
                <button
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
                  Zurück
                </button>
              </div>
            </section>
          ) : (
            <p className="loading-copy" role="status" aria-live="polite">Details werden geladen …</p>
          )}
        </div>
    </DetailDialog>
  )
}
