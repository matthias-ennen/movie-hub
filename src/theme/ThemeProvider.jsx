import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import {
  AUTO_SWITCH_INTERVALS,
  DEFAULT_THEME_SETTINGS,
  THEMES,
  getPeriodKey,
  isAutoSwitchInterval,
  isThemeId,
  normalizeThemeSettings,
  resolveThemeForStartup,
} from './themeConfig.js'

const LEGACY_STORAGE_KEY = 'movie-hub-theme-settings-v1'
const ThemeContext = createContext(null)

function loadLegacyThemeSettings() {
  if (typeof window === 'undefined') return DEFAULT_THEME_SETTINGS

  try {
    const stored = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    return resolveThemeForStartup(stored ? JSON.parse(stored) : DEFAULT_THEME_SETTINGS)
  } catch {
    return DEFAULT_THEME_SETTINGS
  }
}

function settingsEqual(a, b) {
  return JSON.stringify(normalizeThemeSettings(a)) === JSON.stringify(normalizeThemeSettings(b))
}

export function ThemeProvider({ children }) {
  const { activeProfile, updateActiveProfileThemeSettings } = useProfiles()
  const [settings, setSettings] = useState(() => resolveThemeForStartup(activeProfile?.themeSettings ?? loadLegacyThemeSettings()))
  const [hydratedProfileId, setHydratedProfileId] = useState(activeProfile?.id ?? null)

  useEffect(() => {
    if (!activeProfile) return
    setSettings(resolveThemeForStartup(activeProfile.themeSettings ?? loadLegacyThemeSettings()))
    setHydratedProfileId(activeProfile.id)
  }, [activeProfile?.id])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = settings.themeId
    document.documentElement.style.colorScheme = settings.themeId === 'bright' ? 'light' : 'dark'
  }, [settings.themeId])

  useEffect(() => {
    if (!activeProfile || hydratedProfileId !== activeProfile.id) return undefined

    try {
      // Legacy-Spiegel bleibt als Migrations-/Offline-Fallback erhalten. Die
      // führende Persistenz liegt ab Phase 2.3 im aktiven Firestore-Profil.
      window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // localStorage kann z. B. im privaten Browsermodus blockiert sein.
    }

    if (settingsEqual(settings, activeProfile.themeSettings)) return undefined

    const timer = window.setTimeout(() => {
      updateActiveProfileThemeSettings(settings).catch((error) => {
        console.error('Theme-Einstellungen konnten nicht im Profil gespeichert werden.', error)
      })
    }, 180)

    return () => window.clearTimeout(timer)
  }, [settings, activeProfile, hydratedProfileId, updateActiveProfileThemeSettings])

  const selectTheme = useCallback((themeId) => {
    if (!isThemeId(themeId)) return

    setSettings((current) => ({
      ...current,
      themeId,
      autoSwitch: {
        ...current.autoSwitch,
        periodKey: current.autoSwitch.enabled
          ? getPeriodKey(current.autoSwitch.interval)
          : current.autoSwitch.periodKey,
      },
    }))
  }, [])

  const setAutoSwitchEnabled = useCallback((enabled) => {
    setSettings((current) => ({
      ...current,
      autoSwitch: {
        ...current.autoSwitch,
        enabled: Boolean(enabled),
        periodKey: enabled ? getPeriodKey(current.autoSwitch.interval) : current.autoSwitch.periodKey,
      },
    }))
  }, [])

  const setAutoSwitchInterval = useCallback((interval) => {
    if (!isAutoSwitchInterval(interval)) return

    setSettings((current) => ({
      ...current,
      autoSwitch: {
        ...current.autoSwitch,
        interval,
        periodKey: current.autoSwitch.enabled ? getPeriodKey(interval) : current.autoSwitch.periodKey,
      },
    }))
  }, [])

  const value = useMemo(() => ({
    themeId: settings.themeId,
    themes: THEMES,
    autoSwitchEnabled: settings.autoSwitch.enabled,
    autoSwitchInterval: settings.autoSwitch.interval,
    autoSwitchIntervals: AUTO_SWITCH_INTERVALS,
    selectTheme,
    setAutoSwitchEnabled,
    setAutoSwitchInterval,
  }), [settings, selectTheme, setAutoSwitchEnabled, setAutoSwitchInterval])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme muss innerhalb des ThemeProvider verwendet werden.')
  return context
}
