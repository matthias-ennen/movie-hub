import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFilmCollection } from '../src/catalog/filmCollections.js'
import { CURRENT_TITLE_METADATA_VERSION, titleNeedsMetadataEnrichment } from '../src/catalog/titleMetadata.js'
import { buildSharedMediaTitleRef } from '../src/library/sharedMediaCatalogModel.js'
import {
  normalizeTmdbTitle,
  normalizeTmdbVideos,
  normalizeTmdbWatchProviders,
  toMovieHubTitle,
} from '../src/services/tmdb.js'
import { readTmdbChangeSet, tmdbChangedTitleKeys } from './tmdb-change-queue.mjs'

const token = process.env.TMDB_API_READ_TOKEN
const language = process.env.TMDB_LANGUAGE || 'de-DE'
const country = process.env.TMDB_COUNTRY || 'DE'
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'movie-hub-62459'
const updateLimit = Math.max(1, Math.min(2000, Number(process.env.MOVIE_HUB_METADATA_BACKFILL_LIMIT) || 250))
const maxAgeDays = Math.max(1, Math.min(365, Number(process.env.MOVIE_HUB_METADATA_MAX_AGE_DAYS) || 30))
const concurrency = 3
const maxRetries = 4
const statusPath = resolve(process.env.MOVIE_HUB_METADATA_STATUS || 'artifacts/moviehub-metadata-status.json')

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function tmdbFetch(path, searchParams = {}, attempt = 0) {
  if (!token) throw new Error('TMDB_API_READ_TOKEN is missing.')
  const endpoint = new URL(`https://api.themoviedb.org/3${path}`)
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== '') endpoint.searchParams.set(key, String(value))
  }
  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
    const retryAfter = Number(response.headers.get('retry-after'))
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * (2 ** attempt))
    return tmdbFetch(path, searchParams, attempt + 1)
  }
  if (!response.ok) throw new Error(`TMDB request failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return response.json()
}

export async function enrichSharedMediaTitleRef(titleRef, {
  fetchTmdb = tmdbFetch,
  collectionCache = new Map(),
  updatedAt = new Date().toISOString(),
} = {}) {
  const tmdbId = Number(titleRef?.tmdbId)
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) throw new Error('Movie-Hub manifest has no valid TMDB id.')
  const type = titleRef?.type === 'series' ? 'series' : 'movie'
  const tmdbType = type === 'series' ? 'tv' : 'movie'
  const ratingAppend = type === 'series' ? 'content_ratings' : 'release_dates'
  const detail = await fetchTmdb(`/${tmdbType}/${tmdbId}`, {
    language,
    append_to_response: `credits,keywords,images,watch/providers,videos,${ratingAppend}`,
    include_image_language: 'null,de,en',
  })
  const normalized = normalizeTmdbTitle(detail, tmdbType)
  const providerData = normalizeTmdbWatchProviders(detail?.['watch/providers'], country)
  const videos = normalizeTmdbVideos([detail?.videos], normalized.originalLanguage)
  let collectionDetails = null

  if (normalized.type === 'movie' && normalized.collectionId) {
    if (!collectionCache.has(normalized.collectionId)) {
      collectionCache.set(normalized.collectionId, fetchTmdb(`/collection/${normalized.collectionId}`, { language })
        .then((collection) => buildFilmCollection(collection, [normalized]))
        .catch((error) => {
          collectionCache.delete(normalized.collectionId)
          throw error
        }))
    }
    collectionDetails = await collectionCache.get(normalized.collectionId)
  }

  return buildSharedMediaTitleRef({
    ...titleRef,
    ...toMovieHubTitle(normalized, { providerIds: providerData.providerIds }),
    collectionDetails,
    videos,
    metadataVersion: CURRENT_TITLE_METADATA_VERSION,
    metadataComplete: true,
    metadataUpdatedAt: updatedAt,
  })
}

async function mapWithConcurrency(values, limit, callback) {
  let nextIndex = 0
  const results = new Array(values.length)
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++
      results[index] = await callback(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return results
}

export async function runSharedMediaMetadataBackfill({
  db,
  fetchTmdb = tmdbFetch,
  now = new Date(),
  limit = updateLimit,
  ageDays = maxAgeDays,
  changedTitleKeys = null,
} = {}) {
  if (!db) throw new Error('Firestore Admin client is missing.')
  const source = await db.collectionGroup('sharedMedia').get()
  const queuedChanges = changedTitleKeys || tmdbChangedTitleKeys(await readTmdbChangeSet())
  const candidates = source.docs.map((snapshot, index) => {
    const segments = String(snapshot.ref.path || '').split('/')
    const data = snapshot.data()
    const titleRef = data?.titleRef
    const key = `${titleRef?.type === 'series' ? 'series' : 'movie'}:${Number(titleRef?.tmdbId)}`
    const validDocument = segments.length === 4
      && segments[0] === 'users'
      && segments[2] === 'sharedMedia'
      && data?.hasMedia === true
    return {
      snapshot,
      index,
      validDocument,
      incomplete: titleRef?.metadataComplete !== true,
      changed: queuedChanges.has(key),
      due: validDocument && titleNeedsMetadataEnrichment(titleRef, { now: now.getTime(), maxAgeDays: ageDays }),
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
      const titleRef = await enrichSharedMediaTitleRef(snapshot.data().titleRef, {
        fetchTmdb,
        collectionCache,
        updatedAt: now.toISOString(),
      })
      await snapshot.ref.set({ hasMedia: true, titleRef, updatedAt: now }, { merge: true })
      updated++
    } catch (error) {
      failed++
      console.warn(`Movie-Hub metadata backfill failed for ${snapshot.ref.path}:`, error instanceof Error ? error.message : String(error))
    }
  })
  return { scanned: source.size, candidates: candidates.length, updated, failed }
}

async function main() {
  if (!token) throw new Error('TMDB_API_READ_TOKEN is missing.')
  const [{ applicationDefault, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ])
  const app = initializeApp({ credential: applicationDefault(), projectId })
  const result = await runSharedMediaMetadataBackfill({ db: getFirestore(app) })
  await mkdir(dirname(statusPath), { recursive: true })
  await writeFile(statusPath, `${JSON.stringify({ ...result, generatedAt: new Date().toISOString() })}\n`, 'utf8')
  console.log(`Movie-Hub metadata: scanned ${result.scanned}, selected ${result.candidates}, updated ${result.updated}, failed ${result.failed}.`)
  if (result.failed) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
