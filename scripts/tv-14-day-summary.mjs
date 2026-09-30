import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TV_14_DAY_SUMMARY_VERSION = 1
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TV_TIME_ZONE = 'Europe/Berlin'

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function canonicalType(value) {
  return value === 'series' || value === 'tv' ? 'series' : value === 'movie' ? 'movie' : null
}

function canonicalKey(value) {
  const type = canonicalType(value?.type ?? value?.mediaType)
  const tmdbId = Number(value?.tmdbId)
  return type && Number.isInteger(tmdbId) && tmdbId > 0 ? `${type}:${tmdbId}` : null
}

function usefulText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function localHour(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: TV_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return Number(hour)
}

function isPrimeTimeAiring(airing) {
  const hour = localHour(airing?.startTime)
  return Number.isInteger(hour) && hour >= 20 && hour < 23
}

function rankingMetadata(value = {}) {
  const genreIds = (Array.isArray(value.genres) ? value.genres : [])
    .map((genre) => Number(genre?.id ?? genre))
    .filter(Number.isFinite)
  const genreNames = (Array.isArray(value.genreNames) ? value.genreNames : [])
    .map(usefulText)
    .filter(Boolean)
  return {
    title: usefulText(value.title),
    originalTitle: usefulText(value.originalTitle),
    year: finite(value.year),
    posterUrl: usefulText(value.posterUrl || value.neutralPosterUrl),
    posterPath: usefulText(value.posterPath || value.neutralPosterPath),
    voteAverage: finite(value.voteAverage),
    voteCount: finite(value.voteCount),
    popularity: finite(value.popularity),
    genreIds: [...new Set(genreIds)],
    genreNames: [...new Set(genreNames)],
  }
}

function metadataScore(value) {
  const meta = rankingMetadata(value)
  return [
    meta.title,
    meta.posterUrl || meta.posterPath,
    meta.voteAverage,
    meta.voteCount,
    meta.popularity,
    meta.genreIds.length || meta.genreNames.length,
  ].filter((item) => item !== null && item !== false && item !== 0 && item !== '').length
}

function bestMetadata(...values) {
  return values.filter(Boolean).sort((left, right) => metadataScore(right) - metadataScore(left))[0] || {}
}

function normalizeAiring(airing, providerId) {
  const startTime = usefulText(airing?.startTime)
  const stopTime = usefulText(airing?.stopTime)
  if (!startTime || !stopTime) return null
  return {
    providerId,
    stationId: usefulText(airing?.stationId),
    sourceStationId: usefulText(airing?.sourceStationId),
    stationName: usefulText(airing?.stationName),
    programId: usefulText(airing?.programId),
    startTime,
    stopTime,
    playbackRoutes: Array.isArray(airing?.playbackRoutes) ? airing.playbackRoutes : [],
    episode: airing?.episode || null,
  }
}

function providerEntries(payload, providerId) {
  return (Array.isArray(payload?.entries) ? payload.entries : [])
    .map((entry) => {
      const key = canonicalKey(entry)
      if (!key) return null
      const airings = (Array.isArray(entry.airings) ? entry.airings : [entry.nextAiring].filter(Boolean))
        .map((airing) => normalizeAiring(airing, providerId))
        .filter(Boolean)
        .sort((left, right) => left.startTime.localeCompare(right.startTime))
      if (!airings.length) return null
      return { key, entry, airings, providerId }
    })
    .filter(Boolean)
}

function buildMetadataLookup(catalog, searchIndex) {
  const lookup = new Map()
  for (const value of [
    ...(Array.isArray(catalog?.titles) ? catalog.titles : []),
    ...(Array.isArray(searchIndex?.entries) ? searchIndex.entries : []),
  ]) {
    const key = canonicalKey(value)
    if (!key) continue
    const current = lookup.get(key)
    lookup.set(key, bestMetadata(current, value))
  }
  return lookup
}

export function buildTv14DaySummary({
  waipuTitles = null,
  joynTitles = null,
  catalog = null,
  searchIndex = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const metadataByKey = buildMetadataLookup(catalog, searchIndex)
  const grouped = new Map()

  for (const source of [
    ...providerEntries(waipuTitles, 'waipu'),
    ...providerEntries(joynTitles, 'joyn'),
  ]) {
    if (!grouped.has(source.key)) grouped.set(source.key, { sources: [], airings: [] })
    grouped.get(source.key).sources.push(source)
    grouped.get(source.key).airings.push(...source.airings)
  }

  const entries = [...grouped.entries()].map(([key, group]) => {
    const sourceEntryMetadata = group.sources.map(({ entry }) => entry)
    const metadata = rankingMetadata(bestMetadata(metadataByKey.get(key), ...sourceEntryMetadata))
    const airings = group.airings.sort((left, right) => left.startTime.localeCompare(right.startTime))
    const nextAiring = airings[0] || null
    const nextPrimeTimeAiring = airings.find(isPrimeTimeAiring) || null
    const [type, tmdbIdText] = key.split(':')
    return {
      key,
      tmdbId: Number(tmdbIdText),
      type,
      ...metadata,
      providerIds: [...new Set(group.sources.map(({ providerId }) => providerId))].sort(),
      airingCount: airings.length,
      nextAiring,
      nextPrimeTimeAiring,
      hasPrimeTime: Boolean(nextPrimeTimeAiring),
    }
  }).sort((left, right) => (
    String(left.nextAiring?.startTime || '').localeCompare(String(right.nextAiring?.startTime || ''))
    || left.key.localeCompare(right.key)
  ))

  return {
    schemaVersion: TV_14_DAY_SUMMARY_VERSION,
    kind: 'moviehub-tv-14-day-summary',
    generatedAt,
    count: entries.length,
    entries,
  }
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

export async function writeTv14DaySummary({
  waipuPath = resolve(root, 'public/waipu-live/titles.json'),
  joynPath = resolve(root, 'public/joyn-live/titles.json'),
  catalogPath = resolve(root, 'public/catalog.json'),
  searchIndexPath = resolve(root, 'public/search-index.json'),
  outputPath = resolve(root, 'public/tv-14-days-summary.json'),
  now = Date.now(),
} = {}) {
  const [waipuTitles, joynTitles, catalog, searchIndex] = await Promise.all([
    readJson(waipuPath),
    readJson(joynPath),
    readJson(catalogPath),
    readJson(searchIndexPath),
  ])
  const summary = buildTv14DaySummary({
    waipuTitles,
    joynTitles,
    catalog,
    searchIndex,
    generatedAt: new Date(now).toISOString(),
  })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(summary) + '\n', 'utf8')
  return summary
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeTv14DaySummary()
    .then((summary) => {
      process.stdout.write(JSON.stringify({
        kind: summary.kind,
        generatedAt: summary.generatedAt,
        count: summary.count,
        withPrimeTime: summary.entries.filter((entry) => entry.hasPrimeTime).length,
        withRankingMetadata: summary.entries.filter((entry) => (
          Number.isFinite(entry.voteAverage)
          || Number.isFinite(entry.popularity)
          || Number.isFinite(entry.voteCount)
        )).length,
      }, null, 2) + '\n')
    })
    .catch((error) => {
      process.stderr.write((error?.stack || String(error)) + '\n')
      process.exitCode = 1
    })
}
