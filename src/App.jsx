import { useCallback, useMemo, useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import ContentRow from './components/ContentRow.jsx'
import DetailModal from './components/DetailModal.jsx'
import Hero from './components/Hero.jsx'
import PosterCard from './components/PosterCard.jsx'
import ProfileView from './components/ProfileView.jsx'
import { rowDefinitions, titles } from './data/catalog.js'
import { useAuth } from './hooks/useAuth.js'
import { useDpadNavigation } from './hooks/useDpadNavigation.js'
import { firebaseReady } from './lib/firebase.js'

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

function Header({ currentView, onViewChange, user, onSignOut, profileOpen, onProfileToggle, onProfileClose }) {
  const navItems = [
    ['home', 'Home'],
    ['movies', 'Filme'],
    ['series', 'Serien'],
    ['library', 'Meine Inhalte'],
  ]

  function openProfileSettings() {
    onProfileClose()
    onViewChange('profile')
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
            aria-label="Profil öffnen"
            aria-expanded={profileOpen}
          >
            <span className="avatar">M</span><span className="profile-label">Profil</span>
          </button>
          {profileOpen && (
            <div className="profile-menu" role="menu" aria-label="Profilmenü">
              <strong>Movie-Hub-Profil</strong>
              <span>{user.email}</span>
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

function SearchView({ onOpen }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('de')
    if (!normalized) return titles
    return titles.filter((item) => `${item.title} ${item.genre}`.toLocaleLowerCase('de').includes(normalized))
  }, [query])

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

function MovieHub({ user }) {
  const [currentView, setCurrentView] = useState('home')
  const [selectedTitle, setSelectedTitle] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const heroItem = titles[0]

  const handleViewChange = useCallback((nextView) => {
    setProfileOpen(false)
    setCurrentView(nextView)
  }, [])

  const handleOpenTitle = useCallback((item) => {
    setProfileOpen(false)
    setSelectedTitle(item)
  }, [])

  const handleBack = useCallback(() => {
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

    // Auf Home wird der Zurück-Impuls bewusst nicht geschluckt. In der
    // späteren Fire-TV-Hülle kann dadurch die native App-Navigation übernehmen.
    return false
  }, [currentView, profileOpen, selectedTitle])

  useDpadNavigation({
    detailOpen: Boolean(selectedTitle),
    profileMenuOpen: profileOpen,
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
    })),
    [],
  )
  const movies = titles.filter((item) => item.type === 'movie')
  const series = titles.filter((item) => item.type === 'series')
  const library = titles.filter((item) => ['dune-2', 'shogun', 'arrival', 'severance', 'oppenheimer', 'dark'].includes(item.id))

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
      />
      {currentView === 'home' && (
        <main>
          <Hero item={heroItem} onOpen={handleOpenTitle} />
          <div className="rows-wrap">
            <div className="prototype-strip"><strong>Phase 1 Prototyp</strong><span>Kontrollierte Testdaten · echte TMDB-Daten folgen in Phase 2</span></div>
            {rows.map((row) => <ContentRow key={row.id} title={row.title} items={row.items} onOpen={handleOpenTitle} />)}
          </div>
        </main>
      )}
      {currentView === 'movies' && <BrowseView title="Filme" subtitle="Deine Filmwelt – später gespeist aus TMDB und deinen Streamingdiensten." items={movies} onOpen={handleOpenTitle} />}
      {currentView === 'series' && <BrowseView title="Serien" subtitle="Serien entdecken, merken und später direkt beim passenden Anbieter öffnen." items={series} onOpen={handleOpenTitle} />}
      {currentView === 'library' && <BrowseView title="Meine Inhalte" subtitle="Der vorbereitete Platz für Favoriten, Watchlist, Bewertungen und Gesehenes." items={library} onOpen={handleOpenTitle} />}
      {currentView === 'search' && <SearchView onOpen={handleOpenTitle} />}
      {currentView === 'profile' && <ProfileView user={user} onSignOut={handleSignOut} />}
      {selectedTitle && <DetailModal item={selectedTitle} onClose={() => setSelectedTitle(null)} />}
    </div>
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

  return user ? <MovieHub user={user} /> : <Login />
}
