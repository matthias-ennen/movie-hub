export const CURRENT_TITLE_METADATA_VERSION = 2

const TMDB_PLACEHOLDER_TITLE = /^TMDB\s*#\s*\d+$/i

export function isUsableTitle(value) {
  const title = String(value ?? '').trim()
  return Boolean(title) && !TMDB_PLACEHOLDER_TITLE.test(title)
}

function timestampMilliseconds(value) {
  if (!value) return null
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function titleNeedsMetadataEnrichment(item, {
  now = Date.now(),
  maxAgeDays = null,
} = {}) {
  if (!item?.tmdbId) return false
  if (!isUsableTitle(item.title)) return true
  if (Number(item.metadataVersion || 0) < CURRENT_TITLE_METADATA_VERSION) return true
  if (item.metadataComplete !== true) return true
  if (item.type !== 'series' && item.mediaType !== 'tv') {
    if (item.collectionChecked !== true) return true
    if (item.collectionId && !item.collectionDetails) return true
  }

  if (!Number.isFinite(Number(maxAgeDays)) || Number(maxAgeDays) <= 0) return false
  const updatedAt = timestampMilliseconds(item.metadataUpdatedAt)
  if (!updatedAt) return true
  return Number(now) - updatedAt > Number(maxAgeDays) * 86400000
}

export function sameTmdbTitle(left, right) {
  if (!left?.tmdbId || !right?.tmdbId) return false
  const leftType = left.type === 'series' || left.mediaType === 'tv' ? 'series' : 'movie'
  const rightType = right.type === 'series' || right.mediaType === 'tv' ? 'series' : 'movie'
  return leftType === rightType && Number(left.tmdbId) === Number(right.tmdbId)
}

export function mergeEnrichedTitle(base, enriched) {
  if (!sameTmdbTitle(base, enriched)) return base
  const providerIds = [...new Set([...(base.providerIds || []), ...(enriched.providerIds || [])])]
  const enrichedCollectionChecked = enriched.type !== 'series' && enriched.collectionChecked === true
  const title = isUsableTitle(enriched.title)
    ? enriched.title
    : isUsableTitle(base.title)
      ? base.title
      : enriched.title || base.title || ''
  return {
    ...base,
    ...enriched,
    id: base.id,
    title,
    providerIds,
    providerOffers: Array.isArray(base.providerOffers) && base.providerOffers.length
      ? base.providerOffers
      : enriched.providerOffers || [],
    movieHubCatalog: base.movieHubCatalog === true || enriched.movieHubCatalog === true,
    collectionId: enrichedCollectionChecked ? enriched.collectionId ?? null : base.collectionId ?? enriched.collectionId ?? null,
    collectionName: enrichedCollectionChecked ? enriched.collectionName || null : base.collectionName || enriched.collectionName || null,
    collectionChecked: base.type === 'series' ? null : base.collectionChecked === true || enriched.collectionChecked === true,
    collectionDetails: enriched.collectionDetails || base.collectionDetails || null,
    metadataVersion: Math.max(Number(base.metadataVersion) || 0, Number(enriched.metadataVersion) || 0),
    metadataComplete: isUsableTitle(title) && (base.metadataComplete === true || enriched.metadataComplete === true),
    metadataUpdatedAt: enriched.metadataUpdatedAt || base.metadataUpdatedAt || null,
  }
}
