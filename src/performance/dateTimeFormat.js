const FORMATTER_CACHE_LIMIT = 16
const formatters = new Map()

// TV rows format many airings with the same small set of locale/time-zone
// options. Reuse the expensive ICU formatter, not a date-specific result.
export function getDateTimeFormatter(locale, options) {
  const key = JSON.stringify([locale, Object.entries(options).sort(([a], [b]) => a.localeCompare(b))])
  if (formatters.has(key)) return formatters.get(key)
  const formatter = new Intl.DateTimeFormat(locale, options)
  formatters.set(key, formatter)
  if (formatters.size > FORMATTER_CACHE_LIMIT) formatters.delete(formatters.keys().next().value)
  return formatter
}
