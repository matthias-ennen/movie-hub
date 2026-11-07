// Pure seasonal content calendar. Display settings are independent of visual themes.
// Dates and boundaries are evaluated in Europe/Berlin, never UTC or device locale.
export const SEASONAL_CONTENT_MODES = Object.freeze([
  { id: 'classic', label: 'Klassisch', description: 'Die bisherige MovieHub-Auswahl ohne saisonale Bevorzugung.' },
  { id: 'halloween', label: 'Halloween', description: 'Gezielt passende Grusel- und Halloween-Titel.' },
  { id: 'christmas', label: 'Weihnachten', description: 'Weihnachtsfilme und passende Serien entdecken.' },
  { id: 'easter', label: 'Ostern', description: 'Passende Osterfilme und besondere Entdeckungen.' },
  { id: 'pentecost', label: 'Pfingsten', description: 'Passende Feiertagstitel, sofern verfügbar.' },
])
const SEASON_IDS = new Set(SEASONAL_CONTENT_MODES.map(x => x.id))
const DAY_MS = 86400000
const BERLIN_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
})

function civilDay(value) {
  const date = value instanceof Date ? value : new Date(value)
  const parts = Object.fromEntries(BERLIN_DAY.formatToParts(
    Number.isNaN(date.getTime()) ? new Date() : date,
  ).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]))
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS)
}
const dayIso = day => new Date(day * DAY_MS).toISOString().slice(0, 10)
const dayOf = (year, month, date) => Math.floor(Date.UTC(year, month - 1, date) / DAY_MS)

// Gregorian computus (Gregorian calendar); no external library/network calls.
export function easterSunday(year) {
  const a = year % 19
  const b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k + 7) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const date = ((h + l - 7 * m + 114) % 31) + 1
  return dayOf(year, month, date)
}

function windows(year) {
  const easter = easterSunday(year)
  const pentecost = easter + 49
  return [
    { id: 'christmas', start: dayOf(year, 12, 1), end: dayOf(year + 1, 1, 7) },
    { id: 'halloween', start: dayOf(year, 10, 15), end: dayOf(year, 11, 1) },
    { id: 'easter', start: easter - 14, end: easter + 8 },
    { id: 'pentecost', start: pentecost - 7, end: pentecost + 3 },
  ]
}

export function seasonalCalendarPeriod(value = new Date()) {
  const current = civilDay(value)
  const year = new Date(current * DAY_MS).getUTCFullYear()
  const all = [year - 1, year, year + 1].flatMap(windows)
  const active = all.find(w => current >= w.start && current < w.end)
  if (active) return { seasonId: active.id, periodKey: `${active.id}:${dayIso(active.start)}` }
  const latestBoundary = Math.max(...all.flatMap(w => [w.start, w.end]).filter(day => day <= current))
  return { seasonId: 'classic', periodKey: `classic:${dayIso(latestBoundary)}` }
}

export function normalizeSeasonalContent(value) {
  const seasonal = value && typeof value === 'object' ? value : {}
  return {
    enabled: Boolean(seasonal.enabled),
    seasonId: SEASON_IDS.has(seasonal.seasonId) ? seasonal.seasonId : 'classic',
    autoSwitch: {
      enabled: seasonal.autoSwitch?.enabled !== false,
      periodKey: typeof seasonal.autoSwitch?.periodKey === 'string'
        && /^[a-z]+:\d{4}-\d{2}-\d{2}$/.test(seasonal.autoSwitch.periodKey)
        ? seasonal.autoSwitch.periodKey : null,
    },
  }
}

export function resolveSeasonalContent(value, date = new Date()) {
  const settings = normalizeSeasonalContent(value)
  if (!settings.enabled) return 'classic'
  if (!settings.autoSwitch.enabled) return settings.seasonId
  const period = seasonalCalendarPeriod(date)
  return settings.autoSwitch.periodKey === period.periodKey
    ? settings.seasonId : period.seasonId
}

export function withSeasonalContentEnabled(value, enabled) {
  const settings = normalizeSeasonalContent(value)
  return { ...settings, enabled: Boolean(enabled) }
}

export function withSeasonalAutoSwitch(value, enabled) {
  const settings = normalizeSeasonalContent(value)
  return { ...settings, autoSwitch: { enabled: Boolean(enabled), periodKey: null } }
}

export function withManualSeasonalContent(value, seasonId, date = new Date()) {
  const settings = normalizeSeasonalContent(value)
  if (!SEASON_IDS.has(seasonId)) return settings
  return {
    ...settings, enabled: true, seasonId,
    autoSwitch: {
      ...settings.autoSwitch,
      periodKey: settings.autoSwitch.enabled ? seasonalCalendarPeriod(date).periodKey : null,
    },
  }
}

export function isSeasonalRowVisible(row, activeSeasonId) {
  return !row?.seasonId || (activeSeasonId !== 'classic' && row.seasonId === activeSeasonId)
}

/**
 * Reuse the published canonical title model for Movies/Series browse rows.
 * Availability is checked by the caller's existing provider-selection logic.
 */
export function buildThemedBrowseRows(rowDefinitions, titlesById, seasonId, mediaType, isAvailable) {
  const selected = (Array.isArray(rowDefinitions) ? rowDefinitions : [])
    .filter(row => ['seasonal','quality'].includes(row?.discoveryKind)
      && row.mediaType === (mediaType === 'series' ? 'tv' : 'movie')
      && isSeasonalRowVisible(row, seasonId))
  return selected.map(row => ({
    id: row.id, title: row.title, preserveOrder: true,
    items: (Array.isArray(row.ids) ? row.ids : [])
      .map(id => titlesById.get(id))
      .filter(item => item && (typeof isAvailable !== 'function' || isAvailable(item))),
  })).filter(row => row.items.length >= 6)
}
