import DetailDialog from './DetailDialog.jsx'
import { DialogHeading } from './DetailActions.jsx'

export default function TitleAlertDialog({ title, included, tv, available = false, canEnableAvailable = false, busy, ready, message, onToggle, onClose }) {
  return <DetailDialog className="media-panel detail-alert-panel" labelledBy="detail-alert-heading" onClose={onClose}>
    <DialogHeading id="detail-alert-heading" subtitle={title} onClose={onClose}>Erinnerungen</DialogHeading>
    <div className="title-alert-options" aria-label="Benachrichtigungen für diesen Titel">
      {[['included', 'Wenn inklusive', included], ['tv', 'Wenn im TV', tv], ['available', 'Wenn verfügbar', available]].map(([kind, label, enabled]) => (
        <button key={kind} type="button" data-focusable="true" aria-pressed={enabled}
          aria-disabled={busy || !ready || (kind === 'available' && !enabled && !canEnableAvailable)} onClick={() => !busy && ready && (kind !== 'available' || enabled || canEnableAvailable) && onToggle(kind)}>
          <strong>{label}</strong><span>{enabled ? 'Ein' : 'Aus'}</span>
        </button>
      ))}
    </div>
    {!canEnableAvailable && !available && <p className="settings-hint">„Wenn verfügbar“ kannst du nur bei Titeln ohne Anbieter einschalten.</p>}
    {message && <p role="status" className="personal-state-message">{message}</p>}
  </DetailDialog>
}
