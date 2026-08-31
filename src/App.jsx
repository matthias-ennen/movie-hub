import { useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { useAuth } from './hooks/useAuth.js'
import {
  auth,
  isFirebaseConfigured,
  missingFirebaseConfigKeys,
} from './lib/firebase.js'
import { runPhase0WriteReadTest } from './services/phase0Test.js'

function SetupNotice() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Movie Hub · Phase 0</p>
        <h1>Firebase-Konfiguration fehlt</h1>
        <p>
          Das Web-Grundgerüst ist vorhanden. Kopiere <code>.env.example</code> nach
          <code> .env</code> und trage die Firebase-Web-Konfiguration der App
          <strong> movie-hub-web</strong> ein.
        </p>
        <p className="muted">
          Fehlende Pflichtwerte: {missingFirebaseConfigKeys.join(', ')}
        </p>
      </section>
    </main>
  )
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
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell">
      <section className="panel login-panel">
        <p className="eyebrow">Movie Hub · Phase 0</p>
        <h1>Anmelden</h1>
        <p className="muted">
          Noch keine Filmoberfläche – zuerst prüfen wir Authentifizierung,
          Firestore und Hosting sauber Ende-zu-Ende.
        </p>
        <form onSubmit={handleSubmit} className="form">
          <label>
            E-Mail
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Passwort
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Anmeldung läuft …' : 'Anmelden'}
          </button>
        </form>
        {message && <p className="error">{message}</p>}
      </section>
    </main>
  )
}

function Dashboard({ user }) {
  const [testResult, setTestResult] = useState('Noch nicht ausgeführt.')
  const [testing, setTesting] = useState(false)

  async function runTest() {
    setTesting(true)
    setTestResult('Schreib-/Lesetest läuft …')

    try {
      const result = await runPhase0WriteReadTest(user.uid)
      setTestResult(`Erfolgreich: ${result.message}`)
    } catch (error) {
      setTestResult(`Fehler: ${error.message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Movie Hub · Phase 0</p>
        <h1>Technisches Fundament</h1>
        <p>
          Angemeldet als <strong>{user.email}</strong>
        </p>
        <div className="status-grid">
          <article>
            <span>Authentication</span>
            <strong>verbunden</strong>
          </article>
          <article>
            <span>Benutzer-ID</span>
            <strong className="mono">{user.uid}</strong>
          </article>
        </div>
        <div className="actions">
          <button onClick={runTest} disabled={testing}>
            {testing ? 'Test läuft …' : 'Firestore schreiben + lesen'}
          </button>
          <button className="secondary" onClick={() => signOut(auth)}>
            Abmelden
          </button>
        </div>
        <p className="test-result">{testResult}</p>
      </section>
    </main>
  )
}

export default function App() {
  const { user, loading, error } = useAuth()

  if (!isFirebaseConfigured) {
    return <SetupNotice />
  }

  if (loading) {
    return <main className="shell"><p>Lade Firebase-Sitzung …</p></main>
  }

  if (error) {
    return <main className="shell"><p className="error">{error.message}</p></main>
  }

  return user ? <Dashboard user={user} /> : <Login />
}
