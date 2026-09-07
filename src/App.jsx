import { useCallback, useEffect, useMemo, useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import ContentRow from './components/ContentRow.jsx'
import DetailModal from './components/DetailModal.jsx'
import Hero from './components/Hero.jsx'
import PosterCard from './components/PosterCard.jsx'
import ProfileView from './components/ProfileView.jsx'
import { rowDefinitions as fallbackRowDefinitions, titles as fallbackTitles } from './data/catalog.js'
import { useAuth } from './hooks/useAuth.js'
import { useDpadNavigation } from './hooks/useDpadNavigation.js'
import { useLibrary } from './library/LibraryProvider.jsx'
import { buildPersonalRows, mergeCatalogWithPersonalSnapshots } from './library/personalRows.js'
import { firebaseReady } from './lib/firebase.js'
import { ProfileProvider, useProfiles } from './profiles/ProfileProvider.jsx'
import { ThemeProvider } from './theme/ThemeProvider.jsx'

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

  function handleProfileSelect(profileId) {
    onProfileSelect(profileId)
    onProfileClose()
  }

  return (
    <header className="topbar">
      <button type="button" className="brand brand-button" onClick={() => onViewChange('home')} data-focusable="true">MOVIE <span>HUB</span></button>
      <nav className="main-nav" aria-label="Hauptnavigation">
        {navItems.map(([id, label]) => (
          <button type="button" key={id} className={currentView === id ? 'nav-link active' : 'nav-link'} onClick={() => onViewChange(id)} data-focusable="true">{label}</button>
        ))}
      </nav>
      <div className="top-actions">
        <button type="button" className={currentView === 'search' ? 'icon-button active' : 'icon-button'} onClick={() => onViewChange('search')} data-focusable="true" aria-label="Suche">⌕</button>
        <div className="profile-wrap">
          <button
            type="button"
            className={currentView === 'profile' ? 'profile-button active' : 'profile-button'}
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
              <button type="button" onClick={onSignOut} data-focusable="true" role="menuitem">Abmelden</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function BrowseView({ title, subtitle, items, onOpen }) {
  return (
    <main className="browse-page">
      <div className="page-heading">
        <p className="eyebrow">Movie Hub</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="poster-grid">
        {items.map((item) => <PosterCard key={item.id} item={item} onOpen={onOpen} />)}
      </div>
    </main>
  )
}

function PersonalLibraryView({ rows, onOpen, profileName, loading, error }) {
  return (
    <main className="browse-page personal-library-page">
      <div className="page-heading">
        <p className="eyebrow">{profileName ?? 'Movie Hub'}</p>
        <h1>Meine Inhalte</h1>
        <p>Deine Watchlist, Favoriten, gesehenen Titel und persönlichen Bewertungen – getrennt für dieses Profil.</p>
      </div>

      {loading && <p className="loading-copy">Persönliche Inhalte werden geladen …</p>}
      {error && <p className="error">Persönliche Inhalte konnten nicht geladen werden: {error.message}</p>}

      {!loading && !error && rows.length === 0 && (
        <section className="library-empty-state">
          <p className="settings-kicker">Noch leer</p>
          <h2>Deine persönlichen Reihen entstehen hier automatisch.</h2>
          <p>Öffne einen Film oder eine Serie und markiere ihn als Favorit, für später, gesehen oder gib eine Bewertung ab.</p>
        </section>
      )}

      {rows.length > 0 && (
        <div className="rows-wrap personal-library-rows">
          {rows.map((row) => <ContentRow key={row.id} title={row.title} items={row.items} onOpen={onOpen} />)}
        </div>
      )}
    </main>
  )
}

function SearchView({ titles, onOpen }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('de')
    if (!normalized) return titles
    return titles.filter((item) => {
      const haystack = `${item.title || ''} ${item.originalTitle || ''} ${item.genre || ''}`.toLocaleLowerCase('de')
      return haystack.includes(normalized)
    })
  }, [query, titles])

  return (
    <main className="browse-page search-page">
      <div className="page-heading">
        <p className="eyebrow">Schnell finden</p>
        <h1>Suche</h1>
      </div>
      <label className="search-box">
        <span>⌕</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Film, Serie oder Genre …"
          aria-label="Filme und Serien suchen"
          data-focusable="true"
        />
      </label>
      <p className="result-count">{results.length} Treffer</p>
      <div className="poster-grid">
        {results.map((item) => <PosterCard key={item.id} item={item} onOpen={onOpen} />)}
      </div>
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
  const [currentView, setCurrentView] = useState('home')
  const [selectedTitle, setSelectedTitle] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [exitDialogOpen, setExitDialogOpen] = useState(false)
  const [catalog, setCatalog] = useState({
    source: 'fallback',
    titles: fallbackTitles,
    rowDefinitions: fallbackRowDefinitions,
  })

  useEffect(() => {
    let cancelled = false

    async function loadCatalog() {
      try {
        const response = await fetch('/catalog.json', { cache: 'no-store' })
        if (!response.ok) throw new Error(`Katalog konnte nicht geladen werden (${response.status})`)
        const data = await response.json()

        if (!Array.isArray(data.titles) || !data.titles.length || !Array.isArray(data.rowDefinitions)) return
        if (!cancelled) {
          setCatalog({
            source: data.source === 'tmdb' ? 'tmdb' : 'fallback',
            titles: data.titles,
            rowDefinitions: data.rowDefinitions,
            generatedAt: data.generatedAt || null,
          })
        }
      } catch (error) {
        console.warn('Movie Hub verwendet den lokalen Katalog-Fallback.', error)
      }
    }

    loadCatalog()
    return () => { cancelled = true }
  }, [])

  const titles = catalog.titles.length ? catalog.titles : fallbackTitles
  const rowDefinitions = catalog.rowDefinitions.length ? catalog.rowDefinitions : fallbackRowDefinitions
  const heroItem = titles[0]

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
    // Android asks whether Movie Hub still has a UI layer to close. At the
    // root it asks this themed React surface to display the confirmation.
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
    const { auth } = await firebaseReady
    await signOut(auth)
  }

  const rows = useMemo(
    () => rowDefinitions.map((row) => ({
      ...row,
      items: row.ids.map((id) => titles.find((item) => item.id === id)).filter(Boolean),
    })).filter((row) => row.items.length),
    [rowDefinitions, titles],
  )
  const personalRows = useMemo(
    () => buildPersonalRows(mergeCatalogWithPersonalSnapshots(titles, statesByKey), getTitleState),
    [titles, statesByKey, getTitleState],
  )
  const movies = titles.filter((item) => item.type === 'movie')
  const series = titles.filter((item) => item.type === 'series')
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
      />
      {currentView === 'home' && (
        <main>
          <Hero item={heroItem} onOpen={handleOpenTitle} />
          <div className="rows-wrap">
            <div className="prototype-strip">
              <strong>{liveTmdb ? 'Echte TMDB-Daten' : 'Entwicklungsfallback'}</strong>
              <span>{liveTmdb ? 'Filme & Serien · deutsche Metadaten · Poster & Backdrops' : 'Der Live-TMDB-Katalog konnte noch nicht geladen werden.'}</span>
            </div>
            {!libraryLoading && !libraryError && personalRows.map((row) => (
              <ContentRow key={row.id} title={row.title} items={row.items} onOpen={handleOpenTitle} />
            ))}
            {rows.map((row) => <ContentRow key={row.id} title={row.title} items={row.items} onOpen={handleOpenTitle} />)}
          </div>
        </main>
      )}
      {currentView === 'movies' && <BrowseView title="Filme" subtitle="Echte Filmdaten aus TMDB in der Movie-Hub-Oberfläche." items={movies} onOpen={handleOpenTitle} />}
      {currentView === 'series' && <BrowseView title="Serien" subtitle="Echte Seriendaten aus TMDB – auf dieselbe ruhige TV-Oberfläche reduziert." items={series} onOpen={handleOpenTitle} />}
      {currentView === 'library' && (
        <PersonalLibraryView
          rows={personalRows}
          onOpen={handleOpenTitle}
          profileName={activeProfile?.displayName}
          loading={libraryLoading}
          error={libraryError}
        />
      )}
      {currentView === 'search' && <SearchView titles={titles} onOpen={handleOpenTitle} />}
      {currentView === 'profile' && <ProfileView user={user} onSignOut={handleSignOut} />}
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
      <main className="auth-shell">
        <section className="auth-panel">
          <p className="eyebrow">Movie Hub</p>
          <h1>Profile konnten nicht geladen werden</h1>
          <p className="error">{error?.message ?? 'Kein aktives Profil verfügbar.'}</p>
        </section>
      </main>
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
      <main className="auth-shell">
        <section className="auth-panel">
          <p className="eyebrow">Movie Hub</p>
          <h1>Firebase konnte nicht initialisiert werden</h1>
          <p className="error">{error.message}</p>
        </section>
      </main>
    )
  }

  return user ? (
    <ProfileProvider user={user}>
      <AuthenticatedMovieHub user={user} />
    </ProfileProvider>
  ) : <Login />
}
