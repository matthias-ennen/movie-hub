import { getActivePosterRowLimit } from '../profiles/profileExperienceRuntime.js'

export const MIN_CATEGORY_ROW_TITLES = 6
export const CATEGORY_ROW_LIMIT = 70

export const MOVIE_CATEGORY_OPTIONS = [
  { id: 'action', title: 'Action', genreIds: [28] },
  { id: 'adventure', title: 'Abenteuer', genreIds: [12] },
  { id: 'comedy', title: 'Komödie', genreIds: [35] },
  { id: 'horror', title: 'Horror', genreIds: [27] },
  { id: 'thriller', title: 'Thriller', genreIds: [53] },
  { id: 'crime', title: 'Krimi', genreIds: [80] },
  { id: 'science-fiction', title: 'Science-Fiction', genreIds: [878] },
  { id: 'fantasy', title: 'Fantasy', genreIds: [14] },
  { id: 'drama', title: 'Drama', genreIds: [18] },
  { id: 'romance', title: 'Romantik', genreIds: [10749] },
  { id: 'family', title: 'Kinder & Familie', genreIds: [10751] },
  { id: 'animation', title: 'Animation & Zeichentrick', genreIds: [16] },
  { id: 'documentary', title: 'Dokumentation', genreIds: [99] },
  { id: 'history', title: 'Historienfilme', genreIds: [36] },
  { id: 'war', title: 'Kriegsfilme', genreIds: [10752] },
  { id: 'western', title: 'Western', genreIds: [37] },
  { id: 'classics', title: 'Klassiker', beforeYear: 2000 },
]

export const SERIES_CATEGORY_OPTIONS = [
  { id: 'action-adventure', title: 'Action & Abenteuer', genreIds: [10759] },
  { id: 'comedy', title: 'Komödie', genreIds: [35] },
  { id: 'crime', title: 'Krimi', genreIds: [80] },
  { id: 'drama', title: 'Drama', genreIds: [18] },
  { id: 'science-fiction-fantasy', title: 'Science-Fiction & Fantasy', genreIds: [10765] },
  { id: 'mystery', title: 'Mystery', genreIds: [9648] },
  { id: 'kids', title: 'Kinder', genreIds: [10762] },
  { id: 'family', title: 'Familie', genreIds: [10751] },
  { id: 'animation', title: 'Animation', genreIds: [16] },
  { id: 'documentary', title: 'Dokumentation', genreIds: [99] },
  { id: 'reality', title: 'Reality', genreIds: [10764] },
  { id: 'soap', title: 'Soap', genreIds: [10766] },
  { id: 'war-politics', title: 'Krieg & Politik', genreIds: [10768] },
  { id: 'western', title: 'Western', genreIds: [37] },
]

export const DEFAULT_CATEGORY_SETTINGS = Object.freeze({
  enabledMovieCategoryIds: Object.freeze(MOVIE_CATEGORY_OPTIONS.map((category) => category.id)),
  enabledSeriesCategoryIds: Object.freeze(SERIES_CATEGORY_OPTIONS.map((category) => category.id)),
  movieCategoryOrder: Object.freeze(MOVIE_CATEGORY_OPTIONS.map((category) => category.id)),
  seriesCategoryOrder: Object.freeze(SERIES_CATEGORY_OPTIONS.map((category) => category.id)),
})

function normalizeIds(value, options, defaults) {
  if (!Array.isArray(value)) return [...defaults]
  const knownIds = new Set(options.map((category) => category.id))
  const requestedIds = new Set(value.filter((id) => knownIds.has(id)))
  return options.map((category) => category.id).filter((id) => requestedIds.has(id))
}

