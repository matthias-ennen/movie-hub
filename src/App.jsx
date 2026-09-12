import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import AboutView from './components/AboutView.jsx'
import DetailModal from './components/DetailModal.jsx'
import Hero from './components/Hero.jsx'
import { ProgressivePosterGrid, ProgressiveRows } from './components/ProgressiveContent.jsx'
import ProfileView from './components/ProfileView.jsx'
import SearchView from './components/SearchView.jsx'
import SettingsView from './components/SettingsView.jsx'
import { buildCategoryRows } from './catalog/categoryRows.js'
import { buildPersonalSmartRows, normalizeSmartFilterOptions } from './catalog/personalSmartRows.js'
import { buildProviderBrowseRows, buildProviderHomeRows } from './catalog/providerCatalogRows.js'
import { selectCoordinatedHeroItems, selectPersonalHeroItems } from './catalog/heroSelection.js'
import { buildMovieHubCatalogRows } from './catalog/movieHubCatalog.js'
import { curateCatalogRows, curateTitles, hasEnabledAvailability, PUBLIC_POSTER_ROW_LIMIT } from './catalog/contentCuration.js'
import { getContentPeriodKey, normalizeContentDisplaySettings, resolveContentSortMode } from './catalog/contentDisplaySettings.js'
import { rowDefinitions as fallbackRowDefinitions, titles as fallbackTitles } from './data/catalog.js'
import { useAuth } from './hooks/useAuth.js'
import { useDpadNavigation } from './hooks/useDpadNavigation.js'
import { useHeroFirstPage } from './hooks/useHeroFirstPage.js'
import { useCurationClock } from './hooks/useCurationClock.js'
import { useProviderSelection } from './settings/useProviderSelection.js'
import { useLibrary } from './library/LibraryProvider.jsx'
import { buildPersonalRows, mergeCatalogWithPersonalSnapshots } from './library/personalRows.js'
import { useSharedMediaCatalog } from './library/useSharedMediaCatalog.js'
import { mergeSharedMediaCatalogTitles, mergeTitlesWithSharedMediaCatalog } from './library/sharedMediaCatalogModel.js'
import { firebaseReady } from './lib/firebase.js'
import { preloadHeroImage } from './performance/progressiveRendering.js'
import { notifyNativeStartupReady } from './performance/nativeStartup.js'
import { ProfileProvider, useProfiles } from './profiles/ProfileProvider.jsx'
import { ThemeProvider } from './theme/ThemeProvider.jsx'
import { TmdbCatalogProvider, useTmdbCatalog } from './tmdb/TmdbCatalogProvider.jsx'
import { buildTmdbCatalogRows, mergePublicAndPersonalCatalog } from './tmdb/tmdbCatalogModel.js'

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
        onClick={() => onViewChange('home')}
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
            onClick={() => onViewChange(id)}
            onFocus={() => onViewIntent(id)}
            onPointerEnter={() => onViewIntent(id)}
            data-focusable="true"
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="top-actions">
        <button type="button" className={currentView === 'search' ? 'icon-button active' : 'icon-button'} onClick={() => onViewChange('search')} data-focusable="true" aria-label="Suche">⌕</button>
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

function BrowseView({ viewId, title, subtitle, items, rows = [], heroItems = [], onOpen }) {
  const { heroReady, handleHeroReady } = useHeroFirstPage(viewId)

  return (
    <main className="category-page" data-page-load-state={heroReady ? 'rows' : 'hero'}>
      <Hero items={heroItems} onOpen={onOpen} eyebrow={title} onReady={handleHeroReady} />
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
    </main>
  )
}

function HomeView({ heroItems, rows, onOpen, liveTmdb, catalogStatus }) {
  const { heroReady, handleHeroReady } = useHeroFirstPage('home')
  const startupReadyReportedRef = useRef(false)
  const catalogReady = catalogStatus === 'ready'
  const handleInitialContentReady = useCallback(() => {
    if (!catalogReady || startupReadyReportedRef.current) return
    startupReadyReportedRef.current = true
    notifyNativeStartupReady()
  }, [catalogReady])

  return (
    <main data-page-load-state={heroReady ? 'rows' : 'hero'}>
      <Hero
        items={heroItems}
        onOpen={onOpen}
        onReady={catalogReady ? handleHeroReady : undefined}
      />
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
    </main>
  )
}

