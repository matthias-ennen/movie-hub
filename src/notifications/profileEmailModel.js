// Shared client/server contract. Verification is never inferred from client data.
export const PROFILE_EMAIL_VERSION = 1
export const EMAIL_PHASES = Object.freeze(['included-found', 'tv-found', 'tv-final'])

export function normalizeEmailAddress(value) {
  if (typeof value !== 'string') return ''
  const email = value.trim()
  const at = email.lastIndexOf('@')
  return at < 0 ? email : `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`
}

export function isValidEmailAddress(value) {
  if (typeof value !== 'string' || value !== normalizeEmailAddress(value) || value.length > 254) return false
  const parts = value.split('@')
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64
    || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')) return false
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0])
    && parts[1].length <= 253 && parts[1].includes('.')
    && parts[1].split('.').every((part) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part))
}

export function initialProfileEmail(profile, accountEmail, stored) {
  // Missing is different from an explicitly saved empty address.
  if (stored != null) return typeof stored.email === 'string' ? stored.email : ''
  return profile?.role === 'primary' ? normalizeEmailAddress(accountEmail) : ''
}

export function validEmailPreferences(value) {
  return value?.schemaVersion === PROFILE_EMAIL_VERSION
    && Number.isSafeInteger(value.revision) && value.revision > 0
    && Number.isSafeInteger(value.addressVersion) && value.addressVersion > 0
    && typeof value.enabled === 'boolean'
    && (isValidEmailAddress(value.email) || (value.email === '' && value.enabled === false))
}

export function nextEmailPreferences(previous, { email, enabled, expectedRevision }, timestamp) {
  if (previous != null && !validEmailPreferences(previous)) throw new Error('Die gespeicherten E-Mail-Einstellungen sind ungültig.')
  if (expectedRevision !== (previous?.revision ?? 0)) {
    throw new Error('Die E-Mail-Einstellungen wurden auf einem anderen Gerät geändert. Bitte die Profilseite erneut öffnen.')
  }
  const normalized = normalizeEmailAddress(email)
  if (typeof enabled !== 'boolean' || (!isValidEmailAddress(normalized) && (normalized || enabled))) {
    throw new Error('Bitte eine gültige E-Mail-Adresse eingeben oder den E-Mail-Empfang ausschalten.')
  }
  return {
    schemaVersion: PROFILE_EMAIL_VERSION,
    email: normalized, enabled,
    revision: (previous?.revision ?? 0) + 1,
    addressVersion: (previous?.addressVersion ?? 0) + (previous?.email === normalized ? 0 : 1),
    updatedAt: timestamp,
  }
}

export function emailAddressConfirmed(preferences, verification) {
  return validEmailPreferences(preferences) && verification?.status === 'verified'
    && verification.email === preferences.email
    && verification.addressVersion === preferences.addressVersion
}
