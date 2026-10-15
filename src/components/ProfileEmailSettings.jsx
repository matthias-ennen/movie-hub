import { useEffect, useRef, useState } from 'react'
import SettingsButton from './SettingsButton.jsx'
import SettingsToggle from './SettingsToggle.jsx'
import { emailAddressConfirmed, initialProfileEmail, isValidEmailAddress, normalizeEmailAddress } from '../notifications/profileEmailModel.js'
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
    if (busy || (preferences?.revision ?? 0) < revision) return
    // A server-side unsubscribe must update the switch even with an unsaved address draft.
    setEnabled(preferences?.enabled === true)
    if (!dirty) {
      setEmail(initialProfileEmail(profile, accountEmail, preferences))
      setRevision(preferences?.revision ?? 0)
    }
  }, [preferences, profile, accountEmail, dirty, busy, revision])

  async function toggleEmail() {
    if (!ready || saving.current || error) return
    // A toggle changes consent only, never an unsaved address draft.
    const storedEmail = initialProfileEmail(profile, accountEmail, preferences)
    const nextEnabled = !enabled
    if (nextEnabled && !isValidEmailAddress(storedEmail)) {
      setMessage('Bitte zuerst eine gültige E-Mail-Adresse speichern.')
      return
    }
    saving.current = true
    setBusy(true)
    setEnabled(nextEnabled)
    setMessage('')
    try {
      const saved = await save({ email: storedEmail, enabled: nextEnabled, expectedRevision: revision })
      if (alive.current) {
        setEnabled(saved.enabled)
        setRevision(saved.revision)
        setMessage(saved.enabled ? 'E-Mail-Mitteilungen eingeschaltet.' : 'E-Mail-Mitteilungen ausgeschaltet.')
      }
    } catch (failure) {
      if (alive.current) {
        setEnabled(enabled)
        setMessage(failure?.code
          ? 'E-Mail-Mitteilungen konnten nicht geändert werden. Bitte erneut versuchen.'
          : failure?.message || 'E-Mail-Mitteilungen konnten nicht geändert werden.')
      }
    } finally {
      saving.current = false
      if (alive.current) setBusy(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (!ready || saving.current || error) return
    const normalized = normalizeEmailAddress(email)
    if (normalized === initialProfileEmail(profile, accountEmail, preferences)
      && preferences?.enabled === enabled && emailAddressConfirmed(preferences, verification)) {
      setDirty(false)
      setMessage('E-Mail-Adresse ist bereits gespeichert.')
      return
    }
    saving.current = true
    setBusy(true)
    setMessage('')
    try {
      const saved = await save({ email: normalized, enabled, expectedRevision: revision })
      if (alive.current) {
        setEmail(saved.email)
        setEnabled(saved.enabled)
        setRevision(saved.revision)
        setDirty(false)
        setMessage('E-Mail-Adresse gespeichert.')
      }
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
  const currentProof = verification && preferences && verification.addressVersion === preferences.addressVersion
    && (!['pending', 'failed'].includes(verification.status) || verification.revision === preferences?.revision)
    ? verification : null
  const status = !preferences?.enabled ? '' : confirmed ? 'E-Mail-Adresse bestätigt.'
    : currentProof?.status === 'limited' ? 'Zu viele Bestätigungsanfragen. Bitte später erneut speichern.'
      : currentProof?.status === 'failed' ? 'Die Bestätigungs-E-Mail konnte nicht versandt werden. Bitte erneut speichern.'
        : currentProof?.status === 'pending'
          ? timeMillis(currentProof.expiresAt) <= Date.now()
            ? 'Der Bestätigungslink ist abgelaufen. Bitte erneut speichern.'
            : currentProof.sentAt ? 'Bitte bestätige deine E-Mail-Adresse über den zugesandten Link.'
              : 'Die Bestätigungs-E-Mail wird vorbereitet.'
          : 'E-Mail-Empfang vorgemerkt. Die Bestätigung steht noch aus.'
  return (
    <form className="profile-email-form" onSubmit={submit} aria-label="E-Mail-Mitteilungen für dieses Profil">
      <div className="profile-email-address-row">
        <label htmlFor="profile-email-address">E-Mail-Adresse
          <input id="profile-email-address" type="email" autoComplete="email" maxLength={254}
            value={email} readOnly={!ready || busy || Boolean(error)} data-focusable="true"
            onChange={(event) => { setEmail(event.target.value); setDirty(true); setMessage('') }} />
        </label>
        <SettingsButton type="submit" disabled={!ready || busy || Boolean(error)} aria-busy={busy || undefined}>
          {busy ? 'Speichert …' : 'E-Mail speichern'}
        </SettingsButton>
      </div>
      <SettingsToggle label="Mitteilungen auch per E-Mail erhalten" enabled={enabled}
        busy={!ready || busy || Boolean(error)} saving={busy} onToggle={toggleEmail} />
      <div className="profile-email-feedback" role="status" aria-live="polite">
        {(error || message || !ready) && <p className="profile-message">{error || message || 'E-Mail-Einstellungen werden geladen …'}</p>}
        {ready && !error && status && <p className="profile-message">{status}</p>}
      </div>
    </form>
  )
}

export default function ProfileEmailSettings({ user, profile }) {
  const state = useProfileEmail(user.uid, profile.id)
  return <ProfileEmailForm profile={profile} accountEmail={user.email} {...state} />
}
