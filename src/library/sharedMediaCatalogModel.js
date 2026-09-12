import { titleMediaKey } from './sharedMediaModel.js'

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function buildSharedMediaTitleRef(item) {
  const type = item?.type === 'series' ? 'series' : 'movie'
  const tmdbId = finiteNumber(item?.tmdbId)
  return {
    id: String(item?.id || (tmdbId !== null ? `tmdb-${type}-${tmdbId}` : '')).slice(0, 100),
    tmdbId,
    type,
    title: String(item?.title || '').trim().slice(0, 160),
    year: finiteNumber(item?.year),
    posterUrl: typeof item?.posterUrl === 'string' ? item.posterUrl : null,
    neutralPosterUrl: typeof item?.neutralPosterUrl === 'string' ? item.neutralPosterUrl : null,
    backdropUrl: typeof item?.backdropUrl === 'string' ? item.backdropUrl : null,
    description: typeof item?.description === 'string' ? item.description.slice(0, 600) : '',
  }
}

export function normalizeSharedMediaCatalogEntry(id, value) {
  if (!value || value.hasMedia === false) return null
  const titleRef = buildSharedMediaTitleRef(value.titleRef)
  if (!titleRef.title || (!titleRef.id && titleRef.tmdbId === null)) return null
  return {
    key: String(id || titleMediaKey(titleRef)),
    titleRef,
  }
}

export function sharedMediaCatalogTitle(entry) {
  const ref = entry?.titleRef
  if (!ref?.title) return null
  const type = ref.type === 'series' ? 'series' : 'movie'
  const id = ref.id || (ref.tmdbId !== null ? `tmdb-${type}-${ref.tmdbId}` : entry.key)
  return {
    ...ref,
    id,
    type,
    providerIds: ['moviehub'],
    providerOffers: [],
    movieHubCatalog: true,
  }
}

export function mergeSharedMediaCatalogTitles(entries, titles) {
  const byKey = new Map((Array.isArray(titles) ? titles : []).map((item) => [titleMediaKey(item), item]))
  const result = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    const fallback = sharedMediaCatalogTitle(entry)
    if (!fallback) continue
    const current = byKey.get(entry.key)
    const providerIds = [...new Set(['moviehub', ...(current?.providerIds || [])])]
    result.push({
      ...fallback,
      ...(current || {}),
      providerIds,
      movieHubCatalog: true,
    })
  }
  return result
}

export function mergeTitlesWithSharedMediaCatalog(titles, movieHubTitles) {
  const movieHubByKey = new Map((Array.isArray(movieHubTitles) ? movieHubTitles : [])
    .map((item) => [titleMediaKey(item), item]))
  const seen = new Set()
  const merged = (Array.isArray(titles) ? titles : []).map((item) => {
    const key = titleMediaKey(item)
    const movieHubItem = movieHubByKey.get(key)
    if (!movieHubItem) return item
    seen.add(key)
    return movieHubItem
  })
  for (const item of Array.isArray(movieHubTitles) ? movieHubTitles : []) {
    const key = titleMediaKey(item)
    if (!seen.has(key)) merged.push(item)
  }
  return merged
}
