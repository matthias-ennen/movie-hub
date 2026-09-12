export const TOP_TEN_LIMIT = 10
export const TOP_TEN_INSERT_AFTER = 3

function finiteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function titleKey(item) {
  if (!item) return ''
  const type = item.type === 'series' || item.mediaType === 'tv' ? 'series' : 'movie'
  const identity = item.tmdbId ?? item.id ?? ''
  return identity === '' ? '' : `${type}:${identity}`
}

function stableIdentity(item) {
  return `${titleKey(item)}:${String(item?.title || '')}`
}

function compareCatalogQuality(a, b) {
  return finiteNumber(b?.popularity) - finiteNumber(a?.popularity)
    || finiteNumber(b?.voteCount) - finiteNumber(a?.voteCount)
    || finiteNumber(b?.voteAverage) - finiteNumber(a?.voteAverage)
    || stableIdentity(a).localeCompare(stableIdentity(b), 'de')
}

function uniqueTitles(items) {
  const unique = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const key = titleKey(item)
    if (!key || unique.has(key)) continue
    unique.set(key, item)
  }
  return [...unique.values()]
}

function catalogIdsForMediaType(catalog, mediaType) {
  if (mediaType === 'movie') return Array.isArray(catalog?.movieIds) ? catalog.movieIds : []
  if (mediaType === 'series') return Array.isArray(catalog?.seriesIds) ? catalog.seriesIds : []
  if (Array.isArray(catalog?.homeIds) && catalog.homeIds.length) return catalog.homeIds
  return [...(Array.isArray(catalog?.movieIds) ? catalog.movieIds : []), ...(Array.isArray(catalog?.seriesIds) ? catalog.seriesIds : [])]
}

function addRankedSource(scores, rankedItems) {
  const items = uniqueTitles(rankedItems)
  const count = items.length
  if (!count) return

  items.forEach((item, index) => {
    const key = titleKey(item)
    const existing = scores.get(key) || { item, providerScore: 0 }
    existing.providerScore += (count - index) / count
    if (compareCatalogQuality(item, existing.item) < 0) existing.item = item
    scores.set(key, existing)
  })
}

function balanceHomeTopTen(ranked, limit) {
  const targetMovies = Math.floor(limit / 2)
  const targetSeries = limit - targetMovies
  const selected = [
    ...ranked.filter((item) => item.type === 'movie').slice(0, targetMovies),
    ...ranked.filter((item) => item.type === 'series').slice(0, targetSeries),
  ]
  const selectedKeys = new Set(selected.map(titleKey))

  for (const item of ranked) {
    if (selected.length >= limit) break
    const key = titleKey(item)
    if (selectedKeys.has(key)) continue
    selected.push(item)
    selectedKeys.add(key)
  }

  const originalRank = new Map(ranked.map((item, index) => [titleKey(item), index]))
  return selected.sort((a, b) => originalRank.get(titleKey(a)) - originalRank.get(titleKey(b)))
}

/**
 * Aggregates the existing ordered lists of every enabled provider. The
 * normalized score makes differently sized provider catalogs comparable.
 */
export function buildProviderTopTen({
  providerCatalogs = {},
  titles = [],
  movieHubTitles = [],
  enabledProviderIds = [],
  mediaType = null,
  limit = TOP_TEN_LIMIT,
} = {}) {
  const maximum = Math.max(0, Number(limit) || 0)
  if (!maximum) return []

  const enabled = new Set(Array.isArray(enabledProviderIds) ? enabledProviderIds : [])
  const allTitles = uniqueTitles([...(Array.isArray(titles) ? titles : []), ...(Array.isArray(movieHubTitles) ? movieHubTitles : [])])
  const byId = new Map(allTitles.map((item) => [item.id, item]))
  const scores = new Map()

  for (const catalog of Object.values(providerCatalogs || {})) {
    if (!catalog?.id || !enabled.has(catalog.id)) continue
    const rankedItems = catalogIdsForMediaType(catalog, mediaType)
      .map((id) => byId.get(id))
      .filter((item) => item && (!mediaType || item.type === mediaType))
    addRankedSource(scores, rankedItems)
  }

  if (enabled.has('moviehub')) {
    const rankedMovieHubItems = uniqueTitles(movieHubTitles)
      .filter((item) => !mediaType || item.type === mediaType)
      .sort(compareCatalogQuality)
    addRankedSource(scores, rankedMovieHubItems)
  }

  const ranked = [...scores.values()]
    .sort((a, b) => b.providerScore - a.providerScore || compareCatalogQuality(a.item, b.item))
    .map((entry) => entry.item)

  return mediaType ? ranked.slice(0, maximum) : balanceHomeTopTen(ranked, maximum)
}

function safeLocalRating(item, getTitleState) {
  try {
    const rating = getTitleState?.(item)?.rating
    return Number.isInteger(rating) ? rating : null
  } catch {
    return null
  }
}

/** Personal ranking is profile-local first, then account-wide TMDB rating. */
export function buildPersonalTopTen(rows = [], getTitleState, limit = TOP_TEN_LIMIT) {
  const candidates = uniqueTitles(rows.flatMap((row) => Array.isArray(row?.items) ? row.items : []))
  const ranked = candidates.map((item) => ({
    item,
    localRating: safeLocalRating(item, getTitleState),
    tmdbRating: finiteNumberOrNull(item?.tmdbRating),
  }))

  ranked.sort((a, b) => {
    const aTier = a.localRating !== null ? 0 : a.tmdbRating !== null ? 1 : 2
    const bTier = b.localRating !== null ? 0 : b.tmdbRating !== null ? 1 : 2
    return aTier - bTier
      || (aTier === 0 ? b.localRating - a.localRating : 0)
      || (aTier === 1 ? b.tmdbRating - a.tmdbRating : 0)
      || compareCatalogQuality(a.item, b.item)
  })

  return ranked.slice(0, Math.max(0, Number(limit) || 0)).map((entry) => entry.item)
}

export function insertTopTenRow(rows = [], { id, title, items } = {}, after = TOP_TEN_INSERT_AFTER) {
  const visibleRows = rows.filter((row) => Array.isArray(row?.items) && row.items.length)
  const topItems = uniqueTitles(items).slice(0, TOP_TEN_LIMIT)
  if (!topItems.length) return visibleRows

  const insertionIndex = Math.min(Math.max(0, Number(after) || 0), visibleRows.length)
  const topTenRow = { id, title, items: topItems, variant: 'top-ten' }
  return [...visibleRows.slice(0, insertionIndex), topTenRow, ...visibleRows.slice(insertionIndex)]
}
