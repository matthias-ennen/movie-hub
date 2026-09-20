import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SERIES_SEASON_BUCKET_COUNT,
  SERIES_SEASON_DATA_VERSION,
  normalizeSeriesSeasonDetail,
  normalizeSeriesSeasons,
  seriesSeasonBucket,
} from '../src/catalog/seriesNavigation.js'
import { isTmdbTitleChangePending, readTmdbChangeSet, tmdbChangedTitleTimes } from './tmdb-change-queue.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = resolve(root, 'public/catalog.json')
const searchDetailsDirectory = resolve(root, 'public/search-details')
const outputDirectory = resolve(root, 'public/series-details')
const token = process.env.TMDB_API_READ_TOKEN
const language = process.env.TMDB_LANGUAGE || 'de-DE'
const requestLimit = Math.max(0, Number(process.env.TMDB_SERIES_SEASON_ENRICH_LIMIT) || 600)
const maxAgeDays = Math.max(1, Number(process.env.TMDB_SERIES_SEASON_MAX_AGE_DAYS) || 30)
const requestConcurrency = Math.max(1, Math.min(10, Number(process.env.TMDB_SERIES_SEASON_CONCURRENCY) || 6))
const maxRetries = 4

function entryKey(seriesTmdbId, seasonNumber) {
  return `${Number(seriesTmdbId)}:${Number(seasonNumber)}`
}

function isFresh(entry, now = Date.now()) {
  if (Number(entry?.version) !== SERIES_SEASON_DATA_VERSION) return false
  const generatedAt = Date.parse(entry?.generatedAt || '')
  return Number.isFinite(generatedAt) && now - generatedAt < maxAgeDays * 86_400_000
}

export function selectSeriesSeasonRefreshCandidates(references, existingEntries, {
  now = Date.now(),
  limit = requestLimit,
  changedTitleKeys = new Set(),
} = {}) {
  const timestamp = now instanceof Date ? now.getTime() : Number(now)
  return (Array.isArray(references) ? references : [])
    .map((reference, index) => ({
      reference,
      index,
      changed: isTmdbTitleChangePending(
        changedTitleKeys,
        `series:${Number(reference?.seriesTmdbId)}`,
        existingEntries.get(entryKey(reference?.seriesTmdbId, reference?.seasonNumber))?.generatedAt,
      ),
      fresh: isFresh(existingEntries.get(entryKey(reference?.seriesTmdbId, reference?.seasonNumber)), timestamp),
    }))
    .filter((candidate) => candidate.changed || !candidate.fresh)
    .sort((left, right) => {
      if (left.changed !== right.changed) return left.changed ? -1 : 1
      return left.index - right.index
    })
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((candidate) => candidate.reference)
}

async function sleep(milliseconds) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

export async function tmdbSeasonFetch(seriesTmdbId, seasonNumber, attempt = 0) {
  if (!token) throw new Error('TMDB_API_READ_TOKEN is missing. Series detail generation must run only in trusted CI.')
  const endpoint = new URL(`https://api.themoviedb.org/3/tv/${seriesTmdbId}/season/${seasonNumber}`)
  endpoint.searchParams.set('language', language)
  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })

  if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
    const retryAfter = Number(response.headers.get('retry-after'))
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 750 * (2 ** attempt))
    return tmdbSeasonFetch(seriesTmdbId, seasonNumber, attempt + 1)
  }
  if (!response.ok) throw new Error(`TMDB staffel request failed with HTTP ${response.status}`)
  return response.json()
}

export function collectSeriesSeasonReferences(titles) {
  const references = []
  for (const title of Array.isArray(titles) ? titles : []) {
    if (title?.type !== 'series' || !Number.isInteger(Number(title?.tmdbId))) continue
    const seasons = normalizeSeriesSeasons(title.seasons, {
      seriesTmdbId: title.tmdbId,
      numberOfSeasons: title.numberOfSeasons,
    })
    for (const season of seasons) {
      references.push({
        seriesTmdbId: Number(title.tmdbId),
        seriesTitle: title.title,
        seasonNumber: season.seasonNumber,
      })
    }
  }

  return [...new Map(references.map((reference) => [
    entryKey(reference.seriesTmdbId, reference.seasonNumber),
    reference,
  ])).values()].sort((left, right) => (
    left.seriesTmdbId - right.seriesTmdbId
    || left.seasonNumber - right.seasonNumber
  ))
}

