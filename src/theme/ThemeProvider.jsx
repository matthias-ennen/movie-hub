import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import { useSeasonalCalendarClock } from '../hooks/useSeasonalCalendarClock.js'
import { seasonalVisualAssets } from './seasonalPresentation.js'
import { isCinematicSeasonMediaReady } from './seasonalMediaManifest.js'
import {
  SEASONAL_CONTENT_MODES,
  resolveSeasonalContent,
  withSeasonalContentEnabled,
  withSeasonalAutoSwitch,
  withManualSeasonalContent,
} from '../catalog/seasonalContent.js'
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
  const seasonalCalendarKey = useSeasonalCalendarClock()
  const [settings, setSettings] = useState(() => resolveThemeForStartup(activeProfile?.themeSettings ?? loadLegacyThemeSettings()))
  const [hydratedProfileId, setHydratedProfileId] = useState(activeProfile?.id ?? null)
  const activeVisualSeason = useMemo(
    () => resolveSeasonalContent(settings.seasonalTheme),
    [settings.seasonalTheme, seasonalCalendarKey],
  )

  useEffect(() => {
    if (!activeProfile) return
    setSettings(resolveThemeForStartup(activeProfile.themeSettings ?? loadLegacyThemeSettings()))
    setHydratedProfileId(activeProfile.id)
  }, [activeProfile?.id])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = settings.themeId
    document.documentElement.style.colorScheme = settings.themeId === 'bright' ? 'light' : 'dark'
  }, [settings.themeId])

  // Theme overlay is independent of active provider, poster and base-theme
  // selection. No new network calls or component-level decoration animation.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.season = activeVisualSeason
    root.dataset.seasonEnabled = settings.seasonalTheme.enabled ? 'true' : 'false'
    root.dataset.seasonMedia = isCinematicSeasonMediaReady(activeVisualSeason) ? 'cinematic' : 'legacy'
    const artwork = seasonalVisualAssets(activeVisualSeason)
    root.style.setProperty('--season-wallpaper', `url("${artwork.wallpaper}")`)
    root.style.setProperty('--season-corner', `url("${artwork.corner}")`)
    return () => {
      if (root.dataset.season === activeVisualSeason) {
        delete root.dataset.season
        delete root.dataset.seasonEnabled
        delete root.dataset.seasonMedia
        root.style.removeProperty('--season-wallpaper')
        root.style.removeProperty('--season-corner')
      }
    }
  }, [activeVisualSeason, settings.seasonalTheme.enabled])

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

  const setSeasonalThemeEnabled = useCallback((enabled) => {
    setSettings(current => ({
      ...current,
      seasonalTheme: withSeasonalContentEnabled(current.seasonalTheme, enabled),
    }))
  }, [])

  const setSeasonalThemeAutoSwitch = useCallback((enabled) => {
    setSettings(current => ({
      ...current,
      seasonalTheme: withSeasonalAutoSwitch(current.seasonalTheme, enabled),
    }))
  }, [])

  const selectSeasonalTheme = useCallback((seasonId) => {
    setSettings(current => ({
      ...current,
      seasonalTheme: withManualSeasonalContent(current.seasonalTheme, seasonId),
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
    seasonalThemes: SEASONAL_CONTENT_MODES,
    seasonalThemeSettings: settings.seasonalTheme,
    activeVisualSeason,
    setSeasonalThemeEnabled,
    setSeasonalThemeAutoSwitch,
    selectSeasonalTheme,
  }), [settings, selectTheme, setAutoSwitchEnabled, setAutoSwitchInterval,
    activeVisualSeason, setSeasonalThemeEnabled, setSeasonalThemeAutoSwitch,
    selectSeasonalTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme muss innerhalb des ThemeProvider verwendet werden.')
  return context
}
