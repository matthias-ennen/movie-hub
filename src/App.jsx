import { useEffect, useMemo, useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { useAuth } from './hooks/useAuth.js'
import { firebaseReady } from './lib/firebase.js'

const providers = {
  netflix: { label: 'Netflix', short: 'N' },
  prime: { label: 'Prime Video', short: 'P' },
  disney: { label: 'Disney+', short: 'D+' },
  youtube: { label: 'YouTube', short: 'YT' },
  waipu: { label: 'waipu.tv', short: 'W' },
}

const titles = [
  {
    id: 'dune-2',
    title: 'Dune: Part Two',
    type: 'movie',
    year: 2024,
    meta: '2 Std. 46 Min.',
    genre: 'Science-Fiction · Abenteuer',
    description: 'Paul Atreides verbündet sich mit Chani und den Fremen und stellt sich der Entscheidung über das Schicksal von Arrakis.',
    providerIds: ['prime', 'youtube'],
    accent: '#c88953',
    accent2: '#50311f',
    score: '8,4',
  },
  {
    id: 'blade-runner',
    title: 'Blade Runner 2049',
    type: 'movie',
    year: 2017,
    meta: '2 Std. 44 Min.',
    genre: 'Science-Fiction · Thriller',
    description: 'Ein neuer Blade Runner stößt auf ein lange verborgenes Geheimnis und sucht nach einem früheren LAPD-Blade-Runner.',
    providerIds: ['netflix', 'prime'],
    accent: '#d45d36',
    accent2: '#23314c',
    score: '8,0',
  },
  {
    id: 'arrival',
    title: 'Arrival',
    type: 'movie',
    year: 2016,
    meta: '1 Std. 56 Min.',
    genre: 'Science-Fiction · Drama',
    description: 'Eine Linguistin versucht, die Sprache außerirdischer Besucher zu entschlüsseln, bevor die globale Lage eskaliert.',
    providerIds: ['prime'],
    accent: '#7199a7',
    accent2: '#25353a',
    score: '7,9',
  },
  {
    id: 'interstellar',
    title: 'Interstellar',
    type: 'movie',
    year: 2014,
    meta: '2 Std. 49 Min.',
    genre: 'Science-Fiction · Drama',
    description: 'Eine Expedition durch ein Wurmloch sucht nach einer neuen Heimat für die Menschheit.',
    providerIds: ['netflix', 'prime'],
    accent: '#6d8291',
    accent2: '#1a212b',
    score: '8,7',
  },
  {
    id: 'oppenheimer',
    title: 'Oppenheimer',
    type: 'movie',
    year: 2023,
    meta: '3 Std.',
    genre: 'Drama · Geschichte',
    description: 'Das Leben des Physikers J. Robert Oppenheimer und die Entwicklung der ersten Atombombe.',
    providerIds: ['prime', 'youtube'],
    accent: '#d76c2d',
    accent2: '#421d10',
    score: '8,3',
  },
  {
    id: 'shogun',
    title: 'Shōgun',
    type: 'series',
    year: 2024,
    meta: '1 Staffel',
    genre: 'Drama · Geschichte',
    description: 'Machtkämpfe im Japan des Jahres 1600 verbinden das Schicksal eines englischen Seefahrers mit dem eines mächtigen Fürsten.',
    providerIds: ['disney'],
    accent: '#b04a35',
    accent2: '#321b18',
    score: '8,6',
  },
  {
    id: 'severance',
    title: 'Severance',
    type: 'series',
    year: 2022,
    meta: '2 Staffeln',
    genre: 'Mystery · Science-Fiction',
    description: 'Angestellte trennen ihre Erinnerungen an Beruf und Privatleben – bis die Grenzen des Systems zu bröckeln beginnen.',
    providerIds: ['prime'],
    accent: '#57777b',
    accent2: '#182628',
    score: '8,7',
  },
  {
    id: 'dark',
    title: 'Dark',
    type: 'series',
    year: 2017,
    meta: '3 Staffeln',
    genre: 'Mystery · Science-Fiction',
    description: 'Das Verschwinden eines Kindes führt vier Familien in ein Geflecht aus Geheimnissen, Zeitschleifen und Generationen.',
    providerIds: ['netflix'],
    accent: '#4f6672',
    accent2: '#121a1e',
    score: '8,7',
  },
  {
    id: 'expanse',
    title: 'The Expanse',
    type: 'series',
    year: 2015,
    meta: '6 Staffeln',
    genre: 'Science-Fiction · Drama',
    description: 'Zwischen Erde, Mars und dem Asteroidengürtel droht ein Konflikt, der die Menschheit verändern könnte.',
    providerIds: ['prime'],
    accent: '#497ea8',
    accent2: '#16283a',
    score: '8,5',
  },
  {
    id: 'andor',
    title: 'Andor',
    type: 'series',
    year: 2022,
    meta: '2 Staffeln',
    genre: 'Science-Fiction · Thriller',
    description: 'Cassian Andors Weg in den Widerstand zeigt, wie aus einzelnen Entscheidungen eine Rebellion entsteht.',
    providerIds: ['disney'],
    accent: '#68768b',
    accent2: '#1c222d',
    score: '8,4',
  },
  {
    id: 'civil-war',
    title: 'Civil War',
    type: 'movie',
    year: 2024,
    meta: '1 Std. 49 Min.',
    genre: 'Drama · Thriller',
    description: 'Journalisten reisen durch ein zerrissenes Amerika und dokumentieren einen eskalierenden inneren Konflikt.',
    providerIds: ['prime', 'youtube'],
    accent: '#87634a',
    accent2: '#2b211a',
    score: '7,0',
  },
  {
    id: 'three-body',
    title: '3 Body Problem',
    type: 'series',
    year: 2024,
    meta: '1 Staffel',
    genre: 'Science-Fiction · Mystery',
    description: 'Eine Gruppe von Wissenschaftlern wird mit einer Bedrohung konfrontiert, deren Ursprung weit außerhalb der Erde liegt.',
    providerIds: ['netflix'],
    accent: '#7168a5',
    accent2: '#241f3c',
    score: '7,5',
  },
]

const rowDefinitions = [
  { id: 'top', title: 'Meine Top-Auswahl', ids: ['dune-2', 'blade-runner', 'interstellar', 'shogun', 'dark', 'expanse'] },
  { id: 'scifi', title: 'Science-Fiction & Technik', ids: ['arrival', 'blade-runner', 'interstellar', 'expanse', 'three-body', 'andor'] },
  { id: 'series', title: 'Serien für dich', ids: ['shogun', 'severance', 'dark', 'expanse', 'andor', 'three-body'] },
  { id: 'watch', title: 'Später ansehen', ids: ['oppenheimer', 'civil-war', 'arrival', 'severance', 'dune-2'] },
]

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

function ProviderBadges({ providerIds }) {
  return (
    <div className="provider-badges" aria-label="Verfügbare Anbieter">
      {providerIds.map((providerId) => (
        <span className={`provider-badge provider-${providerId}`} title={providers[providerId].label} key={providerId}>
          {providers[providerId].short}
        </span>
      ))}
    </div>
  )
}

function PosterCard({ item, onOpen }) {
  return (
    <button
      type="button"
      className="poster-card"
      onClick={() => onOpen(item)}
      data-focusable="true"
      aria-label={`${item.title} öffnen`}
      style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}
    >
      <span className="poster-art" aria-hidden="true">
        <span className="poster-kicker">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
        <span className="poster-title">{item.title}</span>
        <span className="poster-year">{item.year}</span>
      </span>
      <ProviderBadges providerIds={item.providerIds} />
    </button>
  )
}

