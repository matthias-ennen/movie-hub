import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getProviderDestination,
  providers,
} from '../data/catalog.js'
import { buildFilmCollection, findFilmCollectionForTitle, resolveFilmCollectionParts } from '../catalog/filmCollections.js'
import { resolveArtworkUrl } from '../catalog/artworkRotation.js'
import { useLibrary } from '../library/LibraryProvider.jsx'
import { localDateValue } from '../library/libraryState.js'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { loadSharedMedia, removeSharedMedia, saveSharedMedia } from '../library/sharedMedia.js'
import { isSmbMediaUrl, normaliseMedia } from '../library/sharedMediaModel.js'
import { launchMovieHubMedia } from '../library/providerMediaLaunch.js'
import { ProviderBadge } from './ProviderBadges.jsx'
import AgeRatingBadge from './AgeRatingBadge.jsx'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import { loadSearchDetail, toSearchDetailFallback } from '../search/lazySearchDetails.js'
import { normalizeSeriesSeasons } from '../catalog/seriesNavigation.js'
import { launchProviderPlaybackRoute } from '../providers/providerPlaybackLaunch.js'
import { resolveBoundLiveProviderRoutes } from '../providers/liveProviderRoutes.js'
import { useTitleAlerts } from '../notifications/useTitleAlerts.js'
import { includedSwitchShownAsOn, ignoreCompletedIncludedClick } from '../notifications/includedSwitchSession.js'
import { resolveProviderPresentation } from '../providers/providerPresentation.js'
import { formatDetailTvAiring, resolveDetailTvAiring } from '../tv/detailTvAiring.js'
import { buildDetailLiveProviderEntries, buildDetailStreamingProviderIds } from './detailProviderPresentation.js'

import DetailDialog from './detail/DetailDialog.jsx'
import DetailLayout from './detail/DetailLayout.jsx'
import DetailCard from './detail/DetailCard.jsx'
import DetailActions, { DialogHeading } from './detail/DetailActions.jsx'
import SeriesNavigation from './detail/SeriesNavigation.jsx'
import TitleAlertDialog from './detail/TitleAlertDialog.jsx'
import TitleEditor from './detail/TitleEditor.jsx'
import PersonalTitleActions from './detail/PersonalTitleActions.jsx'
import CollectionPicker from './detail/CollectionPicker.jsx'
import TitleDescription from './detail/TitleDescription.jsx'
import { episodeReference, openingEpisode } from '../catalog/episodeContext.js'
import { navigationEpisode } from '../catalog/episodeResolution.js'

