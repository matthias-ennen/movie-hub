import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeTmdbTitle, normalizeTmdbVideos, normalizeTmdbWatchProviders, toMovieHubTitle } from '../src/services/tmdb.js'

const token = process.env.TMDB_API_READ_TOKEN
const language = process.env.TMDB_LANGUAGE || 'de-DE'
const country = process.env.TMDB_COUNTRY || 'DE'

// These rows are product configuration, not hard-coded editorial content.
// Changing a title, the source, or the amount of content later does not affect
// the public catalog format or any personal Firestore data.
export const CATALOG_ROWS = [
  { id: 'trending', title: 'Jetzt beliebt', source: 'trending', mediaType: 'all', limit: 10 },
  { id: 'new-movies', title: 'Neue Filme', source: 'recent-movies', mediaType: 'movie', limit: 10 },
  { id: 'new-series', title: 'Neue Serien', source: 'recent-series', mediaType: 'tv', limit: 10 },
  { id: 'movies', title: 'Filme entdecken', source: 'popular-movies', mediaType: 'movie', limit: 10 },
  { id: 'series', title: 'Serien entdecken', source: 'popular-series', mediaType: 'tv', limit: 10 },
]

// Temporary device-test references. Metadata continues to come from TMDB.
// The provider flag is deliberately isolated and documented so it cannot be
// mistaken for the future provider-catalog architecture.
export const PROVIDER_TEST_REFERENCES = [
  {
    id: 106747,
    mediaType: 'movie',
    providerId: 'waipu',
    rowId: 'provider-test-waipu',
    rowTitle: 'Anbieter-Test · waipu.tv',
    note: 'Machete Kills – waipu availability manually confirmed for Fire-TV acceptance on 2026-09-08.',
  },
]

const CANDIDATES_PER_ROW = 24
const MINIMUM_TITLES_PER_ROW = 6
// Stable TMDB provider identifiers for the providers Movie Hub currently
// exposes. They prefilter the new-release rows before the detailed per-title
// availability check below. waipu.tv remains covered by that later check.
const TMDB_DISCOVER_PROVIDER_IDS = '8|119|337|192'
// Each candidate needs a detail and a provider request. Two workers keep the
// total request rate deliberately conservative for the daily TMDB job.
const REQUEST_CONCURRENCY = 2
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

