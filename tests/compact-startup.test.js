import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildStartupPublication } from '../scripts/generate-startup-catalog.mjs'
import { projectStartupTitle, validStartupCatalog, startupResourcePath } from '../src/catalog/startupCatalog.js'
import { loadStartupCatalog, preloadPublicCatalog, readPublicCatalogDetail, readPublicFilterOptions, resetPublicCatalogForTests } from '../src/performance/publicCatalog.js'
import { mergeEnrichedTitle, titleNeedsMetadataEnrichment } from '../src/catalog/titleMetadata.js'
import { heroNeedsCanonicalMetadata } from '../src/components/heroMetadata.js'
import { buildPersonalSmartRows } from '../src/catalog/personalSmartRows.js'
import { selectCoordinatedHeroItems } from '../src/catalog/heroSelection.js'
import { metadataRequests } from '../src/performance/metadataRequests.js'

const movie = {
  id: 'tmdb-movie-65', tmdbId: 65, type: 'movie', source: 'tmdb', title: 'Ein Film', year: 2024,
  metadataVersion: 3, metadataComplete: true, collectionId: 5, collectionChecked: true,
  metadataChecks: Object.fromEntries(['details','artwork','ageRating','credits','keywords','videos','providers','collection'].map(key => [key, 'present'])),
  collectionDetails: { id: 5, name: 'Sammlung', parts: [{ id: 65 }] }, cast: [{ id: 9, name: 'Darsteller' }], seasons: [],
  videos: [{ site: 'YouTube', key: 'abcdefghijk', type: 'Trailer' }], artwork: { heroBackdropPaths: ['/hero.jpg'] },
  smartFacets: { version: 1, cast: [{ id: 9, name: 'Darsteller' }], keywords: [{ id: 10, name: 'Wald' }], creators: [] },
}
const source = { source: 'tmdb', generatedAt: '2026-10-31T04:00:00Z', titles: [movie], rowDefinitions: [{ id: 'home', ids: [movie.id] }],
  collections: { 5: movie.collectionDetails }, smartFilterOptions: { cast: [{ id: 9, label: 'Darsteller', count: 1 }] } }
const response = data => ({ ok: true, json: async () => data })
const cache = stored => ({ read: vi.fn(async () => stored), write: vi.fn(async () => true) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); resetPublicCatalogForTests(); metadataRequests.clear() })

