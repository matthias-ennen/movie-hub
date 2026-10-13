import { useLayoutEffect, useRef, useState } from 'react'
import DetailDialog from './DetailDialog.jsx'
import { DialogHeading } from './DetailActions.jsx'

export default function TitleEditor({ activeProfile, personalState, personalBusy, libraryLoading,
  personalMessage, savePersonalPatch, noteDraft, setNoteDraft, handleSaveNote, sharedMedia,
  mediaDraft, mediaBusy, mediaMessage, editingMediaId, pendingDeleteId, startMediaDraft,
  addMedia, setMediaDraft, resetMediaDraft, launchMedia, mediaIcon, editMedia, deleteMedia, onClose }) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const mediaTrigger = useRef(null)
  const addLink = useRef(null)
  const previousType = useRef(mediaDraft.type)
  const originalMedia = sharedMedia.find((entry) => entry.id === editingMediaId)
  const mediaChanged = editingMediaId
    ? mediaDraft.label !== originalMedia?.label || mediaDraft.url !== originalMedia?.url
    : Boolean(mediaDraft.label || mediaDraft.url)
  const dirty = noteDraft !== personalState.note || mediaChanged
  useLayoutEffect(() => {
    if (previousType.current && !mediaDraft.type && document.activeElement === document.body) {
      const target = mediaTrigger.current?.isConnected ? mediaTrigger.current : addLink.current
      target?.focus({ preventScroll: true })
    }
    previousType.current = mediaDraft.type
  }, [mediaDraft.type])
  function close() {
    if (personalBusy || mediaBusy) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }
  return <DetailDialog className="media-panel media-editor-panel detail-editor-panel"
    labelledBy="media-editor-heading" onClose={close}>
    <DialogHeading id="media-editor-heading" onClose={close}>Bearbeiten</DialogHeading>
    <div className="detail-editor-content">
      <section aria-labelledby="personal-edit-heading">
        <h3 className="settings-kicker" id="personal-edit-heading">Für {activeProfile?.displayName || 'dieses Profil'}</h3>
            {personalState.watched && (
              <label className="watched-date-control">
                Gesehen am
                <input
                  type="date"
                  value={personalState.watchedAt ?? ''}
                  onChange={(event) => savePersonalPatch({ watched: true, watchedAt: event.target.value || null }, 'Gesehen-Datum gespeichert.')}
                  aria-disabled={personalBusy || libraryLoading}
                  data-focusable="true"
                />
              </label>
            )}

            <form className="personal-note-form" onSubmit={handleSaveNote}>
              <label>
                Persönliche Notiz
                <textarea
                  value={noteDraft}
                  maxLength={500}
                  rows={3}
                  placeholder="Optional – nur in diesem Movie-Hub-Profil"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  data-focusable="true"
                />
              </label>
              <button
                type="submit"
                aria-disabled={personalBusy || libraryLoading || noteDraft === personalState.note}
                data-focusable="true"
              >Notiz speichern</button>
            </form>


        {personalMessage && <p className="personal-state-message" role="status">{personalMessage}</p>}
      </section>
      <section aria-labelledby="shared-edit-heading">
        <h3 className="settings-kicker" id="shared-edit-heading">Eigene Links und Videos · alle Profile</h3>
            <div className="media-kind-actions" aria-label="Eigenen Inhalt hinzufügen">
              <button ref={addLink} type="button" data-focusable="true" onClick={(event) => { mediaTrigger.current = event.currentTarget; startMediaDraft('web') }}>↗ Link hinzufügen</button>
              <button type="button" data-focusable="true" onClick={(event) => { mediaTrigger.current = event.currentTarget; startMediaDraft('video') }}>▶ Video hinzufügen</button>
            </div>

            {mediaDraft.type && (
              <form onSubmit={addMedia} className="media-form">
                <h3 className="media-form-title">{editingMediaId ? 'Eintrag bearbeiten' : mediaDraft.type === 'video' ? 'Video hinzufügen' : 'Link hinzufügen'}</h3>
                <label>Bezeichnung<input required maxLength="80" placeholder={mediaDraft.type === 'video' ? 'z. B. Film auf NAS' : 'z. B. YouTube-Video'} value={mediaDraft.label} onChange={(event) => setMediaDraft({ ...mediaDraft, label: event.target.value })} data-focusable="true" /></label>
                <label>Adresse<input required type="text" placeholder={mediaDraft.type === 'video' ? 'https://…/video.mp4, smb://… oder \\Server\Freigabe\video.mkv' : 'https://…'} value={mediaDraft.url} onChange={(event) => setMediaDraft({ ...mediaDraft, url: event.target.value })} data-focusable="true" /></label>
                <div className="media-form-actions">
                  <button type="submit" disabled={mediaBusy} data-focusable="true">Speichern</button>
                  <button type="button" disabled={mediaBusy} data-focusable="true" onClick={resetMediaDraft}>Abbrechen</button>
                </div>
              </form>
            )}

            {mediaDraft.type === 'web' && <p className="media-form-hint">Links werden außerhalb des Movie-Hub-Players in der passenden App oder im Browser geöffnet. YouTube-Links werden auf unterstützten Geräten gezielt an die YouTube-App übergeben.</p>}
            {mediaDraft.type === 'video' && <p className="media-form-hint">Movie Hub erkennt die Quelle automatisch: HTTP(S)-Videos laufen im Movie-Hub-Player; <code>smb://server/freigabe/datei</code> und Windows-Pfade wie <code>\\Server\Freigabe\datei</code> werden als Netzwerkvideo geöffnet. Zugangsdaten kommen aus <strong>Einstellungen → Netzlaufwerke</strong>.</p>}
            {mediaMessage && <p className="personal-state-message" role="status">{mediaMessage}</p>}
            {sharedMedia.length > 0 && (
              <div className="media-entry-list">
                {sharedMedia.map((entry) => (
                  <div className="media-entry" key={entry.id}>
                    <button type="button" data-focusable="true" onClick={() => launchMedia(entry)}><span aria-hidden="true">{mediaIcon(entry)}</span> {entry.label}</button>
                    <button type="button" data-focusable="true" disabled={mediaBusy} onClick={(event) => { mediaTrigger.current = event.currentTarget; editMedia(entry) }}>Bearbeiten</button>
                    <button type="button" className="media-delete" data-focusable="true" disabled={mediaBusy} onClick={() => deleteMedia(entry)}>{pendingDeleteId === entry.id ? 'Wirklich löschen?' : 'Löschen'}</button>
                  </div>
                ))}
              </div>
            )}

      </section>
    </div>
    {confirmDiscard && <DetailDialog className="media-panel detail-discard-panel" label="Ungespeicherte Änderungen" onClose={() => setConfirmDiscard(false)}>
      <DialogHeading id="discard-heading" onClose={() => setConfirmDiscard(false)}>Ungespeicherte Änderungen</DialogHeading>
      <p>Möchtest du weiter bearbeiten oder deine ungespeicherten Änderungen verwerfen?</p>
      <div className="media-form-actions">
        <button type="button" data-focusable="true" onClick={() => setConfirmDiscard(false)}>Weiter bearbeiten</button>
        <button type="button" data-focusable="true" onClick={() => { setNoteDraft(personalState.note); resetMediaDraft(); onClose() }}>Verwerfen</button>
      </div>
    </DetailDialog>}
  </DetailDialog>
}
