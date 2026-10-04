import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import DetailLoadingScreen from './components/DetailLoadingScreen.jsx'
import HeroFirstPage from './components/HeroFirstPage.jsx'
import { ProgressivePosterGrid, ProgressiveRows } from './components/ProgressiveContent.jsx'
import { detailInitialImageUrl, prepareDetailRequestItem, preloadDetailImage, waitForDetailLoadingPaint } from './components/detailPresentation.js'
import { buildCategoryRows } from './catalog/categoryRows.js'
import { buildPersonalSmartRows, normalizeSmartFilterOptions } from './catalog/personalSmartRows.js'
import { buildProviderBrowseRows, buildProviderHomeRows } from './catalog/providerCatalogRows.js'
import { selectCoordinatedHeroItems, selectPersonalHeroItemsFromSources } from './catalog/heroSelection.js'
import { buildMovieHubCatalogRows } from './catalog/movieHubCatalog.js'
import { normalizeFilmCollectionIndex } from './catalog/filmCollections.js'
import { buildPersonalTopTen, buildProviderTopTen } from './catalog/topTenRows.js'
import { assembleTopTenPageRows, visiblePageRows } from './catalog/pageRowContract.js'
import { curateCatalogRows, curateTitles, hasEnabledAvailability, PUBLIC_POSTER_ROW_LIMIT } from './catalog/contentCuration.js'
import { getContentPeriodKey, normalizeContentDisplaySettings, resolveContentSortMode } from './catalog/contentDisplaySettings.js'
import { resolvePresentationArtwork } from './catalog/artworkRotation.js'
import { rowDefinitions as fallbackRowDefinitions, titles as fallbackTitles } from './data/catalog.js'
import { useAuth } from './hooks/useAuth.js'
import { useDpadNavigation } from './hooks/useDpadNavigation.js'
import { useCurationClock } from './hooks/useCurationClock.js'
import { useProviderSelection } from './settings/useProviderSelection.js'
import { useWaipuStationSelection } from './settings/useWaipuStationSelection.js'
import { useJoynStationSelection } from './settings/useJoynStationSelection.js'
import { useLibrary } from './library/LibraryProvider.jsx'
import { buildPersonalRows, buildPersonalTopHundredRows, buildWatchedHistoryRows, mergeCatalogWithPersonalSnapshots } from './library/personalRows.js'
import {
  clearSharedMediaLoadCache,
  loadSharedMediaCached,
  refreshSharedMediaCatalogMetadata,
} from './library/sharedMedia.js'
import { useSharedMediaCatalog } from './library/useSharedMediaCatalog.js'
import { mergeSharedMediaCatalogTitles, mergeTitlesWithSharedMediaCatalog } from './library/sharedMediaCatalogModel.js'
import { firebaseReady } from './lib/firebase.js'
import { useAnnouncements } from './notifications/useAnnouncements.js'
import { AnnouncementsView, BellButton, StartupAnnouncement } from './notifications/AnnouncementsView.jsx'
import { preloadHeroImage } from './performance/progressiveRendering.js'
import { prepareForActiveView, prepareRowsForActiveView } from './performance/contentRowPreparation.js'
import { loadCatalogWithRetry } from './performance/catalogStartup.js'
import { notifyNativeStartupReady } from './performance/nativeStartup.js'
import {
  LazyAboutView,
  LazyDetailModal,
  LazyProfileView,
  LazySearchView,
  LazySettingsView,
  LazyTvFeature,
  loadDetailModalModule,
  preloadSecondaryViewModule,
} from './performance/lazyViews.jsx'
import {
  cancelPerformanceSpan,
  finishPerformanceSpan,
  recordPerformanceEvent,
  startPerformanceSpan,
} from './performance/performanceDiagnostics.js'
import { shouldLoadLiveStations } from './performance/liveCatalogStartup.js'
import { INITIAL_HOME_FOCUS_EVENT } from './components/InitialHomeFocus.jsx'
import { ProfileProvider, useProfiles } from './profiles/ProfileProvider.jsx'
import { ThemeProvider } from './theme/ThemeProvider.jsx'
import { TmdbCatalogProvider, useTmdbCatalog } from './tmdb/TmdbCatalogProvider.jsx'
import { buildTmdbCatalogRows, mergePublicAndPersonalCatalog } from './tmdb/tmdbCatalogModel.js'
import { nextTvAiringTransition } from './waipu/waipuAiringStatus.js'
import {
  advanceLiveAvailabilityEntries,
  loadLiveAvailabilityIndex,
  mergeLiveAvailability,
} from './sources/liveAvailabilityIndex.js'

function NativeStartupSignal() {
  useEffect(() => {
    let secondFrame = null
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => notifyNativeStartupReady())
    })

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    }
  }, [])

  return null
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const { auth } = await firebaseReady
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <NativeStartupSignal />
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand brand-large">MOVIE <span>HUB</span></div>
          <p className="eyebrow">Deine Streaming-Zentrale</p>
          <h1>Willkommen zurück</h1>
          <p className="muted">Filme und Serien an einem Ort entdecken, merken und später direkt beim passenden Anbieter öffnen.</p>
          <form onSubmit={handleSubmit} className="form">
            <label>
              E-Mail
              <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Passwort
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button type="submit" disabled={busy}>{busy ? 'Anmeldung läuft …' : 'Anmelden'}</button>
          </form>
          {message && <p className="error">{message}</p>}
        </section>
      </main>
    </>
  )
}

function LazyViewLoading({ label, className = 'browse-page' }) {
  return (
    <main className={className} aria-busy="true">
      <p className="eyebrow page-section-heading">{label}</p>
      <p className="loading-copy">Ansicht wird geladen …</p>
    </main>
  )
}

