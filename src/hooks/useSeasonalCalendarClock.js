import { useSyncExternalStore } from 'react'
import { seasonalCalendarPeriod } from '../catalog/seasonalContent.js'

// A single shared date source drives both seasonal poster selection and visual
// themes. Subscribers receive the same transition, without a per-component timer.
const listeners = new Set()
let currentPeriod = seasonalCalendarPeriod().periodKey
let refreshTimer = null

function snapshot() {
  return currentPeriod
}

function refresh() {
  const next = seasonalCalendarPeriod().periodKey
  if (next === currentPeriod) return
  currentPeriod = next
  listeners.forEach(listener => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== 'undefined') {
    refresh()
    refreshTimer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size && typeof window !== 'undefined') {
      if (refreshTimer !== null) window.clearInterval(refreshTimer)
      refreshTimer = null
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }
}

export function useSeasonalCalendarClock() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
