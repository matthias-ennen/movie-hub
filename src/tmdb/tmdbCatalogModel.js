import { buildTmdbImageUrl } from '../services/tmdb.js'

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
    originalLanguage: raw.originalLanguage || null,
    voteAverage: Number.isFinite(Number(raw.voteAverage)) ? Number(raw.voteAverage) : null,
    voteCount: Number.isFinite(Number(raw.voteCount)) ? Number(raw.voteCount) : null,
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
    favoriteOrder: Number.isFinite(Number(raw.favoriteOrder)) ? Number(raw.favoriteOrder) : null,
    watchlistOrder: Number.isFinite(Number(raw.watchlistOrder)) ? Number(raw.watchlistOrder) : null,
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
      favoriteOrder: personal.favoriteOrder,
      watchlistOrder: personal.watchlistOrder,
      syncedAt: personal.syncedAt,
      providerIds: existing.providerIds?.length ? existing.providerIds : personal.providerIds,
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

export function buildTmdbCatalogRows(items = []) {
  const rows = [
    { id: 'tmdb-favorites', title: 'TMDB Favoriten', items: orderByMembership(items, 'tmdbFavorite', 'favoriteOrder') },
    { id: 'tmdb-watchlist', title: 'TMDB Watchlist', items: orderByMembership(items, 'tmdbWatchlist', 'watchlistOrder') },
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
    originalLanguage: normalized.originalLanguage,
    voteAverage: normalized.voteAverage,
    voteCount: normalized.voteCount,
    genreNames: normalized.genreNames,
    providerIds: normalized.providerIds,
    favorite: normalized.tmdbFavorite,
    watchlist: normalized.tmdbWatchlist,
    favoriteOrder: normalized.favoriteOrder,
    watchlistOrder: normalized.watchlistOrder,
    syncedAt: syncedAt || null,
  }
}
