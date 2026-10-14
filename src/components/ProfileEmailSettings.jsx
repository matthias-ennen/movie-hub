import { useEffect, useRef, useState } from 'react'
import SettingsButton from './SettingsButton.jsx'
import SettingsToggle from './SettingsToggle.jsx'
import { emailAddressConfirmed, initialProfileEmail } from '../notifications/profileEmailModel.js'
import { useProfileEmail } from '../notifications/useProfileEmail.js'
import { timeMillis } from '../notifications/titleAlertLifecycleModel.js'

export function ProfileEmailForm({ profile, accountEmail, ready, preferences, verification, error, save }) {
  const [email, setEmail] = useState(() => initialProfileEmail(profile, accountEmail, preferences))
  const [enabled, setEnabled] = useState(preferences?.enabled === true)
  const [revision, setRevision] = useState(preferences?.revision ?? 0)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const alive = useRef(true)
  const saving = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (dirty || busy) return
    setEmail(initialProfileEmail(profile, accountEmail, preferences))
    setEnabled(preferences?.enabled === true)
    setRevision(preferences?.revision ?? 0)
  }, [preferences, profile, accountEmail, dirty, busy])

  async function submit(event) {
    event.preventDefault()
    if (!ready || saving.current || error) return
    saving.current = true
    setBusy(true)
    setMessage('')
    try {
      await save({ email, enabled, expectedRevision: revision })
      if (alive.current) { setDirty(false); setMessage('E-Mail-Einstellungen gespeichert.') }
    } catch (failure) {
      if (alive.current) setMessage(failure?.code
        ? 'E-Mail-Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen.'
        : failure?.message || 'E-Mail-Einstellungen konnten nicht gespeichert werden.')
    } finally {
      saving.current = false
      if (alive.current) setBusy(false)
    }
  }

  const confirmed = emailAddressConfirmed(preferences, verification)
  const currentProof = verification?.addressVersion === preferences?.addressVersion ? verification : null
  const status = !preferences?.enabled ? '' : confirmed ? 'E-Mail-Adresse bestätigt.'
    : currentProof?.status === 'limited' ? 'Zu viele Bestätigungsanfragen. Bitte später erneut speichern.'
      : currentProof?.status === 'failed' ? 'Die Bestätigungs-E-Mail konnte nicht versandt werden. Bitte erneut speichern.'
        : currentProof?.status === 'pending'
          ? timeMillis(currentProof.expiresAt) <= Date.now()
            ? 'Der Bestätigungslink ist abgelaufen. Bitte erneut speichern.'
            : currentProof.sentAt ? 'Bitte bestätige deine E-Mail-Adresse über den zugesandten Link.'
              : 'Die Bestätigungs-E-Mail wird vorbereitet.'
          : 'E-Mail-Empfang vorgemerkt. Die Versandfreischaltung steht noch aus.'
  return (
    <form className="profile-email-form" onSubmit={submit} aria-label="E-Mail-Mitteilungen für dieses Profil">
      <label htmlFor="profile-email-address">E-Mail-Adresse
        <input id="profile-email-address" type="email" autoComplete="email" maxLength={254}
          value={email} readOnly={!ready || busy || Boolean(error)} data-focusable="true"
          onChange={(event) => { setEmail(event.target.value); setDirty(true); setMessage('') }} />
      </label>
      <SettingsToggle label="Mitteilungen auch per E-Mail erhalten" enabled={enabled}
        busy={!ready || busy || Boolean(error)} onToggle={() => { setEnabled(!enabled); setDirty(true); setMessage('') }} />
      <SettingsButton type="submit" disabled={!ready || busy || Boolean(error)} aria-busy={busy || undefined}>
        {busy ? 'Speichert …' : 'E-Mail-Einstellungen speichern'}
      </SettingsButton>
      <p className="profile-message" role="status" aria-live="polite">{error || message || (!ready ? 'E-Mail-Einstellungen werden geladen …' : status)}</p>
    </form>
  )
}

export default function ProfileEmailSettings({ user, profile }) {
  const state = useProfileEmail(user.uid, profile.id)
  return <ProfileEmailForm profile={profile} accountEmail={user.email} {...state} />
}
