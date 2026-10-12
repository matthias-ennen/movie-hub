import { useState } from 'react'
import SettingsButton from './SettingsButton.jsx'
import {
  HERO_COUNT_OPTIONS,
  HERO_TRAILER_DELAY_OPTIONS,
  POSTER_ROW_LIMIT_OPTIONS,
  normalizeProfileExperienceSettings,
  updateProfileExperienceSetting,
} from '../profiles/profileExperienceSettings.js'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
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
  {
    id: 'tv',
    title: 'TV',
    options: [
      ['hero', 'Hero-Bereich'],
      ['top10', 'Top 10'],
    ],
  },
]

export default function DisplaySettings() {
  const { activeProfile, updateActiveProfileExperienceSettings } = useProfiles()
  const experienceSettings = normalizeProfileExperienceSettings(activeProfile?.experienceSettings)
  const [experienceSaving, setExperienceSaving] = useState(null)
  const [experienceError, setExperienceError] = useState(null)
  async function saveExperienceSetting(path, value) {
    if (experienceSaving) return
    setExperienceSaving(path)
    setExperienceError(null)
    try {
      const next = updateProfileExperienceSetting(experienceSettings, path, value)
      await updateActiveProfileExperienceSettings(next)
    } catch (error) {
      setExperienceError(error)
    } finally {
      setExperienceSaving(null)

    }
  }

  return (
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
              <SettingsButton
                type="button"
                key={limit}
                className={experienceSettings.posterRowLimit === limit ? 'content-sort-choice active' : 'content-sort-choice'}
                onClick={() => saveExperienceSetting('posterRowLimit', limit)}
                disabled={Boolean(experienceSaving)}
                aria-pressed={experienceSettings.posterRowLimit === limit}
                data-focusable="true"
              >
                <span className="content-sort-choice-title"><strong>{limit}</strong></span>
                <span>Titel je Reihe</span>
              </SettingsButton>
            ))}
          </div>
        </div>

        <div className="content-display-subsection">
          <div className="settings-heading">
            <div>
              <h3>Heroes</h3>
              <p>Anzahl wechselnder Hero-Titel auf den Hauptseiten. Gilt auf allen Hauptseiten.</p>
            </div>
            <span className="settings-status">Standard 5</span>
          </div>
          <div className="content-sort-grid" aria-label="Anzahl Hero-Titel">
            {HERO_COUNT_OPTIONS.map((count) => (
              <SettingsButton
                type="button"
                key={count}
                className={experienceSettings.heroCount === count ? 'content-sort-choice active' : 'content-sort-choice'}
                onClick={() => saveExperienceSetting('heroCount', count)}
                disabled={Boolean(experienceSaving)}
                aria-pressed={experienceSettings.heroCount === count}
                data-focusable="true"
              >
                <span className="content-sort-choice-title"><strong>{count}</strong></span>
                <span>Hero-Titel</span>
              </SettingsButton>
            ))}
          </div>
        </div>

        <div className="content-display-subsection">
          <div className="settings-heading">
            <div>
              <h3>Automatische Hero-Trailer</h3>
              <p>Öffnet nach der gewählten Wartezeit einen vorhandenen Trailer im Vollbild-Player.</p>
            </div>
            <span className="settings-status">Standard Aus · 15 Sekunden · Ton an</span>
          </div>
          <div className="category-choice-grid">
            <SettingsButton
              type="button"
              className={experienceSettings.heroTrailers.enabled ? 'category-choice active' : 'category-choice'}
              onClick={() => saveExperienceSetting('heroTrailers.enabled', !experienceSettings.heroTrailers.enabled)}
              disabled={Boolean(experienceSaving)}
              aria-pressed={experienceSettings.heroTrailers.enabled}
              data-focusable="true"
            >
              <span>Hero-Trailer</span>
              <small>{experienceSaving === 'heroTrailers.enabled' ? 'Speichert …' : experienceSettings.heroTrailers.enabled ? 'An' : 'Aus'}</small>
              <span className={experienceSettings.heroTrailers.enabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true"><span /></span>
            </SettingsButton>
            <SettingsButton
              type="button"
              className={experienceSettings.heroTrailers.soundEnabled ? 'category-choice active' : 'category-choice'}
              onClick={() => saveExperienceSetting('heroTrailers.soundEnabled', !experienceSettings.heroTrailers.soundEnabled)}
              disabled={Boolean(experienceSaving) || !experienceSettings.heroTrailers.enabled}
              aria-pressed={experienceSettings.heroTrailers.soundEnabled}
              data-focusable="true"
            >
              <span>Trailer-Ton</span>
              <small>{experienceSaving === 'heroTrailers.soundEnabled' ? 'Speichert …' : experienceSettings.heroTrailers.soundEnabled ? 'Mit Ton' : 'Stumm'}</small>
              <span className={experienceSettings.heroTrailers.soundEnabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true"><span /></span>
            </SettingsButton>
          </div>
          <div className="content-sort-grid" aria-label="Startverzögerung für Hero-Trailer">
            {HERO_TRAILER_DELAY_OPTIONS.map((seconds) => (
              <SettingsButton
                type="button"
                key={seconds}
                className={experienceSettings.heroTrailers.delaySeconds === seconds ? 'content-sort-choice active' : 'content-sort-choice'}
                onClick={() => saveExperienceSetting('heroTrailers.delaySeconds', seconds)}
                disabled={Boolean(experienceSaving) || !experienceSettings.heroTrailers.enabled}
                aria-pressed={experienceSettings.heroTrailers.delaySeconds === seconds}
                data-focusable="true"
              >
                <span className="content-sort-choice-title"><strong>{seconds}</strong></span>
                <span>Sekunden</span>
              </SettingsButton>
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
                    <SettingsButton
                      type="button"
                      key={path}
                      className={enabled ? 'category-choice active' : 'category-choice'}
                      onClick={() => saveExperienceSetting(path, !enabled)}
                      disabled={Boolean(experienceSaving)}
                      aria-pressed={enabled}
                      data-focusable="true"
                    >
                      <span>{label}</span>
                      <small>{experienceSaving === path ? 'Speichert …' : enabled ? 'Sichtbar' : 'Ausgeblendet'}</small>
                      <span className={enabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true"><span /></span>
                    </SettingsButton>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {experienceError && <p className="error" role="status">Profileinstellungen konnten nicht gespeichert werden: {experienceError.message}</p>}
      </section>

  )
}
