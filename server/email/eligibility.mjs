import { emailAddressConfirmed, EMAIL_PHASES, validEmailPreferences } from '../../src/notifications/profileEmailModel.js'
import { isActiveTitleWatch, timeMillis } from '../../src/notifications/titleAlertLifecycleModel.js'
import { alertNotificationId, watchId } from '../../src/notifications/titleAlertModel.js'

export const MAIL_RETRY_WINDOW = 23 * 60 * 60 * 1000 // Below Resend's 24h idempotency window.
export const MAIL_MAX_ATTEMPTS = 5

export function notificationMailModel({ eventId, message, watch, preferences, verification, profileName, createdAt, now, liveAfter }) {
  if (!validEmailPreferences(preferences) || !preferences.enabled || !emailAddressConfirmed(preferences, verification)
    || !EMAIL_PHASES.includes(message?.phase) || message.schemaVersion !== 2
    || !watchId(watch, watch?.kind) || message.kind !== watch.kind
    || message.titleType !== watch.type || message.tmdbId !== watch.tmdbId
    || message.mediaTitle !== watch.title || typeof watch.title !== 'string' || !watch.title.trim()
    || watch.title.length > 160 || !Number.isFinite(createdAt) || !Number.isFinite(liveAfter)
    || createdAt < liveAfter || createdAt > now
    || !Number.isFinite(timeMillis(preferences.updatedAt)) || createdAt < timeMillis(preferences.updatedAt)
    || !Number.isFinite(timeMillis(verification.verifiedAt)) || createdAt < timeMillis(verification.verifiedAt)) return null
  const isFinal = message.phase === 'tv-final'
  if (eventId !== alertNotificationId(watch, isFinal ? 'final' : 'initial')) return null
  if (message.kind === 'included' && message.phase !== 'included-found') return null
  if (message.kind === 'available' && message.phase !== 'available-found') return null
  if (message.kind === 'tv' && !['tv-found', 'tv-final'].includes(message.phase)) return null
  const terminal = message.phase === 'included-found' || message.phase === 'available-found' || isFinal
  if (terminal ? watch.status !== 'completed' || watch.completionNotificationId !== eventId
    : !isActiveTitleWatch(watch) || message.scheduleStatus !== 'scheduled') return null
  let expiresAt = Math.min(createdAt + MAIL_RETRY_WINDOW, timeMillis(message.expiresAt))
  const airingStartAt = timeMillis(message.airingStartAt)
  const airingEndsAt = timeMillis(message.airingEndsAt)
  if (message.kind === 'tv') {
    if (!Number.isFinite(airingStartAt) || !String(message.stationName || '').trim()
      || String(message.stationName).length > 160) return null
    expiresAt = Math.min(expiresAt, isFinal
      ? Math.min(Number.isFinite(airingEndsAt) ? airingEndsAt : airingStartAt + 15 * 60000, airingStartAt + 6 * 3600000)
      : airingStartAt)
    if (isFinal && now < airingStartAt - 5 * 60000) return null
  }
  if (!Number.isFinite(expiresAt) || now >= expiresAt) return null
  return {
    phase: message.phase, title: watch.title, profileName: String(profileName || 'Profil').slice(0, 32),
    stationName: String(message.stationName || ''),
    providerNames: (Array.isArray(message.providerNames) ? message.providerNames : [])
      .filter((name) => typeof name === 'string' && name.trim() && name.length <= 100).slice(0, 20),
    airingStartAt: Number.isFinite(airingStartAt) ? airingStartAt : null,
    expiresAt,
  }
}
