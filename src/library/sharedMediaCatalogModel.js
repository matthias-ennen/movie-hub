import { titleMediaKey } from './sharedMediaModel.js'

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function imagePaths(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((path) => typeof path === 'string' && path.trim())
    .map((path) => path.trim()))].slice(0, 3)
}

function compactCollection(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.parts)) return null
  const id = finiteNumber(value.id)
  if (!id) return null
  return {
    id,
    name: String(value.name || '').slice(0, 160),
    overview: String(value.overview || '').slice(0, 1000),
    poster_path: value.poster_path || value.posterPath || null,
    backdrop_path: value.backdrop_path || value.backdropPath || null,
    parts: value.parts.map((part) => ({
      id: finiteNumber(part?.tmdbId ?? part?.id),
      title: String(part?.title || '').slice(0, 160),
      original_title: String(part?.originalTitle || part?.original_title || '').slice(0, 160),
      overview: String(part?.description || part?.overview || '').slice(0, 600),
      release_date: part?.releaseDate || part?.release_date || null,
      poster_path: part?.posterPath || part?.poster_path || null,
      backdrop_path: part?.backdropPath || part?.backdrop_path || null,
      vote_average: finiteNumber(part?.voteAverage ?? part?.vote_average),
    })).filter((part) => part.id && part.title),
  }
}

export function buildSharedMediaTitleRef(item) {
  const type = item?.type === 'series' ? 'series' : 'movie'
  const tmdbId = finiteNumber(item?.tmdbId)
  const collectionId = type === 'movie' ? finiteNumber(item?.collectionId ?? item?.facets?.collectionId ?? item?.smartFacets?.collection?.id) : null
  const artwork = item?.artwork && typeof item.artwork === 'object' ? item.artwork : {}
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
    artwork: {
      posterPaths: imagePaths(artwork.posterPaths),
      heroBackdropPaths: imagePaths(artwork.heroBackdropPaths),
    },
    collectionId,
    collectionName: collectionId
      ? String(item?.collectionName || item?.smartFacets?.collection?.name || '').trim().slice(0, 160) || null
      : null,
    collectionChecked: type === 'movie' ? item?.collectionChecked === true : null,
    collectionDetails: type === 'movie' ? compactCollection(item?.collectionDetails) : null,
    metadataVersion: Math.max(1, finiteNumber(item?.metadataVersion) || 1),
    metadataComplete: item?.metadataComplete === true,
    metadataUpdatedAt: typeof item?.metadataUpdatedAt === 'string' ? item.metadataUpdatedAt : null,
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
