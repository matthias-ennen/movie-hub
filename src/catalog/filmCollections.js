import { buildTmdbImageUrl } from '../services/tmdb.js'

const ACCENT_PAIRS = [
  ['#c88953', '#50311f'],
  ['#d45d36', '#23314c'],
  ['#7199a7', '#25353a'],
  ['#6d8291', '#1a212b'],
  ['#b04a35', '#321b18'],
  ['#57777b', '#182628'],
  ['#497ea8', '#16283a'],
  ['#7168a5', '#241f3c'],
]

function finiteId(value) {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

function releaseYear(value) {
  const match = String(value || '').match(/^(\d{4})-/)
  return match ? Number(match[1]) : null
}

function accentsFor(tmdbId) {
  return ACCENT_PAIRS[Math.abs(Number(tmdbId) || 0) % ACCENT_PAIRS.length]
}

function scoreFor(value) {
  if (!Number.isFinite(Number(value))) return '–'
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function collectionIdForTitle(item) {
  if (item?.type === 'series' || item?.mediaType === 'tv') return null
  return finiteId(
    item?.facets?.collectionId
      ?? item?.smartFacets?.collection?.id
      ?? item?.collectionId,
  )
}

export function findFilmCollectionForTitle(item, collections = {}) {
  if (!item || item.type === 'series') return null
  const directId = collectionIdForTitle(item)
  if (directId && collections?.[String(directId)]) return collections[String(directId)]

  const tmdbId = finiteId(item.tmdbId)
  if (!tmdbId) return null
  return Object.values(collections || {}).find((collection) => (
    Array.isArray(collection?.parts)
      && collection.parts.some((part) => finiteId(part?.tmdbId) === tmdbId)
  )) || null
}

export function compareCollectionParts(left, right) {
  const leftDate = /^\d{4}-\d{2}-\d{2}$/.test(left?.releaseDate || '')
    ? left.releaseDate
    : '9999-12-31'
  const rightDate = /^\d{4}-\d{2}-\d{2}$/.test(right?.releaseDate || '')
    ? right.releaseDate
    : '9999-12-31'

  return leftDate.localeCompare(rightDate)
    || String(left?.title || '').localeCompare(String(right?.title || ''), 'de')
    || (finiteId(left?.tmdbId) || 0) - (finiteId(right?.tmdbId) || 0)
}

export function normalizeCollectionPart(raw, collectionId) {
  const tmdbId = finiteId(raw?.tmdbId ?? raw?.id)
  const title = String(raw?.title || raw?.original_title || '').trim()
  if (!tmdbId || !title || raw?.adult === true) return null

  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(raw?.releaseDate || raw?.release_date || '')
    ? (raw.releaseDate || raw.release_date)
    : null
  const rawVoteAverage = raw?.voteAverage ?? raw?.vote_average
  const voteAverage = rawVoteAverage !== null && rawVoteAverage !== '' && Number.isFinite(Number(rawVoteAverage))
    ? Number(rawVoteAverage)
    : null
  const rawYear = raw?.year
  const [accent, accent2] = accentsFor(tmdbId)
  const posterPath = raw?.posterPath || raw?.poster_path || null
  const backdropPath = raw?.backdropPath || raw?.backdrop_path || null

  return {
    id: `tmdb-movie-${tmdbId}`,
    tmdbId,
    type: 'movie',
    source: 'tmdb',
    title,
    originalTitle: raw?.originalTitle || raw?.original_title || title,
    description: String(raw?.description || raw?.overview || ''),
    year: rawYear !== null && rawYear !== '' && Number.isFinite(Number(rawYear))
      ? Number(rawYear)
      : releaseYear(releaseDate),
    releaseDate,
    posterPath,
    backdropPath,
    posterUrl: raw?.posterUrl || buildTmdbImageUrl(posterPath, 'w500'),
    backdropUrl: raw?.backdropUrl || buildTmdbImageUrl(backdropPath, 'w1280'),
    neutralPosterPath: raw?.neutralPosterPath || posterPath,
    neutralPosterUrl: raw?.neutralPosterUrl || raw?.posterUrl || buildTmdbImageUrl(posterPath, 'w500'),
    artwork: {
      posterPaths: [...new Set([...(raw?.artwork?.posterPaths || []), posterPath].filter(Boolean))].slice(0, 3),
      heroBackdropPaths: [...new Set([...(raw?.artwork?.heroBackdropPaths || []), backdropPath].filter(Boolean))].slice(0, 3),
    },
    voteAverage,
    score: raw?.score || scoreFor(voteAverage),
    meta: raw?.meta || 'Film',
    genre: raw?.genre || 'Ohne Genreangabe',
    genres: Array.isArray(raw?.genres) ? raw.genres : [],
    cast: Array.isArray(raw?.cast) ? raw.cast : [],
    videos: Array.isArray(raw?.videos) ? raw.videos : [],
    providerIds: Array.isArray(raw?.providerIds) ? [...new Set(raw.providerIds)] : [],
    providerOffers: Array.isArray(raw?.providerOffers) ? raw.providerOffers : [],
    accent,
    accent2,
    facets: { collectionId: finiteId(collectionId) },
    collectionId: finiteId(collectionId),
    collectionName: raw?.collectionName || null,
    collectionChecked: true,
    metadataVersion: Math.max(2, Number(raw?.metadataVersion) || 0),
    detailSource: raw?.detailSource || 'collection',
  }
}

function collectionNameFromTitles(collectionId, titles) {
  return titles
    .map((title) => title?.smartFacets?.collection)
    .find((collection) => finiteId(collection?.id) === collectionId && collection?.name)
    ?.name || ''
}

export function buildFilmCollection(rawCollection, catalogTitles = []) {
  const collectionId = finiteId(rawCollection?.id)
  if (!collectionId) return null

  const catalogParts = catalogTitles
    .filter((title) => title?.type === 'movie' && collectionIdForTitle(title) === collectionId)
  const fullByTmdbId = new Map(catalogParts
    .filter((title) => finiteId(title?.tmdbId))
    .map((title) => [finiteId(title.tmdbId), title]))
  const rawParts = Array.isArray(rawCollection?.parts) && rawCollection.parts.length
    ? rawCollection.parts
    : catalogParts
  const partsById = new Map()

  for (const rawPart of rawParts) {
    const tmdbId = finiteId(rawPart?.tmdbId ?? rawPart?.id)
    const merged = tmdbId && fullByTmdbId.has(tmdbId)
      ? { ...rawPart, ...fullByTmdbId.get(tmdbId) }
      : rawPart
    const part = normalizeCollectionPart(merged, collectionId)
    if (part) partsById.set(part.tmdbId, part)
  }

  for (const title of catalogParts) {
    const part = normalizeCollectionPart(title, collectionId)
    if (part && !partsById.has(part.tmdbId)) partsById.set(part.tmdbId, part)
  }

  const parts = [...partsById.values()].sort(compareCollectionParts)
  if (!parts.length) return null

  return {
    id: collectionId,
    name: String(rawCollection?.name || collectionNameFromTitles(collectionId, catalogTitles) || 'Filmreihe'),
    overview: String(rawCollection?.overview || ''),
    posterUrl: rawCollection?.posterUrl || buildTmdbImageUrl(rawCollection?.poster_path, 'w500'),
    backdropUrl: rawCollection?.backdropUrl || buildTmdbImageUrl(rawCollection?.backdrop_path, 'w1280'),
    parts,
  }
}

export function buildFilmCollectionIndex(rawCollections, catalogTitles = []) {
  const rawById = new Map((Array.isArray(rawCollections) ? rawCollections : [])
    .map((collection) => [finiteId(collection?.id), collection])
    .filter(([id]) => id))

  for (const title of Array.isArray(catalogTitles) ? catalogTitles : []) {
    const collectionId = collectionIdForTitle(title)
    if (collectionId && !rawById.has(collectionId)) rawById.set(collectionId, { id: collectionId })
  }

  return Object.fromEntries([...rawById.entries()]
    .map(([id, raw]) => [String(id), buildFilmCollection(raw, catalogTitles)])
    .filter(([, collection]) => collection?.parts?.length > 1))
}

export function normalizeFilmCollectionIndex(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.values(value)
    .map((collection) => {
      const normalized = buildFilmCollection(collection, [])
      return normalized ? [String(normalized.id), normalized] : null
    })
    .filter(Boolean))
}

export function resolveFilmCollectionParts(collection, titles = []) {
  if (!collection?.parts?.length) return []
  const fullByTmdbId = new Map((Array.isArray(titles) ? titles : [])
    .filter((title) => title?.type === 'movie' && finiteId(title?.tmdbId))
    .map((title) => [finiteId(title.tmdbId), title]))

  return collection.parts.map((part) => {
    const full = fullByTmdbId.get(finiteId(part.tmdbId))
    if (!full) return part
    return {
      ...part,
      ...full,
      facets: {
        ...(part.facets || {}),
        ...(full.facets || {}),
        collectionId: collection.id,
      },
      providerIds: [...new Set([...(part.providerIds || []), ...(full.providerIds || [])])],
    }
  })
}
