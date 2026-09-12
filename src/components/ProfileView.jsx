import { useEffect, useState } from 'react'
import {
  MOVIE_CATEGORY_OPTIONS,
  SERIES_CATEGORY_OPTIONS,
  normalizeCategorySettings,
} from '../catalog/categoryRows.js'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import { useTheme } from '../theme/ThemeProvider.jsx'

export default function ProfileView({ user, onSignOut }) {
  const {
    profiles,
    activeProfile,
    selectProfile,
    createProfile,
    renameProfile,
    updateActiveProfileCategorySettings,
  } = useProfiles()
  const {
    themeId,
    themes,
    autoSwitchEnabled,
    autoSwitchInterval,
    autoSwitchIntervals,
    selectTheme,
    setAutoSwitchEnabled,
    setAutoSwitchInterval,
  } = useTheme()
  const [profileName, setProfileName] = useState(activeProfile?.displayName ?? '')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [categorySavingId, setCategorySavingId] = useState(null)
  const [categoryMessage, setCategoryMessage] = useState('')
  const categorySettings = normalizeCategorySettings(activeProfile?.categorySettings)
  const categoryGroups = [
    {
      id: 'movie',
      title: 'Filmkategorien',
      options: MOVIE_CATEGORY_OPTIONS,
      enabledIds: categorySettings.enabledMovieCategoryIds,
    },
    {
      id: 'series',
      title: 'Serienkategorien',
      options: SERIES_CATEGORY_OPTIONS,
      enabledIds: categorySettings.enabledSeriesCategoryIds,
    },
  ]

  useEffect(() => {
    setProfileName(activeProfile?.displayName ?? '')
    setProfileMessage('')
    setCategoryMessage('')
  }, [activeProfile?.id, activeProfile?.displayName])

  async function toggleCategory(mediaType, categoryId) {
    if (!activeProfile || categorySavingId) return
    const current = normalizeCategorySettings(activeProfile.categorySettings)
    const key = mediaType === 'series' ? 'enabledSeriesCategoryIds' : 'enabledMovieCategoryIds'
    const enabled = current[key].includes(categoryId)
    const next = {
      ...current,
      [key]: enabled
        ? current[key].filter((id) => id !== categoryId)
        : [...current[key], categoryId],
    }

    setCategorySavingId(`${mediaType}:${categoryId}`)
    setCategoryMessage('')
    try {
      await updateActiveProfileCategorySettings(next)
    } catch (error) {
      console.error(error)
      setCategoryMessage('Kategorien konnten nicht gespeichert werden.')
    } finally {
      setCategorySavingId(null)
    }
  }

  async function handleCreateProfile() {
    setProfileBusy(true)
    setProfileMessage('')
    try {
      await createProfile()
      setProfileMessage('Neues Profil angelegt und aktiviert.')
    } catch (error) {
      console.error(error)
      setProfileMessage('Profil konnte nicht angelegt werden.')
    } finally {
      setProfileBusy(false)
    }
  }

  async function handleRenameProfile(event) {
    event.preventDefault()
    if (!activeProfile) return

    setProfileBusy(true)
    setProfileMessage('')
    try {
      const changed = await renameProfile(activeProfile.id, profileName)
      setProfileMessage(changed ? 'Profilname gespeichert.' : 'Bitte einen Profilnamen eingeben.')
    } catch (error) {
      console.error(error)
      setProfileMessage('Profilname konnte nicht gespeichert werden.')
    } finally {
      setProfileBusy(false)
    }
  }

  return (
    <main className="browse-page profile-page">
      <div className="page-heading profile-heading">
        <p className="eyebrow">Dein Movie Hub</p>
        <h1>Profil & Design</h1>
        <p>Jedes interne Profil bekommt eigene Kategorien und Darstellungseinstellungen.</p>
      </div>

      <section className="settings-panel" aria-labelledby="profiles-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Profile</p>
            <h2 id="profiles-heading">Movie-Hub-Profil auswählen</h2>
          </div>
          <span className="settings-status">Aktiv: {activeProfile?.displayName ?? '–'}</span>
        </div>

        <div className="profile-choice-grid" aria-label="Interne Movie-Hub-Profile">
          {profiles.map((profile) => {
            const active = profile.id === activeProfile?.id
            const initial = profile.displayName.trim().charAt(0).toUpperCase() || 'P'
            return (
              <button
                type="button"
                key={profile.id}
                className={active ? 'profile-choice active' : 'profile-choice'}
                onClick={() => selectProfile(profile.id)}
                data-focusable="true"
                aria-pressed={active}
              >
                <span className="profile-choice-avatar" aria-hidden="true">{initial}</span>
                <span className="profile-choice-copy">
                  <strong>{profile.displayName}</strong>
                  <span>{profile.role === 'primary' ? 'Hauptprofil' : 'Unterprofil'}{active ? ' · Aktiv' : ''}</span>
                </span>
              </button>
            )
          })}
          <button
            type="button"
            className="profile-choice profile-add-choice"
            onClick={handleCreateProfile}
            disabled={profileBusy}
            data-focusable="true"
          >
            <span className="profile-choice-avatar" aria-hidden="true">+</span>
            <span className="profile-choice-copy">
              <strong>Profil hinzufügen</strong>
              <span>Eigene Kategorien, eigenes Design und eigene Inhalte</span>
            </span>
          </button>
        </div>

        {activeProfile && (
          <form className="profile-name-form" onSubmit={handleRenameProfile}>
            <label>
              Aktives Profil umbenennen
              <input
                type="text"
                value={profileName}
                maxLength={32}
                onChange={(event) => setProfileName(event.target.value)}
                data-focusable="true"
              />
            </label>
            <button type="submit" disabled={profileBusy} data-focusable="true">Name speichern</button>
          </form>
        )}
        {profileMessage && <p className="profile-message">{profileMessage}</p>}
      </section>

      <section className="settings-panel category-settings-panel" aria-labelledby="category-settings-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Persönliche Auswahl</p>
            <h2 id="category-settings-heading">Meine Kategorien</h2>
          </div>
          <span className="settings-status">Profil: {activeProfile?.displayName ?? '–'}</span>
        </div>

        <p className="settings-description">
          Deine Auswahl erscheint auf Filme und Serien direkt vor den Anbieterreihen. Home und Meine Inhalte bleiben unverändert.
        </p>

        {activeProfile && categoryGroups.map((group) => (
          <div className="category-settings-group" key={group.id}>
            <div className="category-settings-group-heading">
              <h3>{group.title}</h3>
              <span>{group.enabledIds.length} von {group.options.length} aktiv</span>
            </div>
            <div className="category-choice-grid" aria-label={`${group.title} auswählen`}>
              {group.options.map((category) => {
                const enabled = group.enabledIds.includes(category.id)
                const saving = categorySavingId === `${group.id}:${category.id}`
                return (
                  <button
                    type="button"
                    key={category.id}
                    className={enabled ? 'category-choice active' : 'category-choice'}
                    onClick={() => toggleCategory(group.id, category.id)}
                    role="switch"
                    aria-checked={enabled}
                    aria-busy={saving}
                    data-focusable="true"
                  >
                    <span>{category.title}</span>
                    <span className={enabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true">
                      <span />
                    </span>
                    <small>{saving ? 'Speichert …' : enabled ? 'An' : 'Aus'}</small>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {categoryMessage && <p className="error" role="status">{categoryMessage}</p>}
        <p className="settings-hint">
          Klassiker umfasst in dieser Version Filme mit Erscheinungsjahr vor 2000. Jede Änderung gilt nur für das aktuell aktive Profil.
        </p>
      </section>

      <section className="settings-panel" aria-labelledby="theme-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Darstellung</p>
            <h2 id="theme-heading">Design auswählen</h2>
          </div>
          <span className="settings-status">Aktiv: {themes.find((theme) => theme.id === themeId)?.label}</span>
        </div>

        <div className="theme-choice-grid">
          {themes.map((theme) => {
            const active = theme.id === themeId
            return (
              <button
                type="button"
                key={theme.id}
                className={active ? 'theme-choice active' : 'theme-choice'}
                onClick={() => selectTheme(theme.id)}
                data-focusable="true"
                aria-pressed={active}
              >
                <span className={`theme-preview theme-preview-${theme.id}`} aria-hidden="true">
                  <span className="theme-preview-bar" />
                  <span className="theme-preview-hero" />
                  <span className="theme-preview-row">
                    <i /><i /><i /><i />
                  </span>
                </span>
                <span className="theme-choice-copy">
                  <span className="theme-choice-title">
                    <strong>{theme.label}</strong>
                    {active && <span className="active-mark">Aktiv</span>}
                  </span>
                  <span>{theme.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="settings-panel auto-switch-panel" aria-labelledby="auto-switch-heading">
        <div className="settings-heading auto-switch-heading-row">
          <div>
            <p className="settings-kicker">Abwechslung</p>
            <h2 id="auto-switch-heading">Automatischer Designwechsel</h2>
          </div>
          <button
            type="button"
            className={autoSwitchEnabled ? 'switch-control active' : 'switch-control'}
            role="switch"
            aria-checked={autoSwitchEnabled}
            aria-label="Automatischen Designwechsel ein- oder ausschalten"
            onClick={() => setAutoSwitchEnabled(!autoSwitchEnabled)}
            data-focusable="true"
          >
            <span className="switch-knob" />
            <span className="switch-label">{autoSwitchEnabled ? 'Ein' : 'Aus'}</span>
          </button>
        </div>

        <p className="settings-description">
          Wenn diese Funktion aktiv ist, wählt Movie Hub beim ersten Start einer neuen Wechselperiode zufällig eines der fünf Designs aus – nur für das aktuell aktive Profil.
        </p>

        {autoSwitchEnabled && (
          <div className="interval-controls" aria-label="Intervall für automatischen Designwechsel">
            {autoSwitchIntervals.map((interval) => (
              <button
                type="button"
                key={interval.id}
                className={autoSwitchInterval === interval.id ? 'interval-button active' : 'interval-button'}
                onClick={() => setAutoSwitchInterval(interval.id)}
                data-focusable="true"
                aria-pressed={autoSwitchInterval === interval.id}
              >
                {interval.label}
              </button>
            ))}
          </div>
        )}

        <p className="settings-hint">
          Eine manuelle Designwahl schaltet die Automatik nicht aus. Das manuell gewählte Design bleibt bis zum nächsten planmäßigen Wechsel aktiv.
        </p>
      </section>

      <section className="settings-panel account-panel" aria-labelledby="account-heading">
        <div>
          <p className="settings-kicker">Konto</p>
          <h2 id="account-heading">Movie-Hub-Konto</h2>
          <p className="account-email">{user.email}</p>
        </div>
        <button type="button" className="account-signout" onClick={onSignOut} data-focusable="true">Abmelden</button>
      </section>
    </main>
  )
}
