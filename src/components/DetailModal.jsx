import { useEffect, useRef, useState } from 'react'
import { getProviderDestination, providers } from '../data/catalog.js'
import { useLibrary } from '../library/LibraryProvider.jsx'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { loadSharedMedia, removeSharedMedia, saveSharedMedia } from '../library/sharedMedia.js'
import { ProviderBadge } from './ProviderBadges.jsx'

export default function DetailModal({ item, onClose }) {
  const { activeProfile } = useProfiles()
  const { user } = useAuth()
  const { getTitleState, updateTitleState, loading: libraryLoading } = useLibrary()
  const [personalMessage, setPersonalMessage] = useState('')
  const [personalBusy, setPersonalBusy] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [sharedMedia, setSharedMedia] = useState([])
  const [mediaDraft, setMediaDraft] = useState({ label: '', url: '', type: 'web' })
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [mediaEditorOpen, setMediaEditorOpen] = useState(false)
  const [editingMediaId, setEditingMediaId] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [mediaMessage, setMediaMessage] = useState('')
  const [playing, setPlaying] = useState(null)
  const returnFocusRef = useRef(null)
  const providerIds = Array.isArray(item.providerIds) ? item.providerIds : []
  const hasProviders = providerIds.length > 0
  const cast = Array.isArray(item.cast) ? item.cast.slice(0, 5) : []
  const automaticVideos = Array.isArray(item.videos) ? item.videos : []
  const personalState = getTitleState(item)

  useEffect(() => {
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement ? active : null

    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector('[data-detail-autofocus="true"]')
      target?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      const returnTarget = returnFocusRef.current
      if (returnTarget?.isConnected) {
        window.requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }))
      }
    }
  }, [item.id])

  useEffect(() => {
    setNoteDraft(personalState.note)
    setPersonalMessage('')
  }, [activeProfile?.id, item.id, personalState.note])

  useEffect(() => {
    let cancelled = false
    setSharedMedia([])
    setMediaMessage('')
      setMediaEditorOpen(false)
      setMediaPickerOpen(false)
      setPlaying(null)
      setPendingDeleteId(null)
    if (user) {
      loadSharedMedia(user.uid, item)
        .then((entries) => { if (!cancelled) setSharedMedia(entries) })
        .catch((error) => {
          console.error(error)
          if (!cancelled) setMediaMessage('Movie-Hub-Medien konnten nicht geladen werden.')
        })
    }
    return () => { cancelled = true }
  }, [user?.uid, item.id])

  useEffect(() => {
    const closeTopMediaLayer = () => {
      if (playing) {
        setPlaying(null)
        return true
      }
      if (mediaPickerOpen) {
        setMediaPickerOpen(false)
        return true
      }
      if (mediaEditorOpen) {
        setMediaEditorOpen(false)
        return true
      }
      return false
    }
    window.__movieHubDetailBack = closeTopMediaLayer
    return () => {
      if (window.__movieHubDetailBack === closeTopMediaLayer) delete window.__movieHubDetailBack
    }
  }, [mediaEditorOpen, mediaPickerOpen, playing])

  useEffect(() => {
    if (!mediaEditorOpen && !mediaPickerOpen && !playing) return undefined
    const frame = window.requestAnimationFrame(() => {
      document.querySelector('[data-media-autofocus="true"]')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mediaEditorOpen, mediaPickerOpen, playing])

  if (!item) return null

  async function savePersonalPatch(patch, message) {
    setPersonalBusy(true)
    setPersonalMessage('')
    try {
      await updateTitleState(item, patch)
      setPersonalMessage(message)
    } catch (error) {
      console.error(error)
      setPersonalMessage('Persönliche Einstellung konnte nicht gespeichert werden.')
    } finally {
      setPersonalBusy(false)
    }
  }

  async function handleSaveNote(event) {
    event.preventDefault()
    await savePersonalPatch({ note: noteDraft }, 'Notiz gespeichert.')
  }

  function openProvider(providerId) {
    const destination = getProviderDestination(providerId, item.title)
    if (!destination) return

    // The Android shell exposes only a host-whitelisted external browser
    // fallback here. Provider-specific app deep links are a later step.
    if (window.MovieHubNative?.openExternalUrl) {
      window.MovieHubNative.openExternalUrl(destination)
      return
    }

    window.open(destination, '_blank', 'noopener,noreferrer')
  }

  function openUrl(url) {
    if (window.MovieHubNative?.openMediaUrl) window.MovieHubNative.openMediaUrl(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function addMedia(event) {
    event.preventDefault()
    setMediaBusy(true)
    setMediaMessage('')
    try {
      const entry = { ...mediaDraft, id: editingMediaId }
      const id = await saveSharedMedia(user.uid, item, entry)
      const saved = { ...mediaDraft, id }
      setSharedMedia((all) => [...all.filter((value) => value.id !== id), saved]
        .sort((a, b) => a.label.localeCompare(b.label, 'de')))
      setMediaDraft({ label: '', url: '', type: 'web' })
      setEditingMediaId(null)
      setMediaMessage(editingMediaId ? 'Eintrag aktualisiert.' : 'Eintrag für alle Profile gespeichert.')
    } catch (error) {
      console.error(error)
      setMediaMessage(error instanceof Error ? error.message : 'Eintrag konnte nicht gespeichert werden.')
    } finally {
      setMediaBusy(false)
    }
  }

  function editMedia(entry) {
    setEditingMediaId(entry.id)
    setPendingDeleteId(null)
    setMediaDraft({ label: entry.label, url: entry.url, type: entry.type })
    setMediaMessage('')
  }

  function resetMediaDraft() {
    setEditingMediaId(null)
    setPendingDeleteId(null)
    setMediaDraft({ label: '', url: '', type: 'web' })
    setMediaMessage('')
  }

  async function deleteMedia(entry) {
    if (pendingDeleteId !== entry.id) {
      setPendingDeleteId(entry.id)
      setMediaMessage(`„${entry.label}“ wirklich löschen? Bitte Löschen erneut wählen.`)
      return
    }
    setMediaBusy(true)
    setMediaMessage('')
    try {
      await removeSharedMedia(user.uid, item, entry.id)
      setSharedMedia((all) => all.filter((value) => value.id !== entry.id))
      if (editingMediaId === entry.id) resetMediaDraft()
      setPendingDeleteId(null)
      setMediaMessage('Eintrag gelöscht.')
    } catch (error) {
      console.error(error)
      setMediaMessage('Eintrag konnte nicht gelöscht werden.')
    } finally {
      setMediaBusy(false)
    }
  }

  function launchMedia(entry) { if (entry.type === 'video') setPlaying(entry); else openUrl(entry.url) }

  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-label={`Details zu ${item.title}`}>
        <div className={item.posterUrl ? 'detail-art has-image' : 'detail-art'} style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}>
          {item.posterUrl && <img className="detail-art-image" src={item.posterUrl} alt="" />}
          <span className="detail-type">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
          <span className="detail-art-title">{item.title}</span>
        </div>
        <div className="detail-copy">
          <button
            className="icon-button detail-close"
            type="button"
            onClick={onClose}
            data-focusable="true"
            aria-label="Details schließen"
          >×</button>
          <p className="eyebrow">Movie Hub · {item.source === 'tmdb' ? 'TMDB' : 'Testdaten'}</p>
          <h2>{item.title}</h2>
          <div className="meta-line"><strong>{item.score}</strong><span>{item.year || '–'}</span><span>{item.meta}</span></div>
          <p className="genre">{item.genre}</p>
          <p className="detail-description">{item.description || 'Für diesen Titel liegt noch keine deutsche Beschreibung vor.'}</p>
          {cast.length > 0 && (
            <div className="cast-block">
              <h3>Besetzung</h3>
              <p>{cast.map((person) => person.name).join(' · ')}</p>
            </div>
          )}

          {automaticVideos.length > 0 && (
            <section className="catalog-videos" aria-labelledby="catalog-videos-heading">
              <h3 id="catalog-videos-heading">Videos</h3>
              <div className="video-actions">
                {automaticVideos.map((video, index) => (
                  <button
                    type="button"
                    className="action-button video-action"
                    key={video.id || video.url}
                    data-focusable="true"
                    data-detail-autofocus={index === 0 ? 'true' : undefined}
                    onClick={() => openUrl(video.url)}
                  >▶ {video.label || (video.type === 'teaser' ? 'Teaser' : 'Trailer')}</button>
                ))}
              </div>
              <p className="prototype-note">Trailer und Teaser werden über YouTube geöffnet.</p>
            </section>
          )}

          <h3>Wo ansehen?</h3>
          {(sharedMedia.length > 0 || hasProviders) ? (
            <div className="provider-actions" aria-label="Anbieter und Movie-Hub-Medien">
              {sharedMedia.length > 0 && (
                <button
                  type="button"
                  className="action-button provider-action movie-hub-action"
                  data-focusable="true"
                  data-detail-autofocus={automaticVideos.length === 0 ? 'true' : undefined}
                  onClick={() => sharedMedia.length === 1 ? launchMedia(sharedMedia[0]) : setMediaPickerOpen(true)}
                  aria-label={sharedMedia.length === 1 ? `${sharedMedia[0].label} über Movie Hub öffnen` : 'Movie-Hub-Medien auswählen'}
                >
                  <span className="movie-hub-provider-mark" aria-hidden="true">MH</span>
                  Movie Hub
                </button>
              )}
              {providerIds.map((providerId, index) => {
                const provider = providers[providerId]
                if (!provider) return null
                return (
                  <button
                    type="button"
                    key={providerId}
                    className="action-button provider-action"
                    data-focusable="true"
                    data-detail-autofocus={automaticVideos.length === 0 && sharedMedia.length === 0 && index === 0 ? 'true' : undefined}
                    onClick={() => openProvider(providerId)}
                    aria-label={`${provider.label} öffnen`}
                  >
                    <ProviderBadge providerId={providerId} />
                    {provider.label}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="prototype-note">Für diesen Titel ist derzeit kein unterstützter Anbieter in Deutschland hinterlegt.</p>
          )}
          {hasProviders && <p className="prototype-note">Der gewählte Anbieter wird außerhalb von Movie Hub geöffnet.</p>}
          {item.tmdbId && <p className="tmdb-credit">Datenquelle: TMDB · ID {item.tmdbId}</p>}

          <section className="personal-title-state" aria-labelledby="personal-title-state-heading">
            <div className="personal-title-state-heading">
              <div>
                <p className="settings-kicker">{activeProfile?.displayName ?? 'Profil'}</p>
                <h3 id="personal-title-state-heading">Meine Einstellungen</h3>
              </div>
              {personalState.rating && <span className="personal-rating-summary">{personalState.rating}/10</span>}
            </div>

            <div className="personal-action-grid">
              <button
                type="button"
                className={personalState.favorite ? 'personal-action active' : 'personal-action'}
                aria-pressed={personalState.favorite}
                onClick={() => savePersonalPatch(
                  { favorite: !personalState.favorite },
                  personalState.favorite ? 'Aus Favoriten entfernt.' : 'Zu Favoriten hinzugefügt.',
                )}
                disabled={personalBusy || libraryLoading}
                data-focusable="true"
                data-detail-autofocus={automaticVideos.length === 0 && sharedMedia.length === 0 && !hasProviders ? 'true' : undefined}
              >
                <span aria-hidden="true">♥</span>
                <span>{personalState.favorite ? 'Favorit' : 'Als Favorit'}</span>
              </button>
              <button
                type="button"
                className={personalState.watchlist ? 'personal-action active' : 'personal-action'}
                aria-pressed={personalState.watchlist}
                onClick={() => savePersonalPatch(
                  { watchlist: !personalState.watchlist },
                  personalState.watchlist ? 'Aus der Watchlist entfernt.' : 'Für später gemerkt.',
                )}
                disabled={personalBusy || libraryLoading}
                data-focusable="true"
              >
                <span aria-hidden="true">＋</span>
                <span>{personalState.watchlist ? 'Watchlist' : 'Später ansehen'}</span>
              </button>
              <button
                type="button"
                className={personalState.watched ? 'personal-action active' : 'personal-action'}
                aria-pressed={personalState.watched}
                onClick={() => savePersonalPatch(
                  { watched: !personalState.watched },
                  personalState.watched ? 'Als ungesehen markiert.' : 'Als gesehen markiert.',
                )}
                disabled={personalBusy || libraryLoading}
                data-focusable="true"
              >
                <span aria-hidden="true">✓</span>
                <span>{personalState.watched ? 'Gesehen' : 'Als gesehen'}</span>
              </button>
            </div>

            <div className="personal-rating-block">
              <span>Meine Bewertung</span>
              <div className="personal-rating-buttons" aria-label="Persönliche Bewertung von 1 bis 10">
                {Array.from({ length: 10 }, (_, index) => index + 1).map((rating) => (
                  <button
                    type="button"
                    key={rating}
                    className={personalState.rating === rating ? 'rating-button active' : 'rating-button'}
                    aria-pressed={personalState.rating === rating}
                    onClick={() => savePersonalPatch(
                      { rating: personalState.rating === rating ? null : rating },
                      personalState.rating === rating ? 'Bewertung entfernt.' : `Mit ${rating}/10 bewertet.`,
                    )}
                    disabled={personalBusy || libraryLoading}
                    data-focusable="true"
                  >{rating}</button>
                ))}
              </div>
            </div>

            {personalState.watched && (
              <label className="watched-date-control">
                Gesehen am
                <input
                  type="date"
                  value={personalState.watchedAt ?? ''}
                  onChange={(event) => savePersonalPatch({ watched: true, watchedAt: event.target.value || null }, 'Gesehen-Datum gespeichert.')}
                  disabled={personalBusy || libraryLoading}
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
              <button type="submit" disabled={personalBusy || libraryLoading || noteDraft === personalState.note} data-focusable="true">Notiz speichern</button>
            </form>

            {personalMessage && <p className="personal-state-message" role="status">{personalMessage}</p>}
          </section>

          <button
            type="button"
            className="media-manage-shortcut"
            data-focusable="true"
            onClick={() => { resetMediaDraft(); setMediaEditorOpen(true) }}
          >
            <span className="media-manage-shortcut-icon" aria-hidden="true">＋</span>
            <span>
              <strong>{sharedMedia.length ? 'Movie-Hub-Links & Videos verwalten' : 'Link oder Video hinzufügen'}</strong>
              <small>Gemeinsam in allen Profilen verfügbar</small>
            </span>
          </button>
          {mediaMessage && !mediaEditorOpen && <p className="personal-state-message" role="status">{mediaMessage}</p>}
        </div>
      </section>
      {mediaPickerOpen && (
        <div className="media-layer detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMediaPickerOpen(false)}>
          <section className="media-panel media-picker-panel" role="dialog" aria-modal="true" aria-labelledby="media-picker-heading">
            <p className="settings-kicker">Movie Hub</p>
            <h2 id="media-picker-heading">Was möchtest du öffnen?</h2>
            <div className="media-picker-list">
              {sharedMedia.map((entry, index) => (
                <button
                  type="button"
                  key={entry.id}
                  data-focusable="true"
                  data-media-autofocus={index === 0 ? 'true' : undefined}
                  onClick={() => { setMediaPickerOpen(false); launchMedia(entry) }}
                >
                  <span aria-hidden="true">{entry.type === 'video' ? '▶' : '↗'}</span>
                  <span>{entry.label}<small>{entry.type === 'video' ? 'In Movie Hub abspielen' : 'Webseite öffnen'}</small></span>
                </button>
              ))}
            </div>
            <button type="button" className="media-cancel" data-focusable="true" onClick={() => setMediaPickerOpen(false)}>Abbrechen</button>
          </section>
        </div>
      )}
      {mediaEditorOpen && (
        <div className="media-layer detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMediaEditorOpen(false)}>
          <section className="media-panel media-editor-panel" role="dialog" aria-modal="true" aria-labelledby="media-editor-heading">
            <p className="settings-kicker">Für alle Profile</p>
            <h2 id="media-editor-heading">Movie-Hub-Medien verwalten</h2>
            <p>Hier gespeicherte Links erscheinen bei diesem Titel in jedem Profil.</p>
            <form onSubmit={addMedia} className="media-form">
              <label>Bezeichnung<input required maxLength="80" placeholder="z. B. Deutscher Trailer" value={mediaDraft.label} onChange={(event) => setMediaDraft({ ...mediaDraft, label: event.target.value })} data-focusable="true" data-media-autofocus="true" /></label>
              <label>Adresse<input required type="url" inputMode="url" placeholder="https://… oder http://…" value={mediaDraft.url} onChange={(event) => setMediaDraft({ ...mediaDraft, url: event.target.value })} data-focusable="true" /></label>
              <label>Aktion<select value={mediaDraft.type} onChange={(event) => setMediaDraft({ ...mediaDraft, type: event.target.value })} data-focusable="true"><option value="web">Web-Link öffnen</option><option value="video">Video in Movie Hub abspielen</option></select></label>
              <div className="media-form-actions">
                <button type="submit" disabled={mediaBusy} data-focusable="true">{editingMediaId ? 'Änderung speichern' : 'Hinzufügen'}</button>
                {editingMediaId && <button type="button" disabled={mediaBusy} data-focusable="true" onClick={resetMediaDraft}>Abbrechen</button>}
              </div>
            </form>
            {mediaMessage && <p className="personal-state-message" role="status">{mediaMessage}</p>}
            {sharedMedia.length > 0 && (
              <div className="media-entry-list">
                {sharedMedia.map((entry) => (
                  <div className="media-entry" key={entry.id}>
                    <button type="button" data-focusable="true" onClick={() => launchMedia(entry)}><span aria-hidden="true">{entry.type === 'video' ? '▶' : '↗'}</span> {entry.label}</button>
                    <button type="button" data-focusable="true" disabled={mediaBusy} onClick={() => editMedia(entry)}>Bearbeiten</button>
                    <button type="button" className="media-delete" data-focusable="true" disabled={mediaBusy} onClick={() => deleteMedia(entry)}>{pendingDeleteId === entry.id ? 'Wirklich löschen?' : 'Löschen'}</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="media-cancel" data-focusable="true" onClick={() => setMediaEditorOpen(false)}>Fertig</button>
          </section>
        </div>
      )}
      {playing && (
        <div className="media-layer detail-backdrop">
          <section className="media-panel player-panel" role="dialog" aria-modal="true" aria-labelledby="player-heading">
            <div className="player-heading">
              <div><p className="settings-kicker">Movie-Hub-Player</p><h2 id="player-heading">{playing.label}</h2></div>
              <button type="button" data-focusable="true" data-media-autofocus="true" onClick={() => setPlaying(null)}>× Schließen</button>
            </div>
            <video controls autoPlay playsInline src={playing.url}>Dieses Videoformat kann auf diesem Gerät nicht wiedergegeben werden.</video>
            <p className="prototype-note">Die Wiedergabe hängt vom Video- und Audio-Codec des Geräts ab. MP4 mit H.264/AAC ist am zuverlässigsten.</p>
          </section>
        </div>
      )}
    </div>
  )
}
