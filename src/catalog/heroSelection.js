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