function ContentRow({ title, items, onOpen }) {
  return (
    <section className="content-row">
      <div className="row-heading">
        <h2>{title}</h2>
        <span>{items.length} Titel</span>
      </div>
      <div className="poster-track">
        {items.map((item) => <PosterCard item={item} onOpen={onOpen} key={item.id} />)}
      </div>
    </section>
  )
}

function DetailModal({ item, onClose }) {
  const [providerMessage, setProviderMessage] = useState('')

  useEffect(() => {
    const target = document.querySelector('[data-detail-autofocus="true"]')
    target?.focus()
  }, [item])

  if (!item) return null

  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-label={`Details zu ${item.title}`}>
        <div className="detail-art" style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}>
          <span className="detail-type">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
          <span className="detail-art-title">{item.title}</span>
        </div>
        <div className="detail-copy">
          <button className="icon-button detail-close" type="button" onClick={onClose} data-focusable="true" aria-label="Details schließen">×</button>
          <p className="eyebrow">Movie Hub · Testdaten</p>
          <h2>{item.title}</h2>
          <div className="meta-line"><strong>{item.score}</strong><span>{item.year}</span><span>{item.meta}</span></div>
          <p className="genre">{item.genre}</p>
          <p className="detail-description">{item.description}</p>
          <h3>Wo ansehen?</h3>
          <div className="provider-actions">
            {item.providerIds.map((providerId, index) => (
              <button
                type="button"
                key={providerId}
                className="provider-action"
                data-focusable="true"
                data-detail-autofocus={index === 0 ? 'true' : undefined}
                onClick={() => setProviderMessage(`${providers[providerId].label}: direkter Start folgt in Phase 4.`)}
              >
                <span className={`provider-badge provider-${providerId}`}>{providers[providerId].short}</span>
                {providers[providerId].label}
              </button>
            ))}
          </div>
          {providerMessage && <p className="prototype-note">{providerMessage}</p>}
        </div>
      </section>
    </div>
  )
}

