import { timeMillis, personalHardExpiry } from './titleAlertLifecycleModel.js'
import { alertNotificationId, watchId } from './titleAlertModel.js'

export const FINAL_LEAD_MS = 5 * 60 * 1000
export const FINAL_LATE_GRACE_MS = 15 * 60 * 1000
export const FINAL_MAX_BATCH = 200

// The first TV event is authoritative. A nightly state checkpoint is NOT
// required: the user may activate a TV watch hours before the next nightly run.
export function tvFinalEligibility(watch, firstEvent, now = Date.now()) {
  if (!watch || watch.kind !== 'tv'
    || !['movie', 'series'].includes(watch.type)
    || watch.status === 'completed'
    || !(watch.status === 'active' || (watch.status == null && watch.schemaVersion === 1))
    || firstEvent?.schemaVersion !== 2 || firstEvent?.phase !== 'tv-found'
    || firstEvent.kind !== 'tv' || firstEvent.titleType !== watch.type
    || Number(firstEvent.tmdbId) !== Number(watch.tmdbId)
    || !String(firstEvent.stationName || '').trim()) return null
  const start = timeMillis(firstEvent.airingStartAt)
  const current = timeMillis(now)
  if (!Number.isFinite(start) || !Number.isFinite(current)) return null
  if (current < start - FINAL_LEAD_MS || current >= start + FINAL_LATE_GRACE_MS) return null
  return { start, now: current, late: current >= start }
}

export function tvFinalNotification(watch, firstEvent, now) {
  const due = tvFinalEligibility(watch, firstEvent, now)
  if (!due) return null
  const end = timeMillis(firstEvent.airingEndsAt)
  const station = String(firstEvent.stationName).trim()
  const title = String(watch.title || '').trim()
  if (!title || title.length > 160 || station.length > 160) return null
  const body = due.late
    ? `${title} läuft jetzt auf ${station}.`
    : `In wenigen Minuten: ${title} auf ${station}.`
  return {
    schemaVersion: 2, kind: 'tv', titleType: watch.type,
    tmdbId: Number(watch.tmdbId), title: due.late ? 'Jetzt im TV' : 'Gleich im TV',
    mediaTitle: title, body, phase: 'tv-final',
    eventAt: new Date(due.now), completedAt: new Date(due.now),
    startsAt: new Date(due.now),
    expiresAt: personalHardExpiry('tv', {
      createdAt: due.now, airingEndsAt: Number.isFinite(end) ? end : undefined,
    }),
    airingStartAt: new Date(due.start), stationName: station,
    ...(Number.isFinite(end) ? { airingEndsAt: new Date(end) } : {}),
  }
}

export function isCanonicalFirstTvEvent(watch, eventId) {
  return watchId(watch, 'tv') !== null
    && alertNotificationId(watch, 'initial') === eventId
}
