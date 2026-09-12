import { useEffect, useState } from 'react'
import { PROVIDER_OPTIONS } from '../settings/providerSelectionModel.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import { useTmdbCatalog } from '../tmdb/TmdbCatalogProvider.jsx'
import { ProviderBadge } from './ProviderBadges.jsx'

function formatSyncTime(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('de-DE')
}

function catalogTmdbProviderIds(providerCatalogs) {
  if (!providerCatalogs || typeof providerCatalogs !== 'object') return null

  return Object.values(providerCatalogs)
    .filter((provider) => (
      (Array.isArray(provider.movieTmdbProviderIds) && provider.movieTmdbProviderIds.length)
      || (Array.isArray(provider.seriesTmdbProviderIds) && provider.seriesTmdbProviderIds.length)
      || Number.isFinite(Number(provider.movieTmdbProviderId))
      || Number.isFinite(Number(provider.seriesTmdbProviderId))
    ))
    .map((provider) => provider.id)
    .filter(Boolean)
}

function visibleProviderOptions(availableTmdbProviderIds) {
  const available = Array.isArray(availableTmdbProviderIds)
    ? new Set(availableTmdbProviderIds)
    : null

  return PROVIDER_OPTIONS.filter((provider) => {
    if (provider.source === 'moviehub') return true
    if (provider.source === 'special') return provider.id === 'waipu'
    if (!available) return provider.defaultEnabled
    return available.has(provider.id)
  })
}

