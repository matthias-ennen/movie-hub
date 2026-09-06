export const THEMES = [
  { id: 'midnight', label: 'Midnight', description: 'Der aktuelle dunkle Movie-Hub-Look.' },
  { id: 'cinema', label: 'Cinema', description: 'Große Poster, großer Hero und stark visuelle Inszenierung.' },
  { id: 'compact', label: 'Compact', description: 'Mehr Titel gleichzeitig mit geringerer Informationsdichte pro Karte.' },
  { id: 'minimal', label: 'Minimal', description: 'Ruhig, reduziert und mit zurückgenommenen Effekten.' },
  { id: 'bright', label: 'Bright', description: 'Eine helle Oberfläche mit gleicher Funktionsstruktur.' },
]

export const THEME_IDS = THEMES.map((theme) => theme.id)

export const AUTO_SWITCH_INTERVALS = [
  { id: 'daily', label: 'Täglich' },
  { id: 'weekly', label: 'Wöchentlich' },
  { id: 'monthly', label: 'Monatlich' },
]

export const AUTO_SWITCH_INTERVAL_IDS = AUTO_SWITCH_INTERVALS.map((interval) => interval.id)

export const DEFAULT_THEME_SETTINGS = {
  themeId: 'midnight',
  autoSwitch: {
    enabled: false,
    interval: 'daily',
    periodKey: null,
  },
}

export function isThemeId(themeId) {
  return THEME_IDS.includes(themeId)
}

export function isAutoSwitchInterval(interval) {
  return AUTO_SWITCH_INTERVAL_IDS.includes(interval)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function localDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getPeriodKey(interval, date = new Date()) {
  if (interval === 'monthly') {
    return `month:${date.getFullYear()}-${pad(date.getMonth() + 1)}`
  }

  if (interval === 'weekly') {
    const weekStart = new Date(date)
    weekStart.setHours(0, 0, 0, 0)
    const daysSinceMonday = (weekStart.getDay() + 6) % 7
    weekStart.setDate(weekStart.getDate() - daysSinceMonday)
    return `week:${localDateKey(weekStart)}`
  }

  return `day:${localDateKey(date)}`
}

export function chooseRandomTheme(currentThemeId, random = Math.random) {
  const candidates = THEME_IDS.filter((themeId) => themeId !== currentThemeId)
  if (!candidates.length) return currentThemeId
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
  return candidates[index]
}

export function normalizeThemeSettings(value) {
  const themeId = isThemeId(value?.themeId) ? value.themeId : DEFAULT_THEME_SETTINGS.themeId
  const interval = isAutoSwitchInterval(value?.autoSwitch?.interval)
    ? value.autoSwitch.interval
    : DEFAULT_THEME_SETTINGS.autoSwitch.interval

  return {
    themeId,
    autoSwitch: {
      enabled: Boolean(value?.autoSwitch?.enabled),
      interval,
      periodKey: typeof value?.autoSwitch?.periodKey === 'string' ? value.autoSwitch.periodKey : null,
    },
  }
}

export function resolveThemeForStartup(value, date = new Date(), random = Math.random) {
  const settings = normalizeThemeSettings(value)
  if (!settings.autoSwitch.enabled) return settings

  const currentPeriodKey = getPeriodKey(settings.autoSwitch.interval, date)
  if (settings.autoSwitch.periodKey === currentPeriodKey) return settings

  return {
    themeId: chooseRandomTheme(settings.themeId, random),
    autoSwitch: {
      ...settings.autoSwitch,
      periodKey: currentPeriodKey,
    },
  }
}