function Header({
  currentView,
  onViewChange,
  unreadCount,
  onContentViewActivate,
  user,
  onSignOut,
  profileOpen,
  onProfileToggle,
  onProfileClose,
  activeProfile,
  profiles,
  onProfileSelect,
  onViewIntent,
}) {
  const navItems = [
    ['home', 'Home'],
    ['movies', 'Filme'],
    ['series', 'Serien'],
    ['tv', 'TV'],
    ['library', 'Meine Inhalte'],
  ]
  const profileInitial = activeProfile?.displayName?.trim().charAt(0).toUpperCase() || 'M'

  function openProfileSettings() {
    onViewIntent('profile')
    onProfileClose()
    onViewChange('profile')
  }

  function openAppSettings() {
    onViewIntent('settings')
    onProfileClose()
    onViewChange('settings')
  }

  function openAbout() {
    onViewIntent('about')
    onProfileClose()
    onViewChange('about')
  }

  function handleProfileSelect(profileId) {
    onProfileSelect(profileId)
    onProfileClose()
  }

  const profileAreaActive = currentView === 'profile' || currentView === 'settings' || currentView === 'about'

  return (
    <header className="topbar">
      <button
        type="button"
        className="brand brand-button"
        onClick={() => onContentViewActivate('home', { source: 'logo' })}
        onFocus={() => onViewIntent('home')}
        onPointerEnter={() => onViewIntent('home')}
        data-focusable="true"
      >
        MOVIE <span>HUB</span>
      </button>
      <nav className="main-nav" aria-label="Hauptnavigation">
        {navItems.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={currentView === id ? 'nav-link active' : 'nav-link'}
            onClick={() => onContentViewActivate(id, { source: 'nav' })}
            onFocus={() => onViewIntent(id)}
            onPointerEnter={() => onViewIntent(id)}
            data-content-view={id}
            data-focusable="true"
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="top-actions">
        <button
          type="button"
          className={currentView === 'search' ? 'icon-button active' : 'icon-button'}
          onClick={() => { onViewIntent('search'); onViewChange('search') }}
          onFocus={() => onViewIntent('search')}
          onPointerEnter={() => onViewIntent('search')}
          data-focusable="true"
          aria-label="Suche"
        >⌕</button>
        <BellButton unreadCount={unreadCount} active={currentView === 'notifications'} onClick={() => onViewChange('notifications')} />
        <div className="profile-wrap">
          <button
            type="button"
            className={profileAreaActive ? 'profile-button active' : 'profile-button'}
            onClick={onProfileToggle}
            onFocus={() => onViewIntent('profile')}
            onPointerEnter={() => onViewIntent('profile')}
            data-focusable="true"
            aria-label={`Profil öffnen: ${activeProfile?.displayName ?? 'Movie Hub'}`}
            aria-expanded={profileOpen}
          >
            <span className="avatar">{profileInitial}</span><span className="profile-label">{activeProfile?.displayName ?? 'Profil'}</span>
          </button>
          {profileOpen && (
            <div className="profile-menu" role="menu" aria-label="Profilmenü">
              <strong>{activeProfile?.displayName ?? 'Movie-Hub-Profil'}</strong>
              <span>{user.email}</span>
              {profiles.length > 1 && (
                <div className="profile-menu-switcher" aria-label="Profil wechseln">
                  {profiles.map((profile) => (
                    <button
                      type="button"
                      key={profile.id}
                      className={profile.id === activeProfile?.id ? 'profile-menu-profile active' : 'profile-menu-profile'}
                      onClick={() => handleProfileSelect(profile.id)}
                      data-focusable="true"
                      role="menuitemradio"
                      aria-checked={profile.id === activeProfile?.id}
                    >
                      {profile.displayName}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="profile-settings-link" onClick={openProfileSettings} onFocus={() => onViewIntent('profile')} onPointerEnter={() => onViewIntent('profile')} data-focusable="true" role="menuitem">Profil & Design</button>
              <button type="button" className="app-settings-link" onClick={openAppSettings} onFocus={() => onViewIntent('settings')} onPointerEnter={() => onViewIntent('settings')} data-focusable="true" role="menuitem">Einstellungen</button>
              <button type="button" className="about-settings-link" onClick={openAbout} data-focusable="true" role="menuitem">Über Movie Hub</button>
              <button type="button" onClick={onSignOut} data-focusable="true" role="menuitem">Abmelden</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function BrowseView({
  viewId,
  title,
  subtitle,
  items,
  rows = [],
  heroItems = [],
  readyEnabled = true,
  activationRequest,
  onActivationUnavailable,
  onOpen,
}) {
  return (
    <HeroFirstPage
      pageId={viewId}
      className="category-page"
      heroItems={heroItems}
      heroEyebrow={title}
      readyEnabled={readyEnabled}
      activationRequest={activationRequest}
      onActivationUnavailable={onActivationUnavailable}
      onOpen={onOpen}
    >
      {({ heroReady }) => (
        <section className="browse-page">
          <div className="page-heading">
            <p className="eyebrow">Movie Hub</p>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {rows.length > 0 ? (
            <ProgressiveRows
              rows={rows}
              heroReady={heroReady}
              onOpen={onOpen}
              className="rows-wrap browse-provider-rows"
            />
          ) : (
            <ProgressivePosterGrid items={items} heroReady={heroReady} onOpen={onOpen} />
          )}
        </section>
      )}
    </HeroFirstPage>
  )
}

function HomeView({
  heroItems,
  rows,
  onOpen,
  liveTmdb,
  catalogStatus,
  onStartupReady,
  activationRequest,
  onActivationUnavailable,
}) {
  const startupReadyReportedRef = useRef(false)
  const catalogReady = catalogStatus === 'ready'
  const handleInitialContentReady = useCallback(({ visibleRowCount = 0 } = {}) => {
    if (!catalogReady || startupReadyReportedRef.current) return
    startupReadyReportedRef.current = true
    recordPerformanceEvent('startup:home-ready', { visibleRowCount })
    notifyNativeStartupReady()
    onStartupReady?.()
  }, [catalogReady, onStartupReady])

  return (
    <HeroFirstPage
      pageId="home"
      heroItems={heroItems}
      readyEnabled={catalogStatus !== 'loading'}
      activationRequest={activationRequest}
      onActivationUnavailable={onActivationUnavailable}
      onOpen={onOpen}
    >
      {({ heroReady }) => (
        <div className="rows-wrap">
          <div className="prototype-strip">
            <strong>{liveTmdb ? 'Echte TMDB-Daten' : 'Entwicklungsfallback'}</strong>
            <span>{liveTmdb ? 'Filme & Serien · deutsche Metadaten · Poster & Backdrops' : 'Der Live-TMDB-Katalog konnte noch nicht geladen werden.'}</span>
          </div>
          <ProgressiveRows
            rows={rows}
            heroReady={heroReady}
            onOpen={onOpen}
            className="progressive-home-rows"
            onInitialContentReady={handleInitialContentReady}
          />
        </div>
      )}
    </HeroFirstPage>
  )
}

function PersonalLibraryView({
  rows,
  heroItems = [],
  onOpen,
  profileName,
  loading,
  error,
  activationRequest,
  onActivationUnavailable,
}) {
  return (
    <HeroFirstPage
      pageId="library"
      className="personal-library-shell"
      heroItems={heroItems}
      heroEyebrow="Meine Inhalte"
      readyEnabled={!loading}
      activationRequest={activationRequest}
      onActivationUnavailable={onActivationUnavailable}
      onOpen={onOpen}
    >
      {({ heroReady }) => (
        <section className="browse-page personal-library-page">
          <div className="page-heading">
            <p className="eyebrow">{profileName ?? 'Movie Hub'}</p>
            <h1>Meine Inhalte</h1>
            <p>Deine Movie-Hub-Watchlist, Favoriten und Bewertungen sowie deine synchronisierten persönlichen TMDB-Listen.</p>
          </div>

          {loading && <p className="loading-copy">Persönliche Inhalte werden geladen …</p>}
          {error && <p className="error">Persönliche Inhalte konnten nicht geladen werden: {error.message}</p>}

          {!loading && !error && rows.length === 0 && (
            <section className="library-empty-state">
              <p className="settings-kicker">Noch leer</p>
              <h2>Deine persönlichen Reihen entstehen hier automatisch.</h2>
              <p>Öffne einen Film oder eine Serie und markiere ihn für die Watchlist, als Favorit oder gib eine Bewertung ab.</p>
            </section>
          )}

          {rows.length > 0 && (
            <ProgressiveRows
              rows={rows}
              heroReady={heroReady}
              onOpen={onOpen}
              className="rows-wrap personal-library-rows"
            />
          )}
        </section>
      )}
    </HeroFirstPage>
  )
}

function ExitConfirmationDialog({ onCancel, onClose }) {
  return (
    <div className="exit-backdrop">
      <section className="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-dialog-title">
        <p className="settings-kicker">Movie Hub</p>
        <h2 id="exit-dialog-title">App schließen?</h2>
        <p>Du kannst Movie Hub jederzeit über den Startbildschirm wieder öffnen.</p>
        <div className="exit-dialog-actions">
          <button type="button" className="exit-cancel" onClick={onCancel} data-focusable="true" autoFocus>Abbrechen</button>
          <button type="button" className="exit-confirm" onClick={onClose} data-focusable="true">Schließen</button>
        </div>
      </section>
    </div>
  )
}

function MovieHub({ user }) {
  const { profiles, activeProfile, selectProfile } = useProfiles()
  const { items: announcements, readIds, unreadCount, ready: announcementsReady, error: announcementsError, markRead } = useAnnouncements(user.uid, activeProfile?.id)
  const [dismissedStartupIds, setDismissedStartupIds] = useState(() => new Set())
  const [startupNoticeError, setStartupNoticeError] = useState('')
  const [startupFocusReady, setStartupFocusReady] = useState(() => !window.MovieHubNative || Boolean(window.__movieHubStartupFocusReady))
  const { getTitleState, statesByKey, loading: libraryLoading, error: libraryError } = useLibrary()
  const { personalTitles: tmdbPersonalTitles } = useTmdbCatalog()
  const { enabledProviderIds } = useProviderSelection()
  const {
    disabledStationIds,
    orderStations,
    loading: stationSelectionLoading,
  } = useWaipuStationSelection()
  const {
    disabledStationIds: disabledJoynStationIds,
    orderStations: orderJoynStations,
    loading: joynStationSelectionLoading,
  } = useJoynStationSelection()
  const {
    entries: sharedMediaCatalogEntries,
    hasTitle: hasMovieHubTitle,
    loading: sharedMediaCatalogLoading,
  } = useSharedMediaCatalog()
  const curationDayKey = useCurationClock()
  const [currentView, setCurrentView] = useState('home')
  const [contentActivationRequest, setContentActivationRequest] = useState(null)
  const [selectedTitle, setSelectedTitle] = useState(null)
  const [detailRequest, setDetailRequest] = useState(null)
  const [detailSharedMedia, setDetailSharedMedia] = useState([])
  const [detailSharedMediaLoadError, setDetailSharedMediaLoadError] = useState('')
  const [detailPrimaryImageUrl, setDetailPrimaryImageUrl] = useState(undefined)
  const [profileOpen, setProfileOpen] = useState(false)
  const [exitDialogOpen, setExitDialogOpen] = useState(false)
  const [catalog, setCatalog] = useState({
    status: 'loading',
    source: 'fallback',
    titles: fallbackTitles,
    rowDefinitions: fallbackRowDefinitions,
    providerCatalogs: {},
    collections: {},
    smartFilterOptions: normalizeSmartFilterOptions(),
  })
  const [liveAvailabilityEntries, setLiveAvailabilityEntries] = useState([])
  const [liveAvailabilityClock, setLiveAvailabilityClock] = useState(() => Date.now())
  const [waipuStationCatalog, setWaipuStationCatalog] = useState({
    status: 'loading',
    stations: [],
    generatedAt: null,
    horizon: null,
    days: [],
  })
  const [joynStationCatalog, setJoynStationCatalog] = useState({
    status: 'loading',
    stations: [],
    generatedAt: null,
    horizon: null,
    days: [],
  })
  const [homeStartupReady, setHomeStartupReady] = useState(false)
  const [tvStationCatalogsRequested, setTvStationCatalogsRequested] = useState(false)
  const contentActivationSequenceRef = useRef(0)
  const detailRequestSequenceRef = useRef(0)
  const detailPerformanceRequestRef = useRef(null)
  const liveAvailabilityRequestedRef = useRef(false)
  const detailReturnFocusRef = useRef(null)
  const detailSessionActiveRef = useRef(false)

  useEffect(() => {
    if (startupFocusReady) return undefined
    const ready = () => {
      recordPerformanceEvent('startup:focus-ready')
      setStartupFocusReady(true)
    }
    window.addEventListener(INITIAL_HOME_FOCUS_EVENT, ready)
    const fallback = window.setTimeout(() => {
      recordPerformanceEvent('startup:focus-ready', { reason: 'fallback-timeout' })
      setStartupFocusReady(true)
    }, 12_000)
    return () => { window.removeEventListener(INITIAL_HOME_FOCUS_EVENT, ready); window.clearTimeout(fallback) }
  }, [startupFocusReady])

  const liveStationsRequested = shouldLoadLiveStations({
    tvRequested: tvStationCatalogsRequested,
    settingsOpen: currentView === 'settings',
  })

  useEffect(() => {
    let cancelled = false
    startPerformanceSpan('catalog', 'startup')

    async function loadCatalog() {
      try {
        const data = await loadCatalogWithRetry(async () => {
          const response = await fetch('/catalog.json', { cache: 'no-store' })
          if (!response.ok) throw new Error(`Katalog konnte nicht geladen werden (${response.status})`)
          const loadedCatalog = await response.json()

          if (!Array.isArray(loadedCatalog.titles)
              || !loadedCatalog.titles.length
              || !Array.isArray(loadedCatalog.rowDefinitions)) {
            throw new Error('Der geladene Katalog ist unvollständig.')
          }
          return loadedCatalog
        }, { shouldCancel: () => cancelled })

        if (!cancelled) {
          finishPerformanceSpan('catalog', 'startup', {
            outcome: 'ready',
            source: data.source === 'tmdb' ? 'tmdb' : 'fallback',
            titleCount: Array.isArray(data.titles) ? data.titles.length : 0,
          })
          setCatalog({
            status: 'ready',
            source: data.source === 'tmdb' ? 'tmdb' : 'fallback',
            titles: data.titles,
            rowDefinitions: data.rowDefinitions,
            providerCatalogs: data.providerCatalogs && typeof data.providerCatalogs === 'object' ? data.providerCatalogs : {},
            collections: normalizeFilmCollectionIndex(data.collections),
            smartFilterOptions: normalizeSmartFilterOptions(data.smartFilterOptions),
            generatedAt: data.generatedAt || null,
          })
        }
      } catch (error) {
        if (error?.name === 'AbortError') return
        console.warn('Movie Hub verwendet den lokalen Katalog-Fallback.', error)
        if (!cancelled) {
          finishPerformanceSpan('catalog', 'startup', { outcome: 'error' })
          setCatalog((current) => ({ ...current, status: 'error' }))
        }
      }
    }

    loadCatalog()
    return () => {
      cancelled = true
      cancelPerformanceSpan('catalog', 'startup', { reason: 'unmounted' })
    }
  }, [])

  useEffect(() => {
    if (!homeStartupReady || liveAvailabilityRequestedRef.current) return
    liveAvailabilityRequestedRef.current = true
    startPerformanceSpan('live:index', 'availability')
    loadLiveAvailabilityIndex()
      .then((entries) => {
        const loadedAt = Date.now()
        setLiveAvailabilityEntries(entries)
        setLiveAvailabilityClock(loadedAt)
        finishPerformanceSpan('live:index', 'availability', {
          outcome: 'ready',
          entryCount: entries.length,
        })
      })
      .catch((error) => {
        console.warn('Live-Verfügbarkeitsindex konnte nicht geladen werden.', error)
        setLiveAvailabilityEntries([])
        finishPerformanceSpan('live:index', 'availability', { outcome: 'error' })
      })
  }, [homeStartupReady])

  useEffect(() => {
    if (!liveStationsRequested) return undefined
    let cancelled = false
    const controller = new AbortController()
    import('./waipu/waipuTvCatalog.js')
      .then(({ loadWaipuLiveStationCatalog }) => loadWaipuLiveStationCatalog({ signal: controller.signal }))
      .then((stationCatalog) => {
        if (!cancelled) setWaipuStationCatalog(stationCatalog)
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return
        console.warn('Waipu-Senderkatalog konnte nicht geladen werden.', error)
        setWaipuStationCatalog({ status: 'unavailable', stations: [], days: [] })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [liveStationsRequested])

  useEffect(() => {
    if (!liveStationsRequested) return undefined
    let cancelled = false
    const controller = new AbortController()
    import('./joyn/joynTvCatalog.js')
      .then(({ loadJoynLiveStationCatalog }) => loadJoynLiveStationCatalog({ signal: controller.signal }))
      .then((stationCatalog) => {
        if (!cancelled) setJoynStationCatalog(stationCatalog)
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return
        console.warn('Joyn-Senderkatalog konnte nicht geladen werden.', error)
        setJoynStationCatalog({ status: 'unavailable', stations: [], days: [] })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [liveStationsRequested])

  useEffect(() => {
    const airings = liveAvailabilityEntries.flatMap((entry) => (
      Array.isArray(entry?.airings) ? entry.airings : [entry?.nextAiring]
    )).filter(Boolean)
    const nextTransition = nextTvAiringTransition(airings, liveAvailabilityClock)
    if (!Number.isFinite(nextTransition)) return undefined
    const timeout = window.setTimeout(() => {
      const now = Date.now()
      setLiveAvailabilityEntries((entries) => advanceLiveAvailabilityEntries(entries, { now }))
      setLiveAvailabilityClock(now)
    }, Math.max(0, Math.min(2_147_483_647, nextTransition - Date.now() + 1_000)))
    return () => window.clearTimeout(timeout)
  }, [liveAvailabilityClock, liveAvailabilityEntries])

  useEffect(() => {
    if (sharedMediaCatalogLoading || !user?.uid || !sharedMediaCatalogEntries.length) return
    refreshSharedMediaCatalogMetadata(user.uid, sharedMediaCatalogEntries)
      .catch((error) => console.warn('Movie-Hub-Katalogmetadaten konnten nicht profilgebunden ergänzt werden.', error))
  }, [user?.uid, sharedMediaCatalogLoading, sharedMediaCatalogEntries])

  const publicTitles = catalog.titles.length ? catalog.titles : fallbackTitles
  const contentDisplaySettings = useMemo(
    () => normalizeContentDisplaySettings(activeProfile?.contentDisplaySettings),
    [activeProfile?.contentDisplaySettings],
  )
  const artworkOptions = useMemo(() => ({
    profileId: activeProfile?.id || 'profile',
    rotationMode: contentDisplaySettings.artworkRotation,
    date: new Date(),
  }), [activeProfile?.id, contentDisplaySettings.artworkRotation, curationDayKey])
  const baseTitles = useMemo(
    () => mergePublicAndPersonalCatalog(publicTitles, tmdbPersonalTitles),
    [publicTitles, tmdbPersonalTitles],
  )
  const rawMovieHubTitles = useMemo(
    () => mergeSharedMediaCatalogTitles(sharedMediaCatalogEntries, baseTitles),
    [sharedMediaCatalogEntries, baseTitles],
  )
  const preLiveTitles = useMemo(
    () => mergeTitlesWithSharedMediaCatalog(baseTitles, rawMovieHubTitles),
    [baseTitles, rawMovieHubTitles],
  )
  const rawTitles = useMemo(
    () => mergeLiveAvailability(preLiveTitles, liveAvailabilityEntries, { now: liveAvailabilityClock }),
    [liveAvailabilityClock, liveAvailabilityEntries, preLiveTitles],
  )
  const titles = useMemo(
    () => rawTitles.map((item) => resolvePresentationArtwork(item, artworkOptions)),
    [rawTitles, artworkOptions],
  )
  const movieHubTitles = useMemo(
    () => mergeLiveAvailability(rawMovieHubTitles, liveAvailabilityEntries, { now: liveAvailabilityClock })
      .map((item) => resolvePresentationArtwork(item, artworkOptions)),
    [artworkOptions, liveAvailabilityClock, liveAvailabilityEntries, rawMovieHubTitles],
  )
  const rowDefinitions = catalog.rowDefinitions.length ? catalog.rowDefinitions : fallbackRowDefinitions
  const activeSortMode = useMemo(
    () => resolveContentSortMode(contentDisplaySettings, activeProfile?.id, new Date()),
    [contentDisplaySettings, activeProfile?.id, curationDayKey],
  )
  const curationPeriodKey = contentDisplaySettings.autoSwitch.enabled
    ? getContentPeriodKey(contentDisplaySettings.autoSwitch.interval, new Date())
    : 'manual'
  const curationSeed = `${activeProfile?.id || 'profile'}:${curationPeriodKey}:${catalog.generatedAt || 'catalog'}`

  const handleViewChange = useCallback((nextView) => {
    recordPerformanceEvent('view:activate', { viewId: nextView })
    setProfileOpen(false)
    setContentActivationRequest(null)
    setCurrentView(nextView)
  }, [])

  const handleContentViewActivate = useCallback((nextView, { source = 'nav' } = {}) => {
    handleViewChange(nextView)
    contentActivationSequenceRef.current += 1
    setContentActivationRequest({
      id: contentActivationSequenceRef.current,
      viewId: nextView,
      source,
    })
  }, [handleViewChange])

  const handleHeroActivationUnavailable = useCallback((request) => {
    if (request?.source !== 'logo') return
    window.requestAnimationFrame(() => {
      const homeButton = document.querySelector('[data-content-view="home"]')
      if (homeButton instanceof HTMLElement && homeButton.isConnected) {
        homeButton.focus({ preventScroll: true })
      }
    })
  }, [])

  const handleOpenTitle = useCallback((item, displayedPosterUrl = null) => {
    setProfileOpen(false)
    if (!detailSessionActiveRef.current) {
      const active = document.activeElement
      detailReturnFocusRef.current = active instanceof HTMLElement ? active : null
      detailSessionActiveRef.current = true
    }

    setSelectedTitle(null)
    setDetailSharedMedia([])
    setDetailSharedMediaLoadError('')
    setDetailPrimaryImageUrl(undefined)
    void loadDetailModalModule().catch(() => {})

    const presented = resolvePresentationArtwork(item, artworkOptions)
    const initiallySelected = {
      ...presented,
      displayPosterUrl: displayedPosterUrl || item?.displayPosterUrl || presented.displayPosterUrl,
    }
    detailRequestSequenceRef.current += 1
    const requestId = detailRequestSequenceRef.current
    if (detailPerformanceRequestRef.current !== null) {
      cancelPerformanceSpan('detail', String(detailPerformanceRequestRef.current), { reason: 'replaced' })
    }
    detailPerformanceRequestRef.current = requestId
    startPerformanceSpan('detail', String(requestId), {
      requireComplete: true,
      mediaType: item?.type === 'series' || item?.mediaType === 'tv' ? 'series' : 'movie',
    })
    setDetailRequest({ id: requestId, item: initiallySelected, error: null })
  }, [artworkOptions])

  useEffect(() => {
    if (!detailRequest || libraryLoading) return undefined

    let cancelled = false
    const controller = new AbortController()
    if (detailRequest.error) return undefined

    const { id: requestId, item } = detailRequest

    async function prepareDetail() {
      await waitForDetailLoadingPaint()
      if (cancelled) return

      const preparedItem = await prepareDetailRequestItem(item, {
        artworkOptions,
        liveAvailabilityEntries,
        liveAvailabilityNow: liveAvailabilityClock,
      })
      if (cancelled) return
      const displayedItem = {
        ...preparedItem,
        displayPosterUrl: item.displayPosterUrl || preparedItem.displayPosterUrl,
      }

      let sharedMedia = []
      let sharedMediaLoadError = ''
      const shouldLoadSharedMedia = Boolean(user?.uid)
        && (sharedMediaCatalogLoading || hasMovieHubTitle(displayedItem))
      const mediaLoad = shouldLoadSharedMedia
        ? loadSharedMediaCached(user.uid, displayedItem)
          .then((entries) => { sharedMedia = entries })
          .catch((error) => {
            console.error(error)
            sharedMediaLoadError = 'Eigene Links und Videos konnten nicht geladen werden.'
          })
        : Promise.resolve()

      const primaryImageUrl = detailInitialImageUrl(displayedItem)
      const detailModuleLoad = loadDetailModalModule()
      let imageResult = 'no-image'
      await Promise.all([
        preloadDetailImage(primaryImageUrl, { signal: controller.signal }).then((result) => { imageResult = result }),
        mediaLoad,
        detailModuleLoad,
      ])
      if (cancelled) return

      finishPerformanceSpan('detail', String(requestId), {
        outcome: 'ready',
        sharedMediaCount: sharedMedia.length,
        imageState: imageResult,
      })
      if (detailPerformanceRequestRef.current === requestId) detailPerformanceRequestRef.current = null
      setDetailSharedMedia(sharedMedia)
      setDetailSharedMediaLoadError(sharedMediaLoadError)
      setDetailPrimaryImageUrl(imageResult === 'loaded' ? primaryImageUrl : null)
      setSelectedTitle(displayedItem)
      setDetailRequest((current) => current?.id === requestId ? null : current)
    }

    prepareDetail().catch((error) => {
      console.warn('Movie-Hub-Detailansicht konnte nicht vollständig vorbereitet werden.', error)
      if (cancelled) return
      finishPerformanceSpan('detail', String(requestId), { outcome: 'error' })
      if (detailPerformanceRequestRef.current === requestId) detailPerformanceRequestRef.current = null
      setDetailRequest((current) => current?.id === requestId
        ? { ...current, error }
        : current)
    })

    return () => { cancelled = true }
  }, [
    artworkOptions,
    detailRequest,
    hasMovieHubTitle,
    libraryLoading,
    liveAvailabilityClock,
    liveAvailabilityEntries,
    sharedMediaCatalogLoading,
    user?.uid,
  ])

  const restoreDetailReturnFocus = useCallback(() => {
    const target = detailReturnFocusRef.current
    if (!target?.isConnected) return
    window.requestAnimationFrame(() => {
      if (target.isConnected) target.focus({ preventScroll: true })
    })
  }, [])

  const closeDetail = useCallback(() => {
    const detailWasMounted = Boolean(selectedTitle)
    if (detailPerformanceRequestRef.current !== null) {
      cancelPerformanceSpan('detail', String(detailPerformanceRequestRef.current), { reason: 'closed' })
      detailPerformanceRequestRef.current = null
    }
    setDetailRequest(null)
    setSelectedTitle(null)
    setDetailSharedMedia([])
    setDetailSharedMediaLoadError('')
    setDetailPrimaryImageUrl(undefined)
    detailSessionActiveRef.current = false
    if (!detailWasMounted) restoreDetailReturnFocus()
  }, [restoreDetailReturnFocus, selectedTitle])

  const cancelDetailLoading = useCallback(() => {
    if (detailPerformanceRequestRef.current !== null) {
      cancelPerformanceSpan('detail', String(detailPerformanceRequestRef.current), { reason: 'cancelled' })
      detailPerformanceRequestRef.current = null
    }
    if (selectedTitle) {
      setDetailRequest(null)
      return
    }
    closeDetail()
  }, [closeDetail, selectedTitle])

  const retryDetailLoading = useCallback(() => {
    if (detailPerformanceRequestRef.current !== null) {
      cancelPerformanceSpan('detail', String(detailPerformanceRequestRef.current), { reason: 'retry' })
    }
    detailRequestSequenceRef.current += 1
    const requestId = detailRequestSequenceRef.current
    detailPerformanceRequestRef.current = requestId
    startPerformanceSpan('detail', String(requestId), { retry: true })
    setDetailRequest((current) => current
      ? { ...current, id: requestId, error: null }
      : current)
  }, [])

  const closeInteractiveLayer = useCallback(() => {
    const startup = document.querySelector('.notification-dialog')
    if (startup) {
      const id = startup.getAttribute('data-announcement-id')
      if (id) setDismissedStartupIds((previous) => new Set(previous).add(id))
      return true
    }
    if (detailRequest) {
      if (detailPerformanceRequestRef.current !== null) {
        cancelPerformanceSpan('detail', String(detailPerformanceRequestRef.current), { reason: 'back' })
        detailPerformanceRequestRef.current = null
      }
      setDetailRequest(null)
      if (!selectedTitle) {
        detailSessionActiveRef.current = false
        restoreDetailReturnFocus()
      }
      return true
    }

    if (selectedTitle) {
      if (window.__movieHubDetailBack?.()) return true
      closeDetail()
      return true
    }

    if (profileOpen) {
      setProfileOpen(false)
      return true
    }

    if (currentView !== 'home') {
      setCurrentView('home')
      return true
    }

    return false
  }, [closeDetail, currentView, detailRequest, profileOpen, restoreDetailReturnFocus, selectedTitle])

  const handleBack = useCallback(() => {
    if (closeInteractiveLayer()) return true

    if (exitDialogOpen) {
      setExitDialogOpen(false)
      return true
    }

    setExitDialogOpen(true)
    return true
  }, [closeInteractiveLayer, exitDialogOpen])

  const handleNativeBack = useCallback(() => (
    closeInteractiveLayer() ? 'handled' : 'confirm'
  ), [closeInteractiveLayer])

  const closeApp = useCallback(() => {
    if (typeof window.MovieHubNative?.closeApp === 'function') {
      window.MovieHubNative.closeApp()
      return
    }

    setExitDialogOpen(false)
  }, [])

  useEffect(() => {
    window.__movieHubNativeBack = handleNativeBack
    window.__movieHubShowExitConfirmation = () => {
      setExitDialogOpen(true)
    }

    return () => {
      if (window.__movieHubNativeBack === handleNativeBack) {
        delete window.__movieHubNativeBack
      }
      delete window.__movieHubShowExitConfirmation
    }
  }, [handleNativeBack])

  useDpadNavigation({
    detailOpen: Boolean(selectedTitle || detailRequest),
    profileMenuOpen: profileOpen,
    exitDialogOpen,
    onBack: handleBack,
  })

  async function handleSignOut() {
    clearSharedMediaLoadCache()
    if (typeof window.MovieHubNative?.clearSessionSmbCredentials === 'function') {
      window.MovieHubNative.clearSessionSmbCredentials()
    }
    const { auth } = await firebaseReady
    await signOut(auth)
  }

  const rawHomeRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'home', () => [
      ...buildProviderHomeRows(catalog.providerCatalogs, titles),
      ...rowDefinitions.filter((row) => !row.providerId).map((row) => ({
        ...row,
        displayLimit: Array.isArray(row.ids) ? row.ids.length : 0,
        items: (Array.isArray(row.ids) ? row.ids : []).map((id) => titles.find((item) => item.id === id)).filter(Boolean),
      })),
    ].filter((row) => row.items.length)),
    [catalog.providerCatalogs, currentView, rowDefinitions, titles],
  )
  const personalCatalogTitles = useMemo(
    () => mergeCatalogWithPersonalSnapshots(titles, statesByKey)
      .map((item) => resolvePresentationArtwork(item, artworkOptions)),
    [titles, statesByKey, artworkOptions],
  )
  const personalRows = useMemo(
    () => buildPersonalRows(personalCatalogTitles, getTitleState),
    [personalCatalogTitles, getTitleState, statesByKey],
  )
  const personalTopHundredRows = useMemo(
    () => prepareRowsForActiveView(
      currentView,
      'library',
      () => buildPersonalTopHundredRows(personalCatalogTitles, getTitleState),
    ),
    [currentView, personalCatalogTitles, getTitleState, statesByKey],
  )
  const watchedHistoryRows = useMemo(
    () => prepareRowsForActiveView(
      currentView,
      'library',
      () => buildWatchedHistoryRows(personalCatalogTitles, getTitleState),
    ),
    [currentView, personalCatalogTitles, getTitleState, statesByKey],
  )
  const tmdbRows = useMemo(
    () => (currentView === 'home' || currentView === 'library')
      ? buildTmdbCatalogRows(titles)
      : [],
    [currentView, titles],
  )
  const personalSmartRows = useMemo(
    () => prepareRowsForActiveView(
      currentView,
      'library',
      () => buildPersonalSmartRows(
        publicTitles,
        activeProfile?.contentRowSettings,
        undefined,
        (items, row) => curateTitles(items, {
          mode: activeSortMode,
          seed: `${curationSeed}:smart:${row.id}`,
        }),
      ),
    ),
    [currentView, publicTitles, activeProfile?.contentRowSettings, activeSortMode, curationSeed],
  )
  const combinedPersonalRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'library', () => [
      ...personalRows.filter((row) => row.id !== 'my-ratings'),
      ...personalTopHundredRows,
      ...tmdbRows,
      ...personalSmartRows,
    ]),
    [currentView, personalRows, personalTopHundredRows, tmdbRows, personalSmartRows],
  )
  const personalTopTen = useMemo(
    () => prepareForActiveView(
      currentView,
      'library',
      () => buildPersonalTopTen(combinedPersonalRows, getTitleState),
      [],
    ),
    [combinedPersonalRows, currentView, getTitleState, statesByKey],
  )
  const personalDisplayRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'library', () => {
      const regularRows = combinedPersonalRows.filter((row) => !row.id.startsWith('my-top-100-'))
      const rowsWithTopTen = assembleTopTenPageRows({
        page: 'myContent',
        rows: regularRows,
        topTen: {
          id: 'top-ten-personal',
          title: 'Deine persönliche Top 10',
          items: personalTopTen,
        },
      })
      const topTenIndex = rowsWithTopTen.findIndex((row) => row.id === 'top-ten-personal')
      const insertionIndex = topTenIndex >= 0 ? topTenIndex + 1 : rowsWithTopTen.length
      return visiblePageRows([
        ...rowsWithTopTen.slice(0, insertionIndex),
        ...watchedHistoryRows,
        ...personalTopHundredRows,
        ...rowsWithTopTen.slice(insertionIndex),
      ], 'myContent')
    }),
    [
      activeProfile?.experienceSettings,
      combinedPersonalRows,
      currentView,
      personalTopTen,
      watchedHistoryRows,
      personalTopHundredRows,
    ],
  )
  const providerTopTenInput = useMemo(() => ({
    providerCatalogs: catalog.providerCatalogs,
    titles,
    movieHubTitles,
    enabledProviderIds,
  }), [catalog.providerCatalogs, titles, movieHubTitles, enabledProviderIds])
  const homeTopTen = useMemo(
    () => prepareForActiveView(
      currentView,
      'home',
      () => buildProviderTopTen(providerTopTenInput),
      [],
    ),
    [currentView, providerTopTenInput],
  )
  const movieTopTen = useMemo(
    () => prepareForActiveView(
      currentView,
      'movies',
      () => buildProviderTopTen({ ...providerTopTenInput, mediaType: 'movie' }),
      [],
    ),
    [currentView, providerTopTenInput],
  )
  const seriesTopTen = useMemo(
    () => prepareForActiveView(
      currentView,
      'series',
      () => buildProviderTopTen({ ...providerTopTenInput, mediaType: 'series' }),
      [],
    ),
    [currentView, providerTopTenInput],
  )
  const eligiblePublicTitles = useMemo(
    () => titles.filter((item) => hasEnabledAvailability(item, enabledProviderIds, hasMovieHubTitle)),
    [titles, enabledProviderIds, hasMovieHubTitle],
  )
  const curatedPublicTitles = useMemo(
    () => curateTitles(eligiblePublicTitles, {
      mode: activeSortMode,
      seed: `${curationSeed}:heroes`,
      watchedMode: contentDisplaySettings.watchedMode,
      getTitleState,
    }),
    [eligiblePublicTitles, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey],
  )
  const curatedMovieTitles = useMemo(
    () => curateTitles(eligiblePublicTitles.filter((item) => item.type === 'movie'), {
      mode: activeSortMode,
      seed: `${curationSeed}:heroes:movies`,
      watchedMode: contentDisplaySettings.watchedMode,
      getTitleState,
    }),
    [eligiblePublicTitles, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey],
  )
  const curatedSeriesTitles = useMemo(
    () => curateTitles(eligiblePublicTitles.filter((item) => item.type === 'series'), {
      mode: activeSortMode,
      seed: `${curationSeed}:heroes:series`,
      watchedMode: contentDisplaySettings.watchedMode,
      getTitleState,
    }),
    [eligiblePublicTitles, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey],
  )
  const coordinatedHeroes = useMemo(
    () => selectCoordinatedHeroItems(curatedPublicTitles, {
      movieItems: curatedMovieTitles,
      seriesItems: curatedSeriesTitles,
      selectionReady: catalog.status !== 'loading',
    }),
    [catalog.status, curatedMovieTitles, curatedPublicTitles, curatedSeriesTitles],
  )
  const homeHeroes = coordinatedHeroes.home
  const movieHeroes = coordinatedHeroes.movies
  const seriesHeroes = coordinatedHeroes.series
  const movies = curatedMovieTitles
  const series = curatedSeriesTitles
  const personalHeroes = useMemo(
    () => selectPersonalHeroItemsFromSources([
      () => personalRows.filter((row) => row.id !== 'my-ratings'),
      () => currentView === 'library'
        ? personalTopHundredRows
        : buildPersonalTopHundredRows(personalCatalogTitles, getTitleState),
      () => (currentView === 'home' || currentView === 'library')
        ? tmdbRows
        : buildTmdbCatalogRows(titles),
      () => currentView === 'library'
        ? personalSmartRows
        : buildPersonalSmartRows(
          publicTitles,
          activeProfile?.contentRowSettings,
          undefined,
          (items, row) => curateTitles(items, {
            mode: activeSortMode,
            seed: `${curationSeed}:smart:${row.id}`,
          }),
        ),
    ]),
    [
      activeProfile?.contentRowSettings,
      activeSortMode,
      curationSeed,
      currentView,
      getTitleState,
      personalCatalogTitles,
      personalRows,
      personalSmartRows,
      personalTopHundredRows,
      publicTitles,
      titles,
      tmdbRows,
    ],
  )
  const curatedHomeRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'home', () => curateCatalogRows(
      rawHomeRows.filter((row) => !row.providerId || enabledProviderIds.includes(row.providerId)).map((row) => ({
        ...row,
        items: row.items.filter((item) => hasEnabledAvailability(item, enabledProviderIds, hasMovieHubTitle)),
      })),
      {
        mode: activeSortMode,
        seed: `${curationSeed}:home`,
        watchedMode: contentDisplaySettings.watchedMode,
        getTitleState,
      },
    )),
    [rawHomeRows, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, currentView, getTitleState, statesByKey, enabledProviderIds, hasMovieHubTitle],
  )
  const curateMovieHubTitles = useCallback((items, seedSuffix) => curateTitles(items, {
    mode: activeSortMode,
    seed: `${curationSeed}:moviehub:${seedSuffix}`,
    watchedMode: contentDisplaySettings.watchedMode,
    getTitleState,
    limit: PUBLIC_POSTER_ROW_LIMIT,
  }), [activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey])
  const curatedMovieHubHomeTitles = useMemo(
    () => prepareForActiveView(
      currentView,
      'home',
      () => curateMovieHubTitles(movieHubTitles, 'home'),
      [],
    ),
    [currentView, movieHubTitles, curateMovieHubTitles],
  )
  const curatedMovieHubMovieTitles = useMemo(
    () => prepareForActiveView(
      currentView,
      'movies',
      () => curateMovieHubTitles(movieHubTitles.filter((item) => item.type === 'movie'), 'movies'),
      [],
    ),
    [currentView, movieHubTitles, curateMovieHubTitles],
  )
  const curatedMovieHubSeriesTitles = useMemo(
    () => prepareForActiveView(
      currentView,
      'series',
      () => curateMovieHubTitles(movieHubTitles.filter((item) => item.type === 'series'), 'series'),
      [],
    ),
    [currentView, movieHubTitles, curateMovieHubTitles],
  )
  const movieHubHomeRows = useMemo(
    () => prepareRowsForActiveView(
      currentView,
      'home',
      () => enabledProviderIds.includes('moviehub') ? buildMovieHubCatalogRows(curatedMovieHubHomeTitles) : [],
    ),
    [currentView, curatedMovieHubHomeTitles, enabledProviderIds],
  )
  const movieHubMovieRows = useMemo(
    () => prepareRowsForActiveView(
      currentView,
      'movies',
      () => enabledProviderIds.includes('moviehub') ? buildMovieHubCatalogRows(curatedMovieHubMovieTitles, 'movie') : [],
    ),
    [currentView, curatedMovieHubMovieTitles, enabledProviderIds],
  )
  const movieHubSeriesRows = useMemo(
    () => prepareRowsForActiveView(
      currentView,
      'series',
      () => enabledProviderIds.includes('moviehub') ? buildMovieHubCatalogRows(curatedMovieHubSeriesTitles, 'series') : [],
    ),
    [currentView, curatedMovieHubSeriesTitles, enabledProviderIds],
  )
  const hasProviderCatalogs = Object.keys(catalog.providerCatalogs || {}).length > 0
  const providerMovieRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'movies', () => (
      hasProviderCatalogs ? curateCatalogRows(
        buildProviderBrowseRows(catalog.providerCatalogs, titles, 'movie')
          .filter((row) => !row.providerId || enabledProviderIds.includes(row.providerId))
          .map((row) => ({
            ...row,
            items: row.items.filter((item) => hasEnabledAvailability(item, enabledProviderIds, hasMovieHubTitle)),
          })),
        {
          mode: activeSortMode,
          seed: `${curationSeed}:provider-movies`,
          watchedMode: contentDisplaySettings.watchedMode,
          getTitleState,
          limit: PUBLIC_POSTER_ROW_LIMIT,
        },
      ) : []
    )),
    [catalog.providerCatalogs, titles, hasProviderCatalogs, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, currentView, getTitleState, statesByKey, enabledProviderIds, hasMovieHubTitle],
  )
  const providerSeriesRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'series', () => (
      hasProviderCatalogs ? curateCatalogRows(
        buildProviderBrowseRows(catalog.providerCatalogs, titles, 'series')
          .filter((row) => !row.providerId || enabledProviderIds.includes(row.providerId))
          .map((row) => ({
            ...row,
            items: row.items.filter((item) => hasEnabledAvailability(item, enabledProviderIds, hasMovieHubTitle)),
          })),
        {
          mode: activeSortMode,
          seed: `${curationSeed}:provider-series`,
          watchedMode: contentDisplaySettings.watchedMode,
          getTitleState,
          limit: PUBLIC_POSTER_ROW_LIMIT,
        },
      ) : []
    )),
    [catalog.providerCatalogs, titles, hasProviderCatalogs, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, currentView, getTitleState, statesByKey, enabledProviderIds, hasMovieHubTitle],
  )
  const movieCategoryRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'movies', () => buildCategoryRows({
      titles,
      mediaType: 'movie',
      enabledCategoryIds: activeProfile?.categorySettings?.enabledMovieCategoryIds,
      categoryOrder: activeProfile?.categorySettings?.movieCategoryOrder,
      enabledProviderIds,
      sortItems: (items, category) => curateTitles(items, {
        mode: activeSortMode,
        seed: `${curationSeed}:category-movie:${category.id}`,
        watchedMode: contentDisplaySettings.watchedMode,
        getTitleState,
      }),
    })),
    [titles, activeProfile?.categorySettings?.enabledMovieCategoryIds, activeProfile?.categorySettings?.movieCategoryOrder, enabledProviderIds, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, currentView, getTitleState, statesByKey],
  )
  const seriesCategoryRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'series', () => buildCategoryRows({
      titles,
      mediaType: 'series',
      enabledCategoryIds: activeProfile?.categorySettings?.enabledSeriesCategoryIds,
      categoryOrder: activeProfile?.categorySettings?.seriesCategoryOrder,
      enabledProviderIds,
      sortItems: (items, category) => curateTitles(items, {
        mode: activeSortMode,
        seed: `${curationSeed}:category-series:${category.id}`,
        watchedMode: contentDisplaySettings.watchedMode,
        getTitleState,
      }),
    })),
    [titles, activeProfile?.categorySettings?.enabledSeriesCategoryIds, activeProfile?.categorySettings?.seriesCategoryOrder, enabledProviderIds, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, currentView, getTitleState, statesByKey],
  )
  const movieBrowseBaseRows = useMemo(
    () => prepareRowsForActiveView(
      currentView,
      'movies',
      () => [...movieCategoryRows, ...movieHubMovieRows, ...providerMovieRows],
    ),
    [currentView, movieCategoryRows, movieHubMovieRows, providerMovieRows],
  )
  const movieBrowseRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'movies', () => assembleTopTenPageRows({
      page: 'movies',
      rows: movieBrowseBaseRows,
      topTen: {
        id: 'top-ten-movies',
        title: 'Top 10 Filme bei deinen Anbietern',
        items: movieTopTen,
      },
    })),
    [activeProfile?.experienceSettings, currentView, movieBrowseBaseRows, movieTopTen],
  )
  const seriesBrowseBaseRows = useMemo(
    () => prepareRowsForActiveView(
      currentView,
      'series',
      () => [...seriesCategoryRows, ...movieHubSeriesRows, ...providerSeriesRows],
    ),
    [currentView, seriesCategoryRows, movieHubSeriesRows, providerSeriesRows],
  )
  const seriesBrowseRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'series', () => assembleTopTenPageRows({
      page: 'series',
      rows: seriesBrowseBaseRows,
      topTen: {
        id: 'top-ten-series',
        title: 'Top 10 Serien bei deinen Anbietern',
        items: seriesTopTen,
      },
    })),
    [activeProfile?.experienceSettings, currentView, seriesBrowseBaseRows, seriesTopTen],
  )
  const homeBaseRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'home', () => [
      ...movieHubHomeRows,
      ...curatedHomeRows,
      ...(!libraryLoading && !libraryError ? personalRows : []),
      ...tmdbRows,
    ]),
    [currentView, movieHubHomeRows, curatedHomeRows, libraryLoading, libraryError, personalRows, tmdbRows],
  )
  const homeRows = useMemo(
    () => prepareRowsForActiveView(currentView, 'home', () => assembleTopTenPageRows({
      page: 'home',
      rows: homeBaseRows,
      topTen: {
        id: 'top-ten-home',
        title: 'Top 10 bei deinen Anbietern',
        items: homeTopTen,
      },
    })),
    [activeProfile?.experienceSettings, currentView, homeBaseRows, homeTopTen],
  )
  const heroItemsByView = useMemo(() => ({
    home: homeHeroes,
    movies: movieHeroes,
    series: seriesHeroes,
    library: personalHeroes,
  }), [homeHeroes, movieHeroes, personalHeroes, seriesHeroes])
  const handleViewIntent = useCallback((nextView) => {
    if (preloadSecondaryViewModule(nextView)) return
    preloadHeroImage(heroItemsByView[nextView])
  }, [heroItemsByView])
  const liveTmdb = catalog.source === 'tmdb'
  const startupAnnouncement = startupFocusReady && announcementsReady && currentView === 'home' && !selectedTitle && !detailRequest && !exitDialogOpen
    ? announcements.find((item) => item.mode === 'startup' && !readIds.has(item.id) && !dismissedStartupIds.has(item.id))
    : null

  return (
    <div className="app-shell">
      <Header
        currentView={currentView}
        onViewChange={handleViewChange}
        unreadCount={unreadCount}
        onContentViewActivate={handleContentViewActivate}
        user={user}
        onSignOut={handleSignOut}
        profileOpen={profileOpen}
        onProfileToggle={() => setProfileOpen((open) => !open)}
        onProfileClose={() => setProfileOpen(false)}
        activeProfile={activeProfile}
        profiles={profiles}
        onProfileSelect={selectProfile}
        onViewIntent={handleViewIntent}
      />
      {currentView === 'home' && (
        <HomeView
          heroItems={homeHeroes}
          rows={homeRows}
          onOpen={handleOpenTitle}
          liveTmdb={liveTmdb}
          catalogStatus={catalog.status}
          onStartupReady={() => setHomeStartupReady(true)}
          activationRequest={contentActivationRequest?.viewId === 'home' ? contentActivationRequest : null}
          onActivationUnavailable={handleHeroActivationUnavailable}
        />
      )}
      {currentView === 'movies' && (
        <BrowseView
          key="movies"
          viewId="movies"
          title="Filme"
          subtitle="Deine Filmkategorien – danach die Kataloge deiner Anbieter."
          items={movies}
          rows={movieBrowseRows}
          heroItems={movieHeroes}
          readyEnabled={catalog.status !== 'loading'}
          activationRequest={contentActivationRequest?.viewId === 'movies' ? contentActivationRequest : null}
          onActivationUnavailable={handleHeroActivationUnavailable}
          onOpen={handleOpenTitle}
        />
      )}
      {currentView === 'series' && (
        <BrowseView
          key="series"
          viewId="series"
          title="Serien"
          subtitle="Deine Serienkategorien – danach die Kataloge deiner Anbieter."
          items={series}
          rows={seriesBrowseRows}
          heroItems={seriesHeroes}
          readyEnabled={catalog.status !== 'loading'}
          activationRequest={contentActivationRequest?.viewId === 'series' ? contentActivationRequest : null}
          onActivationUnavailable={handleHeroActivationUnavailable}
          onOpen={handleOpenTitle}
        />
      )}
      {currentView === 'tv' && (
        <Suspense fallback={<LazyViewLoading label="TV" className="browse-page tv-program-page" />}>
          <LazyTvFeature
            waipuStationCatalog={waipuStationCatalog}
            joynStationCatalog={joynStationCatalog}
            disabledWaipuStationIds={disabledStationIds}
            disabledJoynStationIds={disabledJoynStationIds}
            orderWaipuStations={orderStations}
            orderJoynStations={orderJoynStations}
            stationSelectionLoading={stationSelectionLoading}
            joynStationSelectionLoading={joynStationSelectionLoading}
            liveAvailabilityEntries={liveAvailabilityEntries}
            artworkOptions={artworkOptions}
            activationRequest={contentActivationRequest?.viewId === 'tv' ? contentActivationRequest : null}
            onActivationUnavailable={handleHeroActivationUnavailable}
            onStationCatalogsRequested={setTvStationCatalogsRequested}
            onOpen={handleOpenTitle}
          />
        </Suspense>
      )}
      {currentView === 'library' && (
        <PersonalLibraryView
          rows={personalDisplayRows}
          heroItems={personalHeroes}
          onOpen={handleOpenTitle}
          profileName={activeProfile?.displayName}
          loading={libraryLoading}
          error={libraryError}
          activationRequest={contentActivationRequest?.viewId === 'library' ? contentActivationRequest : null}
          onActivationUnavailable={handleHeroActivationUnavailable}
        />
      )}
      {currentView === 'search' && (
        <Suspense fallback={<LazyViewLoading label="Suchen" className="browse-page search-page" />}>
          <LazySearchView
            publicTitles={publicTitles}
            personalTitles={tmdbPersonalTitles}
            movieHubTitles={movieHubTitles}
            fullTitles={titles}
            onOpen={handleOpenTitle}
          />
        </Suspense>
      )}
      {currentView === 'notifications' && <AnnouncementsView items={announcements} readIds={readIds} ready={announcementsReady} error={announcementsError} onRead={markRead} onOpenTitle={(message) => {
        const match = titles.find((title) => title.type === message.titleType && Number(title.tmdbId) === Number(message.tmdbId))
        handleOpenTitle(match || {
          id: `tmdb-${message.titleType}-${message.tmdbId}`,
          tmdbId: message.tmdbId,
          type: message.titleType,
          title: message.mediaTitle || 'Titel',
          source: 'tmdb',
        }, null, { requireComplete: true })
      }} />}
      {currentView === 'profile' && (
        <Suspense fallback={<LazyViewLoading label="Dein Movie Hub" className="browse-page profile-page" />}>
          <LazyProfileView
            user={user}
            onSignOut={handleSignOut}
            publicTitles={publicTitles}
            smartFilterOptions={catalog.smartFilterOptions}
          />
        </Suspense>
      )}
      {currentView === 'settings' && (
        <Suspense fallback={<LazyViewLoading label="Einstellungen" className="browse-page profile-page" />}>
          <LazySettingsView
            waipuStations={waipuStationCatalog.stations}
            waipuStationStatus={waipuStationCatalog.status}
            joynStations={joynStationCatalog.stations}
            joynStationStatus={joynStationCatalog.status}
          />
        </Suspense>
      )}
      {currentView === 'about' && (
        <Suspense fallback={<LazyViewLoading label="Über Movie Hub" />}>
          <LazyAboutView />
        </Suspense>
      )}
      {selectedTitle && (
        <Suspense fallback={<DetailLoadingScreen item={selectedTitle} onClose={closeDetail} />}>
        <LazyDetailModal
          key={[
            selectedTitle.id || `${selectedTitle.type || selectedTitle.mediaType}:${selectedTitle.tmdbId || selectedTitle.title}`,
            selectedTitle.tvAiring?.canonicalStationId || selectedTitle.tvAiring?.stationId || '',
            selectedTitle.tvAiring?.startTime || '',
            selectedTitle.tvAiring?.stopTime || '',
          ].join('|')}
          item={selectedTitle}
          collections={catalog.collections}
          titles={titles}
          initialSharedMedia={detailSharedMedia}
          initialPrimaryImageUrl={detailPrimaryImageUrl}
          sharedMediaPreloaded
          sharedMediaLoadError={detailSharedMediaLoadError}
          liveAvailabilityNow={liveAvailabilityClock}
          returnFocusTarget={detailReturnFocusRef.current}
          onSelectTitle={handleOpenTitle}
          onClose={closeDetail}
        />
        </Suspense>
      )}
      {detailRequest && (
        <DetailLoadingScreen
          item={detailRequest.item}
          error={detailRequest.error}
          onRetry={retryDetailLoading}
          onClose={cancelDetailLoading}
        />
      )}
      {exitDialogOpen && <ExitConfirmationDialog onCancel={() => setExitDialogOpen(false)} onClose={closeApp} />}
      {startupAnnouncement && <StartupAnnouncement key={startupAnnouncement.id} item={startupAnnouncement} error={startupNoticeError} onConfirm={async (id) => {
        try {
          await markRead(id)
          setStartupNoticeError('')
          setDismissedStartupIds((previous) => new Set(previous).add(id))
        } catch {
          setStartupNoticeError('Lesestatus konnte nicht gespeichert werden. Bitte erneut versuchen.')
        }
      }} onDismiss={() => {
        setStartupNoticeError('')
        setDismissedStartupIds((previous) => new Set(previous).add(startupAnnouncement.id))
      }} />}
    </div>
  )
}

