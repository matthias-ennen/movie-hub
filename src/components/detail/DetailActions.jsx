import BellIcon from '../BellIcon.jsx'

export default function DetailActions({ onClose, onEdit, onAlert, alertActive = false, notePresent = false, loading = false }) {
  return <div className={`detail-actions-bar${onEdit || loading ? ' detail-title-actions' : ''}`}>
    {(onEdit || loading) && <button type="button" className="icon-button detail-action" data-focusable="true" disabled={loading}
      aria-label={notePresent ? 'Bearbeiten · Notiz vorhanden' : 'Bearbeiten'} onClick={onEdit}>
      <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" />
      </svg>
      {notePresent && <span className="detail-note-dot" aria-hidden="true" />}
      <span className="detail-action-label">{notePresent ? 'Bearbeiten · Notiz vorhanden' : 'Bearbeiten'}</span>
    </button>}
    {(onAlert || loading) && <button type="button" data-focusable="true" onClick={onAlert} disabled={loading}
      className={`icon-button detail-action detail-alert-button${alertActive ? ' active' : ''}`}
      aria-label={alertActive ? 'Erinnerung aktiv' : 'Erinnerung einrichten'}>
      <BellIcon />
      {alertActive && <span className="detail-alert-check" aria-hidden="true">✓</span>}
      <span className="detail-action-label">{alertActive ? 'Erinnerung aktiv' : 'Erinnerung einrichten'}</span>
    </button>}
    <button type="button" className="icon-button detail-action detail-close" data-focusable="true"
      data-dialog-close="true" aria-label="Details schließen" onClick={onClose}>
      <span aria-hidden="true">×</span>
    </button>
  </div>
}

export function DialogHeading({ id, children, subtitle, onClose }) {
  return <div className="detail-dialog-heading">
    <div><h2 id={id}>{children}</h2>{subtitle && <p>{subtitle}</p>}</div>
    <button type="button" className="icon-button" data-focusable="true" data-dialog-close="true"
      aria-label="Schließen" onClick={onClose}>×</button>
  </div>
}
