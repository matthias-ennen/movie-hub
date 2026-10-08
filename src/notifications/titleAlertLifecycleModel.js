// Pure contract for #381. This module deliberately performs no Firestore writes.
// The existing V1 client and nightly server continue to operate until phases B–E.
export const TITLE_ALERT_SCHEMA_VERSION = 2
export const PERSONAL_NOTIFICATION_SCHEMA_VERSION = 2
export const PERSONAL_READ_AFTER_COMPLETION_MS = 7 * 86400000
export const PERSONAL_HARD_TTL_MS = 30 * 86400000
export const TV_POST_AIRING_TTL_MS = 7 * 86400000

export function timeMillis(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  if (value instanceof Date) return value.getTime()
  if (value && typeof value.toMillis === 'function') {
    const result = value.toMillis()
    return Number.isFinite(result) ? result : NaN
  }
  if (value && Number.isFinite(value.seconds)) {
    return value.seconds * 1000 + (Number(value.nanoseconds) || 0) / 1e6
  }
  return NaN
}

export function titleWatchStatus(watch) {
  if (!watch || typeof watch !== 'object') return 'inactive'
  if (watch.status === 'completed') return 'completed'
  if (watch.status === 'active') return 'active'
  // A V1 watch has no status field and is active while its document exists.
  if (watch.status == null && watch.schemaVersion === 1) return 'active'
  return 'inactive' // Unknown future/invalid states must not fire.
}

export function isActiveTitleWatch(watch) {
  return titleWatchStatus(watch) === 'active'
}

export function isTerminalAlertPhase(kind, phase) {
  return (kind === 'included' && phase === 'included-found')
    || (kind === 'tv' && phase === 'tv-final')
}

// Preserve all existing V1 data while making the terminal transition explicit.
// Calling this twice returns null, so a replay cannot extend completedAt.
export function finishTitleWatch(watch, { phase, notificationId, completedAt } = {}) {
  if (!isActiveTitleWatch(watch)) return null
  if (!isTerminalAlertPhase(watch.kind, phase)) return null
  if (typeof notificationId !== 'string' || !/^[a-zA-Z0-9-]{1,240}$/.test(notificationId)) {
    throw new Error('A valid persisted notification ID is required to complete a watch.')
  }
  const completed = timeMillis(completedAt)
  if (!Number.isFinite(completed)) throw new Error('A valid completion instant is required.')
  return {
    ...watch, schemaVersion: TITLE_ALERT_SCHEMA_VERSION,
    status: 'completed', completedAt: new Date(completed),
    completionNotificationId: notificationId,
  }
}

// Repeated watching is a conscious new activation, never a new cycle of the old one.
export function activateTitleWatch(previous, { activationId, createdAt } = {}) {
  if (isActiveTitleWatch(previous)) throw new Error('An active watch cannot be silently replaced.')
  if (typeof activationId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(activationId)
    || activationId === previous?.activationId) {
    throw new Error('Reactivation requires a new valid activation ID.')
  }
  const started = timeMillis(createdAt)
  if (!Number.isFinite(started)) throw new Error('A valid activation instant is required.')
  const { completedAt, completionNotificationId, ...retained } = previous || {}
  return {
    ...retained, schemaVersion: TITLE_ALERT_SCHEMA_VERSION,
    activationId, createdAt: new Date(started), status: 'active',
  }
}

// A hard expiration cannot be postponed by opening a message or by a replay.
export function personalHardExpiry(kind, { createdAt, airingEndsAt } = {}) {
  const created = timeMillis(createdAt)
  if (!Number.isFinite(created) || !['included', 'tv'].includes(kind)) {
    throw new Error('Personal expiry requires a supported type and creation timestamp.')
  }
  const outerLimit = created + PERSONAL_HARD_TTL_MS
  if (kind === 'included') return new Date(outerLimit)
  const airingEnd = timeMillis(airingEndsAt)
  // TV reminders are not valid indefinitely even when no reliable stop time exists.
  const proposed = Number.isFinite(airingEnd)
    ? Math.max(created, airingEnd + TV_POST_AIRING_TTL_MS)
    : created + TV_POST_AIRING_TTL_MS
  return new Date(Math.min(outerLimit, proposed))
}

export function personalVisibleUntil(message, readState = null) {
  const hardLimit = timeMillis(message?.expiresAt)
  if (!Number.isFinite(hardLimit)) return NaN // Fail closed, including legacy data.
  const completed = timeMillis(message?.completedAt)
  const read = timeMillis(readState?.readAt ?? readState)
  // Unread, unfinished and V1 notifications retain the existing hard limit.
  if (!Number.isFinite(completed) || !Number.isFinite(read)) return hardLimit
  return Math.min(hardLimit, Math.max(completed, read) + PERSONAL_READ_AFTER_COMPLETION_MS)
}

export function isCurrentPersonalNotification(message, readState = null, now = Date.now()) {
  if (!message || ![1, PERSONAL_NOTIFICATION_SCHEMA_VERSION].includes(message.schemaVersion)
    || !['included', 'tv'].includes(message.kind)) return false
  const start = timeMillis(message.startsAt)
  const end = personalVisibleUntil(message, readState)
  const checkedAt = timeMillis(now)
  return Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(checkedAt)
    && start <= checkedAt && checkedAt < end
}