describe('compact startup publication and generation contract', () => {
  it('retains every title, facet, hero and personal actor selection, with exact full details on demand', () => {
    const publication = buildStartupPublication(source)
    const listing = publication.files.get('catalog.json')
    expect(validStartupCatalog(listing, publication.manifest)).toBe(true)
    const projected = listing.titles[0]
    expect(projected).not.toHaveProperty('collectionDetails')
    expect(projected).not.toHaveProperty('cast')
    expect(projected.facets.castPersonIds).toEqual([9])
    expect(projected.videos).toEqual(movie.videos)
    expect(publication.files.get('details-01.json').entries).toEqual([{ ...movie, detailDeferred: false }])
    expect(publication.files.get('filters.json').smartFilterOptions).toEqual(source.smartFilterOptions)
    const rows = { rows: [{ id: 'actor', type: 'cast', valueId: 9, title: 'Darsteller', enabled: true }] }
    expect(buildPersonalSmartRows(listing.titles, rows).map(row => row.items.map(item => item.id)))
      .toEqual(buildPersonalSmartRows(source.titles, rows).map(row => row.items.map(item => item.id)))
    for (const page of ['home', 'movies', 'series']) expect(selectCoordinatedHeroItems(listing.titles)[page].map(item => item.id))
      .toEqual(selectCoordinatedHeroItems(source.titles)[page].map(item => item.id))
    expect(heroNeedsCanonicalMetadata(projected)).toBe(false)
    expect(titleNeedsMetadataEnrichment(projected, { requireContract: true })).toBe(true)
    for (const merged of [mergeEnrichedTitle(projected, movie), mergeEnrichedTitle(movie, projected)]) {
      expect(titleNeedsMetadataEnrichment(merged, { requireContract: true })).toBe(false)
      expect(merged.collectionDetails).toEqual(movie.collectionDetails)
    }
  })
  it('changes the content address when only full details change', () => {
    const first = buildStartupPublication(source)
    const second = buildStartupPublication({ ...source, titles: [{ ...movie, cast: [{ id: 12, name: 'Neu' }] }] })
    expect(first.manifest.generation).not.toBe(second.manifest.generation)
    expect(() => startupResourcePath('../other', 'catalog.json')).toThrow()
    expect(() => startupResourcePath(first.manifest.generation, '../catalog.json')).toThrow()
    expect(validStartupCatalog(second.files.get('catalog.json'), first.manifest)).toBe(false)
  })
  it('loads only manifest and listing on a fresh start and stores one complete generation', async () => {
    const { manifest, files } = buildStartupPublication(source)
    const storage = cache(null)
    const fetchImpl = vi.fn(async url => response(url.endsWith('manifest.json') ? manifest : files.get('catalog.json')))
    const result = await loadStartupCatalog({ fetchImpl, cache: storage })
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/startup/manifest.json', startupResourcePath(manifest.generation, 'catalog.json')])
    expect(result.titles).toEqual([projectStartupTitle(movie)])
    expect(storage.write).toHaveBeenCalledWith(result)
  })
  it('validates the small manifest and skips downloading an unchanged cached catalog', async () => {
    const { manifest, files } = buildStartupPublication(source)
    const stored = files.get('catalog.json'), storage = cache(stored)
    const fetchImpl = vi.fn(async () => response(manifest))
    expect(await loadStartupCatalog({ fetchImpl, cache: storage })).toBe(stored)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(storage.write).not.toHaveBeenCalled()
  })
  it('replaces a cached generation atomically, and uses bounded last-known data offline', async () => {
    const old = buildStartupPublication(source).files.get('catalog.json')
    const next = buildStartupPublication({ ...source, generatedAt: '2026-11-01T04:00:00Z' })
    const storage = cache(old)
    const fetchImpl = vi.fn(async url => response(url.endsWith('manifest.json') ? next.manifest : next.files.get('catalog.json')))
    expect((await loadStartupCatalog({ fetchImpl, cache: storage })).generation).toBe(next.manifest.generation)
    const offline = vi.fn(async () => { throw new Error('offline') })
    expect(await loadStartupCatalog({ fetchImpl: offline, cache: storage })).toMatchObject({ generation: old.generation, cacheStatus: 'last-known' })
    expect(offline).toHaveBeenCalledOnce()
  })
  it('never combines a new manifest with mismatched data or overwrites the last valid cache', async () => {
    vi.useFakeTimers()
    const old = buildStartupPublication(source).files.get('catalog.json')
    const next = buildStartupPublication({ ...source, generatedAt: '2026-11-01T04:00:00Z' })
    const storage = cache(old)
    const result = loadStartupCatalog({ cache: storage, fetchImpl: async url => response(url.endsWith('manifest.json') ? next.manifest : old) })
    await vi.runAllTimersAsync()
    expect(await result).toMatchObject({ generation: old.generation, cacheStatus: 'last-known' })
    expect(storage.write).not.toHaveBeenCalled()
  })
  it('reuses matching catalog details without requesting the larger search-detail pool', async () => {
    const { manifest, files } = buildStartupPublication(source)
    const fetchImpl = vi.fn(async url => response(url.endsWith('manifest.json') ? manifest : files.get(url.split('/').at(-1))))
    vi.stubGlobal('fetch', fetchImpl)
    await preloadPublicCatalog()
    const detail = await readPublicCatalogDetail(movie)
    expect(detail).toMatchObject({ canonicalPublished: true, detailDeferred: false, cast: movie.cast, collectionDetails: movie.collectionDetails })
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/startup/manifest.json', startupResourcePath(manifest.generation, 'catalog.json'), startupResourcePath(manifest.generation, 'details-01.json')])
  })
  it('keeps filter options bound to the displayed generation after the preload TTL', async () => {
    const { manifest, files } = buildStartupPublication(source)
    const fetchImpl = vi.fn(async url => response(url.endsWith('manifest.json') ? manifest : files.get(url.split('/').at(-1))))
    vi.stubGlobal('fetch', fetchImpl)
    await preloadPublicCatalog()
    const originalNow = Date.now()
    const spy = vi.spyOn(Date, 'now').mockReturnValue(originalNow + 600000)
    try {
      expect(await readPublicFilterOptions()).toEqual(source.smartFilterOptions)
      expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/startup/manifest.json', startupResourcePath(manifest.generation, 'catalog.json'), startupResourcePath(manifest.generation, 'filters.json')])
    } finally { spy.mockRestore() }
  })

})
