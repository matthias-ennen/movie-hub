import DetailDialog from './DetailDialog.jsx'
import { DialogHeading } from './DetailActions.jsx'

export default function TitleAlertDialog({ title, included, tv, busy, ready, message, onToggle, onClose }) {
  return <DetailDialog className="media-panel detail-alert-panel" labelledBy="detail-alert-heading" onClose={onClose}>
    <DialogHeading id="detail-alert-heading" subtitle={title} onClose={onClose}>Erinnerungen</DialogHeading>
    <div className="title-alert-options" aria-label="Benachrichtigungen für diesen Titel">
      {[['included', 'Wenn inklusive', included], ['tv', 'Wenn im TV', tv]].map(([kind, label, enabled]) => (
        <button key={kind} type="button" data-focusable="true" aria-pressed={enabled}
          aria-disabled={busy || !ready} onClick={() => !busy && ready && onToggle(kind)}>
          <strong>{label}</strong><span>{enabled ? 'Ein' : 'Aus'}</span>
        </button>
      ))}
    </div>
    {message && <p role="status" className="personal-state-message">{message}</p>}
  </DetailDialog>
}
