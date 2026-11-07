import SettingsButton from './SettingsButton.jsx'
import { useMemo, useState } from 'react'
import {
  CONTENT_AUTO_SWITCH_INTERVALS,
  CONTENT_SORT_MODES,
  WATCHED_DISPLAY_MODES,
  normalizeContentDisplaySettings,
  resolveContentSortMode,
  withContentAutoSwitch,
  withManualContentSortMode,
  withWatchedDisplayMode,
  withArtworkRotation,
} from '../catalog/contentDisplaySettings.js'
import { ARTWORK_ROTATION_MODES } from '../catalog/artworkRotation.js'
import { SEASONAL_CONTENT_MODES, resolveSeasonalContent, withSeasonalContentEnabled, withSeasonalAutoSwitch, withManualSeasonalContent } from '../catalog/seasonalContent.js'
import { useProfiles } from '../profiles/ProfileProvider.jsx'

export default function ContentDisplaySettings() {
  const { activeProfile, updateActiveProfileContentDisplaySettings } = useProfiles()
  const [savingKey, setSavingKey] = useState(null)
  const [message, setMessage] = useState('')
  const settings = normalizeContentDisplaySettings(activeProfile?.contentDisplaySettings)
  const activeModeId = resolveContentSortMode(settings, activeProfile?.id)
  const seasonal = settings.seasonalContent
  const effectiveSeasonId = resolveSeasonalContent(seasonal)
  const effectiveSeason = SEASONAL_CONTENT_MODES.find(mode => mode.id === effectiveSeasonId) || SEASONAL_CONTENT_MODES[0]
  const activeMode = useMemo(
    () => CONTENT_SORT_MODES.find((mode) => mode.id === activeModeId) || CONTENT_SORT_MODES[0],
    [activeModeId],
  )

  async function save(next, key) {
    if (!activeProfile || savingKey) return
    setSavingKey(key)
    setMessage('')
    try {
      await updateActiveProfileContentDisplaySettings(next)
    } catch (error) {
      console.error(error)
      setMessage('Sortierung und Abwechslung konnten nicht gespeichert werden.')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <section className="settings-panel content-display-panel" aria-labelledby="content-display-heading">
      <div className="settings-heading">
        <div>
          <p className="settings-kicker">Entdecken</p>
          <h2 id="content-display-heading">Sortierung & Abwechslung</h2>
        </div>
        <span className="settings-status">Aktiv: {activeMode.label}</span>
      </div>

      <p className="settings-description">
        Bestimme für dieses Profil, welche Titel in flexiblen Anbieter-, Kategorie- und Entdeckungsreihen weiter vorne erscheinen. Fachlich feste und persönliche Reihen behalten ihre eigene Reihenfolge.
      </p>

      <div className="content-sort-grid" aria-label="Sortierlogik auswählen">
        {CONTENT_SORT_MODES.map((mode) => {
          const selected = settings.sortMode === mode.id
          const effective = activeModeId === mode.id
          return (
            <SettingsButton
              type="button"
              key={mode.id}
              className={selected ? 'content-sort-choice active' : 'content-sort-choice'}
              onClick={() => save(withManualContentSortMode(settings, mode.id), `sort:${mode.id}`)}
              disabled={Boolean(savingKey)}
              aria-pressed={selected}
              data-focusable="true"
            >
              <span className="content-sort-choice-title">
                <strong>{mode.label}</strong>
                {effective && <span className="active-mark">Wirksam</span>}
              </span>
              <span>{mode.description}</span>
              <small>{savingKey === `sort:${mode.id}` ? 'Speichert …' : selected ? 'Ausgewählt' : 'Auswählen'}</small>
            </SettingsButton>
          )
        })}
      </div>

      <div className="content-display-subsection">
        <div className="settings-heading auto-switch-heading-row">
          <div>
            <h3>Automatisch wechseln</h3>
            <p>Movie Hub wählt mit jeder neuen Periode reproduzierbar eine andere wirksame Sortierlogik.</p>
          </div>
          <SettingsButton
            type="button"
            className={settings.autoSwitch.enabled ? 'switch-control active' : 'switch-control'}
            role="switch"
            aria-checked={settings.autoSwitch.enabled}
            onClick={() => save(withContentAutoSwitch(settings, { enabled: !settings.autoSwitch.enabled }), 'auto')}
            disabled={Boolean(savingKey)}
            data-focusable="true"
          >
            <span className="switch-knob" />
            <span className="switch-label">{settings.autoSwitch.enabled ? 'Ein' : 'Aus'}</span>
          </SettingsButton>
        </div>

        {settings.autoSwitch.enabled && (
          <div className="interval-controls" aria-label="Intervall für automatische Sortierung">
            {CONTENT_AUTO_SWITCH_INTERVALS.map((interval) => (
              <SettingsButton
                type="button"
                key={interval.id}
                className={settings.autoSwitch.interval === interval.id ? 'interval-button active' : 'interval-button'}
                onClick={() => save(withContentAutoSwitch(settings, { interval: interval.id }), `interval:${interval.id}`)}
                disabled={Boolean(savingKey)}
                aria-pressed={settings.autoSwitch.interval === interval.id}
                data-focusable="true"
              >
                {interval.label}
              </SettingsButton>
            ))}
          </div>
        )}

        <p className="settings-hint">
          Eine manuelle Auswahl bleibt bis zum nächsten täglichen oder wöchentlichen Wechsel wirksam. Innerhalb einer Periode bleibt die Reihenfolge stabil.
        </p>
      </div>

      <div className="content-display-subsection" aria-label="Saisonale Abwechslung">
        <div className="settings-heading auto-switch-heading-row">
          <div>
            <h3>Saisonale Abwechslung</h3>
            <p>Passende Filme und Serien zur Jahreszeit hervorheben – unabhängig vom ausgewählten Design.</p>
            <p className="settings-hint">Aktiv: {seasonal.enabled ? effectiveSeason.label : 'Aus (Klassisch)'}</p>
          </div>
          <SettingsButton type="button" className={seasonal.enabled ? 'switch-control active' : 'switch-control'}
            role="switch" aria-checked={seasonal.enabled} data-focusable="true"
            aria-label="Saisonale Abwechslung ein- oder ausschalten"
            disabled={Boolean(savingKey)}
            onClick={() => save({ ...settings, seasonalContent: withSeasonalContentEnabled(seasonal, !seasonal.enabled) }, 'season:enabled')}>
            <span className="switch-knob" />
            <span className="switch-label">{seasonal.enabled ? 'Ein' : 'Aus'}</span>
          </SettingsButton>
        </div>

        {seasonal.enabled && (
          <>
            <div className="content-sort-grid" aria-label="Saison auswählen">
              {SEASONAL_CONTENT_MODES.map(mode => (
                <SettingsButton type="button" key={mode.id}
                  className={seasonal.seasonId === mode.id ? 'content-sort-choice active' : 'content-sort-choice'}
                  aria-pressed={seasonal.seasonId === mode.id} data-focusable="true"
                  disabled={Boolean(savingKey)}
                  onClick={() => save({ ...settings,
                    seasonalContent: withManualSeasonalContent(seasonal, mode.id),
                  }, `season:${mode.id}`)}>
                  <span className="content-sort-choice-title">
                    <strong>{mode.label}</strong>
                    {effectiveSeasonId === mode.id && <span className="active-mark">Wirksam</span>}
                  </span>
                  <span>{mode.description}</span>
                  <small>{savingKey === `season:${mode.id}` ? 'Speichert …' : seasonal.seasonId === mode.id ? 'Ausgewählt' : 'Auswählen'}</small>
                </SettingsButton>
              ))}
            </div>
            <div className="settings-heading auto-switch-heading-row">
              <div>
                <h3>Automatisch zur Jahreszeit wechseln</h3>
                <p>Weihnachten, Halloween und bewegliche Feiertage erscheinen in den passenden Zeiträumen. Dazwischen gilt Klassisch.</p>
              </div>
              <SettingsButton type="button"
                className={seasonal.autoSwitch.enabled ? 'switch-control active' : 'switch-control'}
                role="switch" aria-checked={seasonal.autoSwitch.enabled} data-focusable="true"
                aria-label="Saison automatisch wechseln" disabled={Boolean(savingKey)}
                onClick={() => save({ ...settings,
                  seasonalContent: withSeasonalAutoSwitch(seasonal, !seasonal.autoSwitch.enabled),
                }, 'season:auto')}>
                <span className="switch-knob" />
                <span className="switch-label">{seasonal.autoSwitch.enabled ? 'Ein' : 'Aus'}</span>
              </SettingsButton>
            </div>
            <p className="settings-hint">Eine manuell gewählte Saison ist jederzeit möglich, auch außerhalb der Jahreszeit.
              Bei eingeschalteter Automatik bleibt sie bis zur nächsten Saison-Grenze wirksam.
              Ohne Automatik bleibt deine Auswahl bestehen.</p>
          </>
        )}
      </div>

      <div className="content-display-subsection">
        <div className="category-settings-group-heading">
          <h3>Bildwechsel</h3>
          <span>Poster und Hero-Bilder</span>
        </div>
        <p className="settings-hint">
          Movie Hub verwendet je Film und Serie passende Bildvarianten. Die Auswahl bleibt innerhalb des gewählten Zeitraums stabil.
        </p>
        <div className="watched-display-grid" aria-label="Intervall für den Bildwechsel">
          {ARTWORK_ROTATION_MODES.map((mode) => {
            const selected = settings.artworkRotation === mode.id
            return (
              <SettingsButton
                type="button"
                key={mode.id}
                className={selected ? 'watched-display-choice active' : 'watched-display-choice'}
                onClick={() => save(withArtworkRotation(settings, mode.id), `artwork:${mode.id}`)}
                disabled={Boolean(savingKey)}
                aria-pressed={selected}
                data-focusable="true"
              >
                <strong>{mode.label}</strong>
                <span>{mode.description}</span>
              </SettingsButton>
            )
          })}
        </div>
      </div>

      <div className="content-display-subsection">
        <div className="category-settings-group-heading">
          <h3>Gesehene Titel</h3>
          <span>Nur öffentliche Reihen und Heroes</span>
        </div>
        <div className="watched-display-grid" aria-label="Darstellung gesehener Titel">
          {WATCHED_DISPLAY_MODES.map((mode) => {
            const selected = settings.watchedMode === mode.id
            return (
              <SettingsButton
                type="button"
                key={mode.id}
                className={selected ? 'watched-display-choice active' : 'watched-display-choice'}
                onClick={() => save(withWatchedDisplayMode(settings, mode.id), `watched:${mode.id}`)}
                disabled={Boolean(savingKey)}
                aria-pressed={selected}
                data-focusable="true"
              >
                <strong>{mode.label}</strong>
                <span>{mode.description}</span>
              </SettingsButton>
            )
          })}
        </div>
      </div>

      {message && <p className="error" role="status">{message}</p>}
    </section>
  )
}
