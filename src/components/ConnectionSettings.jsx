import { useTmdbCatalog } from '../tmdb/TmdbCatalogProvider.jsx'
import SettingsButton from './SettingsButton.jsx'
function formatSyncTime(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('de-DE')
}

export function NetworkSettings() {
  const nativeNetworkSettings = typeof window.MovieHubNative?.openNetworkSettings === 'function'
  const openNetworkSettings = () => window.MovieHubNative?.openNetworkSettings?.()
  return (
      <section className="settings-panel network-settings-panel" aria-labelledby="network-settings-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Gerät · Heimnetz</p>
            <h2 id="network-settings-heading">Netzlaufwerke</h2>
          </div>
          <span className="settings-status">Nur dieses Gerät</span>
        </div>

        <p className="settings-description">
          Richte SMB-Freigaben ein, prüfe ihre Erreichbarkeit und entscheide, ob Movie Hub die Zugangsdaten geschützt auf diesem Gerät speichern darf.
        </p>

        {nativeNetworkSettings ? (
          <SettingsButton type="button" className="network-settings-open" onClick={openNetworkSettings} data-focusable="true">
            <span aria-hidden="true">⌁</span>
            <span><strong>Netzlaufwerke verwalten</strong><small>Anlegen, verbinden, prüfen, trennen oder bearbeiten</small></span>
          </SettingsButton>
        ) : (
          <p className="settings-hint">
            Netzlaufwerke werden ausschließlich in der aktuellen Android-/Fire-TV-App verwaltet. Im Browser bleiben SMB-Zugangsdaten aus Sicherheitsgründen nicht verfügbar.
          </p>
        )}
      </section>
  )
}

export function TmdbConnectionSettings() {
  const nativeTmdbSettings = typeof window.MovieHubNative?.openTmdbSettings === 'function'
  const { syncState, syncBusy, syncMessage, requestSync, nativeSyncAvailable, error: tmdbCatalogError } = useTmdbCatalog()
  const lastSync = formatSyncTime(syncState?.syncedAt)
  const openTmdbSettings = () => window.MovieHubNative?.openTmdbSettings?.()
  return (
      <section className="settings-panel tmdb-settings-panel" aria-labelledby="tmdb-settings-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Gerät · Filmdaten</p>
            <h2 id="tmdb-settings-heading">The Movie Database</h2>
          </div>
          <span className="settings-status">Zugang nur auf diesem Gerät</span>
        </div>

        <p className="settings-description">
          Hinterlege deinen persönlichen TMDB API Read Access Token und verbinde dein TMDB-Konto. Diese eine Geräteverbindung wird von allen Movie-Hub-Profilen gemeinsam genutzt. Synchronisierte Favoriten, Watchlist und Bewertungen werden anschließend kontoweit in Movie Hub bereitgestellt.
        </p>

        {nativeTmdbSettings ? (
          <SettingsButton type="button" className="network-settings-open" onClick={openTmdbSettings} data-focusable="true">
            <span aria-hidden="true">TMDB</span>
            <span><strong>The Movie Database verwalten</strong><small>API-Zugang einrichten, Konto anmelden, prüfen oder trennen</small></span>
          </SettingsButton>
        ) : (
          <p className="settings-hint">
            Persönliche TMDB-Zugangsdaten werden ausschließlich in der aktuellen Android-/Fire-TV-App geschützt gespeichert. Im Browser ist die Einrichtung aus Sicherheitsgründen nicht verfügbar.
          </p>
        )}

        {nativeSyncAvailable && (
          <SettingsButton
            type="button"
            className="network-settings-open tmdb-sync-open"
            onClick={requestSync}
            disabled={syncBusy}
            data-focusable="true"
          >
            <span aria-hidden="true">↻</span>
            <span>
              <strong>{syncBusy ? 'TMDB wird synchronisiert …' : 'Jetzt synchronisieren'}</strong>
              <small>Favoriten, Watchlist und Bewertungen für Filme und Serien aktualisieren</small>
            </span>
          </SettingsButton>
        )}

        {syncState && (
          <div className="tmdb-sync-summary" aria-label="Letzte TMDB-Synchronisierung">
            <strong>Persönlicher TMDB-Katalog</strong>
            <span>{syncState.favoriteCount ?? 0} Favoriten · {syncState.watchlistCount ?? 0} Watchlist-Titel · {syncState.ratingCount ?? 0} Bewertungen · {syncState.totalCount ?? 0} Titel insgesamt</span>
            {lastSync && <small>Letzte Synchronisierung: {lastSync}</small>}
          </div>
        )}

        {syncMessage && <p className="settings-hint tmdb-sync-message">{syncMessage}</p>}
        {tmdbCatalogError && <p className="error">TMDB-Katalog konnte nicht geladen werden: {tmdbCatalogError.message}</p>}
      </section>
  )
}
