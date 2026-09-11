import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TMDB_PROVIDER_REGISTRY } from '../src/providers/providerRegistry.js'
import { normalizeTmdbTitle } from '../src/services/tmdb.js'
import {
  SEARCH_INDEX_VERSION,
  buildSearchIndexArtifact,
  toSearchIndexEntry,
} from '../src/search/searchIndex.js'
import { SEARCH_DETAIL_BUCKET_COUNT, SEARCH_DETAIL_VERSION } from '../src/search/lazySearchDetails.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = resolve(root, 'public/catalog.json')
const searchIndexPath = resolve(root, 'public/search-index.json')
const searchDetailsDirectory = resolve(root, 'public/search-details')

const token = process.env.TMDB_API_READ_TOKEN
const language = process.env.TMDB_LANGUAGE || 'de-DE'
const country = process.env.TMDB_COUNTRY || 'DE'

export const SEARCH_OFFER_TYPES = ['flatrate', 'free', 'ads', 'rent', 'buy']
export const SEARCH_PAGES_PER_OFFER = Math.max(
  1,
  Math.min(50, Number(process.env.TMDB_SEARCH_PAGES_PER_OFFER) || 10),
)
const REQUEST_CONCURRENCY = 3
const MAX_RETRIES = 4
const MINIMUM_BROAD_DISCOVERY_SIZE = 2000
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

function normalizeProviderName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function tmdbFetch(path, searchParams = {}, attempt = 0) {
  if (!token) throw new Error('TMDB_API_READ_TOKEN is missing.')

  const endpoint = new URL(`https://api.themoviedb.org/3${path}`)
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== '') endpoint.searchParams.set(key, String(value))
  }

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfter = Number(response.headers.get('retry-after'))
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 500 * (2 ** attempt)
    await sleep(delay)
    return tmdbFetch(path, searchParams, attempt + 1)
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`TMDB request failed with HTTP ${response.status}: ${body.slice(0, 300)}`)
  }

  return response.json()
}

