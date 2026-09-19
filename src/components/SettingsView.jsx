import { useEffect, useRef, useState } from 'react'
import {
  HERO_COUNT_OPTIONS,
  HERO_TRAILER_DELAY_OPTIONS,
  POSTER_ROW_LIMIT_OPTIONS,
  normalizeProfileExperienceSettings,
  updateProfileExperienceSetting,
} from '../profiles/profileExperienceSettings.js'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import { PROVIDER_OPTIONS } from '../settings/providerSelectionModel.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import { useWaipuStationSelection } from '../settings/useWaipuStationSelection.js'
import { moveWaipuStation } from '../settings/waipuStationSelectionModel.js'
import { useTmdbCatalog } from '../tmdb/TmdbCatalogProvider.jsx'
import { ProviderBadge } from './ProviderBadges.jsx'

const VISIBILITY_GROUPS = [
  {
    id: 'home',
    title: 'Home',
    options: [
      ['hero', 'Hero-Bereich'],
      ['top10', 'Top 10'],
      ['personalRows', 'Persönliche Reihen'],
      ['providerRows', 'Anbieter-Kataloge'],
    ],
  },
  {
    id: 'movies',
    title: 'Filme',
    options: [
      ['hero', 'Hero-Bereich'],
      ['top10', 'Top 10'],
      ['providerRows', 'Anbieter-Kataloge'],
    ],
  },
  {
    id: 'series',
    title: 'Serien',
    options: [
      ['hero', 'Hero-Bereich'],
      ['top10', 'Top 10'],
      ['providerRows', 'Anbieter-Kataloge'],
    ],
  },
  {
    id: 'myContent',
    title: 'Meine Inhalte',
    options: [
      ['hero', 'Hero-Bereich'],
      ['top10', 'Top 10'],
      ['personalRows', 'Persönliche Reihen'],
      ['history', 'Gesehen-Verlauf'],
    ],
  },
]

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

function stationInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join('') : words[0]?.slice(0, 3) || 'TV').toUpperCase()
}

