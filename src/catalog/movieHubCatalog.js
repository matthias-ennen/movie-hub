import { PUBLIC_POSTER_ROW_LIMIT } from './contentCuration.js'

export function buildMovieHubCatalogRows(titles, mediaType = null, limit = PUBLIC_POSTER_ROW_LIMIT) {
  const unique = new Map()
  for (const item of Array.isArray(titles) ? titles : []) {
    if (!item?.id || unique.has(item.id)) continue
    unique.set(item.id, item)
  }
  const items = [...unique.values()]
    .filter((item) => !mediaType || item?.type === mediaType)
    .slice(0, Math.max(0, Number(limit) || 0))
  if (!items.length) return []

  if (mediaType === 'movie') {
    return [{ id: 'provider-moviehub-movie', providerId: 'moviehub', title: 'Filme bei Movie Hub', items }]
  }
  if (mediaType === 'series') {
    return [{ id: 'provider-moviehub-series', providerId: 'moviehub', title: 'Serien bei Movie Hub', items }]
  }
  return [{ id: 'provider-moviehub-home', providerId: 'moviehub', title: 'Bei Movie Hub verfügbar', items }]
}