function useDpadNavigation(detailOpen, onBack) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        if (detailOpen) {
          event.preventDefault()
          onBack()
        }
        return
      }

      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return

      const active = document.activeElement
      if (!active || active.tagName === 'INPUT') return

      const scope = detailOpen ? '.detail-modal ' : ''
      const candidates = [...document.querySelectorAll(`${scope}[data-focusable="true"]`)]
        .filter((element) => !element.disabled && element.offsetParent !== null)

      if (!candidates.includes(active)) return

      const current = active.getBoundingClientRect()
      const currentX = current.left + current.width / 2
      const currentY = current.top + current.height / 2
      const direction = event.key

      const ranked = candidates
        .filter((candidate) => candidate !== active)
        .map((candidate) => {
          const rect = candidate.getBoundingClientRect()
          const x = rect.left + rect.width / 2
          const y = rect.top + rect.height / 2
          const dx = x - currentX
          const dy = y - currentY
          const valid =
            (direction === 'ArrowLeft' && dx < -4) ||
            (direction === 'ArrowRight' && dx > 4) ||
            (direction === 'ArrowUp' && dy < -4) ||
            (direction === 'ArrowDown' && dy > 4)

          if (!valid) return null
          const primary = direction === 'ArrowLeft' || direction === 'ArrowRight' ? Math.abs(dx) : Math.abs(dy)
          const secondary = direction === 'ArrowLeft' || direction === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx)
          return { candidate, score: primary + secondary * 2.4 }
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)

      if (ranked[0]) {
        event.preventDefault()
        ranked[0].candidate.focus()
        ranked[0].candidate.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailOpen, onBack])
}

function Hero({ item, onOpen }) {
  return (
    <section className="hero" style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}>
      <div className="hero-copy">
        <p className="eyebrow">Heute im Fokus</p>
        <h1>{item.title}</h1>
        <div className="hero-meta"><strong>{item.score}</strong><span>{item.year}</span><span>{item.meta}</span></div>
        <p className="hero-description">{item.description}</p>
        <div className="hero-actions">
          <button type="button" className="primary-action" onClick={() => onOpen(item)} data-focusable="true">▶ Ansehen</button>
          <button type="button" className="secondary-action" onClick={() => onOpen(item)} data-focusable="true">ⓘ Details</button>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <span>{item.title}</span>
      </div>
    </section>
  )
}

function Header({ currentView, onViewChange, user, onSignOut }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const navItems = [
    ['home', 'Home'],
    ['movies', 'Filme'],
    ['series', 'Serien'],
    ['library', 'Meine Inhalte'],
  ]

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
          <button type="button" className="profile-button" onClick={() => setProfileOpen((open) => !open)} data-focusable="true" aria-label="Profil öffnen">
            <span className="avatar">M</span><span className="profile-label">Profil</span>
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <strong>Movie-Hub-Profil</strong>
              <span>{user.email}</span>
              <button type="button" onClick={onSignOut} data-focusable="true">Abmelden</button>
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
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Film, Serie oder Genre …" aria-label="Filme und Serien suchen" />
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
  const heroItem = titles[0]

  useDpadNavigation(Boolean(selectedTitle), () => setSelectedTitle(null))

  async function handleSignOut() {
    const { auth } = await firebaseReady
    await signOut(auth)
  }

  const rows = rowDefinitions.map((row) => ({ ...row, items: row.ids.map((id) => titles.find((item) => item.id === id)).filter(Boolean) }))
  const movies = titles.filter((item) => item.type === 'movie')
  const series = titles.filter((item) => item.type === 'series')
  const library = titles.filter((item) => ['dune-2', 'shogun', 'arrival', 'severance', 'oppenheimer', 'dark'].includes(item.id))

  return (
    <div className="app-shell">
      <Header currentView={currentView} onViewChange={setCurrentView} user={user} onSignOut={handleSignOut} />
      {currentView === 'home' && (
        <main>
          <Hero item={heroItem} onOpen={setSelectedTitle} />
          <div className="rows-wrap">
            <div className="prototype-strip"><strong>Phase 1 Prototyp</strong><span>Kontrollierte Testdaten · echte TMDB-Daten folgen in Phase 2</span></div>
            {rows.map((row) => <ContentRow key={row.id} title={row.title} items={row.items} onOpen={setSelectedTitle} />)}
          </div>
        </main>
      )}
      {currentView === 'movies' && <BrowseView title="Filme" subtitle="Deine Filmwelt – später gespeist aus TMDB und deinen Streamingdiensten." items={movies} onOpen={setSelectedTitle} />}
      {currentView === 'series' && <BrowseView title="Serien" subtitle="Serien entdecken, merken und später direkt beim passenden Anbieter öffnen." items={series} onOpen={setSelectedTitle} />}
      {currentView === 'library' && <BrowseView title="Meine Inhalte" subtitle="Der vorbereitete Platz für Favoriten, Watchlist, Bewertungen und Gesehenes." items={library} onOpen={setSelectedTitle} />}
      {currentView === 'search' && <SearchView onOpen={setSelectedTitle} />}
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