export default function SettingsView({
  availableTmdbProviderIds = null,
  waipuStations = [],
  waipuStationStatus = 'loading',
}) {
  const nativeNetworkSettings = typeof window.MovieHubNative?.openNetworkSettings === 'function'
  const nativeTmdbSettings = typeof window.MovieHubNative?.openTmdbSettings === 'function'
  const [liveTmdbProviderIds, setLiveTmdbProviderIds] = useState(availableTmdbProviderIds)
  const [experienceSaving, setExperienceSaving] = useState(null)
  const [experienceError, setExperienceError] = useState(null)
  const experienceFocusRef = useRef(null)
  const { activeProfile, updateActiveProfileExperienceSettings } = useProfiles()
  const experienceSettings = normalizeProfileExperienceSettings(activeProfile?.experienceSettings)
  const {
    enabledProviderIds,
    loading: providerLoading,
    error: providerError,
    savingProviderId,
    isProviderEnabled,
    setProviderEnabled,
  } = useProviderSelection()
  const {
    disabledStationIds,
    loading: stationSelectionLoading,
    error: stationSelectionError,
    savingStationId,
    isStationEnabled,
    orderStations,
    setStationEnabled,
    setStationOrder,
  } = useWaipuStationSelection()
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

  function toggleStation(stationId) {
    setStationEnabled(stationId, !isStationEnabled(stationId)).catch(() => {})
  }

  function moveStation(stationId, direction) {
    const next = moveWaipuStation(stationOptions, stationId, direction)
    setStationOrder(next, `order:${stationId}`).catch(() => {})
  }

  async function saveExperienceSetting(path, value, focusTarget = null) {
    if (experienceSaving) return
    experienceFocusRef.current = focusTarget instanceof HTMLElement
      ? focusTarget
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setExperienceSaving(path)
    setExperienceError(null)
    try {
      const next = updateProfileExperienceSetting(experienceSettings, path, value)
      await updateActiveProfileExperienceSettings(next)
    } catch (error) {
      setExperienceError(error)
    } finally {
      setExperienceSaving(null)
      window.requestAnimationFrame(() => {
        const target = experienceFocusRef.current
        experienceFocusRef.current = null
        if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true })
      })
    }
  }

  const lastSync = formatSyncTime(syncState?.syncedAt)
  const providerBusy = providerLoading || Boolean(savingProviderId)
  const providerOptions = visibleProviderOptions(liveTmdbProviderIds)
  const activeVisibleProviders = providerOptions.filter((provider) => enabledProviderIds.includes(provider.id)).length
  const stationOptions = orderStations(Array.isArray(waipuStations) ? waipuStations : [])
  const activeStationCount = stationOptions.filter((station) => !disabledStationIds.includes(station.id)).length
  const stationBusy = stationSelectionLoading || Boolean(savingStationId)

  return (
    <main className="browse-page profile-page app-settings-page">
      <div className="page-heading profile-heading">
        <p className="eyebrow">Dein Movie Hub</p>
        <h1>Einstellungen</h1>
        <p>Profilbezogene Darstellung sowie kontoweite Streaming- und Geräteverbindungen an einem Ort.</p>
      </div>

      <section className="settings-panel content-display-panel" aria-labelledby="profile-display-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Aktives Profil</p>
            <h2 id="profile-display-heading">Oberfläche für {activeProfile?.displayName ?? 'dieses Profil'}</h2>
          </div>
          <span className="settings-status">Nur dieses Profil</span>
        </div>
        <p className="settings-description">
          Diese Werte werden mit dem Profil synchronisiert und gelten damit auf Smartphone, Tablet und Fire TV. Andere Profile können eigene Werte verwenden.
        </p>

        <div className="content-display-subsection">
          <div className="settings-heading">
            <div>
              <h3>Posterreihen</h3>
              <p>Maximale Anzahl Titel pro normaler Posterreihe. Top-10-Reihen bleiben immer auf zehn Titel begrenzt.</p>
            </div>
            <span className="settings-status">Standard 50</span>
          </div>
          <div className="content-sort-grid" aria-label="Maximale Titel pro Posterreihe">
            {POSTER_ROW_LIMIT_OPTIONS.map((limit) => (
              <button
                type="button"
                key={limit}
                className={experienceSettings.posterRowLimit === limit ? 'content-sort-choice active' : 'content-sort-choice'}
                onClick={(event) => saveExperienceSetting('posterRowLimit', limit, event.currentTarget)}
                disabled={Boolean(experienceSaving)}
                aria-pressed={experienceSettings.posterRowLimit === limit}
                data-focusable="true"
              >
                <span className="content-sort-choice-title"><strong>{limit}</strong></span>
                <span>Titel je Reihe</span>
              </button>
            ))}
          </div>
        </div>

        <div className="content-display-subsection">
          <div className="settings-heading">
            <div>
              <h3>Heroes</h3>
              <p>Anzahl wechselnder Hero-Titel auf den Hauptseiten. Ein gemeinsamer Profilwert hält Preloading und Speicherbedarf vorhersehbar.</p>
            </div>
            <span className="settings-status">Standard 5</span>
          </div>
          <div className="content-sort-grid" aria-label="Anzahl Hero-Titel">
            {HERO_COUNT_OPTIONS.map((count) => (
              <button
                type="button"
                key={count}
                className={experienceSettings.heroCount === count ? 'content-sort-choice active' : 'content-sort-choice'}
                onClick={(event) => saveExperienceSetting('heroCount', count, event.currentTarget)}
                disabled={Boolean(experienceSaving)}
                aria-pressed={experienceSettings.heroCount === count}
                data-focusable="true"
              >
                <span className="content-sort-choice-title"><strong>{count}</strong></span>
                <span>Hero-Titel</span>
              </button>
            ))}
          </div>
        </div>

        <div className="content-display-subsection">
          <div className="settings-heading">
            <div>
              <h3>Automatische Hero-Trailer</h3>
              <p>Öffnet nach der gewählten Wartezeit den vorhandenen Trailer, ersatzweise einen Teaser, im Vollbild-Player.</p>
            </div>
            <span className="settings-status">Standard Aus · 15 Sekunden · Ton an</span>
          </div>
          <div className="category-choice-grid">
            <button
              type="button"
              className={experienceSettings.heroTrailers.enabled ? 'category-choice active' : 'category-choice'}
              onClick={(event) => saveExperienceSetting('heroTrailers.enabled', !experienceSettings.heroTrailers.enabled, event.currentTarget)}
              disabled={Boolean(experienceSaving)}
              aria-pressed={experienceSettings.heroTrailers.enabled}
              data-focusable="true"
            >
              <span>Hero-Trailer</span>
              <small>{experienceSaving === 'heroTrailers.enabled' ? 'Speichert …' : experienceSettings.heroTrailers.enabled ? 'An' : 'Aus'}</small>
              <span className={experienceSettings.heroTrailers.enabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true"><span /></span>
            </button>
            <button
              type="button"
              className={experienceSettings.heroTrailers.soundEnabled ? 'category-choice active' : 'category-choice'}
              onClick={(event) => saveExperienceSetting('heroTrailers.soundEnabled', !experienceSettings.heroTrailers.soundEnabled, event.currentTarget)}
              disabled={Boolean(experienceSaving) || !experienceSettings.heroTrailers.enabled}
              aria-pressed={experienceSettings.heroTrailers.soundEnabled}
              data-focusable="true"
            >
              <span>Trailer-Ton</span>
              <small>{experienceSaving === 'heroTrailers.soundEnabled' ? 'Speichert …' : experienceSettings.heroTrailers.soundEnabled ? 'Mit Ton' : 'Stumm'}</small>
              <span className={experienceSettings.heroTrailers.soundEnabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true"><span /></span>
            </button>
          </div>
          <div className="content-sort-grid" aria-label="Startverzögerung für Hero-Trailer">
            {HERO_TRAILER_DELAY_OPTIONS.map((seconds) => (
              <button
                type="button"
                key={seconds}
                className={experienceSettings.heroTrailers.delaySeconds === seconds ? 'content-sort-choice active' : 'content-sort-choice'}
                onClick={(event) => saveExperienceSetting('heroTrailers.delaySeconds', seconds, event.currentTarget)}
                disabled={Boolean(experienceSaving) || !experienceSettings.heroTrailers.enabled}
                aria-pressed={experienceSettings.heroTrailers.delaySeconds === seconds}
                data-focusable="true"
              >
                <span className="content-sort-choice-title"><strong>{seconds}</strong></span>
                <span>Sekunden</span>
              </button>
            ))}
          </div>
          <p className="settings-hint">Bei „Mit Ton“ versucht Movie Hub den Vollbild-Trailer mit Ton zu starten. Falls das Gerät Autoplay mit Ton blockiert, wird stumm weitergespielt.</p>
        </div>

        <div className="content-display-subsection">
          <div className="settings-heading">
            <div>
              <h3>Sichtbare Inhaltsbereiche</h3>
              <p>Blende ganze Module aus, ohne persönliche Daten, Links, Bewertungen oder Regeln zu löschen.</p>
            </div>
          </div>
          {VISIBILITY_GROUPS.map((group) => (
            <div className="category-settings-group" key={group.id}>
              <div className="category-settings-group-heading">
                <h3>{group.title}</h3>
                <span>profilbezogen</span>
              </div>
              <div className="category-choice-grid">
                {group.options.map(([key, label]) => {
                  const enabled = experienceSettings.visibility[group.id][key]
                  const path = `visibility.${group.id}.${key}`
                  return (
                    <button
                      type="button"
                      key={path}
                      className={enabled ? 'category-choice active' : 'category-choice'}
                      onClick={(event) => saveExperienceSetting(path, !enabled, event.currentTarget)}
                      disabled={Boolean(experienceSaving)}
                      aria-pressed={enabled}
                      data-focusable="true"
                    >
                      <span>{label}</span>
                      <small>{experienceSaving === path ? 'Speichert …' : enabled ? 'Sichtbar' : 'Ausgeblendet'}</small>
                      <span className={enabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true"><span /></span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {experienceError && <p className="error" role="status">Profileinstellungen konnten nicht gespeichert werden: {experienceError.message}</p>}
      </section>

      <section className="settings-panel provider-selection-panel" aria-labelledby="provider-selection-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Konto · Streaming</p>
            <h2 id="provider-selection-heading">Streaminganbieter</h2>
          </div>
          <span className="settings-status">
            {providerLoading ? 'Wird geladen …' : `${activeVisibleProviders} von ${providerOptions.length} aktiv`}
          </span>
        </div>

        <p className="settings-description">
          Wähle aus, welche Anbieter Movie Hub berücksichtigen soll. Diese Auswahl gilt für das gesamte Movie-Hub-Konto; die profilbezogene Sichtbarkeit des Anbieterbereichs wird oben gesteuert.
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

      <section className="settings-panel provider-selection-panel" aria-labelledby="station-selection-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Konto · TV</p>
            <h2 id="station-selection-heading">Sichtbare TV-Sender</h2>
          </div>
          <span className="settings-status">
            {waipuStationStatus === 'loading' || stationSelectionLoading
              ? 'Wird geladen …'
              : waipuStationStatus === 'ready'
                ? `${activeStationCount} von ${stationOptions.length} aktiv`
                : 'Noch nicht veröffentlicht'}
          </span>
        </div>

        <p className="settings-description">
          Alle verfügbaren Sender sind standardmäßig aktiviert. Schalte hier nur Sender aus, die dich auf der TV-Seite grundsätzlich nicht interessieren. Diese Auswahl gilt kontoweit auf allen Geräten.
        </p>

        {waipuStationStatus === 'ready' && stationOptions.length > 0 ? (
          <div className="provider-selection-list station-selection-list" aria-label="TV-Sender ein- oder ausblenden">
            {stationOptions.map((station, index) => {
              const enabled = isStationEnabled(station.id)
              const saving = savingStationId === station.id
              const moving = savingStationId === `order:${station.id}`
              return (
                <article
                  key={station.id}
                  className={enabled ? 'station-selection-row active' : 'station-selection-row'}
                >
                  <span className="station-selection-mark" aria-hidden="true">{stationInitials(station.name)}</span>
                  <span className="provider-selection-copy">
                    <strong>{station.name}</strong>
                    <small>{enabled ? 'Wird im TV-Reiter berücksichtigt' : 'Im TV-Reiter ausgeblendet'}</small>
                  </span>
                  <div className="station-selection-actions">
                    <button
                      type="button"
                      className={enabled ? 'personal-row-toggle active' : 'personal-row-toggle'}
                      onClick={() => toggleStation(station.id)}
                      role="switch"
                      aria-checked={enabled}
                      disabled={stationBusy}
                      aria-label={`${station.name}: ${enabled ? 'An' : 'Aus'}`}
                      data-focusable="true"
                    >
                      <span>{saving ? 'Speichert …' : enabled ? 'An' : 'Aus'}</span>
                      <span className={enabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true"><span /></span>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStation(station.id, -1)}
                      disabled={stationBusy || index === 0}
                      aria-label={`${station.name} nach oben`}
                      aria-busy={moving}
                      data-focusable="true"
                    >↑</button>
                    <button
                      type="button"
                      onClick={() => moveStation(station.id, 1)}
                      disabled={stationBusy || index === stationOptions.length - 1}
                      aria-label={`${station.name} nach unten`}
                      aria-busy={moving}
                      data-focusable="true"
                    >↓</button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="settings-hint">
            Die Senderliste erscheint, sobald ein vollständig geprüfter Waipu-Live-Katalog veröffentlicht ist.
          </p>
        )}
        <p className="settings-hint">
          Neu hinzukommende Sender sind automatisch eingeschaltet. Die TV-Seite selbst enthält bewusst keine zusätzliche Senderauswahl.
        </p>
        {stationSelectionError && <p className="error" role="status">TV-Sendereinstellungen konnten nicht gespeichert oder synchronisiert werden: {stationSelectionError.message}</p>}
      </section>

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
            <p className="settings-kicker">Gerät · Filmdaten</p>
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
