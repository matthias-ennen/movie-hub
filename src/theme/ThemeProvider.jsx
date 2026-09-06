import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  AUTO_SWITCH_INTERVALS,
  DEFAULT_THEME_SETTINGS,
  THEMES,
  getPeriodKey,
  isAutoSwitchInterval,
  isThemeId,
  resolveThemeForStartup,
} from './themeConfig.js'

const STORAGE_KEY = 'movie-hub-theme-settings-v1'
const ThemeContext = createContext(null)

function loadThemeSettings() {
  if (typeof window === 'undefined') return DEFAULT_THEME_SETTINGS

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return resolveThemeForStartup(stored ? JSON.parse(stored) : DEFAULT_THEME_SETTINGS)
  } catch {
    return DEFAULT_THEME_SETTINGS
  }
}

export function ThemeProvider({ children }) {
  const [settings, setSettings] = useState(loadThemeSettings)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = settings.themeId
    document.documentElement.style.colorScheme = settings.themeId === 'bright' ? 'light' : 'dark'
  }, [settings.themeId])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // localStorage kann z. B. im privaten Browsermodus blockiert sein.
    }
  }, [settings])

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