async function readExistingEntries() {
  const entries = new Map()
  for (let index = 0; index < SERIES_SEASON_BUCKET_COUNT; index += 1) {
    const bucket = index.toString(16).padStart(2, '0')
    try {
      const payload = JSON.parse(await readFile(resolve(outputDirectory, `${bucket}.json`), 'utf8'))
      if (
        payload?.kind !== 'series-season-shard'
        || Number(payload?.version) !== SERIES_SEASON_DATA_VERSION
        || payload?.bucket !== bucket
        || !Array.isArray(payload?.entries)
      ) continue
      for (const entry of payload.entries) {
        if (Number.isInteger(Number(entry?.seriesTmdbId)) && Number.isInteger(Number(entry?.seasonNumber))) {
          entries.set(entryKey(entry.seriesTmdbId, entry.seasonNumber), entry)
        }
      }
    } catch {
      // A missing or invalid old shard is simply rebuilt from the current run.
    }
  }
  return entries
}

async function readSearchDetailTitles() {
  try {
    const manifest = JSON.parse(await readFile(resolve(searchDetailsDirectory, 'manifest.json'), 'utf8'))
    if (!Array.isArray(manifest?.shards)) return []
    const shards = await Promise.all(manifest.shards.map(async (shard) => {
      if (!/^[0-9a-f]{2}$/.test(String(shard?.bucket || ''))) return []
      try {
        const payload = JSON.parse(await readFile(resolve(searchDetailsDirectory, `${shard.bucket}.json`), 'utf8'))
        return Array.isArray(payload?.entries) ? payload.entries : []
      } catch {
        return []
      }
    }))
    return shards.flat()
  } catch {
    return []
  }
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

export async function generateSeriesDetails({ fetchSeason = tmdbSeasonFetch, now = new Date(), changedTitleKeys = null } = {}) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  if (!Array.isArray(catalog?.titles)) throw new Error('The current catalog contains no title list.')

  const searchDetailTitles = await readSearchDetailTitles()
  const references = collectSeriesSeasonReferences([...catalog.titles, ...searchDetailTitles])
  const existingEntries = await readExistingEntries()
  const activeKeys = new Set(references.map((reference) => entryKey(reference.seriesTmdbId, reference.seasonNumber)))
  const entries = new Map([...existingEntries].filter(([key]) => activeKeys.has(key)))
  const queuedChanges = changedTitleKeys || tmdbChangedTitleTimes(await readTmdbChangeSet())
  const pending = selectSeriesSeasonRefreshCandidates(references, entries, {
    now,
    limit: requestLimit,
    changedTitleKeys: queuedChanges,
  })

  let refreshed = 0
  let failed = 0
  await mapWithConcurrency(pending, requestConcurrency, async (reference) => {
    try {
      const payload = await fetchSeason(reference.seriesTmdbId, reference.seasonNumber)
      const normalized = normalizeSeriesSeasonDetail({
        ...payload,
        seriesTmdbId: reference.seriesTmdbId,
        seriesTitle: reference.seriesTitle,
        generatedAt: now.toISOString(),
      })
      entries.set(entryKey(reference.seriesTmdbId, reference.seasonNumber), normalized)
      refreshed += 1
    } catch (error) {
      failed += 1
      console.warn(
        `Series ${reference.seriesTmdbId}, season ${reference.seasonNumber} could not be refreshed:`,
        error instanceof Error ? error.message : String(error),
      )
    }
  })

  if (references.length > 0 && entries.size === 0) {
    throw new Error('Series detail quality gate failed: no season could be generated or restored.')
  }

  await mkdir(outputDirectory, { recursive: true })
  const shards = []
  for (let index = 0; index < SERIES_SEASON_BUCKET_COUNT; index += 1) {
    const bucket = index.toString(16).padStart(2, '0')
    const bucketEntries = [...entries.values()]
      .filter((entry) => seriesSeasonBucket(entry.seriesTmdbId) === bucket)
      .sort((left, right) => left.seriesTmdbId - right.seriesTmdbId || left.seasonNumber - right.seasonNumber)
    const payload = {
      kind: 'series-season-shard',
      version: SERIES_SEASON_DATA_VERSION,
      bucket,
      generatedAt: now.toISOString(),
      entries: bucketEntries,
    }
    await writeFile(resolve(outputDirectory, `${bucket}.json`), `${JSON.stringify(payload)}\n`, 'utf8')
    shards.push({ bucket, count: bucketEntries.length })
  }

  const manifest = {
    kind: 'series-season-manifest',
    version: SERIES_SEASON_DATA_VERSION,
    bucketCount: SERIES_SEASON_BUCKET_COUNT,
    generatedAt: now.toISOString(),
    availableSeasonCount: entries.size,
    requestedSeasonCount: references.length,
    pendingSeasonCount: Math.max(0, references.length - entries.size),
    refreshedCount: refreshed,
    failedCount: failed,
    shards,
  }
  await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest)}\n`, 'utf8')
  console.log(`Series details: ${entries.size}/${references.length} seasons available · ${refreshed} refreshed · ${failed} failed.`)
  return manifest
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await generateSeriesDetails()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
