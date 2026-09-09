import '../styles/about.css'

const PROJECT_URL = 'https://github.com/matthias-ennen/movie-hub'

function readNativeValue(methodName) {
  try {
    const method = window.MovieHubNative?.[methodName]
    if (typeof method !== 'function') return null
    const value = method.call(window.MovieHubNative)
    return value == null || value === '' ? null : String(value)
  } catch {
    return null
  }
}

function deriveBuildFromVersion(version) {
  if (!version) return null
  const parts = version.split('.')
  const candidate = parts.at(-1)
  return /^\d+$/.test(candidate ?? '') ? candidate : null
}

function formatBuildTime(value) {
  if (!value) return 'Lokaler Entwicklungsbuild'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('de-DE')
}

export default function AboutView() {
  const nativeVersion = readNativeValue('getAppVersion')
  const nativeBuild = readNativeValue('getAppBuild') || deriveBuildFromVersion(nativeVersion)
  const nativePlatform = readNativeValue('getPlatformLabel') || (nativeVersion ? 'Android / Fire TV' : 'Web')
  const webBuild = typeof __MOVIE_HUB_WEB_BUILD__ !== 'undefined' ? __MOVIE_HUB_WEB_BUILD__ : 'local'
  const webBuiltAt = typeof __MOVIE_HUB_WEB_BUILT_AT__ !== 'undefined' ? __MOVIE_HUB_WEB_BUILT_AT__ : null

  function openProject() {
    if (typeof window.MovieHubNative?.openProjectUrl === 'function') {
      window.MovieHubNative.openProjectUrl(PROJECT_URL)
      return
    }
    window.open(PROJECT_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <main className="browse-page about-page">
      <section className="about-hero" aria-labelledby="about-title">
        <div>
          <div className="brand about-brand">MOVIE <span>HUB</span></div>
          <p className="eyebrow">Über diese App</p>
          <h1 id="about-title">Movie Hub</h1>
          <p className="about-lead">
            Deine persönliche, TV-optimierte Film- und Streaming-Zentrale für Smartphone, Tablet und Fire TV.
          </p>
        </div>
        <div className="about-version-badge" aria-label="Installierter Movie-Hub-Stand">
          <span>Native App</span>
          <strong>{nativeVersion ? `v${nativeVersion}` : 'Browser'}</strong>
          <small>{nativeBuild ? `Build ${nativeBuild}` : 'Keine APK-Information'}</small>
        </div>
      </section>

      <section className="settings-panel about-panel" aria-labelledby="about-app-info-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Stand</p>
            <h2 id="about-app-info-heading">App-Informationen</h2>
          </div>
          <span className="settings-status">{nativePlatform}</span>
        </div>

        <div className="about-info-grid">
          <article className="about-info-card">
            <span>Native App-Version</span>
            <strong>{nativeVersion ?? 'Nicht verfügbar'}</strong>
            <small>{nativeVersion ? 'Aus dem installierten Android-Paket' : 'Im Browser gibt es keine native APK-Version.'}</small>
          </article>
          <article className="about-info-card">
            <span>Native Build</span>
            <strong>{nativeBuild ?? '–'}</strong>
            <small>{nativeBuild ? 'VersionCode der installierten APK' : 'Nur in der Android-/Fire-TV-App verfügbar.'}</small>
          </article>
          <article className="about-info-card">
            <span>Web-Oberfläche</span>
            <strong>{webBuild}</strong>
            <small>Automatisch aus dem Web-Build erzeugter Git-Stand</small>
          </article>
          <article className="about-info-card">
            <span>Web-Build erstellt</span>
            <strong>{formatBuildTime(webBuiltAt)}</strong>
            <small>APK und Web-Oberfläche können unabhängig voneinander aktualisiert werden.</small>
          </article>
        </div>
      </section>

      <div className="about-section-grid">
        <section className="settings-panel about-panel" aria-labelledby="about-project-heading">
          <p className="settings-kicker">Projekt</p>
          <h2 id="about-project-heading">Movie Hub auf GitHub</h2>
          <p className="settings-description">
            Quellcode, Entwicklungsstand, Issues und technische Dokumentation werden im Movie-Hub-Repository gepflegt.
          </p>
          <button type="button" className="about-link-button" onClick={openProject} data-focusable="true">
            <span aria-hidden="true">↗</span>
            <span><strong>GitHub-Projekt öffnen</strong><small>matthias-ennen/movie-hub</small></span>
          </button>
        </section>

        <section className="settings-panel about-panel" aria-labelledby="about-services-heading">
          <p className="settings-kicker">Daten & Dienste</p>
          <h2 id="about-services-heading">Woher Movie Hub seine Daten bekommt</h2>
          <ul className="about-list">
            <li><strong>TMDB</strong><span>Film- und Seriendaten, Bilder, Metadaten und Providerinformationen.</span></li>
            <li><strong>Firebase</strong><span>Hosting, Anmeldung und kontobezogene Movie-Hub-Daten in Firestore.</span></li>
          </ul>
          <p className="about-note">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </section>

        <section className="settings-panel about-panel" aria-labelledby="about-privacy-heading">
          <p className="settings-kicker">Datenschutz</p>
          <h2 id="about-privacy-heading">Cloud-Daten und lokale Geheimnisse bleiben getrennt</h2>
          <ul className="about-list">
            <li><strong>Firebase / Firestore</strong><span>Profile und persönliche Movie-Hub-Daten können kontobezogen in der Cloud liegen.</span></li>
            <li><strong>SMB / Heimnetz</strong><span>Zugangsdaten bleiben geschützt auf dem jeweiligen Android-/Fire-TV-Gerät.</span></li>
            <li><strong>Persönliches TMDB-Konto</strong><span>API-Token und Session-ID bleiben verschlüsselt gerätelokal und werden nicht an die Web-Oberfläche ausgegeben.</span></li>
          </ul>
        </section>

        <section className="settings-panel about-panel" aria-labelledby="about-open-source-heading">
          <p className="settings-kicker">Open Source & Lizenzen</p>
          <h2 id="about-open-source-heading">Verwendete Komponenten</h2>
          <p className="settings-description">
            Movie Hub verwendet unter anderem React, Vite, Firebase SDK, AndroidX Activity, AndroidX Media3 und SMBJ. Die jeweiligen Projekte bleiben unter ihren eigenen Lizenzbedingungen.
          </p>
          <p className="about-note">Eine vollständige Drittlizenzansicht kann später als eigener Bereich ergänzt werden.</p>
        </section>
      </div>
    </main>
  )
}
