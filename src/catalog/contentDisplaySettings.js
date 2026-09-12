export const CONTENT_SORT_MODES = Object.freeze([
  {
    id: 'balanced',
    label: 'Ausgewogen',
    description: 'Mischt Beliebtheit, Aktualität, Bewertungen und regelmäßige Abwechslung.',
  },
  {
    id: 'popular',
    label: 'Beliebt zuerst',
    description: 'Zeigt besonders gefragte Filme und Serien weiter vorne.',
  },
  {
    id: 'newest',
    label: 'Neueste zuerst',
    description: 'Priorisiert aktuelle Erscheinungsjahre und Veröffentlichungen.',
  },
  {
    id: 'top-rated',
    label: 'Bestbewertet zuerst',
    description: 'Gewichtet hohe Bewertungen erst bei einer belastbaren Stimmenzahl stark.',
  },
  {
    id: 'discover',
    label: 'Mehr entdecken',
    description: 'Bringt häufiger andere sehenswerte Titel aus dem Katalog nach vorne.',
  },
])

export const CONTENT_AUTO_SWITCH_INTERVALS = Object.freeze([
  { id: 'daily', label: 'Täglich' },
  { id: 'weekly', label: 'Wöchentlich' },
])

export const WATCHED_DISPLAY_MODES = Object.freeze([
  {
    id: 'normal',
    label: 'Normal anzeigen',
    description: 'Gesehene und ungesehene Titel werden gleich behandelt.',
  },
  {
    id: 'demote',
    label: 'Weiter hinten',
    description: 'Ungesehene Titel erscheinen in öffentlichen Reihen zuerst.',
  },
  {
    id: 'hide',
    label: 'Ausblenden',
    description: 'Gesehene Titel verschwinden aus öffentlichen Entdeckungsreihen und Heroes.',
  },
])

const SORT_MODE_IDS = new Set(CONTENT_SORT_MODES.map((mode) => mode.id))
const INTERVAL_IDS = new Set(CONTENT_AUTO_SWITCH_INTERVALS.map((interval) => interval.id))
const WATCHED_MODE_IDS = new Set(WATCHED_DISPLAY_MODES.map((mode) => mode.id))

export const DEFAULT_CONTENT_DISPLAY_SETTINGS = Object.freeze({
  sortMode: 'balanced',
  watchedMode: 'normal',
  autoSwitch: Object.freeze({
    enabled: false,
    interval: 'daily',
    periodKey: null,
    periodOrdinal: null,
  }),
})

export function normalizeContentDisplaySettings(value) {
  const settings = value && typeof value === 'object' ? value : {}
  const autoSwitch = settings.autoSwitch && typeof settings.autoSwitch === 'object'
    ? settings.autoSwitch
    : {}

  return {
    sortMode: SORT_MODE_IDS.has(settings.sortMode) ? settings.sortMode : DEFAULT_CONTENT_DISPLAY_SETTINGS.sortMode,
    watchedMode: WATCHED_MODE_IDS.has(settings.watchedMode) ? settings.watchedMode : DEFAULT_CONTENT_DISPLAY_SETTINGS.watchedMode,
    autoSwitch: {
      enabled: Boolean(autoSwitch.enabled),
      interval: INTERVAL_IDS.has(autoSwitch.interval) ? autoSwitch.interval : DEFAULT_CONTENT_DISPLAY_SETTINGS.autoSwitch.interval,
      periodKey: typeof autoSwitch.periodKey === 'string' && autoSwitch.periodKey.length <= 16
        ? autoSwitch.periodKey
        : null,
      periodOrdinal: Number.isInteger(autoSwitch.periodOrdinal) ? autoSwitch.periodOrdinal : null,
    },
  }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

export function getContentPeriodKey(interval = 'daily', date = new Date()) {
  const current = date instanceof Date ? new Date(date.getTime()) : new Date(date)
  if (Number.isNaN(current.getTime())) return getContentPeriodKey(interval, new Date())

  if (interval === 'weekly') {
    const utc = new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()))
    const day = utc.getUTCDay() || 7
    utc.setUTCDate(utc.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
    const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7)
    return `${utc.getUTCFullYear()}-W${pad(week)}`
  }

  return `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`
}

export function stableStringHash(value) {
  let hash = 2166136261
  for (const character of String(value ?? '')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getContentPeriodOrdinal(interval, date) {
  const current = date instanceof Date ? date : new Date(date)
  const day = Math.floor(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()) / 86400000)
  return interval === 'weekly' ? Math.floor(day / 7) : day
}

export function resolveContentSortMode(value, profileId = 'profile', date = new Date()) {
  const settings = normalizeContentDisplaySettings(value)
  if (!settings.autoSwitch.enabled) return settings.sortMode

  const periodKey = getContentPeriodKey(settings.autoSwitch.interval, date)
  if (settings.autoSwitch.periodKey === periodKey) return settings.sortMode

  const currentOrdinal = getContentPeriodOrdinal(settings.autoSwitch.interval, date)
  if (Number.isInteger(settings.autoSwitch.periodOrdinal)) {
    const steps = Math.max(1, currentOrdinal - settings.autoSwitch.periodOrdinal)
    const currentIndex = CONTENT_SORT_MODES.findIndex((mode) => mode.id === settings.sortMode)
    return CONTENT_SORT_MODES[(currentIndex + steps) % CONTENT_SORT_MODES.length].id
  }

  const profileOffset = stableStringHash(`${profileId}:${settings.autoSwitch.interval}`) % CONTENT_SORT_MODES.length
  const index = (profileOffset + currentOrdinal) % CONTENT_SORT_MODES.length
  return CONTENT_SORT_MODES[index].id
}

export function withManualContentSortMode(value, sortMode, date = new Date()) {
  const settings = normalizeContentDisplaySettings(value)
  if (!SORT_MODE_IDS.has(sortMode)) return settings

  return {
    ...settings,
    sortMode,
    autoSwitch: {
      ...settings.autoSwitch,
      periodKey: settings.autoSwitch.enabled
        ? getContentPeriodKey(settings.autoSwitch.interval, date)
        : settings.autoSwitch.periodKey,
      periodOrdinal: settings.autoSwitch.enabled
        ? getContentPeriodOrdinal(settings.autoSwitch.interval, date)
        : settings.autoSwitch.periodOrdinal,
    },
  }
}

export function withContentAutoSwitch(value, patch, date = new Date()) {
  const settings = normalizeContentDisplaySettings(value)
  const nextInterval = INTERVAL_IDS.has(patch?.interval) ? patch.interval : settings.autoSwitch.interval
  const nextEnabled = patch?.enabled === undefined ? settings.autoSwitch.enabled : Boolean(patch.enabled)

  return {
    ...settings,
    autoSwitch: {
      enabled: nextEnabled,
      interval: nextInterval,
      periodKey: nextEnabled ? getContentPeriodKey(nextInterval, date) : settings.autoSwitch.periodKey,
      periodOrdinal: nextEnabled ? getContentPeriodOrdinal(nextInterval, date) : settings.autoSwitch.periodOrdinal,
    },
  }
}

export function withWatchedDisplayMode(value, watchedMode) {
  const settings = normalizeContentDisplaySettings(value)
  return {
    ...settings,
    watchedMode: WATCHED_MODE_IDS.has(watchedMode) ? watchedMode : settings.watchedMode,
  }
}
