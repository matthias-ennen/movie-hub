import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeEnrichedTitle, titleNeedsMetadataEnrichment } from '../src/catalog/titleMetadata.js'
import { buildSharedMediaTitleRef } from '../src/library/sharedMediaCatalogModel.js'
import { mergeSearchDetail, searchDetailBucket } from '../src/search/lazySearchDetails.js'
import { nativeTitleToFirestore } from '../src/tmdb/tmdbCatalogModel.js'
import { toSearchIndexEntry } from '../src/search/searchIndex.js'
import { canonicalTitleIdentity } from './build-title-candidate-inventory.mjs'
import { WaipuTmdbMetadataClient } from './waipu-title-metadata.mjs'

export const TITLE_CANONICAL_EXECUTOR_VERSION = 1

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'movie-hub-62459'
const previewPath = resolve(process.env.TITLE_PRIORITY_PREVIEW || 'artifacts/title-priority-preview.json')
const inventoryPath = resolve(process.env.TITLE_CANDIDATE_INVENTORY || 'artifacts/title-candidate-inventory.json')
const statusPath = resolve(process.env.TITLE_CANONICAL_EXECUTOR_STATUS || 'artifacts/title-canonical-executor-summary.json')
const catalogPath = resolve('public/catalog.json')
const searchIndexPath = resolve('public/search-index.json')
const searchDetailsDirectory = resolve('public/search-details')
const waipuTitlesPath = resolve('public/waipu-live/titles.json')
const PUBLIC_TITLE_FIELDS = Object.freeze([
  'id', 'source', 'tmdbId', 'type', 'mediaType', 'title', 'originalTitle',
  'description', 'year', 'releaseDate', 'runtimeMinutes', 'numberOfSeasons',
  'numberOfEpisodes', 'seasons', 'genres', 'genreNames', 'genre', 'cast',
  'smartFacets', 'collectionId', 'collectionName', 'collectionChecked',
  'collectionDetails', 'metadataComplete', 'metadataVersion', 'metadataChecks',
  'metadataUpdatedAt', 'voteAverage', 'voteCount', 'popularity', 'posterPath',
  'backdropPath', 'neutralPosterPath', 'neutralPosterUrl', 'artwork', 'posterUrl',
  'backdropUrl', 'originalLanguage', 'status', 'ageRating', 'meta', 'score',
  'providerIds', 'providerOffers', 'watchProviderLink', 'videos', 'accent', 'accent2',
])