export default function SettingsView({ availableTmdbProviderIds = null }) {
  const nativeNetworkSettings = typeof window.MovieHubNative?.openNetworkSettings === 'function'
  const nativeTmdbSettings = typeof window.MovieHubNative?.openTmdbSettings === 'function'
  const [liveTmdbProviderIds, setLiveTmdbProviderIds] = useState(availableTmdbProviderIds)
  const {
    enabledProviderIds,
    loading: providerLoading,
    error: providerError,
    savingProviderId,
    isProviderEnabled,
    setProviderEnabled,
  } = useProviderSelection()
  const {
    syncState,
    syncBusy,
    syncMessage,
    requestSync,
    nativeSyncAvailable,
    error: tmdbCatalogError,
  } = useTmdbCatalog()

  useEffect(() => {
    if (Array.isArray(availableTmdbProviderIds)) {
      setLiveTmdbProviderIds(availableTmdbProviderIds)
      return undefined
    }

    let cancelled = false
    fetch('/catalog.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Katalog konnte nicht geladen werden (${response.status})`)
        return response.json()
      })
      .then((catalog) => {
        if (!cancelled) setLiveTmdbProviderIds(catalogTmdbProviderIds(catalog?.providerCatalogs))
      })
      .catch(() => {
        if (!cancelled) setLiveTmdbProviderIds(null)
      })

    return () => { cancelled = true }
  }, [availableTmdbProviderIds])

  function openNetworkSettings() {
    if (nativeNetworkSettings) window.MovieHubNative.openNetworkSettings()
  }

  function openTmdbSettings() {
    if (nativeTmdbSettings) window.MovieHubNative.openTmdbSettings()
  }

  function toggleProvider(providerId) {
    const nextEnabled = !isProviderEnabled(providerId)
    setProviderEnabled(providerId, nextEnabled).catch(() => {})
  }

  const lastSync = formatSyncTime(syncState?.syncedAt)
  const providerBusy = providerLoading || Boolean(savingProviderId)
  const providerOptions = visibleProviderOptions(liveTmdbProviderIds)
  const activeVisibleProviders = providerOptions.filter((provider) => enabledProviderIds.includes(provider.id)).length

  return (
    <main className="browse-page profile-page app-settings-page">
      <div className="page-heading profile-heading">
        <p className="eyebrow">Dein Movie Hub</p>
        <h1>Einstellungen</h1>
        <p>Kontoweite Streaming-Auswahl und geräteweite Verbindungen für Movie Hub.</p>
      </div>

      <section className="settings-panel provider-selection-panel" aria-labelledby="provider-selection-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Streaming</p>
            <h2 id="provider-selection-heading">Streaminganbieter</h2>
          </div>
          <span className="settings-status">
            {providerLoading ? 'Wird geladen …' : `${activeVisibleProviders} von ${providerOptions.length} aktiv`}
          </span>
        </div>

        <p className="settings-description">
          Wähle aus, welche Anbieter Movie Hub für dich berücksichtigen soll. Die Auswahl gilt für dein gesamtes Movie-Hub-Konto und wird zwischen deinen Geräten synchronisiert.
        </p>

        <div className="provider-selection-list" aria-label="Streaminganbieter auswählen">
          {providerOptions.map((provider) => {
            const enabled = isProviderEnabled(provider.id)
            const saving = savingProviderId === provider.id
            return (
              <button
                type="button"
                key={provider.id}
                className={enabled ? 'provider-selection-row active' : 'provider-selection-row'}
                onClick={() => toggleProvider(provider.id)}
                disabled={providerBusy}
                aria-pressed={enabled}
                data-focusable="true"
              >
                <ProviderBadge providerId={provider.id} />
                <span className="provider-selection-copy">
                  <strong>{provider.label}</strong>
                  <small>{provider.description}</small>
                </span>
                <span className={enabled ? 'provider-selection-switch active' : 'provider-selection-switch'} aria-hidden="true">
                  <span className="provider-selection-knob" />
                </span>
                <span className="provider-selection-state">{saving ? 'Speichert …' : enabled ? 'An' : 'Aus'}</span>
              </button>
            )
          })}
        </div>

        <p className="settings-hint">
          Movie Hub bildet seinen Katalog automatisch aus deinen persönlichen Links und Videos. Zusätzliche externe Dienste erscheinen hier nur, wenn der aktuelle TMDB/JustWatch-Katalog sie für Deutschland tatsächlich als Watch Provider liefert. Neue externe Anbieter sind standardmäßig aus, bis du sie aktivierst. waipu.tv bleibt als bestehende Sonderintegration sichtbar.
        </p>
        {providerError && <p className="error" role="status">Streaminganbieter konnten nicht gespeichert oder synchronisiert werden: {providerError.message}</p>}
      </section>

      <section className="settings-panel network-settings-panel" aria-labelledby="network-settings-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Heimnetz</p>
            <h2 id="network-settings-heading">Netzlaufwerke</h2>
          </div>
          <span className="settings-status">Nur dieses Gerät</span>
        </div>

        <p className="settings-description">
          Richte SMB-Freigaben ein, prüfe ihre Erreichbarkeit und entscheide, ob Movie Hub die Zugangsdaten geschützt auf diesem Gerät speichern darf.
        </p>

        {nativeNetworkSettings ? (
          <button type="button" className="network-settings-open" onClick={openNetworkSettings} data-focusable="true">
            <span aria-hidden="true">⌁</span>
            <span><strong>Netzlaufwerke verwalten</strong><small>Anlegen, verbinden, prüfen, trennen oder bearbeiten</small></span>
          </button>
        ) : (
          <p className="settings-hint">
            Netzlaufwerke werden ausschließlich in der aktuellen Android-/Fire-TV-App verwaltet. Im Browser bleiben SMB-Zugangsdaten aus Sicherheitsgründen nicht verfügbar.
          </p>
        )}
      </section>

      <section className="settings-panel tmdb-settings-panel" aria-labelledby="tmdb-settings-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Filmdaten</p>
            <h2 id="tmdb-settings-heading">The Movie Database</h2>
          </div>
          <span className="settings-status">Zugang nur auf diesem Gerät</span>
        </div>

        <p className="settings-description">
          Hinterlege deinen persönlichen TMDB API Read Access Token und verbinde dein TMDB-Konto. Diese eine Geräteverbindung wird von allen Movie-Hub-Profilen gemeinsam genutzt. Synchronisierte Favoriten, Watchlist und Bewertungen werden anschließend kontoweit in Movie Hub bereitgestellt.
        </p>

        {nativeTmdbSettings ? (
          <button type="button" className="network-settings-open" onClick={openTmdbSettings} data-focusable="true">
            <span aria-hidden="true">TMDB</span>
            <span><strong>The Movie Database verwalten</strong><small>API-Zugang einrichten, Konto anmelden, prüfen oder trennen</small></span>
          </button>
        ) : (
          <p className="settings-hint">
            Persönliche TMDB-Zugangsdaten werden ausschließlich in der aktuellen Android-/Fire-TV-App geschützt gespeichert. Im Browser ist die Einrichtung aus Sicherheitsgründen nicht verfügbar.
          </p>
        )}

        {nativeSyncAvailable && (
          <button
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
          </button>
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
    </main>
  )
}