async function mapWithConcurrency(values, limit, callback) {
  const results = new Array(values.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++
      results[index] = await callback(values[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return results
}

function findProviderIds(providerDirectory, provider) {
  const aliases = new Set(provider.aliases)
  return [...new Set(providerDirectory
    .filter((entry) => aliases.has(normalizeProviderName(entry?.provider_name)))
    .map((entry) => Number(entry?.provider_id))
    .filter(Number.isFinite))]
}

async function loadProviderDirectory(mediaType) {
  const payload = await tmdbFetch(`/watch/providers/${mediaType}`, {
    language,
    watch_region: country,
  })
  return Array.isArray(payload?.results) ? payload.results : []
}

async function loadGenreDirectory(mediaType) {
  const tmdbType = mediaType === 'series' || mediaType === 'tv' ? 'tv' : 'movie'
  const payload = await tmdbFetch(`/genre/${tmdbType}/list`, { language })
  return new Map((Array.isArray(payload?.genres) ? payload.genres : [])
    .filter((genre) => Number.isFinite(Number(genre?.id)) && genre?.name)
    .map((genre) => [Number(genre.id), genre.name]))
}

function accentFor(tmdbId) {
  return ACCENT_PAIRS[Math.abs(Number(tmdbId) || 0) % ACCENT_PAIRS.length]
}

function detailBucket(tmdbId) {
  return (Math.abs(Number(tmdbId) || 0) % SEARCH_DETAIL_BUCKET_COUNT)
    .toString(16)
    .padStart(2, '0')
}

function genreNamesFromIds(raw, genreNamesById) {
  return (Array.isArray(raw?.genre_ids) ? raw.genre_ids : [])
    .map((id) => genreNamesById?.get?.(Number(id)))
    .filter(Boolean)
}

export function buildSearchDiscoverParams(tmdbProviderIds, mediaType, offerType, page = 1) {
  const providerIds = (Array.isArray(tmdbProviderIds) ? tmdbProviderIds : [tmdbProviderIds])
    .map(Number)
    .filter(Number.isFinite)

  if (!SEARCH_OFFER_TYPES.includes(offerType)) {
    throw new Error(`Unsupported search offer type: ${offerType}`)
  }

  return {
    language,
    region: mediaType === 'movie' ? country : undefined,
    watch_region: country,
    with_watch_providers: providerIds.join('|'),
    with_watch_monetization_types: offerType,
    sort_by: 'popularity.desc',
    include_adult: false,
    page,
  }
}

export function searchEntryFromDiscover(raw, mediaType, provider, tmdbProviderIds, offerType) {
  if (!provider?.id) return null
  const normalized = normalizeTmdbTitle(raw, mediaType)
  const [accent, accent2] = accentFor(normalized.tmdbId)
  const providerIds = (Array.isArray(tmdbProviderIds) ? tmdbProviderIds : [tmdbProviderIds])
    .map(Number)
    .filter(Number.isFinite)

  return toSearchIndexEntry({
    id: `tmdb-${normalized.type}-${normalized.tmdbId}`,
    tmdbId: normalized.tmdbId,
    type: normalized.type,
    title: normalized.title,
    originalTitle: normalized.originalTitle,
    year: normalized.year,
    posterUrl: normalized.posterUrl,
    accent,
    accent2,
    providerIds: [provider.id],
    providerOffers: [{
      id: provider.id,
      tmdbProviderId: providerIds.length === 1 ? providerIds[0] : null,
      offerTypes: [offerType],
    }],
  }, { scope: 'public' })
}

export function searchDetailFromDiscover(raw, mediaType, genreNamesById = new Map()) {
  const normalized = normalizeTmdbTitle(raw, mediaType)
  return {
    id: `tmdb-${normalized.type}-${normalized.tmdbId}`,
    tmdbId: normalized.tmdbId,
    type: normalized.type,
    title: normalized.title,
    originalTitle: normalized.originalTitle,
    description: normalized.description,
    year: normalized.year,
    releaseDate: normalized.releaseDate,
    backdropUrl: normalized.backdropUrl,
    originalLanguage: normalized.originalLanguage,
    voteAverage: normalized.voteAverage,
    genreNames: genreNamesFromIds(raw, genreNamesById),
    completeness: 'discover',
  }
}

function searchDetailFromCatalogTitle(title) {
  const genreNames = Array.isArray(title?.genres)
    ? title.genres.map((genre) => typeof genre === 'string' ? genre : genre?.name).filter(Boolean)
    : String(title?.genre || '')
      .split('·')
      .map((value) => value.trim())
      .filter((value) => value && value !== 'Ohne Genreangabe')

  return {
    id: title.id,
    tmdbId: Number.isFinite(Number(title.tmdbId)) ? Number(title.tmdbId) : null,
    type: title.type === 'series' ? 'series' : 'movie',
    title: title.title,
    originalTitle: title.originalTitle || null,
    description: title.description || '',
    year: Number.isFinite(Number(title.year)) ? Number(title.year) : null,
    releaseDate: title.releaseDate || null,
    backdropUrl: title.backdropUrl || null,
    originalLanguage: title.originalLanguage || null,
    voteAverage: Number.isFinite(Number(title.voteAverage)) ? Number(title.voteAverage) : null,
    genreNames,
    meta: title.meta || null,
    cast: Array.isArray(title.cast) ? title.cast : [],
    videos: Array.isArray(title.videos) ? title.videos : [],
    completeness: 'catalog',
  }
}

function mergeOfferTypes(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => SEARCH_OFFER_TYPES.includes(value)))]
}

export function mergeProviderSearchEntries(entries) {
  const merged = new Map()

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.id) continue
    const current = merged.get(entry.id)
    if (!current) {
      merged.set(entry.id, {
        ...entry,
        providerIds: [...new Set(entry.providerIds || [])],
        providerOffers: (entry.providerOffers || []).map((offer) => ({
          ...offer,
          offerTypes: mergeOfferTypes(offer.offerTypes),
        })),
      })
      continue
    }

    const offers = new Map()
    for (const offer of [...(current.providerOffers || []), ...(entry.providerOffers || [])]) {
      if (!offer?.id) continue
      const existing = offers.get(offer.id)
      offers.set(offer.id, existing
        ? {
            ...existing,
            ...offer,
            tmdbProviderId: existing.tmdbProviderId ?? offer.tmdbProviderId ?? null,
            offerTypes: mergeOfferTypes([...(existing.offerTypes || []), ...(offer.offerTypes || [])]),
          }
        : { ...offer, offerTypes: mergeOfferTypes(offer.offerTypes) })
    }

    merged.set(entry.id, {
      ...current,
      title: current.title || entry.title,
      originalTitle: current.originalTitle || entry.originalTitle,
      year: current.year || entry.year,
      posterUrl: current.posterUrl || entry.posterUrl,
      providerIds: [...new Set([...(current.providerIds || []), ...(entry.providerIds || [])])],
      providerOffers: [...offers.values()],
    })
  }

  return [...merged.values()]
}

