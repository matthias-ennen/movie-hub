import { alertNotificationId, watchId } from './titleAlertModel.js'
import { isActiveTitleWatch, timeMillis } from './titleAlertLifecycleModel.js'

const titleOrder = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })
const dateFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
})
const timeFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit',
})

export function activeTitleWatchRows(watches) {
  return Object.entries(watches || {})
    .filter(([id, watch]) => isActiveTitleWatch(watch) && watchId(watch, watch.kind) === id
      && alertNotificationId(watch) && String(watch.title || '').trim())
    .map(([id, watch]) => ({ ...watch, id }))
    .sort((a, b) => titleOrder.compare(a.title, b.title) || a.id.localeCompare(b.id))
}

export function titleWatchStatusText(watch, event, now = Date.now()) {
  if (watch.kind === 'included') return 'Wartet auf ein Angebot bei deinen aktivierten Anbietern.'
  const valid = event?.id === alertNotificationId(watch) && event?.phase === 'tv-found'
    && event.kind === 'tv' && event.titleType === watch.type
    && Number(event.tmdbId) === Number(watch.tmdbId)
  if (!valid || event.scheduleStatus === 'cancelled') return 'Wartet auf einen passenden TV-Termin.'
  if (['completed', 'expired'].includes(event.scheduleStatus)) return 'Beobachtung wird abgeschlossen …'
  const start = timeMillis(event.airingStartAt)
  if (!Number.isFinite(start) || !String(event.stationName || '').trim()) return 'Wartet auf einen passenden TV-Termin.'
  const stop = timeMillis(event.airingEndsAt)
  if (start <= now && (!Number.isFinite(stop) || stop <= now)) return 'TV-Termin vergangen · Status wird aktualisiert.'
  const status = start > now ? 'Erinnerung geplant' : 'Sendung läuft'
  return `${dateFormat.format(start)}, ${timeFormat.format(start)} Uhr · ${event.stationName} · ${status}`
}

// A settings action only cancels the activation the user actually saw. A
// concurrent completion or reactivation must never turn this into a toggle.
export async function cancelTitleWatch(transaction, ref, expected, isCurrentScope = () => true) {
  const snapshot = await transaction.get(ref)
  if (!isCurrentScope()) return 'scope-changed'
  if (!snapshot.exists() || !isActiveTitleWatch(snapshot.data())) return 'inactive'
  const current = snapshot.data()
  if (current.activationId !== expected.activationId
    || watchId(current, current.kind) !== expected.id) return 'activation-changed'
  transaction.delete(ref)
  return 'cancelled'
}
