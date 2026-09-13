import { buildTmdbImageUrl } from '../services/tmdb.js'

const SUPPORTED_AGE_RATINGS = new Set([0, 6, 12, 16, 18])

function mediaTypeKey(value) {
  if (value === 'movie') return 'movie'
  if (value === 'tv' || value === 'series') return 'tv'
  return null
}

export function tmdbCatalogKey(item) {
  const type = mediaTypeKey(item?.mediaType ?? item?.type)
  const id = Number(item?.tmdbId)
  if (!type || !Number.isFinite(id)) return null
  return `${type}:${id}`
}

function yearFromDate(value) {
  const match = typeof value === 'string' ? value.match(/^\d{4}/) : null
  return match ? Number(match[0]) : null
}

function score(value) {
  const number = Number(value)
  return Number.isFinite(number)
    ? number.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : '–'
}

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function ageRating(value) {
  const rating = Number(value)
  return SUPPORTED_AGE_RATINGS.has(rating) ? rating : null
}

function stringPaths(value, limit = 3) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((path) => typeof path === 'string' && path.trim())
    .map((path) => path.trim()))].slice(0, limit)
}

function normalizeArtwork(raw) {
  const artwork = raw?.artwork && typeof raw.artwork === 'object' ? raw.artwork : {}
  return {
    posterPaths: stringPaths([...(Array.isArray(artwork.posterPaths) ? artwork.posterPaths : []), raw?.posterPath]),
    heroBackdropPaths: stringPaths([...(Array.isArray(artwork.heroBackdropPaths) ? artwork.heroBackdropPaths : []), raw?.backdropPath]),
  }
}

export function normalizePersonalTmdbTitle(raw) {
  const key = tmdbCatalogKey(raw)
  if (!key) throw new Error('Ungültiger persönlicher TMDB-Titel.')

  const mediaType = mediaTypeKey(raw.mediaType)
  const type = mediaType === 'movie' ? 'movie' : 'series'
  const tmdbId = Number(raw.tmdbId)
  const title = String(raw.title || raw.originalTitle || `TMDB #${tmdbId}`).trim()
  const genreNames = Array.isArray(raw.genreNames)
    ? raw.genreNames.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  const providerIds = Array.isArray(raw.providerIds)
    ? [...new Set(raw.providerIds.map((value) => String(value || '').trim()).filter(Boolean))]
    : []
  const tmdbRating = finiteNumber(raw.ratingValue ?? raw.tmdbRating)
  const artwork = normalizeArtwork(raw)
  const collectionId = type === 'movie' ? finiteNumber(raw.collectionId) : null

  return {
    id: `tmdb-${type}-${tmdbId}`,
    source: 'tmdb',
    tmdbId,
    mediaType,
    type,
    title,
    originalTitle: raw.originalTitle || title,
    description: raw.description || '',
    year: yearFromDate(raw.releaseDate),
    releaseDate: raw.releaseDate || null,
    posterPath: raw.posterPath || null,
    backdropPath: raw.backdropPath || null,
    posterUrl: buildTmdbImageUrl(raw.posterPath, 'w500'),
    backdropUrl: buildTmdbImageUrl(raw.backdropPath, 'w1280'),
    neutralPosterPath: artwork.posterPaths[0] || raw.posterPath || null,
    neutralPosterUrl: buildTmdbImageUrl(artwork.posterPaths[0] || raw.posterPath, 'w500'),
    artwork,
    collectionId,
    collectionName: collectionId && typeof raw.collectionName === 'string' ? raw.collectionName : null,
    collectionChecked: type === 'movie' ? raw.collectionChecked === true : null,
    collectionDetails: type === 'movie' && raw.collectionDetails && typeof raw.collectionDetails === 'object'
      ? raw.collectionDetails
      : null,
    metadataVersion: Math.max(1, finiteNumber(raw.metadataVersion) || 1),
    metadataComplete: raw.metadataComplete === true,
    metadataUpdatedAt: raw.metadataUpdatedAt || raw.syncedAt || null,
    originalLanguage: raw.originalLanguage || null,
    voteAverage: finiteNumber(raw.voteAverage),
    voteCount: finiteNumber(raw.voteCount),
    ageRating: ageRating(raw.ageRating),
    genreNames,
    genres: genreNames.map((name) => ({ name })),
    genre: genreNames.join(' · ') || 'Ohne Genreangabe',
    meta: type === 'series' ? 'Serie' : 'Film',
    score: score(raw.voteAverage),
    providerIds,
    providerOffers: [],
    videos: [],
    accent: '#657184',
    accent2: '#1c2531',
    tmdbFavorite: Boolean(raw.favorite),
    tmdbWatchlist: Boolean(raw.watchlist),
    tmdbRated: Boolean(raw.rated) || tmdbRating !== null,
    tmdbRating,
    favoriteOrder: finiteNumber(raw.favoriteOrder),
    watchlistOrder: finiteNumber(raw.watchlistOrder),
    ratingOrder: finiteNumber(raw.ratingOrder ?? raw.ratedOrder),
    syncedAt: raw.syncedAt || null,
  }
}

