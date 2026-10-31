import { fetchJsonWithTimeout } from './fetchJson.js'
import { loadCatalogWithRetry } from './catalogStartup.js'
import { throwIfAborted } from './cooperativeWork.js'
import { createPublicCatalogCache } from './publicCatalogCache.js'
import { validStartupCatalog, validStartupManifest, startupDetailBucket, startupResourcePath } from '../catalog/startupCatalog.js'
import { metadataRequests } from './metadataRequests.js'
import { recordPerformanceEvent } from './performanceDiagnostics.js'

let request = null, cached = null, loadedAt = 0, byId = new Map(), byReference = new Map()

export async function loadStartupCatalog({ fetchImpl = globalThis.fetch, cache = createPublicCatalogCache(), now = Date.now() } = {}) {
  const stored = await cache.read(now)
  let manifest
  try {
    manifest = await fetchJsonWithTimeout('/startup/manifest.json', { fetchImpl, timeoutMs: stored ? 1500 : 3000 })
    if (!validStartupManifest(manifest)) throw new Error('Startmanifest ist ungültig.')
    if (stored && validStartupCatalog(stored, manifest)) {
      recordPerformanceEvent('startup:catalog-cache', { outcome: 'validated', titleCount: stored.titles.length })
      return stored
    }
    const data = await loadCatalogWithRetry(async () => {
      const result = await fetchJsonWithTimeout(startupResourcePath(manifest.generation, 'catalog.json'), {
        fetchImpl, timeoutMs: 7000, cache: 'default', measureAs: 'startup:catalog',
      })
      if (!validStartupCatalog(result, manifest)) throw new Error('Startkatalog und Manifest passen nicht zusammen.')
      return result
    }, { retryDelays: [500] })
    // Slow/unavailable storage must not hold the first frame.
    void cache.write(data).catch(() => {})
    recordPerformanceEvent('startup:catalog-cache', { outcome: 'downloaded', titleCount: data.titles.length })
    return data
  } catch (error) {
    if (stored) {
      recordPerformanceEvent('startup:catalog-cache', { outcome: 'last-known', titleCount: stored.titles.length })
      return { ...stored, cacheStatus: 'last-known' }
    }
    // Bounded compatibility with older hosting generations/rollbacks only.
    recordPerformanceEvent('startup:catalog-cache', { outcome: 'legacy-fallback' })
    const data = await fetchJsonWithTimeout('/catalog.json', { fetchImpl, timeoutMs: 7000, measureAs: 'startup:catalog-legacy' })
    if (!Array.isArray(data?.titles) || !data.titles.length || !Array.isArray(data.rowDefinitions)) throw error
    return data
  }
}

function remember(data) {
  cached = data; loadedAt = Date.now()
  byId = new Map(data.titles.map(item => [item.id, item]))
  byReference = new Map(data.titles.map(item => [`${item.type}:${item.tmdbId}`, item]))
  return data
}

export function getPublicCatalogTitle(item) {
  return byId.get(item?.id || item?.catalogId) || byReference.get(`${item?.type}:${item?.tmdbId}`) || null
}

export function preloadPublicCatalog() {
  if (cached && Date.now() - loadedAt < 5 * 60 * 1000) return Promise.resolve(cached)
  if (request) return request
  request = loadStartupCatalog().then(remember).finally(() => { request = null })
  return request
}

export async function readPublicCatalog({ signal } = {}) {
  throwIfAborted(signal)
  let cancel
  const aborted = new Promise((_, reject) => {
    cancel = () => reject(Object.assign(new Error('Start abgebrochen.'), { name: 'AbortError' }))
    signal?.addEventListener('abort', cancel, { once: true })
  })
  try { return await Promise.race([preloadPublicCatalog(), aborted]) }
  finally { signal?.removeEventListener('abort', cancel) }
}

export async function readPublicCatalogDetail(item, options = {}) {
  const listing = getPublicCatalogTitle(item)
  if (!listing) return null
  if (!listing.detailDeferred) return { ...listing, canonicalPublished: true }
  const generation = cached?.generation
  const bucket = startupDetailBucket(listing)
  if (!generation || !bucket) return null
  const payload = await metadataRequests.load(startupResourcePath(generation, `details-${bucket}.json`), { ...options, cache: 'default' })
  if (payload?.kind !== 'moviehub-startup-details' || payload.generation !== generation || !Array.isArray(payload.entries)) throw new Error('Ungültige Titeldetails.')
  const detail = payload.entries.find(candidate => candidate.id === listing.id)
  return detail ? { ...detail, detailDeferred: false, canonicalPublished: true } : null
}

export async function readPublicFilterOptions({ signal } = {}) {
  throwIfAborted(signal)
  // The editor belongs to the displayed catalog, even after the preload TTL.
  const catalog = cached || await readPublicCatalog({ signal })
  if (!catalog.generation) return catalog.smartFilterOptions || {}
  const payload = await metadataRequests.load(startupResourcePath(catalog.generation, 'filters.json'), { signal, cache: 'default' })
  if (payload?.kind !== 'moviehub-startup-filters' || payload.generation !== catalog.generation) throw new Error('Filterauswahl konnte nicht geladen werden.')
  return payload.smartFilterOptions || {}
}

export function resetPublicCatalogForTests() { request = null; cached = null; loadedAt = 0; byId.clear(); byReference.clear() }
