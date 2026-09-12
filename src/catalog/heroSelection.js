export const HERO_LIMIT = 5

function uniqueTitles(items) {
  const seen = new Set()
  const result = []

  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.id || !item?.title || seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }

  return result
}

export function selectHeroItems(items, { type = null, limit = HERO_LIMIT } = {}) {
  const safeLimit = Math.max(0, Number(limit) || 0)
  const filtered = uniqueTitles(items).filter((item) => !type || item.type === type)
  return filtered.slice(0, safeLimit)
}

export function selectHomeHeroItems(items, limit = HERO_LIMIT) {
  const ranked = uniqueTitles(items)
  const safeLimit = Math.max(0, Number(limit) || 0)
  if (safeLimit === 0 || ranked.length <= 1) return ranked.slice(0, safeLimit)

  const first = ranked[0]
  const oppositeType = first.type === 'movie' ? 'series' : 'movie'
  const opposite = ranked.find((item) => item.type === oppositeType)
  if (!opposite) return ranked.slice(0, safeLimit)

  const selectedIds = new Set([first.id, opposite.id])
  const selected = ranked.filter((item) => selectedIds.has(item.id))

  for (const item of ranked) {
    if (selected.length >= safeLimit) break
    if (selectedIds.has(item.id)) continue
    selectedIds.add(item.id)
    selected.push(item)
  }

  return selected
    .sort((left, right) => ranked.indexOf(left) - ranked.indexOf(right))
    .slice(0, safeLimit)
}

export function selectPersonalHeroItems(rows, limit = HERO_LIMIT) {
  const items = (Array.isArray(rows) ? rows : []).flatMap((row) => (
    Array.isArray(row?.items) ? row.items : []
  ))
  return selectHeroItems(items, { limit })
}

function identity(item) {
  return `${item?.type === 'series' ? 'series' : 'movie'}:${item?.tmdbId ?? item?.id ?? ''}`
}

function fillHeroList(first, pool, limit) {
  const result = []
  const seen = new Set()
  for (const item of [first, ...pool]) {
    if (!item) continue
    const key = identity(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
    if (result.length >= limit) break
  }
  return result
}

export function selectCoordinatedHeroItems(items, { limit = HERO_LIMIT } = {}) {
  const safeLimit = Math.max(0, Number(limit) || 0)
  const ranked = uniqueTitles(items)
  const movies = ranked.filter((item) => item.type === 'movie')
  const series = ranked.filter((item) => item.type === 'series')
  const movieFirst = movies[0] || null
  const seriesFirst = series[0] || null
  const reservedFirstIds = new Set([movieFirst, seriesFirst].filter(Boolean).map(identity))
  const homeFirst = ranked.find((item) => !reservedFirstIds.has(identity(item))) || ranked[0] || null

  const homePool = []
  if (homeFirst) {
    const oppositeType = homeFirst.type === 'series' ? 'movie' : 'series'
    const opposite = ranked.find((item) => item.type === oppositeType && identity(item) !== identity(homeFirst))
    if (opposite) homePool.push(opposite)
  }
  homePool.push(...ranked)

  return {
    home: fillHeroList(homeFirst, homePool, safeLimit),
    movies: fillHeroList(movieFirst, movies, safeLimit),
    series: fillHeroList(seriesFirst, series, safeLimit),
  }
}
