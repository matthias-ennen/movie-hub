/**
 * Manual compact and targeted-theme catalog projection.
 * Inputs are the already verified public TMDB generation and an optional
 * bounded thematic snapshot. Never scan the entire provider/offer matrix.
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateLiveCatalog, validateLiveSearchIndex } from './restore-live-tmdb-data.mjs'
import { buildRowDefinitions, resolveCandidate, tmdbFetch } from './generate-tmdb-catalog.mjs'
import {
  seasonalDiscoveryRows, readSeasonalDiscovery, refreshSeasonalDiscovery,
  validateSeasonalDiscovery,
} from './tmdb-seasonal-discovery.mjs'
import { finalizePersonalSmartCatalog } from '../src/catalog/personalSmartRows.js'
import { toSearchIndexEntry } from '../src/search/searchIndex.js'
import {
  mergeProviderSearchEntries, searchDetailFromCatalogTitle,
} from './generate-search-index.mjs'
import { SEARCH_DETAIL_BUCKET_COUNT } from '../src/search/lazySearchDetails.js'

export const MANUAL_DATA_MODES = Object.freeze(['compact', 'themes'])
export const MAX_TARGETED_NEW_TITLE_DETAILS = 40
const THEMATIC_ROW_PREFIX = 'themed-'
const hasProvider = item => Array.isArray(item?.providerIds) && item.providerIds.length > 0
const tmdbKey = item => `${item?.type === 'series' || item?.mediaType === 'tv' ? 'tv' : 'movie'}:${Number(item?.tmdbId ?? item?.id)}`
const candidateKey = item => `${item.mediaType}:${item.id}`
const json = async path => JSON.parse(await readFile(path, 'utf8'))

export function selectNewThematicCandidates(snapshot, knownTitles, budget = MAX_TARGETED_NEW_TITLE_DETAILS) {
  if (!validateSeasonalDiscovery(snapshot) || !Number.isInteger(budget)
    || budget < 0 || budget > MAX_TARGETED_NEW_TITLE_DETAILS) {
    throw Error('MANUAL_THEME_CANDIDATE_BUDGET_OR_SNAPSHOT_INVALID')
  }
  const known = new Set(knownTitles.map(tmdbKey))
  const seen = new Set(known)
  const strategies = snapshot.strategies.filter(s => s.status === 'complete')
  const selected = []
  // Round robin across categories so Christmas/quality are not starved by
  // Halloween candidates when the strict detail budget is reached.
  for (let index = 0; index < 20 && selected.length < budget; index++) {
    for (const strategy of strategies) {
      const candidate = strategy.candidates[index]
      if (!candidate) continue
      const key = candidateKey(candidate)
      if (seen.has(key)) continue
      seen.add(key)
      selected.push(candidate)
      if (selected.length === budget) break
    }
  }
  return selected
}

export function projectManualThematicCatalog(catalog, snapshot, extraTitles = [], now = new Date()) {
  validateLiveCatalog(catalog)
  if (snapshot && !validateSeasonalDiscovery(snapshot)) throw Error('MANUAL_THEME_SNAPSHOT_INVALID')
  const oldRows = catalog.rowDefinitions.filter(row =>
    !String(row?.id || '').startsWith(THEMATIC_ROW_PREFIX))
  const hasOldThemes = oldRows.length !== catalog.rowDefinitions.length
  if (hasOldThemes && !snapshot) throw Error('MANUAL_THEME_RESTORE_REQUIRED_FOR_PUBLISHED_ROWS')
  const existingIds = new Set(catalog.titles.map(title => title.id))
  const allowed = new Set((snapshot?.strategies || [])
    .flatMap(strategy => strategy.candidates.map(candidateKey)))
  const additional = extraTitles.filter(title => !existingIds.has(title.id)
    && allowed.has(tmdbKey(title)) && hasProvider(title))
  const combined = [...catalog.titles, ...additional]
  const byKey = new Map(combined.map(title => [tmdbKey(title).replace(':', '-'), title]))
  const themed = snapshot
    ? buildRowDefinitions(seasonalDiscoveryRows(snapshot), byKey)
    : []
  const rowIds = new Set(oldRows.map(row => row.id))
  if (themed.some(row => rowIds.has(row.id))) throw Error('MANUAL_THEME_ROW_ID_COLLISION')
  const date = now instanceof Date ? now.toISOString() : new Date(now).toISOString()
  const curated = additional.length ? finalizePersonalSmartCatalog(combined) : null
  return {
    catalog: {
      ...catalog, generatedAt: date,
      titles: curated?.titles || combined,
      smartFilterOptions: curated?.smartFilterOptions || catalog.smartFilterOptions,
      rowDefinitions: [...oldRows, ...themed],
    },
    newTitles: additional,
    rows: themed,
    alreadyKnown: combined.length - additional.length,
  }
}

export function mergeManualSearchIndex(index, newTitles, now = new Date()) {
  validateLiveSearchIndex(index)
  if (!newTitles.length) return index
  const generatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString()
  const merged = mergeProviderSearchEntries([
    ...index.entries, ...newTitles.map(title => toSearchIndexEntry(title)).filter(Boolean),
  ])
  if (merged.length < index.entries.length) throw Error('MANUAL_SEARCH_INDEX_TITLE_LOSS')
  return { ...index, generatedAt, count: merged.length, entries: merged }
}

export async function appendManualSearchDetails(newTitles, root, generatedAt) {
  if (!newTitles.length) return { added: 0 }
  const directory = resolve(root, 'search-details')
  const manifestPath = resolve(directory, 'manifest.json')
  const manifest = await json(manifestPath)
  if (manifest?.kind !== 'search-detail-manifest'
    || manifest.bucketCount !== SEARCH_DETAIL_BUCKET_COUNT
    || !Array.isArray(manifest.shards) || manifest.shards.length !== SEARCH_DETAIL_BUCKET_COUNT) {
    throw Error('MANUAL_SEARCH_DETAILS_MANIFEST_INVALID')
  }
  const groups = new Map()
  for (const title of newTitles) {
    const bucket = (Number(title.tmdbId) % SEARCH_DETAIL_BUCKET_COUNT).toString(16).padStart(2, '0')
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket).push(searchDetailFromCatalogTitle(title))
  }
  let total = 0
  const shards = []
  for (const entry of manifest.shards) {
    if (!/^[0-9a-f]{2}$/.test(entry.bucket)) throw Error('MANUAL_SEARCH_DETAILS_BUCKET_INVALID')
    if (!groups.has(entry.bucket)) {
      shards.push(entry)
      total += entry.count
      continue
    }
    const path = resolve(directory, entry.bucket + '.json')
    const value = await json(path)
    if (value?.kind !== 'search-detail-shard' || value.bucket !== entry.bucket
      || !Array.isArray(value.entries)) throw Error('MANUAL_SEARCH_DETAILS_SHARD_INVALID')
    const entries = new Map(value.entries.map(item => [item.id, item]))
    for (const candidate of groups.get(entry.bucket)) entries.set(candidate.id, candidate)
    const merged = [...entries.values()]
    await writeFile(path, JSON.stringify({ ...value, generatedAt, count: merged.length, entries: merged }) + '\n')
    shards.push({ ...entry, count: merged.length })
    total += merged.length
  }
  await writeFile(manifestPath, JSON.stringify({ ...manifest, generatedAt, count: total, shards }) + '\n')
  return { added: newTitles.length, total }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temp = path + '.pending'
  await writeFile(temp, JSON.stringify(value) + '\n', 'utf8')
  await rename(temp, path)
}

/**
 * Explicit mode entry point: compact performs zero TMDB/YouTube requests.
 * Targeted mode performs <=4 keyword+30 discovery pages, followed by
 * <=40 canonical title resolutions (four TMDB endpoints each before retries).
 */