function normalizeOrder(value, options) {
  const defaultOrder = options.map((category) => category.id)
  if (!Array.isArray(value)) return defaultOrder

  const knownIds = new Set(defaultOrder)
  const seen = new Set()
  const requested = value.filter((id) => {
    if (!knownIds.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })
  return [...requested, ...defaultOrder.filter((id) => !seen.has(id))]
}

export function orderCategoryOptions(options, order) {
  const byId = new Map(options.map((category) => [category.id, category]))
  return normalizeOrder(order, options).map((id) => byId.get(id)).filter(Boolean)
}

export function moveCategoryOrder(order, categoryId, direction, options) {
  const normalized = normalizeOrder(order, options)
  const index = normalized.indexOf(categoryId)
  const targetIndex = index + Number(direction)
  if (index < 0 || targetIndex < 0 || targetIndex >= normalized.length) return normalized

  const next = [...normalized]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
}

export function normalizeCategorySettings(value) {
  const settings = value && typeof value === 'object' ? value : {}
  return {
    enabledMovieCategoryIds: normalizeIds(
      settings.enabledMovieCategoryIds,
      MOVIE_CATEGORY_OPTIONS,
      DEFAULT_CATEGORY_SETTINGS.enabledMovieCategoryIds,
    ),
    enabledSeriesCategoryIds: normalizeIds(
      settings.enabledSeriesCategoryIds,
      SERIES_CATEGORY_OPTIONS,
      DEFAULT_CATEGORY_SETTINGS.enabledSeriesCategoryIds,
    ),
    movieCategoryOrder: normalizeOrder(settings.movieCategoryOrder, MOVIE_CATEGORY_OPTIONS),
    seriesCategoryOrder: normalizeOrder(settings.seriesCategoryOrder, SERIES_CATEGORY_OPTIONS),
  }
}

function finiteNumber(value, fallback = Number.NEGATIVE_INFINITY) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function compareCategoryTitles(a, b) {
  return finiteNumber(b.popularity) - finiteNumber(a.popularity)
    || finiteNumber(b.voteCount) - finiteNumber(a.voteCount)
    || finiteNumber(b.voteAverage) - finiteNumber(a.voteAverage)
    || finiteNumber(b.year) - finiteNumber(a.year)
    || String(a.title || '').localeCompare(String(b.title || ''), 'de')
}

function genreIds(item) {
  return new Set((Array.isArray(item?.genres) ? item.genres : [])
    .map((genre) => Number(genre?.id))
    .filter(Number.isFinite))
}

function matchesCategory(item, category) {
  if (Number.isFinite(category.beforeYear)) {
    if (item?.year === null || item?.year === undefined || item?.year === '') return false
    const year = Number(item?.year)
    return Number.isFinite(year) && year < category.beforeYear
  }

  const itemGenreIds = genreIds(item)
  return category.genreIds.some((id) => itemGenreIds.has(id))
}

function hasEnabledProvider(item, enabledProviderIds) {
  const enabled = new Set(Array.isArray(enabledProviderIds) ? enabledProviderIds : [])
  return (Array.isArray(item?.providerIds) ? item.providerIds : [])
    .some((providerId) => enabled.has(providerId))
}

export function buildCategoryRows({
  titles = [],
  mediaType,
  enabledCategoryIds = [],
  enabledProviderIds = [],
  categoryOrder = [],
  minimumTitles = MIN_CATEGORY_ROW_TITLES,
  limit = getActivePosterRowLimit(),
  sortItems = null,
} = {}) {
  const options = mediaType === 'series' ? SERIES_CATEGORY_OPTIONS : MOVIE_CATEGORY_OPTIONS
  const activeIds = new Set(Array.isArray(enabledCategoryIds) ? enabledCategoryIds : [])
  const uniqueTitles = new Map()

  for (const item of Array.isArray(titles) ? titles : []) {
    if (item?.type !== mediaType || !item.id || uniqueTitles.has(item.id)) continue
    if (!hasEnabledProvider(item, enabledProviderIds)) continue
    uniqueTitles.set(item.id, item)
  }

  return orderCategoryOptions(options, categoryOrder)
    .filter((category) => activeIds.has(category.id))
    .map((category) => {
      const matches = [...uniqueTitles.values()].filter((item) => matchesCategory(item, category))
      const ranked = typeof sortItems === 'function'
        ? sortItems(matches, category)
        : matches.sort(compareCategoryTitles)
      const safeLimit = Math.min(Math.max(0, Number(limit) || 0), getActivePosterRowLimit())
      return {
        id: `category-${mediaType}-${category.id}`,
        title: category.title,
        items: ranked.slice(0, safeLimit),
      }
    })
    .filter((row) => row.items.length >= minimumTitles)
}
