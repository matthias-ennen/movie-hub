import { isCurrentPersonalNotification } from './titleAlertLifecycleModel.js'

// Pure inbox filter: no Firebase initialization, React hook or network access.
// Global Admin semantics remain unchanged by the personal watch lifecycle.
export function activeAnnouncement(item, now, readState = null) {
  if (item.id?.startsWith('profile:')) {
    return item.mode === 'inbox' && typeof item.title === 'string'
      && typeof item.body === 'string'
      && isCurrentPersonalNotification(item, readState, now)
  }
  const start = item.startsAt?.toMillis?.()
  const end = item.expiresAt?.toMillis?.()
  return item.schemaVersion === 1 && item.status === 'published'
    && ['inbox', 'startup'].includes(item.mode)
    && typeof item.title === 'string' && typeof item.body === 'string'
    && Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end
}

// A listener for the former account/profile may still have cached entries
// during a React render before its cleanup effect runs. Never render that
// previous scope's personal notifications in the newly selected scope.
export function visibleProfileAnnouncements(personal, userId, profileId) {
  if (!userId || !profileId) return []
  return personal.filter((item) => item.ownerUserId === userId && item.profileId === profileId)
}