function timestampMilliseconds(value) {
  if (!value) return Number.NEGATIVE_INFINITY
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function canonicalKey(value) {
  return canonicalTitleIdentity(value)?.key || null
}

function canonicalForIdentity(value, entry) {
  const type = entry.type === 'series' ? 'series' : 'movie'
  const publicMetadata = Object.fromEntries(PUBLIC_TITLE_FIELDS
    .filter((key) => Object.prototype.hasOwnProperty.call(value || {}, key))
    .map((key) => [key, value[key]]))
  return {
    ...publicMetadata,
    id: value?.id || `tmdb-${type}-${entry.tmdbId}`,
    tmdbId: Number(entry.tmdbId),
    type,
    mediaType: type === 'series' ? 'tv' : 'movie',
  }
}

export function selectReusableCanonical(values, {
  now = Date.now(),
  maxAgeDays = 30,
} = {}) {
  return (Array.isArray(values) ? values : [])
    .filter((value) => !titleNeedsMetadataEnrichment(value, {
      now: now instanceof Date ? now.getTime() : Number(now),
      maxAgeDays,
      requireContract: true,
    }))
    .sort((left, right) => (
      timestampMilliseconds(right?.metadataUpdatedAt) - timestampMilliseconds(left?.metadataUpdatedAt)
      || Number(right?.metadataVersion || 0) - Number(left?.metadataVersion || 0)
    ))[0] || null
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
  await Promise.all(Array.from({ length: Math.min(values.length, Math.max(1, Number(limit) || 1)) }, worker))
  return results
}

function selectedQueueEntries(preview) {
  if (preview?.kind !== 'title-priority-preview') throw new Error('A valid title priority preview is required.')
  const queue = Array.isArray(preview.queue) ? preview.queue : []
  const byKey = new Map(queue.map((entry) => [entry?.key, entry]))
  const selectedKeys = Array.isArray(preview.selectedKeys) ? preview.selectedKeys : []
  if (byKey.size !== queue.length) throw new Error('The title priority queue contains duplicate identities.')
  if (new Set(selectedKeys).size !== selectedKeys.length) throw new Error('The selected title priority queue contains duplicate identities.')
  return selectedKeys.map((key) => {
    const entry = byKey.get(key)
    if (!entry) throw new Error(`Selected title ${key} is missing from the priority queue.`)
    return entry
  })
}

export async function executeTitlePriorityQueue({
  preview,
  candidateValues = new Map(),
  loadTitle,
  now = new Date(),
  maxAgeDays = 30,
  concurrency = 3,
} = {}) {
  const selected = selectedQueueEntries(preview)
  const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString()
  let fetched = 0
  let reused = 0

  // Resolve and validate the complete selected generation before any caller is
  // allowed to fan it out to files or Firestore.
  const resolved = await mapWithConcurrency(selected, concurrency, async (entry) => {
    let canonical = null
    if (entry.action === 'reuse-canonical') {
      canonical = selectReusableCanonical(candidateValues.get(entry.key), { now, maxAgeDays })
      if (!canonical) throw new Error(`Reusable canonical metadata is unavailable for ${entry.key}.`)
      reused += 1
    } else if (entry.action === 'fetch-tmdb') {
      if (typeof loadTitle !== 'function') throw new Error(`TMDB loader is unavailable for ${entry.key}.`)
      canonical = await loadTitle(entry, generatedAt)
      fetched += 1
    } else {
      throw new Error(`Unsupported title priority action for ${entry.key}: ${entry.action}`)
    }
    const normalized = canonicalForIdentity(canonical, entry)
    if (titleNeedsMetadataEnrichment(normalized, { requireContract: true })) {
      throw new Error(`Canonical metadata is incomplete for ${entry.key}.`)
    }
    return [entry.key, normalized]
  })

  const updates = new Map(resolved)
  return {
    updates,
    summary: {
      schemaVersion: TITLE_CANONICAL_EXECUTOR_VERSION,
      kind: 'title-canonical-executor-summary',
      generatedAt,
      mode: 'write',
      counts: {
        queued: Array.isArray(preview?.queue) ? preview.queue.length : 0,
        selected: selected.length,
        fetched,
        reused,
        canonicalReady: updates.size,
      },
    },
  }
}

function documentValue(document) {
  return typeof document?.data === 'function' ? document.data() : document?.data
}

function validUserDocumentPath(document, collection) {
  const path = String(document?.ref?.path ?? document?.path ?? '')
  const segments = path.split('/')
  return segments.length === 4 && segments[0] === 'users' && segments[2] === collection
}

function validProfileTitleDocumentPath(document) {
  const path = String(document?.ref?.path ?? document?.path ?? '')
  const segments = path.split('/')
  return segments.length === 6
    && segments[0] === 'users'
    && segments[2] === 'profiles'
    && segments[4] === 'titles'
}

function hasCatalogRelevantProfileState(value) {
  if (value?.catalogRelevant === true) return true
  return value?.favorite === true
    || value?.watchlist === true
    || value?.watched === true
    || (Number.isInteger(value?.rating) && value.rating >= 1 && value.rating <= 10)
}

export function collectCanonicalCandidateValues({
  catalog = {},
  waipuTitles = {},
  searchShards = new Map(),
  personalDocuments = [],
  profileDocuments = [],
  movieHubDocuments = [],
} = {}) {
  const values = new Map()
  const add = (value) => {
    const key = canonicalKey(value)
    if (!key) return
    if (!values.has(key)) values.set(key, [])
    values.get(key).push(value)
  }
  for (const value of Array.isArray(catalog?.titles) ? catalog.titles : []) add(value)
  for (const value of Array.isArray(waipuTitles?.entries) ? waipuTitles.entries : []) add(value)
  for (const shard of searchShards instanceof Map ? searchShards.values() : []) {
    for (const value of Array.isArray(shard?.entries) ? shard.entries : []) add(value)
  }
  for (const document of Array.isArray(personalDocuments) ? personalDocuments : []) {
    if (validUserDocumentPath(document, 'tmdbCatalog')) add(documentValue(document))
  }
  for (const document of Array.isArray(profileDocuments) ? profileDocuments : []) {
    if (!validProfileTitleDocumentPath(document)) continue
    const data = documentValue(document)
    if (!hasCatalogRelevantProfileState(data)) continue
    add(data?.bootstrapSnapshot ?? data?.titleSnapshot ?? data?.titleRef)
  }
  for (const document of Array.isArray(movieHubDocuments) ? movieHubDocuments : []) {
    const data = documentValue(document)
    if (validUserDocumentPath(document, 'sharedMedia') && data?.hasMedia === true) add(data.titleRef)
  }
  return values
}

function mergeCanonical(base, canonical) {
  return mergeEnrichedTitle(base, canonicalForIdentity(canonical, canonicalTitleIdentity(canonical)))
}

function updateMatchingEntries(entries, updates) {
  let updated = 0
  const values = (Array.isArray(entries) ? entries : []).map((entry) => {
    const canonical = updates.get(canonicalKey(entry))
    if (!canonical) return entry
    updated += 1
    return mergeCanonical(entry, canonical)
  })
  return { entries: values, updated }
}

export function buildCanonicalFanoutPlan({
  updates = new Map(),
  catalog = {},
  searchIndex = {},
  searchShards = new Map(),
  waipuTitles = {},
  personalDocuments = [],
  profileDocuments = [],
  movieHubDocuments = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const catalogResult = updateMatchingEntries(catalog.titles, updates)
  const waipuResult = updateMatchingEntries(waipuTitles.entries, updates)
  const nextSearchShards = new Map([...searchShards].map(([bucket, shard]) => [bucket, {
    ...shard,
    entries: Array.isArray(shard?.entries) ? [...shard.entries] : [],
  }]))
  let searchDetailsUpdated = 0
  let searchIndexAdded = 0
  const nextSearchEntries = Array.isArray(searchIndex?.entries) ? [...searchIndex.entries] : []
  const searchEntries = new Map(nextSearchEntries
    .map((entry) => [canonicalKey(entry), entry]).filter(([key]) => key))

  for (const [key, canonical] of updates) {
    let searchEntry = searchEntries.get(key)
    if (!searchEntry) {
      searchEntry = toSearchIndexEntry(canonical, { scope: 'public' })
      if (!searchEntry) continue
      nextSearchEntries.push(searchEntry)
      searchEntries.set(key, searchEntry)
      searchIndexAdded += 1
    }
    const bucket = searchDetailBucket(searchEntry)
    if (!bucket) continue
    const shard = nextSearchShards.get(bucket) || {
      kind: 'search-detail-shard',
      version: 1,
      bucket,
      generatedAt,
      count: 0,
      entries: [],
    }
    const index = shard.entries.findIndex((entry) => canonicalKey(entry) === key)
    const detail = mergeSearchDetail(searchEntry, canonical)
    if (index >= 0) shard.entries[index] = detail
    else shard.entries.push(detail)
    shard.entries.sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')))
    shard.generatedAt = generatedAt
    shard.count = shard.entries.length
    nextSearchShards.set(bucket, shard)
    searchDetailsUpdated += 1
  }

  const firestoreWrites = []
  let personalUpdated = 0
  let profileUpdated = 0
  let movieHubUpdated = 0
  for (const document of Array.isArray(personalDocuments) ? personalDocuments : []) {
    if (!validUserDocumentPath(document, 'tmdbCatalog')) continue
    const data = documentValue(document)
    const canonical = updates.get(canonicalKey(data))
    if (!canonical) continue
    const personalTitle = nativeTitleToFirestore({
      ...canonical,
      favorite: data?.favorite,
      watchlist: data?.watchlist,
      rated: data?.rated,
      ratingValue: data?.ratingValue,
      favoriteOrder: data?.favoriteOrder,
      watchlistOrder: data?.watchlistOrder,
      ratingOrder: data?.ratingOrder,
      syncedAt: data?.syncedAt,
    }, null)
    personalTitle.syncedAt = data?.syncedAt || null
    firestoreWrites.push({
      ref: document.ref,
      data: personalTitle,
    })
    personalUpdated += 1
  }
  for (const document of Array.isArray(profileDocuments) ? profileDocuments : []) {
    if (!validProfileTitleDocumentPath(document)) continue
    const data = documentValue(document)
    if (!hasCatalogRelevantProfileState(data)) continue
    const canonical = updates.get(canonicalKey(data?.bootstrapSnapshot ?? data?.titleSnapshot ?? data?.titleRef))
    if (!canonical) continue
    firestoreWrites.push({
      ref: document.ref,
      data: {
        titleRef: {
          catalogId: canonical.id,
          tmdbId: canonical.tmdbId,
          type: canonical.type,
        },
        canonicalReady: true,
        canonicalMetadataVersion: canonical.metadataVersion,
        canonicalMetadataUpdatedAt: canonical.metadataUpdatedAt || generatedAt,
      },
      deleteFields: ['bootstrapSnapshot', 'titleSnapshot'],
    })
    profileUpdated += 1
  }
  for (const document of Array.isArray(movieHubDocuments) ? movieHubDocuments : []) {
    if (!validUserDocumentPath(document, 'sharedMedia')) continue
    const data = documentValue(document)
    if (data?.hasMedia !== true) continue
    const canonical = updates.get(canonicalKey(data?.titleRef))
    if (!canonical) continue
    firestoreWrites.push({
      ref: document.ref,
      data: { hasMedia: true, titleRef: buildSharedMediaTitleRef(canonical), updatedAt: new Date(generatedAt) },
    })
    movieHubUpdated += 1
  }

  return {
    catalog: { ...catalog, titles: catalogResult.entries },
    searchIndex: {
      ...searchIndex,
      generatedAt,
      count: nextSearchEntries.length,
      entries: nextSearchEntries,
    },
    waipuTitles: { ...waipuTitles, entries: waipuResult.entries, count: waipuResult.entries.length },
    searchShards: nextSearchShards,
    firestoreWrites,
    counts: {
      catalogUpdated: catalogResult.updated,
      waipuUpdated: waipuResult.updated,
      searchDetailsUpdated,
      searchIndexAdded,
      personalUpdated,
      profileUpdated,
      movieHubUpdated,
      firestoreWrites: firestoreWrites.length,
    },
  }
}

async function readJson(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJsonAtomic(path, value) {
  const target = resolve(path)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, target)
}

async function readSearchShards() {
  const manifest = await readJson(resolve(searchDetailsDirectory, 'manifest.json'), { shards: [] })
  const shards = new Map()
  for (const reference of Array.isArray(manifest?.shards) ? manifest.shards : []) {
    const bucket = String(reference?.bucket || '')
    if (!/^[0-9a-f]{2}$/.test(bucket)) continue
    const shard = await readJson(resolve(searchDetailsDirectory, `${bucket}.json`), null)
    if (shard?.kind === 'search-detail-shard' && Array.isArray(shard.entries)) shards.set(bucket, shard)
  }
  return { manifest, shards }
}

async function commitFirestoreWrites(db, writes, deleteFieldValue) {
  const values = Array.isArray(writes) ? writes : []
  if (values.length > 450) {
    throw new Error(`Canonical Firestore fan-out exceeds the atomic batch limit: ${values.length}/450.`)
  }
  if (!values.length) return
  const batch = db.batch()
  for (const write of values) {
    const data = { ...write.data }
    for (const field of Array.isArray(write.deleteFields) ? write.deleteFields : []) {
      data[field] = deleteFieldValue()
    }
    batch.set(write.ref, data, { merge: true })
  }
  await batch.commit()
}

async function main() {
  const [{ applicationDefault, initializeApp }, { FieldValue, getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ])
  const app = initializeApp({ credential: applicationDefault(), projectId }, 'title-canonical-executor')
  const db = getFirestore(app)
  const [preview, inventory, catalog, searchIndex, waipuTitles, searchData, personalSnapshot, profileSnapshot, movieHubSnapshot] = await Promise.all([
    readJson(previewPath),
    readJson(inventoryPath),
    readJson(catalogPath, { titles: [] }),
    readJson(searchIndexPath, { entries: [] }),
    readJson(waipuTitlesPath, { entries: [] }),
    readSearchShards(),
    db.collectionGroup('tmdbCatalog').get(),
    db.collectionGroup('titles').get(),
    db.collectionGroup('sharedMedia').get(),
  ])
  if (inventory?.kind !== 'title-candidate-inventory') throw new Error('A valid title candidate inventory is required.')

  const candidateValues = collectCanonicalCandidateValues({
    catalog,
    waipuTitles,
    searchShards: searchData.shards,
    personalDocuments: personalSnapshot.docs,
    profileDocuments: profileSnapshot.docs,
    movieHubDocuments: movieHubSnapshot.docs,
  })
  const selectedEntries = selectedQueueEntries(preview)
  const needsTmdb = selectedEntries.some(({ action }) => action === 'fetch-tmdb')
  if (needsTmdb && !process.env.TMDB_API_READ_TOKEN) throw new Error('TMDB_API_READ_TOKEN is missing for the canonical title executor.')
  const client = needsTmdb ? new WaipuTmdbMetadataClient({
    token: process.env.TMDB_API_READ_TOKEN,
    language: process.env.TMDB_LANGUAGE || 'de-DE',
    country: process.env.TMDB_COUNTRY || 'DE',
    maxRequests: Number(process.env.TITLE_CANONICAL_TMDB_REQUEST_BUDGET || 5000),
  }) : null
  const execution = await executeTitlePriorityQueue({
    preview,
    candidateValues,
    loadTitle: client ? (entry, updatedAt) => client.loadTitle(entry, updatedAt) : null,
    maxAgeDays: Number(process.env.TITLE_CANONICAL_MAX_AGE_DAYS || 30),
    concurrency: Number(process.env.TITLE_CANONICAL_CONCURRENCY || 3),
  })
  const plan = buildCanonicalFanoutPlan({
    updates: execution.updates,
    catalog,
    searchIndex,
    searchShards: searchData.shards,
    waipuTitles,
    personalDocuments: personalSnapshot.docs,
    profileDocuments: profileSnapshot.docs,
    movieHubDocuments: movieHubSnapshot.docs,
    generatedAt: execution.summary.generatedAt,
  })

  if (execution.updates.size) {
    if (plan.firestoreWrites.length > 450) {
      throw new Error(`Canonical Firestore fan-out exceeds the atomic batch limit: ${plan.firestoreWrites.length}/450.`)
    }
    const manifest = {
      ...searchData.manifest,
      generatedAt: execution.summary.generatedAt,
      count: [...plan.searchShards.values()].reduce((sum, shard) => sum + shard.entries.length, 0),
      shards: [...plan.searchShards.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([bucket, shard]) => ({ bucket, count: shard.entries.length, path: `/search-details/${bucket}.json` })),
    }
    await Promise.all([
      writeJsonAtomic(catalogPath, plan.catalog),
      writeJsonAtomic(searchIndexPath, plan.searchIndex),
      writeJsonAtomic(waipuTitlesPath, plan.waipuTitles),
      writeJsonAtomic(resolve(searchDetailsDirectory, 'manifest.json'), manifest),
      ...[...plan.searchShards].map(([bucket, shard]) => writeJsonAtomic(
        resolve(searchDetailsDirectory, `${bucket}.json`),
        shard,
      )),
    ])
    await commitFirestoreWrites(db, plan.firestoreWrites, () => FieldValue.delete())
  }

  const summary = {
    ...execution.summary,
    counts: {
      ...execution.summary.counts,
      ...plan.counts,
      tmdbRequests: client?.requestsStarted || 0,
    },
  }
  await writeJsonAtomic(statusPath, summary)
  console.log(
    `Kanonischer Executor: ${summary.counts.canonicalReady}/${summary.counts.selected} verarbeitet`
    + ` · ${summary.counts.fetched} TMDB geladen · ${summary.counts.reused} wiederverwendet`
    + ` · ${summary.counts.firestoreWrites} Firestore-Ziele.`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
