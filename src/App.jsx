import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import AboutView from './components/AboutView.jsx'
import DetailLoadingScreen from './components/DetailLoadingScreen.jsx'
import DetailModal from './components/DetailModal.jsx'
import HeroFirstPage from './components/HeroFirstPage.jsx'
import { ProgressivePosterGrid, ProgressiveRows } from './components/ProgressiveContent.jsx'
import ProfileView from './components/ProfileView.jsx'
import SearchView from './components/SearchView.jsx'
import SettingsView from './components/SettingsView.jsx'
import TvView from './components/TvView.jsx'
import { prepareDetailRequestItem, preloadDetailImage, waitForDetailLoadingPaint } from './components/detailPresentation.js'
import { buildCategoryRows } from './catalog/categoryRows.js'
import { buildPersonalSmartRows, normalizeSmartFilterOptions } from './catalog/personalSmartRows.js'
import { buildProviderBrowseRows, buildProviderHomeRows } from './catalog/providerCatalogRows.js'
import { selectCoordinatedHeroItems, selectPersonalHeroItems } from './catalog/heroSelection.js'
import { buildMovieHubCatalogRows } from './catalog/movieHubCatalog.js'
import { normalizeFilmCollectionIndex } from './catalog/filmCollections.js'
import { buildPersonalTopTen, buildProviderTopTen, insertTopTenRow } from './catalog/topTenRows.js'
import { curateCatalogRows, curateTitles, hasEnabledAvailability, PUBLIC_POSTER_ROW_LIMIT } from './catalog/contentCuration.js'
import { getContentPeriodKey, normalizeContentDisplaySettings, resolveContentSortMode } from './catalog/contentDisplaySettings.js'
import { resolvePresentationArtwork } from './catalog/artworkRotation.js'
import { loadRuntimeTitleMetadata } from './catalog/runtimeTitleMetadata.js'
import { mergeEnrichedTitle, sameTmdbTitle, titleNeedsMetadataEnrichment } from './catalog/titleMetadata.js'
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
import { HERO_PRELOAD_INTENT_DELAY_MS, preloadHeroImage } from './performance/progressiveRendering.js'
import { loadCatalogWithRetry } from './performance/catalogStartup.js'
import { notifyNativeStartupReady } from './performance/nativeStartup.js'
import { INITIAL_HOME_FOCUS_EVENT } from './components/InitialHomeFocus.jsx'
import { ProfileProvider, useProfiles } from './profiles/ProfileProvider.jsx'
import { ThemeProvider } from './theme/ThemeProvider.jsx'
import { TmdbCatalogProvider, useTmdbCatalog } from './tmdb/TmdbCatalogProvider.jsx'
import { buildTmdbCatalogRows, mergePublicAndPersonalCatalog } from './tmdb/tmdbCatalogModel.js'
import {
  advanceWaipuLiveTitles,
  loadWaipuLiveTitles,
  mergeWaipuLiveAvailability,
} from './waipu/waipuLiveCatalog.js'
import {
  buildWaipuTvViewModel,
  buildWaipuTvHeroItems,
  loadWaipuLiveStationCatalog,
  loadWaipuTvAirings,
  nextTvAiringTransition,
  tvDayKey,
} from './waipu/waipuTvCatalog.js'
import { loadJoynLiveStationCatalog, loadJoynTvAirings } from './joyn/joynTvCatalog.js'
import {
  advanceJoynLiveTitles,
  loadJoynLiveTitles,
  mergeJoynLiveAvailability,
} from './joyn/joynLiveCatalog.js'
import { mergeTvAirings } from './sources/mergeTvAirings.js'

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
    onProfileClose()
    onViewChange('profile')
  }

  function openAppSettings() {
    onProfileClose()
    onViewChange('settings')
  }

  function openAbout() {
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
        <button type="button" className={currentView === 'search' ? 'icon-button active' : 'icon-button'} onClick={() => onViewChange('search')} data-focusable="true" aria-label="Suche">⌕</button>
        <BellButton unreadCount={unreadCount} active={currentView === 'notifications'} onClick={() => onViewChange('notifications')} />
        <div className="profile-wrap">
          <button
            type="button"
            className={profileAreaActive ? 'profile-button active' : 'profile-button'}
            onClick={onProfileToggle}
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
              <button type="button" className="profile-settings-link" onClick={openProfileSettings} data-focusable="true" role="menuitem">Profil & Design</button>
              <button type="button" className="app-settings-link" onClick={openAppSettings} data-focusable="true" role="menuitem">Einstellungen</button>
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
  activationRequest,
  onActivationUnavailable,
}) {
  const startupReadyReportedRef = useRef(false)
  const catalogReady = catalogStatus === 'ready'
  const handleInitialContentReady = useCallback(() => {
    if (!catalogReady || startupReadyReportedRef.current) return
    startupReadyReportedRef.current = true
    notifyNativeStartupReady()
  }, [catalogReady])

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
  const [waipuLiveEntries, setWaipuLiveEntries] = useState([])
  const [waipuLiveStatus, setWaipuLiveStatus] = useState('loading')
  const [joynLiveEntries, setJoynLiveEntries] = useState([])
  const [joynLiveStatus, setJoynLiveStatus] = useState('loading')
  const [waipuStatusClock, setWaipuStatusClock] = useState(() => Date.now())
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
  const [tvSchedule, setTvSchedule] = useState({ status: 'idle', airings: [] })
  const [tvHydratedTitles, setTvHydratedTitles] = useState([])
  const [tvScheduleRequested, setTvScheduleRequested] = useState(false)
  const [tvClock, setTvClock] = useState(() => Date.now())
  const [tvPeriodId, setTvPeriodId] = useState(() => `day:${tvDayKey(Date.now())}`)
  const tvScheduleIntentTimerRef = useRef(null)
  const tvMetadataHydrationInFlightRef = useRef(new Set())
  const contentActivationSequenceRef = useRef(0)
  const detailRequestSequenceRef = useRef(0)
  const detailReturnFocusRef = useRef(null)
  const detailSessionActiveRef = useRef(false)

  useEffect(() => {
    if (startupFocusReady) return undefined
    const ready = () => setStartupFocusReady(true)
    window.addEventListener(INITIAL_HOME_FOCUS_EVENT, ready)
    const fallback = window.setTimeout(ready, 12_000)
    return () => { window.removeEventListener(INITIAL_HOME_FOCUS_EVENT, ready); window.clearTimeout(fallback) }
  }, [startupFocusReady])

  useEffect(() => () => {
    if (tvScheduleIntentTimerRef.current !== null) {
      window.clearTimeout(tvScheduleIntentTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

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
          setCatalog((current) => ({ ...current, status: 'error' }))
        }
      }
    }

    loadCatalog()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadWaipuLiveTitles().then((entries) => {
      if (!cancelled) {
        setWaipuLiveEntries(entries)
        setWaipuLiveStatus('ready')
        setWaipuStatusClock(Date.now())
      }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadJoynLiveTitles().then((entries) => {
      if (!cancelled) {
        setJoynLiveEntries(entries)
        setJoynLiveStatus('ready')
        setWaipuStatusClock(Date.now())
      }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadWaipuLiveStationCatalog().then((stationCatalog) => {
      if (!cancelled) setWaipuStationCatalog(stationCatalog)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadJoynLiveStationCatalog().then((stationCatalog) => {
      if (!cancelled) setJoynStationCatalog(stationCatalog)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const nextStopTime = Math.min(...waipuLiveEntries
      .map((entry) => Date.parse(entry?.nextAiring?.stopTime))
      .filter(Number.isFinite))
    if (!Number.isFinite(nextStopTime)) return undefined
    const timeout = window.setTimeout(() => {
      setWaipuLiveEntries((entries) => advanceWaipuLiveTitles(entries))
    }, Math.max(0, Math.min(2_147_483_647, nextStopTime - Date.now() + 1_000)))
    return () => window.clearTimeout(timeout)
  }, [waipuLiveEntries])

  useEffect(() => {
    const nextStopTime = Math.min(...joynLiveEntries
      .map((entry) => Date.parse(entry?.nextAiring?.stopTime))
      .filter(Number.isFinite))
    if (!Number.isFinite(nextStopTime)) return undefined
    const timeout = window.setTimeout(() => {
      setJoynLiveEntries((entries) => advanceJoynLiveTitles(entries))
    }, Math.max(0, Math.min(2_147_483_647, nextStopTime - Date.now() + 1_000)))
    return () => window.clearTimeout(timeout)
  }, [joynLiveEntries])

  useEffect(() => {
    const airings = waipuLiveEntries.flatMap((entry) => (
      Array.isArray(entry?.airings) ? entry.airings : [entry?.nextAiring]
    )).filter(Boolean)
    const nextTransition = nextTvAiringTransition(airings, waipuStatusClock)
    if (!Number.isFinite(nextTransition)) return undefined
    const timeout = window.setTimeout(
      () => setWaipuStatusClock(Date.now()),
      Math.max(0, Math.min(2_147_483_647, nextTransition - Date.now() + 1_000)),
    )
    return () => window.clearTimeout(timeout)
  }, [waipuLiveEntries, waipuStatusClock])

  const activeWaipuStations = useMemo(() => {
    const disabled = new Set(disabledStationIds)
    return orderStations(waipuStationCatalog.stations)
      .filter((station) => !disabled.has(station.id))
  }, [disabledStationIds, orderStations, waipuStationCatalog.stations])
  const activeWaipuStationKey = activeWaipuStations.map((station) => station.id).join('|')
  const availableWaipuDayKey = (waipuStationCatalog.days || []).map(({ key }) => key).join('|')
  const activeJoynStations = useMemo(() => {
    const disabled = new Set(disabledJoynStationIds)
    return orderJoynStations(joynStationCatalog.stations)
      .filter((station) => !disabled.has(station.id))
  }, [disabledJoynStationIds, joynStationCatalog.stations, orderJoynStations])
  const activeJoynStationKey = activeJoynStations.map((station) => station.id).join('|')
  const availableJoynDayKey = (joynStationCatalog.days || []).map(({ key }) => key).join('|')
  const combinedTvDays = useMemo(() => {
    const days = new Map()
    for (const day of [...(waipuStationCatalog.days || []), ...(joynStationCatalog.days || [])]) {
      if (!day?.key) continue
      days.set(day.key, {
        key: day.key,
        count: Number(days.get(day.key)?.count || 0) + Number(day.count || 0),
      })
    }
    return [...days.values()].sort((left, right) => left.key.localeCompare(right.key))
  }, [joynStationCatalog.days, waipuStationCatalog.days])
  const combinedTvStationOrder = useMemo(() => [...new Set([
    ...activeWaipuStations.map((station) => station.id),
    ...activeJoynStations.map((station) => station.canonicalId || `joyn.${station.id}`),
  ])], [activeJoynStations, activeWaipuStations])

  useEffect(() => {
    if (!tvScheduleRequested) return undefined
    const waipuLoading = waipuStationCatalog.status === 'loading' || stationSelectionLoading
    const joynLoading = joynStationCatalog.status === 'loading' || joynStationSelectionLoading
    const waipuReady = waipuStationCatalog.status === 'ready'
    const joynReady = joynStationCatalog.status === 'ready'

    if ((waipuLoading || joynLoading) && !waipuReady && !joynReady) {
      setTvSchedule({ status: 'loading', airings: [] })
      return undefined
    }
    if (!waipuReady && !joynReady) {
      setTvSchedule({ status: 'unavailable', airings: [] })
      return undefined
    }
    if ((!waipuReady || !activeWaipuStations.length) && (!joynReady || !activeJoynStations.length)) {
      setTvSchedule({ status: 'no-stations', airings: [] })
      return undefined
    }

    let cancelled = false
    setTvSchedule((current) => ({ ...current, status: 'loading' }))
    Promise.all([
      waipuReady && activeWaipuStations.length
        ? loadWaipuTvAirings(activeWaipuStations, {
          periodId: tvPeriodId,
          availableDays: waipuStationCatalog.days,
        })
        : Promise.resolve([]),
      joynReady && activeJoynStations.length
        ? loadJoynTvAirings(activeJoynStations, {
          periodId: tvPeriodId,
          availableDays: joynStationCatalog.days,
        })
        : Promise.resolve([]),
    ])
      .then(([waipuAirings, joynAirings]) => {
        if (!cancelled) {
          setTvClock(Date.now())
          setTvSchedule({
            status: 'ready',
            airings: mergeTvAirings(waipuAirings, joynAirings),
          })
        }
      })
      .catch(() => {
        if (!cancelled) setTvSchedule({ status: 'unavailable', airings: [] })
      })
    return () => { cancelled = true }
  }, [
    activeJoynStationKey,
    activeJoynStations,
    activeWaipuStationKey,
    activeWaipuStations,
    availableJoynDayKey,
    availableWaipuDayKey,
    joynStationCatalog.days,
    joynStationCatalog.status,
    joynStationSelectionLoading,
    stationSelectionLoading,
    tvPeriodId,
    tvScheduleRequested,
    waipuStationCatalog.days,
    waipuStationCatalog.status,
  ])

  useEffect(() => {
    if (tvSchedule.status !== 'ready') return undefined
    const nextTransition = nextTvAiringTransition(tvSchedule.airings, tvClock)
    if (!Number.isFinite(nextTransition)) return undefined
    const timeout = window.setTimeout(
      () => setTvClock(Date.now()),
      Math.max(0, Math.min(2_147_483_647, nextTransition - Date.now() + 1_000)),
    )
    return () => window.clearTimeout(timeout)
  }, [tvClock, tvSchedule.airings, tvSchedule.status])

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
  const preWaipuTitles = useMemo(
    () => mergeTitlesWithSharedMediaCatalog(baseTitles, rawMovieHubTitles),
    [baseTitles, rawMovieHubTitles],
  )
  const waipuMergedTitles = useMemo(
    () => mergeWaipuLiveAvailability(preWaipuTitles, waipuLiveEntries, { now: waipuStatusClock }),
    [preWaipuTitles, waipuLiveEntries, waipuStatusClock],
  )
  const rawTitles = useMemo(
    () => mergeJoynLiveAvailability(waipuMergedTitles, joynLiveEntries, { now: waipuStatusClock }),
    [joynLiveEntries, waipuMergedTitles, waipuStatusClock],
  )
  const titles = useMemo(
    () => rawTitles.map((item) => resolvePresentationArtwork(item, artworkOptions)),
    [rawTitles, artworkOptions],
  )
  const movieHubTitles = useMemo(
    () => mergeJoynLiveAvailability(
      mergeWaipuLiveAvailability(rawMovieHubTitles, waipuLiveEntries, { now: waipuStatusClock }),
      joynLiveEntries,
      { now: waipuStatusClock },
    ).map((item) => resolvePresentationArtwork(item, artworkOptions)),
    [rawMovieHubTitles, waipuLiveEntries, joynLiveEntries, waipuStatusClock, artworkOptions],
  )
  const compactTvTitleEntries = useMemo(() => {
    const byKey = new Map()
    for (const entry of [...waipuLiveEntries, ...joynLiveEntries]) {
      const key = entry?.key || `${entry?.type || ''}:${entry?.tmdbId || ''}`
      if (!key || key === ':') continue
      const current = byKey.get(key)
      const airings = [
        ...(Array.isArray(current?.airings) ? current.airings : []),
        ...(Array.isArray(entry?.airings) ? entry.airings : [entry?.nextAiring].filter(Boolean)),
      ].sort((left, right) => String(left?.startTime || '').localeCompare(String(right?.startTime || '')))
      byKey.set(key, {
        ...(current || entry),
        ...entry,
        key,
        airings,
        nextAiring: airings[0] || null,
        airingCount: airings.length,
        providerIds: [...new Set([
          ...(Array.isArray(current?.providerIds) ? current.providerIds : []),
          ...(Array.isArray(entry?.providerIds) ? entry.providerIds : []),
        ])],
      })
    }
    return [...byKey.values()]
  }, [joynLiveEntries, waipuLiveEntries])

  const tvPresentationTitles = useMemo(() => {
    const byKey = new Map(titles.map((title) => [`${title?.type === 'series' || title?.mediaType === 'tv' ? 'series' : 'movie'}:${Number(title?.tmdbId) || ''}`, title]))
    for (const hydrated of tvHydratedTitles) {
      const type = hydrated?.type === 'series' || hydrated?.mediaType === 'tv' ? 'series' : 'movie'
      const tmdbId = Number(hydrated?.tmdbId)
      if (!Number.isInteger(tmdbId) || tmdbId <= 0) continue
      const key = `${type}:${tmdbId}`
      const current = byKey.get(key)
      byKey.set(key, current ? mergeEnrichedTitle(current, hydrated) : hydrated)
    }
    return [...byKey.values()]
  }, [titles, tvHydratedTitles])

  useEffect(() => {
    if (!Array.isArray(tvSchedule.airings) || !tvSchedule.airings.length) return undefined
    let cancelled = false
    const knownByKey = new Map(tvPresentationTitles.map((title) => {
      const type = title?.type === 'series' || title?.mediaType === 'tv' ? 'series' : 'movie'
      return [`${type}:${Number(title?.tmdbId) || ''}`, title]
    }))
    const entryByKey = new Map(compactTvTitleEntries.map((entry) => [entry?.key || `${entry?.type || ''}:${entry?.tmdbId || ''}`, entry]))
    const candidates = new Map()

    for (const airing of tvSchedule.airings) {
      const type = airing?.type === 'series' ? 'series' : airing?.type === 'movie' ? 'movie' : null
      const tmdbId = Number(airing?.tmdbId)
      if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0) continue
      const key = `${type}:${tmdbId}`
      const current = knownByKey.get(key)
      if (current && !titleNeedsMetadataEnrichment(current)) continue
      if (tvMetadataHydrationInFlightRef.current.has(key)) continue
      const entry = entryByKey.get(key)
      candidates.set(key, current || {
        id: `tv-metadata-${type}-${tmdbId}`,
        source: 'tmdb',
        tmdbId,
        type,
        mediaType: type === 'series' ? 'tv' : 'movie',
        title: String(airing?.title || entry?.nextAiring?.title || `TMDB #${tmdbId}`).trim(),
        originalTitle: String(airing?.title || entry?.nextAiring?.title || '').trim(),
        providerIds: [...new Set([
          ...(Array.isArray(entry?.providerIds) ? entry.providerIds : []),
          ...(Array.isArray(airing?.providerIds) ? airing.providerIds : []),
        ])],
        metadataComplete: false,
      })
    }

    const queue = [...candidates.entries()]
    if (!queue.length) return undefined
    for (const [key] of queue) tvMetadataHydrationInFlightRef.current.add(key)

    const workerCount = Math.min(4, queue.length)
    let cursor = 0
    const loaded = []

    async function worker() {
      while (cursor < queue.length) {
        const index = cursor
        cursor += 1
        const [key, candidate] = queue[index]
        try {
          const detail = await loadRuntimeTitleMetadata(candidate)
          if (detail?.tmdbId) loaded.push(detail)
        } catch (error) {
          console.warn('TV-TMDB-Metadaten konnten nicht ergänzt werden.', { key, error })
        } finally {
          tvMetadataHydrationInFlightRef.current.delete(key)
        }
      }
    }

    Promise.all(Array.from({ length: workerCount }, () => worker())).then(() => {
      if (cancelled || !loaded.length) return
      setTvHydratedTitles((current) => {
        const byKey = new Map(current.map((title) => {
          const type = title?.type === 'series' || title?.mediaType === 'tv' ? 'series' : 'movie'
          return [`${type}:${Number(title?.tmdbId) || ''}`, title]
        }))
        for (const detail of loaded) {
          const type = detail?.type === 'series' || detail?.mediaType === 'tv' ? 'series' : 'movie'
          const key = `${type}:${Number(detail?.tmdbId) || ''}`
          const existing = byKey.get(key)
          byKey.set(key, existing ? mergeEnrichedTitle(existing, detail) : detail)
        }
        return [...byKey.values()]
      })
    })

    return () => { cancelled = true }
  }, [compactTvTitleEntries, tvPresentationTitles, tvSchedule.airings])

  const tvViewModel = useMemo(() => buildWaipuTvViewModel({
    airings: tvSchedule.airings,
    titles: tvPresentationTitles,
    titleEntries: compactTvTitleEntries,
    stationOrder: combinedTvStationOrder,
    selectedPeriodId: tvPeriodId,
    availableDays: combinedTvDays,
    now: tvClock,
  }), [combinedTvDays, combinedTvStationOrder, compactTvTitleEntries, tvClock, tvPeriodId, tvPresentationTitles, tvSchedule.airings])
  const compactTvHeroItems = useMemo(() => buildWaipuTvHeroItems({
    titles: tvPresentationTitles,
    titleEntries: compactTvTitleEntries,
    stationOrder: combinedTvStationOrder,
    now: tvClock,
  }), [combinedTvStationOrder, compactTvTitleEntries, tvClock, tvPresentationTitles])
  const tvHeroItems = compactTvHeroItems.length ? compactTvHeroItems : tvViewModel.heroItems
  const tvScheduleSettled = tvSchedule.status !== 'idle' && tvSchedule.status !== 'loading'
  const tvHeroCatalogReady = waipuLiveStatus === 'ready'
    && joynLiveStatus === 'ready'
    && waipuStationCatalog.status !== 'loading'
    && joynStationCatalog.status !== 'loading'
    && !stationSelectionLoading
    && !joynStationSelectionLoading
    && (compactTvHeroItems.length > 0 || tvScheduleSettled)
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
    setProfileOpen(false)
    setContentActivationRequest(null)
    if (nextView === 'tv') {
      if (tvScheduleIntentTimerRef.current !== null) {
        window.clearTimeout(tvScheduleIntentTimerRef.current)
        tvScheduleIntentTimerRef.current = null
      }
      setTvPeriodId(`day:${tvDayKey(Date.now())}`)
      setTvScheduleRequested(true)
    }
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

  const handleOpenTitle = useCallback((item, displayedPosterUrl = null, { requireComplete = false } = {}) => {
    setProfileOpen(false)
    if (!detailSessionActiveRef.current) {
      const active = document.activeElement
      detailReturnFocusRef.current = active instanceof HTMLElement ? active : null
      detailSessionActiveRef.current = true
    }
    const presented = resolvePresentationArtwork(item, artworkOptions)
    const initiallySelected = {
      ...presented,
      displayPosterUrl: displayedPosterUrl || item?.displayPosterUrl || presented.displayPosterUrl,
    }
    detailRequestSequenceRef.current += 1
    const requestId = detailRequestSequenceRef.current
    setDetailRequest({ id: requestId, item: initiallySelected, requireComplete, error: null })

    if (!requireComplete && titleNeedsMetadataEnrichment(item)) {
      loadRuntimeTitleMetadata(item)
        .then((detail) => {
          if (titleNeedsMetadataEnrichment(detail)) return
          setWaipuLiveEntries((entries) => entries.map((entry) => {
            if (!sameTmdbTitle(entry, item)) return entry
            const hydrated = mergeEnrichedTitle({
              ...entry,
              id: entry.id || `tmdb-${entry.type}-${entry.tmdbId}`,
            }, detail)
            return {
              ...hydrated,
              key: entry.key,
              airings: entry.airings,
              nextAiring: entry.nextAiring,
              airingCount: entry.airingCount,
            }
          }))
          setSelectedTitle((current) => {
            if (!current || !sameTmdbTitle(current, item)) return current
            const hydrated = resolvePresentationArtwork(mergeEnrichedTitle(current, detail), artworkOptions)
            return {
              ...hydrated,
              displayPosterUrl: current.displayPosterUrl || hydrated.displayPosterUrl,
            }
          })
          setDetailRequest((current) => {
            if (!current || current.id !== requestId || !sameTmdbTitle(current.item, item)) return current
            const hydrated = resolvePresentationArtwork(mergeEnrichedTitle(current.item, detail), artworkOptions)
            return {
              ...current,
              item: {
                ...hydrated,
                displayPosterUrl: current.item.displayPosterUrl || hydrated.displayPosterUrl,
              },
            }
          })
        })
        .catch((error) => console.warn('Movie-Hub-Titelmetadaten konnten nicht progressiv ergänzt werden.', error))
    }
  }, [artworkOptions])

  useEffect(() => {
    if (!detailRequest) return undefined

    let cancelled = false
    if (detailRequest.error) return undefined

    const { id: requestId, item, requireComplete } = detailRequest

    async function prepareDetail() {
      await waitForDetailLoadingPaint()
      if (cancelled) return

      const preparedItem = await prepareDetailRequestItem(item, {
        requireComplete,
        artworkOptions,
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

      await Promise.all([
        preloadDetailImage(displayedItem.displayPosterUrl || displayedItem.posterUrl || null),
        mediaLoad,
      ])
      if (cancelled) return

      setDetailSharedMedia(sharedMedia)
      setDetailSharedMediaLoadError(sharedMediaLoadError)
      setSelectedTitle(displayedItem)
      setDetailRequest((current) => current?.id === requestId ? null : current)
    }

    prepareDetail().catch((error) => {
      console.warn('Movie-Hub-Detailansicht konnte nicht vollständig vorbereitet werden.', error)
      if (cancelled) return
      if (requireComplete) {
        setDetailRequest((current) => current?.id === requestId
          ? { ...current, error }
          : current)
        return
      }
      setDetailSharedMedia([])
      setDetailSharedMediaLoadError('Zusätzliche Detailinformationen konnten nicht geladen werden.')
      setSelectedTitle(item)
      setDetailRequest((current) => current?.id === requestId ? null : current)
    })

    return () => { cancelled = true }
  }, [artworkOptions, detailRequest, hasMovieHubTitle, sharedMediaCatalogLoading, user?.uid])

  const restoreDetailReturnFocus = useCallback(() => {
    const target = detailReturnFocusRef.current
    if (!target?.isConnected) return
    window.requestAnimationFrame(() => {
      if (target.isConnected) target.focus({ preventScroll: true })
    })
  }, [])

  const closeDetail = useCallback(() => {
    const detailWasMounted = Boolean(selectedTitle)
    setDetailRequest(null)
    setSelectedTitle(null)
    setDetailSharedMedia([])
    setDetailSharedMediaLoadError('')
    detailSessionActiveRef.current = false
    if (!detailWasMounted) restoreDetailReturnFocus()
  }, [restoreDetailReturnFocus, selectedTitle])

  const cancelDetailLoading = useCallback(() => {
    if (selectedTitle) {
      setDetailRequest(null)
      return
    }
    closeDetail()
  }, [closeDetail, selectedTitle])

  const retryDetailLoading = useCallback(() => {
    detailRequestSequenceRef.current += 1
    const requestId = detailRequestSequenceRef.current
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
    () => [
      ...buildProviderHomeRows(catalog.providerCatalogs, titles),
      ...rowDefinitions.filter((row) => !row.providerId).map((row) => ({
        ...row,
        displayLimit: Array.isArray(row.ids) ? row.ids.length : 0,
        items: (Array.isArray(row.ids) ? row.ids : []).map((id) => titles.find((item) => item.id === id)).filter(Boolean),
      })),
    ].filter((row) => row.items.length),
    [catalog.providerCatalogs, rowDefinitions, titles],
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
    () => buildPersonalTopHundredRows(personalCatalogTitles, getTitleState),
    [personalCatalogTitles, getTitleState, statesByKey],
  )
  const watchedHistoryRows = useMemo(
    () => buildWatchedHistoryRows(personalCatalogTitles, getTitleState),
    [personalCatalogTitles, getTitleState, statesByKey],
  )
  const tmdbRows = useMemo(() => buildTmdbCatalogRows(titles), [titles])
  const personalSmartRows = useMemo(
    () => buildPersonalSmartRows(
      publicTitles,
      activeProfile?.contentRowSettings,
      undefined,
      (items, row) => curateTitles(items, {
        mode: activeSortMode,
        seed: `${curationSeed}:smart:${row.id}`,
      }),
    ),
    [publicTitles, activeProfile?.contentRowSettings, activeSortMode, curationSeed],
  )
  const combinedPersonalRows = useMemo(
    () => [
      ...personalRows.filter((row) => row.id !== 'my-ratings'),
      ...personalTopHundredRows, ...tmdbRows, ...personalSmartRows,
    ],
    [personalRows, personalTopHundredRows, tmdbRows, personalSmartRows],
  )
  const personalTopTen = useMemo(
    () => buildPersonalTopTen(combinedPersonalRows, getTitleState),
    [combinedPersonalRows, getTitleState, statesByKey],
  )
  const personalDisplayRows = useMemo(
    () => {
      const regularRows = combinedPersonalRows.filter((row) => !row.id.startsWith('my-top-100-'))
      const rowsWithTopTen = insertTopTenRow(regularRows, {
        id: 'top-ten-personal',
        title: 'Deine persönliche Top 10',
        items: personalTopTen,
      })
      const topTenIndex = rowsWithTopTen.findIndex((row) => row.id === 'top-ten-personal')
      const insertionIndex = topTenIndex >= 0 ? topTenIndex + 1 : rowsWithTopTen.length
      return [
        ...rowsWithTopTen.slice(0, insertionIndex),
        ...watchedHistoryRows,
        ...personalTopHundredRows,
        ...rowsWithTopTen.slice(insertionIndex),
      ]
    },
    [combinedPersonalRows, personalTopTen, watchedHistoryRows, personalTopHundredRows],
  )
  const providerTopTenInput = useMemo(() => ({
    providerCatalogs: catalog.providerCatalogs,
    titles,
    movieHubTitles,
    enabledProviderIds,
  }), [catalog.providerCatalogs, titles, movieHubTitles, enabledProviderIds])
  const homeTopTen = useMemo(
    () => buildProviderTopTen(providerTopTenInput),
    [providerTopTenInput],
  )
  const movieTopTen = useMemo(
    () => buildProviderTopTen({ ...providerTopTenInput, mediaType: 'movie' }),
    [providerTopTenInput],
  )
  const seriesTopTen = useMemo(
    () => buildProviderTopTen({ ...providerTopTenInput, mediaType: 'series' }),
    [providerTopTenInput],
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
  const personalHeroes = useMemo(() => selectPersonalHeroItems(combinedPersonalRows), [combinedPersonalRows])
  const curatedHomeRows = useMemo(
    () => curateCatalogRows(
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
    ),
    [rawHomeRows, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey, enabledProviderIds, hasMovieHubTitle],
  )
  const curateMovieHubTitles = useCallback((items, seedSuffix) => curateTitles(items, {
    mode: activeSortMode,
    seed: `${curationSeed}:moviehub:${seedSuffix}`,
    watchedMode: contentDisplaySettings.watchedMode,
    getTitleState,
    limit: PUBLIC_POSTER_ROW_LIMIT,
  }), [activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey])
  const curatedMovieHubHomeTitles = useMemo(
    () => curateMovieHubTitles(movieHubTitles, 'home'),
    [movieHubTitles, curateMovieHubTitles],
  )
  const curatedMovieHubMovieTitles = useMemo(
    () => curateMovieHubTitles(movieHubTitles.filter((item) => item.type === 'movie'), 'movies'),
    [movieHubTitles, curateMovieHubTitles],
  )
  const curatedMovieHubSeriesTitles = useMemo(
    () => curateMovieHubTitles(movieHubTitles.filter((item) => item.type === 'series'), 'series'),
    [movieHubTitles, curateMovieHubTitles],
  )
  const movieHubHomeRows = useMemo(
    () => enabledProviderIds.includes('moviehub') ? buildMovieHubCatalogRows(curatedMovieHubHomeTitles) : [],
    [curatedMovieHubHomeTitles, enabledProviderIds],
  )
  const movieHubMovieRows = useMemo(
    () => enabledProviderIds.includes('moviehub') ? buildMovieHubCatalogRows(curatedMovieHubMovieTitles, 'movie') : [],
    [curatedMovieHubMovieTitles, enabledProviderIds],
  )
  const movieHubSeriesRows = useMemo(
    () => enabledProviderIds.includes('moviehub') ? buildMovieHubCatalogRows(curatedMovieHubSeriesTitles, 'series') : [],
    [curatedMovieHubSeriesTitles, enabledProviderIds],
  )
  const hasProviderCatalogs = Object.keys(catalog.providerCatalogs || {}).length > 0
  const providerMovieRows = useMemo(
    () => hasProviderCatalogs ? curateCatalogRows(
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
    ) : [],
    [catalog.providerCatalogs, titles, hasProviderCatalogs, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey, enabledProviderIds, hasMovieHubTitle],
  )
  const providerSeriesRows = useMemo(
    () => hasProviderCatalogs ? curateCatalogRows(
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
    ) : [],
    [catalog.providerCatalogs, titles, hasProviderCatalogs, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey, enabledProviderIds, hasMovieHubTitle],
  )
  const movieCategoryRows = useMemo(
    () => buildCategoryRows({
      titles,
      mediaType: 'movie',
      enabledCategoryIds: activeProfile?.categorySettings?.enabledMovieCategoryIds,
      enabledProviderIds,
      sortItems: (items, category) => curateTitles(items, {
        mode: activeSortMode,
        seed: `${curationSeed}:category-movie:${category.id}`,
        watchedMode: contentDisplaySettings.watchedMode,
        getTitleState,
      }),
    }),
    [titles, activeProfile?.categorySettings?.enabledMovieCategoryIds, enabledProviderIds, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey],
  )
  const seriesCategoryRows = useMemo(
    () => buildCategoryRows({
      titles,
      mediaType: 'series',
      enabledCategoryIds: activeProfile?.categorySettings?.enabledSeriesCategoryIds,
      enabledProviderIds,
      sortItems: (items, category) => curateTitles(items, {
        mode: activeSortMode,
        seed: `${curationSeed}:category-series:${category.id}`,
        watchedMode: contentDisplaySettings.watchedMode,
        getTitleState,
      }),
    }),
    [titles, activeProfile?.categorySettings?.enabledSeriesCategoryIds, enabledProviderIds, activeSortMode, curationSeed, contentDisplaySettings.watchedMode, getTitleState, statesByKey],
  )
  const movieBrowseBaseRows = useMemo(
    () => [...movieCategoryRows, ...movieHubMovieRows, ...providerMovieRows],
    [movieCategoryRows, movieHubMovieRows, providerMovieRows],
  )
  const movieBrowseRows = useMemo(
    () => insertTopTenRow(movieBrowseBaseRows, {
      id: 'top-ten-movies',
      title: 'Top 10 Filme bei deinen Anbietern',
      items: movieTopTen,
    }),
    [movieBrowseBaseRows, movieTopTen],
  )
  const seriesBrowseBaseRows = useMemo(
    () => [...seriesCategoryRows, ...movieHubSeriesRows, ...providerSeriesRows],
    [seriesCategoryRows, movieHubSeriesRows, providerSeriesRows],
  )
  const seriesBrowseRows = useMemo(
    () => insertTopTenRow(seriesBrowseBaseRows, {
      id: 'top-ten-series',
      title: 'Top 10 Serien bei deinen Anbietern',
      items: seriesTopTen,
    }),
    [seriesBrowseBaseRows, seriesTopTen],
  )
  const homeBaseRows = useMemo(
    () => [
      ...movieHubHomeRows,
      ...curatedHomeRows,
      ...(!libraryLoading && !libraryError ? personalRows : []),
      ...tmdbRows,
    ],
    [movieHubHomeRows, curatedHomeRows, libraryLoading, libraryError, personalRows, tmdbRows],
  )
  const homeRows = useMemo(
    () => insertTopTenRow(homeBaseRows, {
      id: 'top-ten-home',
      title: 'Top 10 bei deinen Anbietern',
      items: homeTopTen,
    }),
    [homeBaseRows, homeTopTen],
  )
  const heroItemsByView = useMemo(() => ({
    home: homeHeroes,
    movies: movieHeroes,
    series: seriesHeroes,
    tv: tvHeroItems,
    library: personalHeroes,
  }), [homeHeroes, movieHeroes, personalHeroes, seriesHeroes, tvHeroItems])
  const handleViewIntent = useCallback((nextView) => {
    if (tvScheduleIntentTimerRef.current !== null) {
      window.clearTimeout(tvScheduleIntentTimerRef.current)
      tvScheduleIntentTimerRef.current = null
    }
    if (nextView === 'tv' && !tvScheduleRequested) {
      tvScheduleIntentTimerRef.current = window.setTimeout(() => {
        tvScheduleIntentTimerRef.current = null
        setTvScheduleRequested(true)
      }, HERO_PRELOAD_INTENT_DELAY_MS)
    }
    preloadHeroImage(heroItemsByView[nextView])
  }, [heroItemsByView, tvScheduleRequested])
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
        <TvView
          rows={tvViewModel.rows}
          heroItems={tvHeroItems}
          heroReadyEnabled={tvHeroCatalogReady}
          activationRequest={contentActivationRequest?.viewId === 'tv' ? contentActivationRequest : null}
          onActivationUnavailable={handleHeroActivationUnavailable}
          periods={tvViewModel.periods}
          selectedPeriodId={tvViewModel.selectedPeriod.id}
          onPeriodChange={setTvPeriodId}
          status={tvSchedule.status === 'idle' ? 'loading' : tvSchedule.status}
          onOpen={handleOpenTitle}
        />
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
        <SearchView
          publicTitles={publicTitles}
          personalTitles={tmdbPersonalTitles}
          movieHubTitles={movieHubTitles}
          fullTitles={titles}
          onOpen={handleOpenTitle}
        />
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
        <ProfileView
          user={user}
          onSignOut={handleSignOut}
          publicTitles={publicTitles}
          smartFilterOptions={catalog.smartFilterOptions}
        />
      )}
      {currentView === 'settings' && (
        <SettingsView
          waipuStations={waipuStationCatalog.stations}
          waipuStationStatus={waipuStationCatalog.status}
          joynStations={joynStationCatalog.stations}
          joynStationStatus={joynStationCatalog.status}
        />
      )}
      {currentView === 'about' && <AboutView />}
      {selectedTitle && (
        <DetailModal
          item={selectedTitle}
          collections={catalog.collections}
          titles={titles}
          initialSharedMedia={detailSharedMedia}
          sharedMediaPreloaded
          sharedMediaLoadError={detailSharedMediaLoadError}
          returnFocusTarget={detailReturnFocusRef.current}
          onSelectTitle={handleOpenTitle}
          onClose={closeDetail}
        />
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
