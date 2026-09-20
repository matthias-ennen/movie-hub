import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { titleNeedsMetadataEnrichment } from '../src/catalog/titleMetadata.js'
import { nativeTitleToFirestore } from '../src/tmdb/tmdbCatalogModel.js'
import { enrichSharedMediaTitleRef, tmdbFetch } from './enrich-shared-media-metadata.mjs'
import { readTmdbChangeSet, tmdbChangedTitleKeys } from './tmdb-change-queue.mjs'

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'movie-hub-62459'
const updateLimit = Math.max(1, Math.min(2000, Number(process.env.PERSONAL_TMDB_METADATA_BACKFILL_LIMIT) || 250))
const maxAgeDays = Math.max(1, Math.min(365, Number(process.env.PERSONAL_TMDB_METADATA_MAX_AGE_DAYS) || 30))
const concurrency = 3
const statusPath = resolve(process.env.PERSONAL_TMDB_METADATA_STATUS || 'artifacts/personal-tmdb-metadata-status.json')

function personalTitleKey(value) {
  const type = value?.mediaType === 'tv' || value?.type === 'series' ? 'series' : 'movie'
  const tmdbId = Number(value?.tmdbId)
  return Number.isInteger(tmdbId) && tmdbId > 0 ? `${type}:${tmdbId}` : null
}

async function mapWithConcurrency(values, limit, callback) {
  let nextIndex = 0
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++
      await callback(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
}

export async function enrichPersonalTmdbTitle(value, {
  fetchTmdb = tmdbFetch,
  collectionCache = new Map(),
  updatedAt = new Date().toISOString(),
} = {}) {
  const type = value?.mediaType === 'tv' || value?.type === 'series' ? 'series' : 'movie'
  const enriched = await enrichSharedMediaTitleRef({ ...value, type }, {
    fetchTmdb,
    collectionCache,
    updatedAt,
  })
  return {
    ...nativeTitleToFirestore({
      ...enriched,
      mediaType: type === 'series' ? 'tv' : 'movie',
      favorite: value?.favorite,
      watchlist: value?.watchlist,
      rated: value?.rated,
      ratingValue: value?.ratingValue,
      favoriteOrder: value?.favoriteOrder,
      watchlistOrder: value?.watchlistOrder,
      ratingOrder: value?.ratingOrder,
      syncedAt: value?.syncedAt,
    }, null),
    metadataUpdatedAt: updatedAt,
    syncedAt: value?.syncedAt || null,
  }
}

export async function runPersonalTmdbMetadataBackfill({
  db,
  fetchTmdb = tmdbFetch,
  now = new Date(),
  limit = updateLimit,
  ageDays = maxAgeDays,
  changedTitleKeys = null,
} = {}) {
  if (!db) throw new Error('Firestore Admin client is missing.')
  const source = await db.collectionGroup('tmdbCatalog').get()
  const queuedChanges = changedTitleKeys || tmdbChangedTitleKeys(await readTmdbChangeSet())
  const candidates = source.docs.map((snapshot, index) => {
    const segments = String(snapshot.ref.path || '').split('/')
    const data = snapshot.data()
    const validDocument = segments.length === 4
      && segments[0] === 'users'
      && segments[2] === 'tmdbCatalog'
      && Boolean(personalTitleKey(data))
    return {
      snapshot,
      index,
      validDocument,
      incomplete: titleNeedsMetadataEnrichment(data, { requireContract: true }),
      changed: queuedChanges.has(personalTitleKey(data)),
      due: validDocument && titleNeedsMetadataEnrichment(data, {
        now: now.getTime(),
        maxAgeDays: ageDays,
        requireContract: true,
      }),
    }
  }).filter((candidate) => candidate.validDocument && (candidate.due || candidate.changed))
    .sort((left, right) => {
      if (left.incomplete !== right.incomplete) return left.incomplete ? -1 : 1
      if (left.changed !== right.changed) return left.changed ? -1 : 1
      return left.index - right.index
    })
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((candidate) => candidate.snapshot)

  const collectionCache = new Map()
  let updated = 0
  let failed = 0
  await mapWithConcurrency(candidates, concurrency, async (snapshot) => {
    try {
      const value = await enrichPersonalTmdbTitle(snapshot.data(), {
        fetchTmdb,
        collectionCache,
        updatedAt: now.toISOString(),
      })
      await snapshot.ref.set(value, { merge: true })
      updated += 1
    } catch (error) {
      failed += 1
      console.warn(`Personal TMDB metadata backfill failed for ${snapshot.ref.path}:`, error instanceof Error ? error.message : String(error))
    }
  })
  return { scanned: source.size, candidates: candidates.length, updated, failed }
}

async function main() {
  if (!process.env.TMDB_API_READ_TOKEN) throw new Error('TMDB_API_READ_TOKEN is missing.')
  const [{ applicationDefault, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ])
  const app = initializeApp({ credential: applicationDefault(), projectId }, 'personal-tmdb-metadata-backfill')
  const result = await runPersonalTmdbMetadataBackfill({ db: getFirestore(app) })
  await mkdir(dirname(statusPath), { recursive: true })
  await writeFile(statusPath, `${JSON.stringify({ ...result, generatedAt: new Date().toISOString() })}\n`, 'utf8')
  console.log(`Personal TMDB metadata: scanned ${result.scanned}, selected ${result.candidates}, updated ${result.updated}, failed ${result.failed}.`)
  if (result.failed) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