export default function DetailModal({
  item,
  collections = {},
  titles = [],
  initialSharedMedia = null,
  initialPrimaryImageUrl = undefined,
  sharedMediaPreloaded = false,
  sharedMediaLoadError = '',
  liveAvailabilityNow = Date.now(),
  returnFocusTarget = null,
  onSelectTitle,
  onClose,
}) {
  const { activeProfile } = useProfiles()
  const { user } = useAuth()
  const { getTitleState, updateTitleState, loading: libraryLoading } = useLibrary()
  const titleAlerts = useTitleAlerts(user?.uid, activeProfile?.id)
  const { isProviderEnabled } = useProviderSelection()
  const [personalMessage, setPersonalMessage] = useState('')
  const [personalBusy, setPersonalBusy] = useState(false)
  const [alertMenuOpen, setAlertMenuOpen] = useState(false)
  const [alertBusy, setAlertBusy] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  const [includedAcceptedForDetail, setIncludedAcceptedForDetail] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [sharedMedia, setSharedMedia] = useState(() => (
    Array.isArray(initialSharedMedia) ? initialSharedMedia : []
  ))
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
  const [manualEpisode, setManualEpisode] = useState(undefined)
  const automaticTvAiring = useMemo(() => resolveDetailTvAiring(item, { now: liveAvailabilityNow }), [item, liveAvailabilityNow])
  const initialEpisode = navigationEpisode(episodeReference(automaticTvAiring))
    || (automaticTvAiring ? null : openingEpisode(item))
  const selectedEpisode = manualEpisode === undefined ? initialEpisode : manualEpisode
  const selectedSeasonNumber = selectedEpisode?.seasonNumber ?? null
  const personalBusyRef = useRef(false)
  const artworkOptions = {
    profileId: activeProfile?.id || 'profile',
    rotationMode: activeProfile?.contentDisplaySettings?.artworkRotation,
  }
  const seriesSeasons = useMemo(() => normalizeSeriesSeasons(item?.seasons, {
    seriesTmdbId: item?.tmdbId,
    numberOfSeasons: item?.numberOfSeasons,
  }), [item?.tmdbId, item?.numberOfSeasons, item?.seasons])
  const selectedSeason = seriesSeasons.find((season) => season.seasonNumber === selectedSeasonNumber)
    || null
  const initialSeasonNumber = openingEpisode(item)?.seasonNumber ?? null
  const usesInitialDetailImage = item?.type !== 'series'
    || (selectedSeason?.seasonNumber ?? null) === initialSeasonNumber
  const detailPosterUrl = usesInitialDetailImage && initialPrimaryImageUrl !== undefined
    ? initialPrimaryImageUrl
    : selectedSeason?.posterUrl
      ? selectedSeason.posterUrl
      : item?.displayPosterUrl || resolveArtworkUrl(item, artworkOptions)
  const filmCollection = findFilmCollectionForTitle(item, collections)
    || buildFilmCollection(item?.collectionDetails, titles)
  const collectionParts = useMemo(
    () => resolveFilmCollectionParts(filmCollection, titles),
    [filmCollection, titles],
  )
  const currentCollectionIndex = collectionParts.findIndex((part) => Number(part.tmdbId) === Number(item.tmdbId))
  const hasFilmCollection = item.type === 'movie' && collectionParts.length > 1
  const detailTvAiring = useMemo(
    () => manualEpisode === undefined ? automaticTvAiring
      : resolveDetailTvAiring(item, { now: liveAvailabilityNow, selection: manualEpisode }),
    [item, liveAvailabilityNow, manualEpisode, automaticTvAiring],
  )
  const detailTvAiringLabel = useMemo(
    () => formatDetailTvAiring(detailTvAiring),
    [detailTvAiring],
  )
  const detailProviderItem = useMemo(
    () => ({ ...item, tvAiring: detailTvAiring }),
    [detailTvAiring, item],
  )
  const liveProviderPresentation = useMemo(
    () => resolveProviderPresentation(detailProviderItem, { context: 'airing' }),
    [detailProviderItem],
  )
  const titleProviderPresentation = useMemo(
    () => resolveProviderPresentation(item, { context: 'title' }),
    [item],
  )
  const liveRouteSnapshot = useMemo(() => {
    const providerIds = liveProviderPresentation.liveProviderIds
      .filter((providerId) => Boolean(providers[providerId]))
    return resolveBoundLiveProviderRoutes(detailProviderItem, providerIds, { now: liveAvailabilityNow })
  }, [detailProviderItem, liveAvailabilityNow, liveProviderPresentation])
  const liveProviderEntries = buildDetailLiveProviderEntries(
    liveProviderPresentation,
    providers,
    liveRouteSnapshot,
  )
  const streamingProviderIds = buildDetailStreamingProviderIds(
    titleProviderPresentation,
    providers,
    liveProviderEntries,
  )
  const hasLiveProviders = liveProviderEntries.length > 0
  const hasStreamingProviders = streamingProviderIds.length > 0
  const hasTvAiring = Boolean(detailTvAiringLabel)
  const hasProviders = hasLiveProviders || hasStreamingProviders
  const showMovieHubProvider = sharedMedia.length > 0 && isProviderEnabled('moviehub')
  const cast = Array.isArray(item.cast) ? item.cast.slice(0, 5) : []
  const automaticVideos = Array.isArray(item.videos) ? item.videos : []
  // This modal is unmounted when closed. A successful activation stays
  // visually On in this open detail only; Firestore remains the source of truth.
  // Keying by profile + title avoids carrying the visual state across contexts.
  const includedDetailKey = [user?.uid, activeProfile?.id, item?.type, item?.tmdbId].join('|')
  const includedPersistedOn = titleAlerts.isEnabled(item, 'included')
  const includedShownOn = includedSwitchShownAsOn(
    includedPersistedOn, includedAcceptedForDetail, includedDetailKey,
  )
  const personalState = getTitleState(item)
  useEffect(() => {
    setNoteDraft(personalState.note)
    setPersonalMessage('')
    setAlertMenuOpen(false)
    setAlertMessage('')
  }, [activeProfile?.id, item.id, personalState.note])

  useEffect(() => {
    let cancelled = false
    setSharedMedia(Array.isArray(initialSharedMedia) ? initialSharedMedia : [])
    setMediaMessage(sharedMediaLoadError)
    setMediaEditorOpen(false)
    setMediaPickerOpen(false)
    setCollectionPickerOpen(false)
    setCollectionBusyId(null)
    setPlaying(null)
    setPendingDeleteId(null)
    if (user && !sharedMediaPreloaded) {
      loadSharedMedia(user.uid, item)
        .then((entries) => { if (!cancelled) setSharedMedia(entries) })
        .catch((error) => {
          console.error(error)
          if (!cancelled) setMediaMessage('Eigene Links und Videos konnten nicht geladen werden.')
        })
    }
    return () => { cancelled = true }
  }, [
    user?.uid,
    item.id,
    item.metadataVersion,
    item.metadataComplete,
    item.collectionChecked,
    item.collectionId,
    item.collectionDetails,
    initialSharedMedia,
    sharedMediaLoadError,
    sharedMediaPreloaded,
  ])

  if (!item) return null

  async function toggleAlert(kind) {
    if (alertBusy) return
    // After a completed included event, the visible On is locked for this
    // detail visit. A second click must not silently create a fresh watch.
    if (kind === 'included' && ignoreCompletedIncludedClick(
      includedPersistedOn, includedAcceptedForDetail, includedDetailKey,
    )) return
    setAlertBusy(true)
    setAlertMessage('')
    try {
      const enabled = await titleAlerts.toggle(item, kind)
      if (kind === 'included') {
        setIncludedAcceptedForDetail(enabled ? includedDetailKey : null)
      }
      // Intentionally no success hint; only failures are reported.
    } catch (error) {
      setAlertMessage(error?.message || 'Benachrichtigung konnte nicht gespeichert werden. Bitte erneut versuchen.')
    } finally {
      setAlertBusy(false)
    }
  }

  function openCollectionPicker() { setCollectionPickerOpen(true) }
  function closeCollectionPicker() { setCollectionPickerOpen(false); setCollectionBusyId(null) }

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

    closeCollectionPicker()
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

  function openLiveProvider(providerId) {
    const launchRoute = liveRouteSnapshot[providerId]
    if (!launchRoute) return

    markWatchedFromProvider()
    if (launchProviderPlaybackRoute({
      providerId,
      title: item.title,
      route: launchRoute,
      // A concrete live badge keeps the exact route all the way into Android.
      fallbackUrl: launchRoute.target,
    })) return

    if (window.MovieHubNative?.openExternalUrl) {
      window.MovieHubNative.openExternalUrl(launchRoute.target)
      return
    }
    window.open(launchRoute.target, '_blank', 'noopener,noreferrer')
  }

  function openStreamingProvider(providerId) {
    const destination = getProviderDestination(providerId, item.title, {
      waipuMode: 'vod',
    })
    if (!destination) return

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

  function openAutomaticVideo(video) {
    const key = String(video?.key || '').trim()
    if (/^[A-Za-z0-9_-]{6,20}$/.test(key) && window.MovieHubTrailer?.playHeroTrailer) {
      window.MovieHubTrailer.playHeroTrailer(key, item.title || 'Trailer', true)
      return
    }
    openUrl(video?.url)
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
    launchMovieHubMedia(entry, {
      nativeBridge: window.MovieHubNative,
      markWatched: markWatchedFromProvider,
      openUrl,
      playInline: setPlaying,
      reportUnavailable: setMediaMessage,
    })
  }

  function mediaIcon(entry) { return entry.type === 'video' ? '▶' : '↗' }

  function mediaActionLabel(entry) {
    if (entry.type === 'video' && isSmbMediaUrl(entry.url)) return 'Netzwerkvideo in Movie Hub abspielen'
    return entry.type === 'video' ? 'In Movie Hub abspielen' : 'In passender App oder im Browser öffnen'
  }

  return (
    <>
      <DetailDialog primary className="detail-modal detail-layout-panel" backdropClassName="detail-backdrop primary-detail-backdrop"
        label={`Details zu ${item.title}`} onClose={onClose} returnFocusTarget={returnFocusTarget}>
        <DetailLayout actions={<DetailActions onClose={onClose} onEdit={() => { resetMediaDraft(); setMediaEditorOpen(true) }}
            onAlert={titleAlerts.canWatch(item) ? () => setAlertMenuOpen(true) : null}
            alertActive={includedShownOn || titleAlerts.isEnabled(item, 'tv')} notePresent={Boolean(personalState.note)} />} artwork={
        <div className={detailPosterUrl ? 'detail-art has-image' : 'detail-art'} style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}>
          {detailPosterUrl && (
            <img
              className="detail-art-image"
              src={detailPosterUrl}
              alt={`Poster zu ${item.title}`}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          )}
          <span className="detail-type">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
        </div>}>
          <h2>{item.title}</h2>
          <div className="meta-line">
            <strong>{item.score}</strong>
            <span>{item.year || '–'}</span>
            <span>{item.meta}</span>
            <AgeRatingBadge value={item.ageRating} className="detail-age-rating" />
          </div>
          <p className="genre">{item.genre}</p>
          <TitleDescription text={item.description} />
          {cast.length > 0 && (
            <div className="cast-block">
              <h3>Besetzung</h3>
              <p>{cast.map((person) => person.name).join(' · ')}</p>
            </div>
          )}

          {item.type === 'series' && <SeriesNavigation item={item} seasons={seriesSeasons}
            selectedSeason={selectedSeason} selectedEpisode={selectedEpisode}
            onSelectEpisode={setManualEpisode}
            onBeginNavigation={() => setManualEpisode(selectedEpisode)}
            onSelectSeason={seasonNumber => setManualEpisode({ seasonNumber, episodeNumber: null, title: '' })} />}

          {hasFilmCollection && (
            <DetailCard className="film-collection-summary" id="film-collection-heading" title="Filmreihe">
              <div>
                <p className="detail-card-name">{filmCollection.name}</p>
                <p>
                  {currentCollectionIndex >= 0
                    ? `Teil ${currentCollectionIndex + 1} von ${collectionParts.length}`
                    : `${collectionParts.length} Teile`}
                  {' · '}nach Veröffentlichung
                </p>
              </div>
              <button
                type="button"
                className="action-button film-collection-open"
                data-focusable="true"
                onClick={openCollectionPicker}
              >Alle Teile anzeigen</button>
            </DetailCard>
          )}

          {automaticVideos.length > 0 && (
            <section className="catalog-videos" aria-labelledby="catalog-videos-heading">
              <h3 id="catalog-videos-heading">Videos</h3>
              <div className="video-actions">
                {automaticVideos.map((video) => (
                  <button
                    type="button"
                    className="action-button video-action"
                    key={video.id || video.url}
                    data-focusable="true"
                    onClick={() => openAutomaticVideo(video)}
                  >▶ {video.label || (video.type === 'teaser' ? 'Teaser' : 'Trailer')}</button>
                ))}
              </div>
            </section>
          )}

          <h3>Wo anschauen?</h3>
          {hasTvAiring && (
            <section className="provider-availability-group" aria-label="TV-Ausstrahlung">
              <p className="settings-kicker">TV-Ausstrahlung</p>
              <p className="detail-tv-airing">{detailTvAiringLabel}</p>
              {hasLiveProviders && (
                <div className="provider-actions" aria-label="Live-TV-Anbieter für diese Ausstrahlung">
                  {liveProviderEntries.map(({ providerId, canLaunch }) => {
                    const provider = providers[providerId]
                    if (!provider) return null
                    if (!canLaunch) {
                      return (
                        <span
                          key={providerId}
                          className="provider-action provider-action-static"
                          aria-label={`${provider.label} für diese TV-Ausstrahlung verfügbar`}
                        >
                          <ProviderBadge providerId={providerId} />
                          {provider.label}
                        </span>
                      )
                    }
                    return (
                      <button
                        type="button"
                        key={providerId}
                        className="action-button provider-action"
                        data-focusable="true"
                        onClick={() => openLiveProvider(providerId)}
                        aria-label={`${provider.label} für diese TV-Ausstrahlung öffnen`}
                      >
                        <ProviderBadge providerId={providerId} />
                        {provider.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )}
          {(showMovieHubProvider || hasStreamingProviders) && (
            <section className={hasTvAiring ? 'provider-availability-group provider-availability-streaming' : 'provider-availability-group'} aria-label="Streaming und Mediathek">
              <p className="settings-kicker">Streaming / Mediathek</p>
              <div className="provider-actions" aria-label="Streaming- und Mediathek-Anbieter">
                {showMovieHubProvider && (
                  <button
                    type="button"
                    className="action-button provider-action movie-hub-action"
                    data-focusable="true"
                    onClick={() => sharedMedia.length === 1 ? launchMedia(sharedMedia[0]) : setMediaPickerOpen(true)}
                    aria-label={sharedMedia.length === 1 ? `${sharedMedia[0].label} über Movie Hub öffnen` : 'Eigene Movie-Hub-Links und Videos auswählen'}
                  >
                    <span className="movie-hub-provider-mark" aria-hidden="true">MH</span>
                    Movie Hub
                  </button>
                )}
                {streamingProviderIds.map((providerId) => {
                  const provider = providers[providerId]
                  if (!provider) return null
                  return (
                    <button
                      type="button"
                      key={providerId}
                      className="action-button provider-action"
                      data-focusable="true"
                      onClick={() => openStreamingProvider(providerId)}
                      aria-label={`${provider.label} als Streaming- oder Mediathek-Anbieter öffnen`}
                    >
                      <ProviderBadge providerId={providerId} />
                      {provider.label}
                    </button>
                  )
                })}
              </div>
            </section>
          )}
          {!showMovieHubProvider && !hasProviders && !hasTvAiring && (
            <p className="prototype-note">Für diesen Titel ist derzeit kein unterstützter Anbieter in Deutschland hinterlegt.</p>
          )}
          {item.tmdbId && <p className="tmdb-credit">Datenquelle: TMDB · ID {item.tmdbId}</p>}
          <PersonalTitleActions activeProfile={activeProfile} personalState={personalState}
            personalBusy={personalBusy} libraryLoading={libraryLoading} personalMessage={personalMessage}
            savePersonalPatch={savePersonalPatch} />
          {mediaMessage && !mediaEditorOpen && <p className="personal-state-message" role="status">{mediaMessage}</p>}
        </DetailLayout>
      </DetailDialog>

      {collectionPickerOpen && hasFilmCollection && <CollectionPicker filmCollection={filmCollection}
        collectionParts={collectionParts} currentCollectionIndex={currentCollectionIndex} item={item}
        artworkOptions={artworkOptions} getTitleState={getTitleState} isProviderEnabled={isProviderEnabled}
        collectionBusyId={collectionBusyId} selectCollectionPart={selectCollectionPart} onClose={closeCollectionPicker} />}
      {alertMenuOpen && <TitleAlertDialog title={item.title} included={includedShownOn}
        tv={titleAlerts.isEnabled(item, 'tv')} busy={alertBusy} ready={titleAlerts.ready}
        message={alertMessage} onToggle={toggleAlert} onClose={() => setAlertMenuOpen(false)} />}
      {mediaEditorOpen && <TitleEditor {...{ activeProfile, personalState, personalBusy, libraryLoading,
        personalMessage, savePersonalPatch, noteDraft, setNoteDraft, handleSaveNote, sharedMedia,
        mediaDraft, mediaBusy, mediaMessage, editingMediaId, pendingDeleteId, startMediaDraft,
        addMedia, setMediaDraft, resetMediaDraft, launchMedia, mediaIcon, editMedia, deleteMedia }}
        onClose={() => setMediaEditorOpen(false)} />}
      {mediaPickerOpen && <DetailDialog className="media-panel media-picker-panel" labelledBy="media-picker-heading"
        onClose={() => setMediaPickerOpen(false)}>
        <DialogHeading id="media-picker-heading" onClose={() => setMediaPickerOpen(false)}>Was möchtest du öffnen?</DialogHeading>
            <div className="media-picker-list">
              {sharedMedia.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  data-focusable="true"
                  onClick={() => { setMediaPickerOpen(false); launchMedia(entry) }}
                >
                  <span aria-hidden="true">{mediaIcon(entry)}</span>
                  <span>{entry.label}<small>{mediaActionLabel(entry)}</small></span>
                </button>
              ))}
            </div>
            <button type="button" className="media-cancel" data-focusable="true" onClick={() => setMediaPickerOpen(false)}>Abbrechen</button>

      </DetailDialog>}
      {playing && <DetailDialog className="media-panel player-panel" labelledBy="player-heading" onClose={() => setPlaying(null)}>
        <DialogHeading id="player-heading" onClose={() => setPlaying(null)}>{playing.label}</DialogHeading>
            <video controls autoPlay playsInline src={playing.url}>Dieses Videoformat kann auf diesem Gerät nicht wiedergegeben werden.</video>
            <p className="prototype-note">Die Wiedergabe hängt vom Video- und Audio-Codec des Geräts ab. MP4 mit H.264/AAC ist am zuverlässigsten.</p>

      </DetailDialog>}
    </>
  )
}
