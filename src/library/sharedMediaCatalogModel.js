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

function compactCast(value) {
  return (Array.isArray(value) ? value : []).slice(0, 8).map((person) => ({
    id: finiteNumber(person?.id),
    name: String(person?.name || '').trim().slice(0, 120),
    character: person?.character ? String(person.character).slice(0, 160) : null,
    profileUrl: typeof person?.profileUrl === 'string' ? person.profileUrl : null,
  })).filter((person) => person.name)
}

function compactVideos(value) {
  return (Array.isArray(value) ? value : []).slice(0, 8).map((video) => ({
    id: String(video?.id || '').slice(0, 100),
    name: String(video?.name || '').slice(0, 160),
    site: String(video?.site || '').slice(0, 40),
    key: String(video?.key || '').slice(0, 160),
    type: String(video?.type || '').slice(0, 60),
    official: video?.official === true,
    language: video?.language ? String(video.language).slice(0, 20) : null,
    url: typeof video?.url === 'string' ? video.url : null,
  })).filter((video) => video.key || video.url)
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

function withMovieHubAvailability(item, { fallback = false } = {}) {
  return {
    ...item,
    providerIds: [...new Set(['moviehub', ...(Array.isArray(item?.providerIds) ? item.providerIds : [])])],
    movieHubCatalog: true,
    sharedMediaFallback: fallback,
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
    originalTitle: item?.originalTitle ? String(item.originalTitle).slice(0, 160) : null,
    year: finiteNumber(item?.year),
    releaseDate: typeof item?.releaseDate === 'string' ? item.releaseDate : null,
    runtimeMinutes: finiteNumber(item?.runtimeMinutes),
    posterUrl: typeof item?.posterUrl === 'string' ? item.posterUrl : null,
    neutralPosterUrl: typeof item?.neutralPosterUrl === 'string' ? item.neutralPosterUrl : null,
    backdropUrl: typeof item?.backdropUrl === 'string' ? item.backdropUrl : null,
    description: typeof item?.description === 'string' ? item.description.slice(0, 600) : '',
    genre: typeof item?.genre === 'string' ? item.genre.slice(0, 500) : 'Ohne Genreangabe',
    genres: (Array.isArray(item?.genres) ? item.genres : []).slice(0, 20).map((genre) => ({
      id: finiteNumber(genre?.id),
      name: String(typeof genre === 'string' ? genre : genre?.name || '').slice(0, 100),
    })).filter((genre) => genre.name),
    cast: compactCast(item?.cast),
    videos: compactVideos(item?.videos),
    voteAverage: finiteNumber(item?.voteAverage),
    voteCount: finiteNumber(item?.voteCount),
    popularity: finiteNumber(item?.popularity),
    ageRating: finiteNumber(item?.ageRating),
    providerIds: [...new Set((Array.isArray(item?.providerIds) ? item.providerIds : [])
      .filter((providerId) => providerId && providerId !== 'moviehub')
      .map(String))].slice(0, 30),
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
  if (!Number.isFinite(Number(titleRef.tmdbId)) || Number(titleRef.tmdbId) <= 0) return null
  return {
    // TMDB media type + id is the identity. The Firestore document id and
    // cached title text are never allowed to create a competing title identity.
    key: titleMediaKey(titleRef),
    titleRef,
  }
}

export function sharedMediaCatalogTitle(entry) {
  const ref = entry?.titleRef
  const tmdbId = finiteNumber(ref?.tmdbId)
  if (!tmdbId || tmdbId <= 0) return null
  const type = ref?.type === 'series' ? 'series' : 'movie'
  const id = ref?.id || `tmdb-${type}-${tmdbId}`
  const title = String(ref?.title || '').trim() || `TMDB #${tmdbId}`

  // This object is only a display fallback for a Movie-Hub title that is not
  // present in the currently loaded canonical TMDB catalog. It deliberately
  // carries no cached third-party provider availability and is marked
  // incomplete so opening it hydrates from published/native TMDB metadata.
  return withMovieHubAvailability({
    ...ref,
    id,
    tmdbId,
    type,
    title,
    providerIds: [],
    providerOffers: [],
    metadataComplete: false,
  }, { fallback: true })
}

export function mergeSharedMediaCatalogTitles(entries, titles) {
  const byKey = new Map((Array.isArray(titles) ? titles : []).map((item) => [titleMediaKey(item), item]))
  const result = []

  for (const entry of Array.isArray(entries) ? entries : []) {
    const current = byKey.get(entry.key)
    if (current) {
      // Canonical TMDB/public/personal catalog metadata is authoritative.
      // Shared Media contributes only Movie-Hub availability.
      result.push(withMovieHubAvailability(current))
      continue
    }

    const fallback = sharedMediaCatalogTitle(entry)
    if (fallback) result.push(fallback)
  }

  return result
}

export function mergeTitlesWithSharedMediaCatalog(titles, movieHubTitles) {
  const movieHubByKey = new Map((Array.isArray(movieHubTitles) ? movieHubTitles : [])
    .map((item) => [titleMediaKey(item), item]))
  const seen = new Set()
  const merged = (Array.isArray(titles) ? titles : []).map((item) => {
    const key = titleMediaKey(item)
    if (!movieHubByKey.has(key)) return item
    seen.add(key)
    // Keep the canonical title object intact and add only Movie-Hub presence.
    return withMovieHubAvailability(item)
  })

  for (const item of Array.isArray(movieHubTitles) ? movieHubTitles : []) {
    const key = titleMediaKey(item)
    if (!seen.has(key)) merged.push(item)
  }
  return merged
}