function AuthenticatedMovieHub({ user }) {
  const { loading, error, activeProfile } = useProfiles()

  if (loading) return <main className="auth-shell"><p className="loading-copy">Movie-Hub-Profile werden geladen …</p></main>

  if (error || !activeProfile) {
    return (
      <>
        <NativeStartupSignal />
        <main className="auth-shell">
          <section className="auth-panel">
            <p className="eyebrow">Movie Hub</p>
            <h1>Profile konnten nicht geladen werden</h1>
            <p className="error">{error?.message ?? 'Kein aktives Profil verfügbar.'}</p>
          </section>
        </main>
      </>
    )
  }

  return (
    <ThemeProvider>
      <MovieHub user={user} />
    </ThemeProvider>
  )
}

export default function App() {
  const { user, loading, error } = useAuth()

  if (loading) return <main className="auth-shell"><p className="loading-copy">Movie Hub wird geladen …</p></main>

  if (error) {
    return (
      <>
        <NativeStartupSignal />
        <main className="auth-shell">
          <section className="auth-panel">
            <p className="eyebrow">Movie Hub</p>
            <h1>Firebase konnte nicht initialisiert werden</h1>
            <p className="error">{error.message}</p>
          </section>
        </main>
      </>
    )
  }

  return user ? (
    <ProfileProvider user={user}>
      <TmdbCatalogProvider user={user}>
        <AuthenticatedMovieHub user={user} />
      </TmdbCatalogProvider>
    </ProfileProvider>
  ) : <Login />
}