export async function runManualDataMode({
  mode, root = resolve('public'), request = tmdbFetch,
  resolveTitle = resolveCandidate, now = new Date(),
} = {}) {
  if (!MANUAL_DATA_MODES.includes(mode)) throw Error('MANUAL_DATA_MODE_INVALID')
  const catalogPath = resolve(root, 'catalog.json')
  const indexPath = resolve(root, 'search-index.json')
  const catalog = validateLiveCatalog(await json(catalogPath))
  const index = validateLiveSearchIndex(await json(indexPath))
  const snapshotPath = resolve(root, 'seasonal-discovery.json')
  const snapshot = mode === 'themes'
    ? await refreshSeasonalDiscovery({ request, now, path: snapshotPath, force: true })
    : await readSeasonalDiscovery(snapshotPath)
  if (mode === 'themes'
    && (!snapshot || Math.abs(now.getTime() - Date.parse(snapshot.generatedAt)) > 60_000
      || snapshot.uniqueCandidates === 0)) {
    throw Error('MANUAL_THEME_REFRESH_NOT_VERIFIED')
  }

  const candidates = mode === 'themes'
    ? selectNewThematicCandidates(snapshot, catalog.titles)
    : []
  const resolved = []
  let failed = 0
  for (const candidate of candidates) {
    try {
      const title = await resolveTitle(candidate)
      if (title && hasProvider(title)) resolved.push(title)
    } catch (error) {
      failed++
      // Do not fabricate provider offers on failed TMDB detail readback.
      console.warn('Manual theme candidate skipped after failed detail validation', candidateKey(candidate),
        error instanceof Error ? error.message : String(error))
    }
  }
  const projected = projectManualThematicCatalog(catalog, snapshot, resolved, now)
  const mergedIndex = mergeManualSearchIndex(index, projected.newTitles, now)
  // Stage all read/validation and complete the search-detail merge before
  // changing the public catalog; a job error prevents Hosting deployment.
  const details = await appendManualSearchDetails(projected.newTitles, root, now.toISOString())
  await atomicJson(indexPath, mergedIndex)
  await atomicJson(catalogPath, projected.catalog)
  const report = {
    kind: 'moviehub-manual-data-mode-report',
    mode, generatedAt: now.toISOString(),
    seasonalGeneration: snapshot?.generatedAt || null,
    discoveryPages: mode === 'themes' ? snapshot.pagesFetched : 0,
    keywordLookups: mode === 'themes' ? snapshot.keywordLookups : 0,
    newCandidateDetailsAttempted: candidates.length,
    detailFailures: failed,
    netNewTitles: projected.newTitles.length,
    existingCatalogTitles: catalog.titles.length,
    finalCatalogTitles: projected.catalog.titles.length,
    searchIndexEntries: mergedIndex.entries.length,
    searchDetailsAdded: details.added,
    themedRows: projected.rows.map(row => ({ id: row.id, titleCount: row.ids.length })),
    noYoutubeOrAdapterDiscovery: true,
  }
  await atomicJson(resolve('artifacts/manual-data-mode-report.json'), report)
  console.log(JSON.stringify(report))
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1]
  runManualDataMode({ mode }).catch(error => {
    console.error('MANUAL_DATA_MODE_FAILED_CLOSED: ' + (error?.message || String(error)))
    process.exitCode = 1
  })
}