export function mergePublicAndPersonalCatalog(publicTitles = [], personalTitles = []) {
  const byKey = new Map()
  const withoutTmdbKey = []

  for (const item of publicTitles) {
    const key = tmdbCatalogKey(item)
    if (key) byKey.set(key, item)
    else withoutTmdbKey.push(item)
  }

  for (const raw of personalTitles) {
    const personal = raw?.id && raw?.type ? raw : normalizePersonalTmdbTitle(raw)
    const key = tmdbCatalogKey(personal)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, personal)
      continue
    }

    byKey.set(key, {
      ...personal,
      ...existing,
      tmdbFavorite: personal.tmdbFavorite,
      tmdbWatchlist: personal.tmdbWatchlist,
      tmdbRated: personal.tmdbRated,
      tmdbRating: personal.tmdbRating,
      favoriteOrder: personal.favoriteOrder,
      watchlistOrder: personal.watchlistOrder,
      ratingOrder: personal.ratingOrder,
      syncedAt: personal.syncedAt,
      ageRating: existing.ageRating ?? personal.ageRating ?? null,
      providerIds: existing.providerIds?.length ? existing.providerIds : personal.providerIds,
      artwork: {
        posterPaths: [...new Set([...(existing.artwork?.posterPaths || []), ...(personal.artwork?.posterPaths || [])])].slice(0, 3),
        heroBackdropPaths: [...new Set([...(existing.artwork?.heroBackdropPaths || []), ...(personal.artwork?.heroBackdropPaths || [])])].slice(0, 3),
      },
      collectionId: existing.collectionChecked === true
        ? existing.collectionId ?? null
        : personal.collectionId ?? existing.collectionId ?? null,
      collectionName: existing.collectionChecked === true
        ? existing.collectionName || null
        : personal.collectionName || existing.collectionName || null,
      collectionChecked: existing.collectionChecked === true || personal.collectionChecked === true,
      collectionDetails: existing.collectionDetails || personal.collectionDetails || null,
      metadataVersion: Math.max(Number(existing.metadataVersion) || 0, Number(personal.metadataVersion) || 0),
      metadataComplete: existing.metadataComplete === true || personal.metadataComplete === true,
      metadataUpdatedAt: existing.metadataUpdatedAt || personal.metadataUpdatedAt || personal.syncedAt || null,
    })
  }

  return [...byKey.values(), ...withoutTmdbKey]
}

function orderByMembership(items, flag, orderField) {
  return items
    .filter((item) => Boolean(item[flag]))
    .sort((a, b) => {
      const ao = Number.isFinite(a[orderField]) ? a[orderField] : Number.MAX_SAFE_INTEGER
      const bo = Number.isFinite(b[orderField]) ? b[orderField] : Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return String(a.title || '').localeCompare(String(b.title || ''), 'de')
    })
}

function orderByTmdbRating(items) {
  return items
    .filter((item) => item.tmdbRated && Number.isFinite(item.tmdbRating))
    .sort((a, b) => {
      if (b.tmdbRating !== a.tmdbRating) return b.tmdbRating - a.tmdbRating
      const ao = Number.isFinite(a.ratingOrder) ? a.ratingOrder : Number.MAX_SAFE_INTEGER
      const bo = Number.isFinite(b.ratingOrder) ? b.ratingOrder : Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return String(a.title || '').localeCompare(String(b.title || ''), 'de')
    })
}

export function buildTmdbCatalogRows(items = []) {
  const rows = [
    { id: 'tmdb-watchlist', title: 'Meine Watchlist · TMDB', items: orderByMembership(items, 'tmdbWatchlist', 'watchlistOrder') },
    { id: 'tmdb-favorites', title: 'Meine Favoriten · TMDB', items: orderByMembership(items, 'tmdbFavorite', 'favoriteOrder') },
    { id: 'tmdb-ratings', title: 'Meine Bewertungen · TMDB', items: orderByTmdbRating(items) },
  ]
  return rows.filter((row) => row.items.length > 0)
}

export function nativeTitleToFirestore(raw, syncedAt) {
  const normalized = normalizePersonalTmdbTitle({ ...raw, syncedAt })
  return {
    tmdbId: normalized.tmdbId,
    mediaType: normalized.mediaType,
    title: normalized.title,
    originalTitle: normalized.originalTitle || null,
    description: normalized.description || '',
    releaseDate: normalized.releaseDate,
    posterPath: normalized.posterPath,
    backdropPath: normalized.backdropPath,
    artwork: normalized.artwork,
    collectionId: normalized.collectionId,
    collectionName: normalized.collectionName,
    collectionChecked: normalized.collectionChecked,
    collectionDetails: normalized.collectionDetails,
    metadataVersion: normalized.metadataVersion,
    metadataComplete: normalized.metadataComplete,
    metadataUpdatedAt: syncedAt || normalized.metadataUpdatedAt || null,
    originalLanguage: normalized.originalLanguage,
    voteAverage: normalized.voteAverage,
    voteCount: normalized.voteCount,
    genreNames: normalized.genreNames,
    providerIds: normalized.providerIds,
    ageRating: normalized.ageRating,
    favorite: normalized.tmdbFavorite,
    watchlist: normalized.tmdbWatchlist,
    rated: normalized.tmdbRated,
    ratingValue: normalized.tmdbRating,
    favoriteOrder: normalized.favoriteOrder,
    watchlistOrder: normalized.watchlistOrder,
    ratingOrder: normalized.ratingOrder,
    syncedAt: syncedAt || null,
  }
}
