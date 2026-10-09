import { timeMillis } from './titleAlertLifecycleModel.js'

// Keep the already delivered first notification ID and readAt immutable while
// reconciling its schedule against the latest complete 14-day EPG generation.
// This is only allowed BEFORE the originally bound airing begins, or after a
// previously cancelled airing becomes available again.
// Keep the original confirmed broadcast when it is still present in the
// current schedule. A different, newly discovered earlier rerun is not a
// reason to move a user's already-announced appointment.
export function selectTvAiringForReconciliation(first, airings = []) {
  const candidates = Array.isArray(airings) ? airings : []
  const previousStart = timeMillis(first?.airingStartAt)
  const previousStation = String(first?.stationName || '').trim().toLocaleLowerCase('de-DE')
  const original = Number.isFinite(previousStart) && previousStation
    ? candidates.find((airing) => timeMillis(airing?.startTime) === previousStart
      && String(airing?.stationName || '').trim().toLocaleLowerCase('de-DE') === previousStation)
    : null
  return original || candidates[0] || null
}

export function tvFirstAiringReconciliation(first, nextAiring, {
  now = Date.now(), sourceComplete = true,
} = {}) {
  if (first?.schemaVersion !== 2 || first?.kind !== 'tv' || first?.phase !== 'tv-found'
    || first?.scheduleStatus === 'completed') return null
  const previousStart = timeMillis(first.airingStartAt)
  const currentTime = timeMillis(now)
  if (!Number.isFinite(previousStart) || !Number.isFinite(currentTime)) return null
  // A final that was missed because the cloud timer was offline remains
  // eligible for a NEW verified airing without manufacturing a late alert.
  const wasCancelled = ['cancelled', 'expired'].includes(first.scheduleStatus)
  if (!wasCancelled && previousStart <= currentTime) return null

  if (!nextAiring) {
    return sourceComplete && !wasCancelled ? { status: 'cancelled' } : null
  }

  const nextStart = timeMillis(nextAiring.startTime)
  const nextEnd = timeMillis(nextAiring.stopTime)
  const station = String(nextAiring.stationName || '').trim()
  if (!station || !Number.isFinite(nextStart) || nextStart <= currentTime
    || !Number.isFinite(nextEnd) || nextEnd <= nextStart) return null

  const previousEnd = timeMillis(first.airingEndsAt)
  if (!wasCancelled && previousStart === nextStart && previousEnd === nextEnd
    && String(first.stationName || '').trim() === station) return null

  return {
    status: 'scheduled', start: nextStart, end: nextEnd, station,
    airing: nextAiring,
  }
}
