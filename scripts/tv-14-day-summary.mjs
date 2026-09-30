import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeTvAirings } from '../src/sources/mergeTvAirings.js'

export const TV_14_DAY_SUMMARY_VERSION = 1
export const TV_14_DAY_ROW_CANDIDATE_LIMIT = 120
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TV_TIME_ZONE = 'Europe/Berlin'
const TOP_RATED_MINIMUM_VOTES = 50
const TV_GENRE_BUCKETS = Object.freeze([
  { id: 'action-adventure', genreIds: [12, 28, 10759] },
  { id: 'comedy', genreIds: [35] },
  { id: 'crime-thriller', genreIds: [53, 80, 9648] },
  { id: 'science-fiction-fantasy', genreIds: [14, 878, 10765] },
  { id: 'drama-romance', genreIds: [18, 10749] },
  { id: 'family-animation', genreIds: [16, 10751, 10762] },
  { id: 'documentary', genreIds: [99] },
])

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

function normalizeAiring(airing, providerId, type, tmdbId) {
  const startTime = usefulText(airing?.startTime)
  const stopTime = usefulText(airing?.stopTime)
  if (!startTime || !stopTime) return null
  const stationId = usefulText(airing?.stationId)
  const canonicalStationId = usefulText(airing?.canonicalStationId)
  const sourceStationId = usefulText(airing?.sourceStationId)
  const providerStationId = providerId === 'joyn'
    ? sourceStationId || stationId
    : stationId || canonicalStationId
  return {
    providerId,
    providerIds: [providerId],
    type,
    tmdbId,
    stationId,
    canonicalStationId,
    sourceStationId,
    providerStationIds: providerStationId ? { [providerId]: providerStationId } : {},
    stationName: usefulText(airing?.stationName),
    programId: usefulText(airing?.programId),
    startTime,
    stopTime,
    playbackRoutes: Array.isArray(airing?.playbackRoutes) ? airing.playbackRoutes : [],
    episode: airing?.episode || null,
  }
}

function compareSummaryQuality(left, right) {
  const leftVotes = finite(left?.voteCount) || 0
  const rightVotes = finite(right?.voteCount) || 0
  const leftQualified = leftVotes >= TOP_RATED_MINIMUM_VOTES
  const rightQualified = rightVotes >= TOP_RATED_MINIMUM_VOTES
  return Number(rightQualified) - Number(leftQualified)
    || (finite(right?.voteAverage) || 0) - (finite(left?.voteAverage) || 0)
    || rightVotes - leftVotes
    || (finite(right?.popularity) || 0) - (finite(left?.popularity) || 0)
    || String(left?.nextAiring?.startTime || '').localeCompare(String(right?.nextAiring?.startTime || ''))
    || String(left?.key || '').localeCompare(String(right?.key || ''))
}

function hasAnyGenre(entry, genreIds) {
  const ids = new Set(Array.isArray(entry?.genreIds) ? entry.genreIds.map(Number).filter(Number.isFinite) : [])
  return genreIds.some((id) => ids.has(id))
}

function selectCandidatePool(entries, limit = TV_14_DAY_ROW_CANDIDATE_LIMIT) {
  const buckets = [
    entries.filter((entry) => entry.type === 'movie'),
    entries.filter((entry) => entry.type === 'series'),
    entries.filter((entry) => entry.hasPrimeTime),
    ...TV_GENRE_BUCKETS.map((bucket) => entries.filter((entry) => hasAnyGenre(entry, bucket.genreIds))),
  ]
  const selected = new Map()
  for (const bucket of buckets) {
    for (const entry of [...bucket].sort(compareSummaryQuality).slice(0, limit)) {
      selected.set(entry.key, entry)
    }
  }
  return [...selected.values()].sort(compareSummaryQuality)
}

function providerEntries(payload, providerId) {
  return (Array.isArray(payload?.entries) ? payload.entries : [])
    .map((entry) => {
      const key = canonicalKey(entry)
      if (!key) return null
      const airings = (Array.isArray(entry.airings) ? entry.airings : [entry.nextAiring].filter(Boolean))
        .map((airing) => normalizeAiring(airing, providerId, canonicalType(entry?.type ?? entry?.mediaType), Number(entry?.tmdbId)))
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
    const mergedAirings = mergeTvAirings(group.airings)
    const firstByStation = new Map()
    const firstPrimeByStation = new Map()
    for (const airing of mergedAirings) {
      const stationIdentity = airing.canonicalStationId || airing.stationId || airing.sourceStationId || ''
      if (!firstByStation.has(stationIdentity)) firstByStation.set(stationIdentity, airing)
      if (isPrimeTimeAiring(airing) && !firstPrimeByStation.has(stationIdentity)) {
        firstPrimeByStation.set(stationIdentity, airing)
      }
    }
    const airingOptions = [...firstByStation.values()]
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
    const primeTimeOptions = [...firstPrimeByStation.values()]
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
    const nextAiring = airingOptions[0] || null
    const nextPrimeTimeAiring = primeTimeOptions[0] || null
    const [type, tmdbIdText] = key.split(':')
    return {
      key,
      tmdbId: Number(tmdbIdText),
      type,
      ...metadata,
      providerIds: [...new Set(group.sources.map(({ providerId }) => providerId))].sort(),
      airingCount: mergedAirings.length,
      airingOptions,
      primeTimeOptions,
      nextAiring,
      nextPrimeTimeAiring,
      hasPrimeTime: Boolean(nextPrimeTimeAiring),
    }
  }).sort((left, right) => (
    String(left.nextAiring?.startTime || '').localeCompare(String(right.nextAiring?.startTime || ''))
    || left.key.localeCompare(right.key)
  ))

  const candidateEntries = selectCandidatePool(entries)
  return {
    schemaVersion: TV_14_DAY_SUMMARY_VERSION,
    kind: 'moviehub-tv-14-day-summary',
    generatedAt,
    sourceCount: entries.length,
    candidateLimitPerRow: TV_14_DAY_ROW_CANDIDATE_LIMIT,
    count: candidateEntries.length,
    entries: candidateEntries,
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
  const payload = JSON.stringify(summary) + '\n'
  await writeFile(outputPath, payload, 'utf8')
  return { ...summary, byteSize: Buffer.byteLength(payload, 'utf8') }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeTv14DaySummary()
    .then((summary) => {
      process.stdout.write(JSON.stringify({
        kind: summary.kind,
        generatedAt: summary.generatedAt,
        sourceCount: summary.sourceCount,
        count: summary.count,
        candidateLimitPerRow: summary.candidateLimitPerRow,
        withPrimeTime: summary.entries.filter((entry) => entry.hasPrimeTime).length,
        withRankingMetadata: summary.entries.filter((entry) => (
          Number.isFinite(entry.voteAverage)
          || Number.isFinite(entry.popularity)
          || Number.isFinite(entry.voteCount)
        )).length,
        withMultiProviderAirings: summary.entries.filter((entry) => (
          (Array.isArray(entry.airingOptions) ? entry.airingOptions : [])
            .some((airing) => (Array.isArray(airing.providerIds) ? airing.providerIds : []).length > 1)
        )).length,
        multiProviderAiringOptions: summary.entries.reduce((total, entry) => (
          total + (Array.isArray(entry.airingOptions) ? entry.airingOptions : [])
            .filter((airing) => (Array.isArray(airing.providerIds) ? airing.providerIds : []).length > 1)
            .length
        ), 0),
        byteSize: summary.byteSize,
      }, null, 2) + '\n')
    })
    .catch((error) => {
      process.stderr.write((error?.stack || String(error)) + '\n')
      process.exitCode = 1
    })
}