function isoDateDaysAgo(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function candidateKey(candidate) {
  return `${candidate.mediaType}-${candidate.id}`
}

function normalizeCandidate(candidate, fallbackMediaType) {
  const mediaType = candidate?.media_type || fallbackMediaType
  const id = Number(candidate?.id)
  if (!Number.isFinite(id) || !['movie', 'tv'].includes(mediaType)) return null
  return { id, mediaType }
}

function uniqueCandidates(candidates) {
  const seen = new Set()
  return candidates.filter((candidate) => {
    if (!candidate) return false
    const key = candidateKey(candidate)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function accentFor(tmdbId) {
  return ACCENT_PAIRS[Math.abs(Number(tmdbId) || 0) % ACCENT_PAIRS.length]
}

export function applyProviderTestReference(title, reference) {
  if (!title || !reference?.providerId) return title

  const providerIds = Array.isArray(title.providerIds) ? [...title.providerIds] : []
  if (!providerIds.includes(reference.providerId)) providerIds.push(reference.providerId)

  const providerOffers = Array.isArray(title.providerOffers)
    ? title.providerOffers.map((provider) => ({ ...provider }))
    : []

  if (!providerOffers.some((provider) => provider.id === reference.providerId)) {
    providerOffers.push({
      id: reference.providerId,
      tmdbProviderId: null,
      offerTypes: ['test-reference'],
    })
  }

  return {
    ...title,
    providerIds,
    providerOffers,
    providerTestReference: {
      providerId: reference.providerId,
      note: reference.note || null,
    },
  }
}

async function tmdbFetch(path, searchParams = {}) {
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

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`TMDB request failed with HTTP ${response.status}: ${body.slice(0, 300)}`)
  }

  return response.json()
}

function getRowRequest(row) {
  switch (row.source) {
    case 'trending':
      return { path: '/trending/all/week', params: { language } }
    case 'recent-movies':
      return {
        path: '/discover/movie',
        params: {
          language,
          region: country,
          watch_region: country,
          with_watch_providers: TMDB_DISCOVER_PROVIDER_IDS,
          sort_by: 'primary_release_date.desc',
          include_adult: false,
          'primary_release_date.gte': isoDateDaysAgo(180),
          'primary_release_date.lte': today(),
        },
      }
    case 'recent-series':
      return {
        path: '/discover/tv',
        params: {
          language,
          watch_region: country,
          with_watch_providers: TMDB_DISCOVER_PROVIDER_IDS,
          sort_by: 'first_air_date.desc',
          include_adult: false,
          'first_air_date.gte': isoDateDaysAgo(365),
          'first_air_date.lte': today(),
        },
      }
    case 'popular-movies':
      return {
        path: '/discover/movie',
        params: {
          language,
          region: country,
          watch_region: country,
          with_watch_providers: TMDB_DISCOVER_PROVIDER_IDS,
          sort_by: 'popularity.desc',
          include_adult: false,
        },
      }
    case 'popular-series':
      return {
        path: '/discover/tv',
        params: {
          language,
          watch_region: country,
          with_watch_providers: TMDB_DISCOVER_PROVIDER_IDS,
          sort_by: 'popularity.desc',
          include_adult: false,
        },
      }
    default:
      throw new Error(`Unknown catalog row source: ${row.source}`)
  }
}

async function getRowCandidates(row) {
  const request = getRowRequest(row)
  const payload = await tmdbFetch(request.path, request.params)
  const results = Array.isArray(payload?.results) ? payload.results : []
  return uniqueCandidates(
    results
      .slice(0, CANDIDATES_PER_ROW)
      .map((candidate) => normalizeCandidate(candidate, row.mediaType)),
  )
}

async function resolveCandidate(candidate) {
  const detailPath = candidate.mediaType === 'tv' ? `/tv/${candidate.id}` : `/movie/${candidate.id}`
  const providerPath = candidate.mediaType === 'tv'
    ? `/tv/${candidate.id}/watch/providers`
    : `/movie/${candidate.id}/watch/providers`
  const videoPath = candidate.mediaType === 'tv'
    ? `/tv/${candidate.id}/videos`
    : `/movie/${candidate.id}/videos`

  const [payload, providerPayload, germanVideos, fallbackVideos] = await Promise.all([
    tmdbFetch(detailPath, { language, append_to_response: 'credits' }),
    tmdbFetch(providerPath),
    tmdbFetch(videoPath, { language: 'de-DE' }),
    tmdbFetch(videoPath, { language: 'en-US' }),
  ])
  const normalized = normalizeTmdbTitle(payload, candidate.mediaType)
  const providerData = normalizeTmdbWatchProviders(providerPayload, country)
  const videos = normalizeTmdbVideos([germanVideos, fallbackVideos], normalized.originalLanguage)
  const [accent, accent2] = accentFor(normalized.tmdbId)

  return toMovieHubTitle(normalized, {
    id: `tmdb-${normalized.type}-${normalized.tmdbId}`,
    accent,
    accent2,
    videos,
    ...providerData,
  })
}

async function mapWithConcurrency(values, limit, callback) {
  const results = new Array(values.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++
      results[index] = await callback(values[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return results
}

export function buildRowDefinitions(rows, titlesByCandidate) {
  return rows.map(({ id, title, candidates, limit }) => {
    const ids = candidates
      .map((candidate) => titlesByCandidate.get(candidateKey(candidate)))
      .filter((item) => item?.providerIds?.length)
      .slice(0, limit)
      .map((item) => item.id)

    if (ids.length < MINIMUM_TITLES_PER_ROW) {
      throw new Error(`TMDB catalog row "${title}" has only ${ids.length} supported titles; at least ${MINIMUM_TITLES_PER_ROW} are required.`)
    }

    return { id, title, ids }
  })
}

export function buildProviderTestRows(references, titlesByCandidate) {
  return references
    .map((reference) => {
      const title = titlesByCandidate.get(candidateKey(reference))
      if (!title) return null
      return { id: reference.rowId, title: reference.rowTitle, ids: [title.id] }
    })
    .filter(Boolean)
}

export async function generateCatalog() {
  if (!token) {
    throw new Error('TMDB_API_READ_TOKEN is missing. Catalog generation must run only in a trusted server/CI context.')
  }

  const rowsWithCandidates = await Promise.all(CATALOG_ROWS.map(async (row) => ({
    ...row,
    candidates: await getRowCandidates(row),
  })))

  const candidates = uniqueCandidates(rowsWithCandidates.flatMap((row) => row.candidates))
  console.log(`TMDB catalog: resolving ${candidates.length} current candidates`)
  const resolvedTitles = await mapWithConcurrency(candidates, REQUEST_CONCURRENCY, resolveCandidate)
  const titlesByCandidate = new Map(
    resolvedTitles.map((title) => [`${title.type === 'series' ? 'tv' : 'movie'}-${title.tmdbId}`, title]),
  )

  for (const reference of PROVIDER_TEST_REFERENCES) {
    const key = candidateKey(reference)
    const current = titlesByCandidate.get(key) || await resolveCandidate(reference)
    titlesByCandidate.set(key, applyProviderTestReference(current, reference))
  }

  const discoveryRows = buildRowDefinitions(rowsWithCandidates, titlesByCandidate)
  const providerTestRows = buildProviderTestRows(PROVIDER_TEST_REFERENCES, titlesByCandidate)
  const rowDefinitions = [...providerTestRows, ...discoveryRows]
  const visibleIds = new Set(rowDefinitions.flatMap((row) => row.ids))
  const titles = [...titlesByCandidate.values()].filter((title) => visibleIds.has(title.id))

  return {
    source: 'tmdb',
    language,
    country,
    generatedAt: new Date().toISOString(),
    attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    titles,
    rowDefinitions,
  }
}

async function writeCatalog(catalog) {
  const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../public/catalog.json')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  console.log(`TMDB catalog generated: ${catalog.titles.length} titles -> public/catalog.json`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await writeCatalog(await generateCatalog())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
