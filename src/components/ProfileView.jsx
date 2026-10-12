import SettingsButton from './SettingsButton.jsx'
import { useEffect, useState } from 'react'
import { useProfiles } from '../profiles/ProfileProvider.jsx'

export default function ProfileView({ user, onSignOut, onOpenSettings }) {
  const {
    profiles,
    activeProfile,
    selectProfile,
    createProfile,
    renameProfile,
  } = useProfiles()
  const [profileName, setProfileName] = useState(activeProfile?.displayName ?? '')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  useEffect(() => {
    setProfileName(activeProfile?.displayName ?? '')
    setProfileMessage('')
  }, [activeProfile?.id, activeProfile?.displayName])

  async function handleCreateProfile() {
    if (profileBusy) return
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

    if (profileBusy) return
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
        <h1>Profile & Konto</h1>
        <p>Jedes interne Profil bekommt eigene Kategorien, persönliche Reihen und Darstellungseinstellungen.</p>
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
              <SettingsButton
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
              </SettingsButton>
            )
          })}
          <SettingsButton
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
          </SettingsButton>
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
            <SettingsButton type="submit" disabled={profileBusy} data-focusable="true">Name speichern</SettingsButton>
          </form>
        )}
        {profileMessage && <p className="profile-message">{profileMessage}</p>}
      </section>

      <section className="settings-panel">
        <h2>Darstellung & Posterreihen</h2>
        <p>Design, Kategorien und persönliche Reihen verwaltest du in den Einstellungen dieses Profils.</p>
        <SettingsButton className="network-settings-open" onClick={() => onOpenSettings?.('display')}>
          Einstellungen öffnen
        </SettingsButton>
      </section>

      <section className="settings-panel account-panel" aria-labelledby="account-heading">
        <div>
          <p className="settings-kicker">Konto</p>
          <h2 id="account-heading">Movie-Hub-Konto</h2>
          <p className="account-email">{user.email}</p>
        </div>
        <SettingsButton type="button" className="account-signout" onClick={onSignOut} data-focusable="true">Abmelden</SettingsButton>
      </section>
    </main>
  )
}