export function mergeSearchDetails(details) {
  const merged = new Map()
  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail?.id) continue
    const current = merged.get(detail.id)
    if (!current || detail.completeness === 'catalog') {
      merged.set(detail.id, detail)
      continue
    }
    merged.set(detail.id, {
      ...detail,
      ...current,
      description: current.description || detail.description || '',
      backdropUrl: current.backdropUrl || detail.backdropUrl || null,
      genreNames: current.genreNames?.length ? current.genreNames : detail.genreNames || [],
      voteAverage: current.voteAverage ?? detail.voteAverage ?? null,
    })
  }
  return [...merged.values()]
}

async function discoverOfferEntries({ provider, tmdbProviderIds, mediaType, offerType, genreNamesById }) {
  if (!tmdbProviderIds.length) return []

  const path = mediaType === 'movie' ? '/discover/movie' : '/discover/tv'
  const records = []
  let page = 1
  let totalPages = 1

  while (page <= Math.min(totalPages, SEARCH_PAGES_PER_OFFER, 500)) {
    const payload = await tmdbFetch(
      path,
      buildSearchDiscoverParams(tmdbProviderIds, mediaType, offerType, page),
    )
    totalPages = Math.min(Number(payload?.total_pages) || 1, 500)

    for (const raw of Array.isArray(payload?.results) ? payload.results : []) {
      try {
        const entry = searchEntryFromDiscover(raw, mediaType, provider, tmdbProviderIds, offerType)
        if (entry) records.push({
          entry,
          detail: searchDetailFromDiscover(raw, mediaType, genreNamesById),
        })
      } catch (error) {
        console.warn(
          `Search-index candidate skipped for ${provider.id}/${mediaType}/${offerType}:`,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
    page += 1
  }

  return records
}

async function readCatalog() {
  const raw = await readFile(catalogPath, 'utf8')
  const catalog = JSON.parse(raw)
  if (catalog?.source !== 'tmdb' || !Array.isArray(catalog?.titles) || !catalog.titles.length) {
    throw new Error('A valid non-empty TMDB catalog is required before building the search index.')
  }
  return catalog
}

function buildBroadArtifact(catalog, entries) {
  const mergedEntries = mergeProviderSearchEntries([
    ...entries,
    ...buildSearchIndexArtifact(catalog).entries,
  ])

  return {
    source: 'tmdb',
    kind: 'search-index',
    version: SEARCH_INDEX_VERSION,
    language: catalog?.language || language,
    country: catalog?.country || country,
    generatedAt: new Date().toISOString(),
    attribution: catalog?.attribution || 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    providerAttribution: catalog?.providerAttribution || 'Watch-provider availability is powered by JustWatch via TMDB.',
    coverage: {
      mode: 'provider-discover',
      offerTypes: [...SEARCH_OFFER_TYPES],
      pagesPerOffer: SEARCH_PAGES_PER_OFFER,
      providerCount: TMDB_PROVIDER_REGISTRY.length,
    },
    count: mergedEntries.length,
    entries: mergedEntries,
  }
}

async function writeSearchIndex(searchIndex) {
  await mkdir(dirname(searchIndexPath), { recursive: true })
  // Keep the search payload compact. At the target scale of tens of thousands
  // of entries, pretty-printed JSON would waste bandwidth without helping the client.
  await writeFile(searchIndexPath, `${JSON.stringify(searchIndex)}\n`, 'utf8')
  console.log(`Movie Hub search index generated: ${searchIndex.entries.length} entries -> public/search-index.json`)
  return searchIndex
}

async function writeSearchDetails(details, generatedAt = new Date().toISOString()) {
  const merged = mergeSearchDetails(details)
  const buckets = new Map(Array.from({ length: SEARCH_DETAIL_BUCKET_COUNT }, (_, index) => [
    index.toString(16).padStart(2, '0'),
    [],
  ]))

  for (const detail of merged) {
    if (!Number.isFinite(Number(detail.tmdbId))) continue
    buckets.get(detailBucket(detail.tmdbId))?.push(detail)
  }

  await rm(searchDetailsDirectory, { recursive: true, force: true })
  await mkdir(searchDetailsDirectory, { recursive: true })

  let totalBytes = 0
  const shards = []
  for (const [bucket, entries] of buckets) {
    const payload = {
      kind: 'search-detail-shard',
      version: SEARCH_DETAIL_VERSION,
      bucket,
      generatedAt,
      count: entries.length,
      entries,
    }
    const json = `${JSON.stringify(payload)}\n`
    totalBytes += Buffer.byteLength(json)
    await writeFile(resolve(searchDetailsDirectory, `${bucket}.json`), json, 'utf8')
    shards.push({ bucket, count: entries.length, path: `/search-details/${bucket}.json` })
  }

  const manifest = {
    kind: 'search-detail-manifest',
    version: SEARCH_DETAIL_VERSION,
    generatedAt,
    bucketCount: SEARCH_DETAIL_BUCKET_COUNT,
    count: merged.length,
    shards,
  }
  const manifestJson = `${JSON.stringify(manifest)}\n`
  totalBytes += Buffer.byteLength(manifestJson)
  await writeFile(resolve(searchDetailsDirectory, 'manifest.json'), manifestJson, 'utf8')
  console.log(`Movie Hub lazy search details generated: ${merged.length} entries in ${SEARCH_DETAIL_BUCKET_COUNT} shards · ${(totalBytes / 1024 / 1024).toFixed(2)} MiB total`)
  return manifest
}

export async function generateSearchDetailsFromCatalog() {
  const catalog = await readCatalog()
  return writeSearchDetails(
    catalog.titles.map(searchDetailFromCatalogTitle),
    catalog.generatedAt || new Date().toISOString(),
  )
}

export async function generateSearchIndexFromCatalog() {
  const catalog = await readCatalog()
  const searchIndex = buildSearchIndexArtifact(catalog)
  if (!searchIndex.entries.length) throw new Error('Search index generation produced no entries.')
  await writeSearchIndex(searchIndex)
  await writeSearchDetails(catalog.titles.map(searchDetailFromCatalogTitle), searchIndex.generatedAt)
  return searchIndex
}

export async function generateBroadSearchIndexFromTmdb() {
  if (!token) throw new Error('TMDB_API_READ_TOKEN is missing. Broad search-index generation must run in trusted CI.')

  const catalog = await readCatalog()
  const [movieDirectory, tvDirectory, movieGenres, tvGenres] = await Promise.all([
    loadProviderDirectory('movie'),
    loadProviderDirectory('tv'),
    loadGenreDirectory('movie'),
    loadGenreDirectory('tv'),
  ])

  const tasks = []
  for (const provider of TMDB_PROVIDER_REGISTRY) {
    const movieProviderIds = findProviderIds(movieDirectory, provider)
    const tvProviderIds = findProviderIds(tvDirectory, provider)

    for (const offerType of SEARCH_OFFER_TYPES) {
      if (movieProviderIds.length) {
        tasks.push({
          provider,
          tmdbProviderIds: movieProviderIds,
          mediaType: 'movie',
          offerType,
          genreNamesById: movieGenres,
        })
      }
      if (tvProviderIds.length) {
        tasks.push({
          provider,
          tmdbProviderIds: tvProviderIds,
          mediaType: 'tv',
          offerType,
          genreNamesById: tvGenres,
        })
      }
    }
  }

  console.log(
    `Search index discovery: ${tasks.length} provider/media/offer scans · up to ${SEARCH_PAGES_PER_OFFER} pages each`,
  )
  const discovered = await mapWithConcurrency(tasks, REQUEST_CONCURRENCY, discoverOfferEntries)
  const records = discovered.flat()
  const broadEntries = mergeProviderSearchEntries(records.map((record) => record.entry))
  console.log(`Search index discovery resolved ${broadEntries.length} unique titles before catalog merge.`)

  if (broadEntries.length < MINIMUM_BROAD_DISCOVERY_SIZE) {
    throw new Error(
      `Broad search index quality gate failed: ${broadEntries.length} discovered entries; at least ${MINIMUM_BROAD_DISCOVERY_SIZE} are required.`,
    )
  }

  const searchIndex = buildBroadArtifact(catalog, broadEntries)
  await writeSearchIndex(searchIndex)
  await writeSearchDetails([
    ...records.map((record) => record.detail),
    ...catalog.titles.map(searchDetailFromCatalogTitle),
  ], searchIndex.generatedAt)
  return searchIndex
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (token) await generateBroadSearchIndexFromTmdb()
    else await generateSearchIndexFromCatalog()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
