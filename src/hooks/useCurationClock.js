import { useEffect, useState } from 'react'
import { getContentPeriodKey } from '../catalog/contentDisplaySettings.js'

export const PROFILE_EXPERIENCE_CHANGED_EVENT = 'moviehub:profile-experience-changed'

function currentDayKey() {
  return getContentPeriodKey('daily', new Date())
}

export function useCurationClock() {
  const [clock, setClock] = useState(() => ({ dayKey: currentDayKey(), revision: 0 }))

  useEffect(() => {
    const refreshDay = () => setClock((current) => {
      const dayKey = currentDayKey()
      return dayKey === current.dayKey ? current : { ...current, dayKey }
    })
    const refreshExperience = () => setClock((current) => ({
      ...current,
      revision: current.revision + 1,
    }))
    const interval = window.setInterval(refreshDay, 60 * 1000)
    window.addEventListener('focus', refreshDay)
    document.addEventListener('visibilitychange', refreshDay)
    window.addEventListener(PROFILE_EXPERIENCE_CHANGED_EVENT, refreshExperience)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshDay)
      document.removeEventListener('visibilitychange', refreshDay)
      window.removeEventListener(PROFILE_EXPERIENCE_CHANGED_EVENT, refreshExperience)
    }
  }, [])

  return `${clock.dayKey}:${clock.revision}`
}
