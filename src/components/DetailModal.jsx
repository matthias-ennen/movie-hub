import { useEffect, useMemo, useRef, useState } from 'react'
import { getProviderDestination, providers } from '../data/catalog.js'
import { buildFilmCollection, findFilmCollectionForTitle, resolveFilmCollectionParts } from '../catalog/filmCollections.js'
import { resolveArtworkUrl } from '../catalog/artworkRotation.js'
import { useLibrary } from '../library/LibraryProvider.jsx'
import { localDateValue } from '../library/libraryState.js'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { loadSharedMedia, removeSharedMedia, saveSharedMedia } from '../library/sharedMedia.js'
import { isSmbMediaUrl, normaliseMedia } from '../library/sharedMediaModel.js'
import ProviderBadges, { ProviderBadge } from './ProviderBadges.jsx'
import AgeRatingBadge from './AgeRatingBadge.jsx'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import { loadSearchDetail, toSearchDetailFallback } from '../search/lazySearchDetails.js'

export default function DetailModal({ item, collections = {}, titles = [], onSelectTitle, onClose }) {
  const { activeProfile } = useProfiles()
  const { user } = useAuth()
  const { getTitleState, updateTitleState, loading: libraryLoading } = useLibrary()
  const { isProviderEnabled } = useProviderSelection()
  const [personalMessage, setPersonalMessage] = useState('')
  const [personalBusy, setPersonalBusy] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [sharedMedia, setSharedMedia] = useState([])
  const [mediaDraft, setMediaDraft] = useState({ label: '', url: '', type: '' })
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [mediaEditorOpen, setMediaEditorOpen] = useState(false)
  const [editingMediaId, setEditingMediaId] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [mediaMessage, setMediaMessage] = useState('')
  const [playing, setPlaying] = useState(null)
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false)
  const [collectionBusyId, setCollectionBusyId] = useState(null)
  const returnFocusRef = useRef(null)
  const collectionTriggerRef = useRef(null)
  const personalBusyRef = useRef(false)
  const artworkOptions = {
    profileId: activeProfile?.id || 'profile',
    rotationMode: activeProfile?.contentDisplaySettings?.artworkRotation,
  }
  const detailPosterUrl = item?.displayPosterUrl || resolveArtworkUrl(item, artworkOptions)
  const filmCollection = findFilmCollectionForTitle(item, collections)
    || buildFilmCollection(item?.collectionDetails, titles)
  const collectionParts = useMemo(
    () => resolveFilmCollectionParts(filmCollection, titles),
    [filmCollection, titles],
  )
  const currentCollectionIndex = collectionParts.findIndex((part) => Number(part.tmdbId) === Number(item.tmdbId))
  const hasFilmCollection = item.type === 'movie' && collectionParts.length > 1
  const providerIds = (Array.isArray(item.providerIds) ? item.providerIds : [])
    .filter((providerId) => providerId !== 'moviehub' && Boolean(providers[providerId]))
  const hasProviders = providerIds.length > 0
  const showMovieHubProvider = sharedMedia.length > 0 && isProviderEnabled('moviehub')
  const cast = Array.isArray(item.cast) ? item.cast.slice(0, 5) : []
  const automaticVideos = Array.isArray(item.videos) ? item.videos : []
  const personalState = getTitleState(item)

  useEffect(() => {
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement ? active : null

    return () => {
      const returnTarget = returnFocusRef.current
      if (returnTarget?.isConnected) {
        window.requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }))
      }
    }
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector('[data-detail-autofocus="true"]')
      target?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
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
    setCollectionPickerOpen(false)
    setCollectionBusyId(null)
    setPlaying(null)
    setPendingDeleteId(null)
    if (user) {
      loadSharedMedia(user.uid, item)
        .then((entries) => { if (!cancelled) setSharedMedia(entries) })
        .catch((error) => {
          console.error(error)
          if (!cancelled) setMediaMessage('Eigene Links und Videos konnten nicht geladen werden.')
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
      if (collectionPickerOpen) {
        closeCollectionPicker()
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
  }, [collectionPickerOpen, mediaEditorOpen, mediaPickerOpen, playing])

  useEffect(() => {
    if (!collectionPickerOpen && !mediaEditorOpen && !mediaPickerOpen && !playing) return undefined
    const frame = window.requestAnimationFrame(() => {
      document.querySelector('[data-media-autofocus="true"]')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [collectionPickerOpen, mediaEditorOpen, mediaPickerOpen, playing])

  if (!item) return null

  function openCollectionPicker(event) {
    collectionTriggerRef.current = event?.currentTarget || null
    setCollectionBusyId(null)
    setCollectionPickerOpen(true)
  }

  function closeCollectionPicker({ restoreFocus = true } = {}) {
    setCollectionPickerOpen(false)
    setCollectionBusyId(null)
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        if (collectionTriggerRef.current?.isConnected) {
          collectionTriggerRef.current.focus({ preventScroll: true })
        }
      })
    }
  }

  async function selectCollectionPart(part) {
    if (!part || collectionBusyId) return
    if (Number(part.tmdbId) === Number(item.tmdbId)) {
      closeCollectionPicker()
      return
    }

    setCollectionBusyId(part.id)
    let detail = part
    try {
      detail = await loadSearchDetail(part)
    } catch (error) {
      console.warn('Zusätzliche Details zum Filmreihen-Teil konnten nicht geladen werden.', error)
      detail = toSearchDetailFallback(part)
    }

    closeCollectionPicker({ restoreFocus: false })
    const displayedPosterUrl = resolveArtworkUrl(part, artworkOptions)
    onSelectTitle?.({
      ...part,
      ...detail,
      facets: { ...(detail.facets || {}), collectionId: filmCollection.id },
      collectionId: filmCollection.id,
      collectionName: filmCollection.name,
      collectionChecked: true,
      providerIds: [...new Set([...(part.providerIds || []), ...(detail.providerIds || [])])],
    }, displayedPosterUrl)
  }

  async function savePersonalPatch(patch, message) {
    if (personalBusyRef.current || libraryLoading) return

    personalBusyRef.current = true
    setPersonalBusy(true)
    setPersonalMessage('')
    try {
      await updateTitleState(item, patch)
      setPersonalMessage(message)
    } catch (error) {
      console.error(error)
      setPersonalMessage('Persönliche Einstellung konnte nicht gespeichert werden.')
    } finally {
      personalBusyRef.current = false
      setPersonalBusy(false)
    }
  }

  async function handleSaveNote(event) {
    event.preventDefault()
    if (noteDraft === personalState.note) return
    await savePersonalPatch({ note: noteDraft }, 'Notiz gespeichert.')
  }

  function markWatchedFromProvider() {
    const watchedAt = localDateValue()
    setPersonalMessage('Als gesehen markiert.')
    updateTitleState(item, { watched: true, watchedAt, watchedMarkedAt: new Date().toISOString() })
      .catch((error) => {
        console.error(error)
        setPersonalMessage('Anbieter geöffnet, aber „Gesehen“ konnte nicht gespeichert werden.')
      })
  }

  function openProvider(providerId) {
    const destination = getProviderDestination(providerId, item.title)
    if (!destination) return

    // State update is optimistic and starts before the provider launch, but we
    // intentionally do not await it: browser fallbacks must keep the original
    // user gesture so popup blockers do not prevent opening the provider.
    markWatchedFromProvider()

    if (window.MovieHubNative?.openProvider) {
      window.MovieHubNative.openProvider(providerId, item.title, destination)
      return
    }

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
      const normalized = normaliseMedia(entry)
      const id = await saveSharedMedia(user.uid, item, entry)
      const saved = { ...normalized, id }
      setSharedMedia((all) => [...all.filter((value) => value.id !== id), saved]
        .sort((a, b) => a.label.localeCompare(b.label, 'de')))
      setMediaDraft({ label: '', url: '', type: '' })
      setEditingMediaId(null)
      setMediaMessage(editingMediaId ? 'Eintrag aktualisiert.' : 'Eintrag für alle Profile gespeichert.')
    } catch (error) {
      console.error(error)
      setMediaMessage(error instanceof Error ? error.message : 'Eintrag konnte nicht gespeichert werden.')
    } finally {
      setMediaBusy(false)
    }
  }

  function startMediaDraft(type) {
    setEditingMediaId(null)
    setPendingDeleteId(null)
    setMediaDraft({ label: '', url: '', type })
    setMediaMessage('')
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
    setMediaDraft({ label: '', url: '', type: '' })
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

  function launchMedia(entry) {
    if (entry.type === 'video') {
      if (isSmbMediaUrl(entry.url)) {
        if (window.MovieHubNative?.playSmbMedia) {
          window.MovieHubNative.playSmbMedia(entry.label, entry.url)
        } else {
          setMediaMessage('Netzwerkvideos können nur in der aktuellen Android-/Fire-TV-App abgespielt werden.')
        }
        return
      }
      setPlaying(entry)
      return
    }
    openUrl(entry.url)
  }

  function mediaIcon(entry) { return entry.type === 'video' ? '▶' : '↗' }

  function mediaActionLabel(entry) {
    if (entry.type === 'video' && isSmbMediaUrl(entry.url)) return 'Netzwerkvideo in Movie Hub abspielen'
    return entry.type === 'video' ? 'In Movie Hub abspielen' : 'In passender App oder im Browser öffnen'
  }

  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-label={`Details zu ${item.title}`}>
        <div className={detailPosterUrl ? 'detail-art has-image' : 'detail-art'} style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}>
          {detailPosterUrl && <img className="detail-art-image" src={detailPosterUrl} alt={`Poster zu ${item.title}`} />}
          <span className="detail-type">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
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
          <div className="meta-line">
            <strong>{item.score}</strong>
            <span>{item.year || '–'}</span>
            <span>{item.meta}</span>
            <AgeRatingBadge value={item.ageRating} className="detail-age-rating" />
          </div>
          <p className="genre">{item.genre}</p>
          <p className="detail-description">{item.description || 'Für diesen Titel liegt noch keine deutsche Beschreibung vor.'}</p>
          {cast.length > 0 && (
            <div className="cast-block">
              <h3>Besetzung</h3>
              <p>{cast.map((person) => person.name).join(' · ')}</p>
            </div>
          )}

          {hasFilmCollection && (
            <section className="film-collection-summary" aria-labelledby="film-collection-heading">
              <div>
                <p className="settings-kicker">Filmreihe</p>
                <h3 id="film-collection-heading">{filmCollection.name}</h3>
                <p>
                  {currentCollectionIndex >= 0
                    ? `Teil ${currentCollectionIndex + 1} von ${collectionParts.length}`
                    : `${collectionParts.length} Teile`}
                  {' · '}nach Veröffentlichung
                </p>
              </div>
              <button
                ref={collectionTriggerRef}
                type="button"
                className="action-button film-collection-open"
                data-focusable="true"
                data-detail-autofocus="true"
                onClick={openCollectionPicker}
              >Alle Teile anzeigen</button>
            </section>
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
                    data-detail-autofocus={!hasFilmCollection && index === 0 ? 'true' : undefined}
                    onClick={() => openUrl(video.url)}
                  >▶ {video.label || (video.type === 'teaser' ? 'Teaser' : 'Trailer')}</button>
                ))}
              </div>
              <p className="prototype-note">Trailer und Teaser werden über YouTube geöffnet.</p>
            </section>
          )}

          <h3>Wo ansehen?</h3>
          {(showMovieHubProvider || hasProviders) ? (
            <div className="provider-actions" aria-label="Automatische Anbieter und eigene Movie-Hub-Inhalte">
              {showMovieHubProvider && (
                <button
                  type="button"
                  className="action-button provider-action movie-hub-action"
                  data-focusable="true"
                  data-detail-autofocus={!hasFilmCollection && automaticVideos.length === 0 ? 'true' : undefined}
                  onClick={() => sharedMedia.length === 1 ? launchMedia(sharedMedia[0]) : setMediaPickerOpen(true)}
                  aria-label={sharedMedia.length === 1 ? `${sharedMedia[0].label} über Movie Hub öffnen` : 'Eigene Movie-Hub-Links und Videos auswählen'}
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
                    data-detail-autofocus={!hasFilmCollection && automaticVideos.length === 0 && !showMovieHubProvider && index === 0 ? 'true' : undefined}
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
          {hasProviders && <p className="prototype-note">Anbieter werden automatisch aus TMDB bestimmt und in der passenden App beziehungsweise Suchseite geöffnet.</p>}
          {item.tmdbId && <p className="tmdb-credit">Datenquelle: TMDB · ID {item.tmdbId}</p>}

          <section className="personal-title-state" aria-labelledby="personal-title-state-heading" aria-busy={personalBusy}>
            <div className="personal-title-state-heading">
              <div>
                <p className="personal-profile-name">{activeProfile?.displayName ?? 'Profil'}</p>
                <h3 id="personal-title-state-heading">Meine Einstellungen</h3>
              </div>
              {personalState.rating && <span className="personal-rating-summary">{personalState.rating}/10</span>}
            </div>

            <div className="personal-action-grid">
              <button
                type="button"
                className={personalState.favorite ? 'personal-action favorite active' : 'personal-action favorite'}
                aria-pressed={personalState.favorite}
                aria-disabled={personalBusy || libraryLoading}
                onClick={() => savePersonalPatch(
                  { favorite: !personalState.favorite },
                  personalState.favorite ? 'Aus Favoriten entfernt.' : 'Zu Favoriten hinzugefügt.',
                )}
                data-focusable="true"
                data-detail-autofocus={!hasFilmCollection && automaticVideos.length === 0 && !showMovieHubProvider && !hasProviders ? 'true' : undefined}
              >
                <span aria-hidden="true">♥</span>
                <span>{personalState.favorite ? 'Favorit' : 'Als Favorit'}</span>
              </button>
              <button
                type="button"
                className={personalState.watchlist ? 'personal-action watchlist active' : 'personal-action watchlist'}
                aria-pressed={personalState.watchlist}
                aria-disabled={personalBusy || libraryLoading}
                onClick={() => savePersonalPatch(
                  { watchlist: !personalState.watchlist },
                  personalState.watchlist ? 'Aus der Watchlist entfernt.' : 'Zur Watchlist hinzugefügt.',
                )}
                data-focusable="true"
              >
                <span aria-hidden="true">{personalState.watchlist ? '−' : '＋'}</span>
                <span>Watchlist</span>
              </button>
              <button
                type="button"
                className={personalState.watched ? 'personal-action watched active' : 'personal-action watched'}
                aria-pressed={personalState.watched}
                aria-disabled={personalBusy || libraryLoading}
                onClick={() => savePersonalPatch(
                  { watched: !personalState.watched },
                  personalState.watched ? 'Als ungesehen markiert.' : 'Als gesehen markiert.',
                )}
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
                    aria-disabled={personalBusy || libraryLoading}
                    onClick={() => savePersonalPatch(
                      { rating: personalState.rating === rating ? null : rating },
                      personalState.rating === rating ? 'Bewertung entfernt.' : `Mit ${rating}/10 bewertet.`,
                    )}
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

          <button
            type="button"
            className="media-manage-shortcut"
            data-focusable="true"
            onClick={() => { resetMediaDraft(); setMediaEditorOpen(true) }}
          >
            <span className="media-manage-shortcut-icon" aria-hidden="true">＋</span>
            <span>
              <strong>{sharedMedia.length ? 'Eigene Links und Videos' : 'Link oder Video hinzufügen'}</strong>
              <small>Eigene Inhalte · gemeinsam in allen Profilen verfügbar</small>
            </span>
          </button>
          {mediaMessage && !mediaEditorOpen && <p className="personal-state-message" role="status">{mediaMessage}</p>}
        </div>
      </section>
      {collectionPickerOpen && hasFilmCollection && (
        <div className="media-layer detail-backdrop collection-layer" onMouseDown={(event) => event.target === event.currentTarget && closeCollectionPicker()}>
          <section className="media-panel collection-panel" role="dialog" aria-modal="true" aria-labelledby="collection-picker-heading" aria-busy={Boolean(collectionBusyId)}>
            <div className="collection-panel-heading">
              <div>
                <p className="settings-kicker">Filmreihe</p>
                <h2 id="collection-picker-heading">{filmCollection.name}</h2>
                <p>{collectionParts.length} Teile · sortiert nach Veröffentlichung</p>
              </div>
              <button type="button" className="collection-close" data-focusable="true" onClick={() => closeCollectionPicker()}>× Schließen</button>
            </div>
            <div className="collection-part-grid" aria-label={`Alle Teile von ${filmCollection.name}`}>
              {collectionParts.map((part, index) => {
                const isCurrent = Number(part.tmdbId) === Number(item.tmdbId)
                const watched = getTitleState(part).watched
                const partPosterUrl = resolveArtworkUrl(part, artworkOptions)
                const movieHubAvailable = part.providerIds?.includes('moviehub') && isProviderEnabled('moviehub')
                const automaticProviderIds = (part.providerIds || [])
                  .filter((providerId) => providerId !== 'moviehub' && Boolean(providers[providerId]))
                const hasAvailability = movieHubAvailable || automaticProviderIds.length > 0
                return (
                  <button
                    type="button"
                    key={part.id}
                    className={isCurrent ? 'collection-part-card current' : 'collection-part-card'}
                    data-focusable="true"
                    data-media-autofocus={isCurrent || (currentCollectionIndex < 0 && index === 0) ? 'true' : undefined}
                    aria-current={isCurrent ? 'true' : undefined}
                    aria-disabled={Boolean(collectionBusyId)}
                    aria-label={`${part.title}${part.year ? ` (${part.year})` : ''}${isCurrent ? ', aktuell geöffnet' : ''}${watched ? ', gesehen' : ''}`}
                    onClick={() => selectCollectionPart(part)}
                  >
                    <span
                      className={partPosterUrl ? 'collection-part-art has-image' : 'collection-part-art'}
                      style={{ '--poster-accent': part.accent, '--poster-accent-2': part.accent2 }}
                    >
                      {partPosterUrl && <img src={partPosterUrl} alt="" loading="lazy" />}
                      <span className="collection-part-number">{index + 1}</span>
                      <span className="collection-part-statuses">
                        {isCurrent && <span>Aktuell</span>}
                        {watched && <span className="watched">✓ Gesehen</span>}
                      </span>
                      {hasAvailability && (
                        <ProviderBadges
                          providerIds={automaticProviderIds}
                          includeMovieHub={movieHubAvailable}
                          maxVisible={4}
                        />
                      )}
                    </span>
                    <span className="collection-part-copy">
                      <strong>{part.title}</strong>
                      <small>{part.year || 'Jahr unbekannt'}</small>
                      <small className={hasAvailability ? 'available' : 'unavailable'}>
                        {hasAvailability ? 'Bei deinen Anbietern verfügbar' : 'Derzeit nicht bei deinen Anbietern'}
                      </small>
                    </span>
                    {collectionBusyId === part.id && <span className="collection-part-loading">Details werden geladen …</span>}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      )}
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
                  <span aria-hidden="true">{mediaIcon(entry)}</span>
                  <span>{entry.label}<small>{mediaActionLabel(entry)}</small></span>
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
            <h2 id="media-editor-heading">Eigene Links und Videos</h2>
            <p>Hier verwaltest du nur eigene Inhalte. Netflix, Prime Video, Disney+, YouTube und waipu.tv werden automatisch über TMDB angezeigt.</p>

            <div className="media-kind-actions" aria-label="Eigenen Inhalt hinzufügen">
              <button type="button" data-focusable="true" data-media-autofocus={!mediaDraft.type ? 'true' : undefined} onClick={() => startMediaDraft('web')}>↗ Link hinzufügen</button>
              <button type="button" data-focusable="true" onClick={() => startMediaDraft('video')}>▶ Video hinzufügen</button>
            </div>

            {mediaDraft.type && (
              <form onSubmit={addMedia} className="media-form">
                <h3 className="media-form-title">{editingMediaId ? 'Eintrag bearbeiten' : mediaDraft.type === 'video' ? 'Video hinzufügen' : 'Link hinzufügen'}</h3>
                <label>Bezeichnung<input required maxLength="80" placeholder={mediaDraft.type === 'video' ? 'z. B. Film auf NAS' : 'z. B. YouTube-Video'} value={mediaDraft.label} onChange={(event) => setMediaDraft({ ...mediaDraft, label: event.target.value })} data-focusable="true" /></label>
                <label>Adresse<input required type="text" placeholder={mediaDraft.type === 'video' ? 'https://…/video.mp4, smb://… oder \\Server\Freigabe\video.mkv' : 'https://…'} value={mediaDraft.url} onChange={(event) => setMediaDraft({ ...mediaDraft, url: event.target.value })} data-focusable="true" /></label>
                <div className="media-form-actions">
                  <button type="submit" disabled={mediaBusy} data-focusable="true">{editingMediaId ? 'Änderung speichern' : 'Hinzufügen'}</button>
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
