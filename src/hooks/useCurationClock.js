import { useEffect, useState } from 'react'
import { getContentPeriodKey } from '../catalog/contentDisplaySettings.js'

function currentDayKey() {
  return getContentPeriodKey('daily', new Date())
}

export function useCurationClock() {
  const [dayKey, setDayKey] = useState(currentDayKey)

  useEffect(() => {
    const refresh = () => setDayKey(currentDayKey())
    const interval = window.setInterval(refresh, 60 * 1000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return dayKey
}
