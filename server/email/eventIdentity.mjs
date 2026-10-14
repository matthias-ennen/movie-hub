// Validate the Firebase SDK's extracted path before any account/Firestore work.
// Never include malformed identifiers or event payloads in diagnostic output.
export function mailEventIdentity(event, kind) {
  const { uid, profileId, eventId } = event?.params || {}
  const safeProfileId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
  const suffix = kind === 'preferences' ? 'emailPreferences/current'
    : kind === 'notification' && typeof eventId === 'string' && /^[a-zA-Z0-9-]{1,240}$/.test(eventId)
      ? `notifications/${eventId}` : null
  if (event?.type !== 'google.cloud.firestore.document.v1.written'
    || !safeProfileId(uid) || !safeProfileId(profileId) || !suffix
    || event.document !== `users/${uid}/profiles/${profileId}/${suffix}`) throw Error('invalid-mail-event')
  return { uid, profileId, ...(kind === 'notification' ? { eventId } : {}) }
}