function PersonalLibraryView({ rows, heroItems = [], onOpen, profileName, loading, error }) {
  const { heroReady, handleHeroReady } = useHeroFirstPage('library')

  return (
    <main className="personal-library-shell" data-page-load-state={heroReady ? 'rows' : 'hero'}>
      <Hero items={heroItems} onOpen={onOpen} eyebrow="Meine Inhalte" onReady={handleHeroReady} />
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
    </main>
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
  const { getTitleState, statesByKey, loading: libraryLoading, error: libraryError } = useLibrary()
  const { personalTitles: tmdbPersonalTitles } = useTmdbCatalog()
  const { enabledProviderIds } = useProviderSelection()
  const { entries: sharedMediaCatalogEntries, hasTitle: hasMovieHubTitle } = useSharedMediaCatalog()
  const curationDayKey = useCurationClock()
  const [currentView, setCurrentView] = useState('home')
  const [selectedTitle, setSelectedTitle] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [exitDialogOpen, setExitDialogOpen] = useState(false)
  const [catalog, setCatalog] = useState({
    status: 'loading',
    source: 'fallback',
    titles: fallbackTitles,
    rowDefinitions: fallbackRowDefinitions,
    providerCatalogs: {},
    smartFilterOptions: normalizeSmartFilterOptions(),
  })

  useEffect(() => {
    let cancelled = false

    async function loadCatalog() {
      try {
        const response = await fetch('/catalog.json', { cache: 'no-store' })
        if (!response.ok) throw new Error(`Katalog konnte nicht geladen werden (${response.status})`)
        const data = await response.json()

        if (!Array.isArray(data.titles) || !data.titles.length || !Array.isArray(data.rowDefinitions)) {
          throw new Error('Der geladene Katalog ist unvollständig.')
        }
        if (!cancelled) {
          setCatalog({
            status: 'ready',
            source: data.source === 'tmdb' ? 'tmdb' : 'fallback',
            titles: data.titles,
            rowDefinitions: data.rowDefinitions,
            providerCatalogs: data.providerCatalogs && typeof data.providerCatalogs === 'object' ? data.providerCatalogs : {},
            smartFilterOptions: normalizeSmartFilterOptions(data.smartFilterOptions),
            generatedAt: data.generatedAt || null,
          })
        }
      } catch (error) {
        console.warn('Movie Hub verwendet den lokalen Katalog-Fallback.', error)
        if (!cancelled) {
          setCatalog((current) => ({ ...current, status: 'error' }))
        }
      }
    }

    loadCatalog()
    return () => { cancelled = true }
  }, [])

  const publicTitles = catalog.titles.length ? catalog.titles : fallbackTitles
  const baseTitles = useMemo(
    () => mergePublicAndPersonalCatalog(publicTitles, tmdbPersonalTitles),
    [publicTitles, tmdbPersonalTitles],
  )
  const movieHubTitles = useMemo(
    () => mergeSharedMediaCatalogTitles(sharedMediaCatalogEntries, baseTitles),
    [sharedMediaCatalogEntries, baseTitles],
  )
  const titles = useMemo(
    () => mergeTitlesWithSharedMediaCatalog(baseTitles, movieHubTitles),
    [baseTitles, movieHubTitles],
  )
  const rowDefinitions = catalog.rowDefinitions.length ? catalog.rowDefinitions : fallbackRowDefinitions
  const contentDisplaySettings = useMemo(
    () => normalizeContentDisplaySettings(activeProfile?.contentDisplaySettings),
    [activeProfile?.contentDisplaySettings],
  )
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
    setCurrentView(nextView)
  }, [])

  const handleOpenTitle = useCallback((item) => {
    setProfileOpen(false)
    setSelectedTitle(item)
  }, [])

  const closeInteractiveLayer = useCallback(() => {
    if (selectedTitle) {
      if (window.__movieHubDetailBack?.()) return true
      setSelectedTitle(null)
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
  }, [currentView, profileOpen, selectedTitle])

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
    detailOpen: Boolean(selectedTitle),
    profileMenuOpen: profileOpen,
    exitDialogOpen,
    onBack: handleBack,
  })

  async function handleSignOut() {
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
  const personalRows = useMemo(
    () => buildPersonalRows(mergeCatalogWithPersonalSnapshots(titles, statesByKey), getTitleState),
    [titles, statesByKey, getTitleState],
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
    () => [...personalRows, ...tmdbRows, ...personalSmartRows],
    [personalRows, tmdbRows, personalSmartRows],
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
  const coordinatedHeroes = useMemo(
    () => selectCoordinatedHeroItems(curatedPublicTitles),
    [curatedPublicTitles],
  )
  const homeHeroes = coordinatedHeroes.home
  const movieHeroes = coordinatedHeroes.movies
  const seriesHeroes = coordinatedHeroes.series
  const movies = useMemo(() => curatedPublicTitles.filter((item) => item.type === 'movie'), [curatedPublicTitles])
  const series = useMemo(() => curatedPublicTitles.filter((item) => item.type === 'series'), [curatedPublicTitles])
  const personalHeroes = useMemo(() => selectPersonalHeroItems(combinedPersonalRows), [combinedPersonalRows])
  const curatedHomeRows = useMemo(
    () => curateCatalogRows(
      rawHomeRows.map((row) => ({
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
      buildProviderBrowseRows(catalog.providerCatalogs, titles, 'movie').map((row) => ({
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
      buildProviderBrowseRows(catalog.providerCatalogs, titles, 'series').map((row) => ({
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
  const movieBrowseRows = useMemo(
    () => [...movieCategoryRows, ...movieHubMovieRows, ...providerMovieRows],
    [movieCategoryRows, movieHubMovieRows, providerMovieRows],
  )
  const seriesBrowseRows = useMemo(
    () => [...seriesCategoryRows, ...movieHubSeriesRows, ...providerSeriesRows],
    [seriesCategoryRows, movieHubSeriesRows, providerSeriesRows],
  )
  const homeRows = useMemo(
    () => [
      ...movieHubHomeRows,
      ...curatedHomeRows,
      ...(!libraryLoading && !libraryError ? personalRows : []),
      ...tmdbRows,
    ],
    [movieHubHomeRows, curatedHomeRows, libraryLoading, libraryError, personalRows, tmdbRows],
  )
  const heroItemsByView = useMemo(() => ({
    home: homeHeroes,
    movies: movieHeroes,
    series: seriesHeroes,
    library: personalHeroes,
  }), [homeHeroes, movieHeroes, personalHeroes, seriesHeroes])
  const handleViewIntent = useCallback((nextView) => {
    preloadHeroImage(heroItemsByView[nextView])
  }, [heroItemsByView])
  const liveTmdb = catalog.source === 'tmdb'

  return (
    <div className="app-shell">
      <Header
        currentView={currentView}
        onViewChange={handleViewChange}
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
          onOpen={handleOpenTitle}
        />
      )}
      {currentView === 'library' && (
        <PersonalLibraryView
          rows={combinedPersonalRows}
          heroItems={personalHeroes}
          onOpen={handleOpenTitle}
          profileName={activeProfile?.displayName}
          loading={libraryLoading}
          error={libraryError}
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
      {currentView === 'profile' && (
        <ProfileView
          user={user}
          onSignOut={handleSignOut}
          publicTitles={publicTitles}
          smartFilterOptions={catalog.smartFilterOptions}
        />
      )}
      {currentView === 'settings' && <SettingsView />}
      {currentView === 'about' && <AboutView />}
      {selectedTitle && <DetailModal item={selectedTitle} onClose={() => setSelectedTitle(null)} />}
      {exitDialogOpen && <ExitConfirmationDialog onCancel={() => setExitDialogOpen(false)} onClose={closeApp} />}
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
