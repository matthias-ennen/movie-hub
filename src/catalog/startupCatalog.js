import { readTitleFacets } from './titleFacets.js'

export const STARTUP_CATALOG_VERSION = 1
export const STARTUP_DETAIL_BUCKETS = 64
export const STARTUP_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function startupDetailBucket(item) {
  const id = Number(item?.tmdbId)
  if (!Number.isInteger(id) || id <= 0) return null
  return (id % STARTUP_DETAIL_BUCKETS).toString(16).padStart(2, '0')
}

// Listing data is a distinct contract: complete facets and presentation, but
// never an assertion that the full detail/season/collection record is present.
export function projectStartupTitle(item) {
  const { collectionDetails, seasons, cast, smartFacets, ...listing } = item
  return { ...listing, facets: readTitleFacets(item), detailDeferred: true }
}

export function validStartupManifest(value) {
  return value?.kind === 'moviehub-startup-manifest'
    && value.version === STARTUP_CATALOG_VERSION
    && /^[a-f0-9]{64}$/.test(value.generation || '')
    && Number.isInteger(value.titleCount) && value.titleCount > 0
}

export function validStartupCatalog(value, manifest = value) {
  return value?.kind === 'moviehub-startup-catalog'
    && value.version === STARTUP_CATALOG_VERSION
    && /^[a-f0-9]{64}$/.test(value.generation || '')
    && value.generation === manifest?.generation
    && Array.isArray(value.titles) && value.titles.length > 0
    && value.titles.length === manifest.titleCount
    && value.titles.every(item => typeof item?.id === 'string' && item.id && Array.isArray(item.facets?.castPersonIds))
    && Array.isArray(value.rowDefinitions)
}

export function startupResourcePath(generation, file) {
  if (!/^[a-f0-9]{64}$/.test(generation || '')) throw new Error('Ungültige Kataloggeneration.')
  if (!/^(catalog|filters|details-[a-f0-9]{2})\.json$/.test(file)) throw new Error('Ungültige Katalogdatei.')
  return `/startup/${generation}/${file}`
}
