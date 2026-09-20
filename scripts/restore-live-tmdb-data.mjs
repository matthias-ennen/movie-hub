import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutputDirectory = resolve(root, 'public')
const defaultBaseUrl = process.env.MOVIE_HUB_LIVE_URL || 'https://movie-hub-62459.web.app'

function validTimestamp(value) {
  return Number.isFinite(Date.parse(String(value || '')))
}

export function validateLiveCatalog(catalog) {
  if (
    catalog?.source !== 'tmdb'
    || !validTimestamp(catalog?.generatedAt)
    || !Array.isArray(catalog?.titles)
    || catalog.titles.length === 0
    || !Array.isArray(catalog?.rowDefinitions)
    || catalog.rowDefinitions.length === 0
  ) throw new Error('Live catalog is not a valid non-empty TMDB catalog.')
  return catalog
}

export function validateLiveSearchIndex(searchIndex) {
  if (
    searchIndex?.kind !== 'search-index'
    || !validTimestamp(searchIndex?.generatedAt)
    || !Array.isArray(searchIndex?.entries)
    || searchIndex.entries.length === 0
  ) throw new Error('Live search index is not a valid non-empty search index.')
  return searchIndex
}

async function fetchJson(fetchImpl, baseUrl, pathname) {
  const response = await fetchImpl(new URL(pathname, baseUrl), {
    headers: { Accept: 'application/json' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`)
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json')) throw new Error(`${pathname} did not return JSON`)
  return response.json()
}

export async function restoreLiveTmdbData({
  fetchImpl = fetch,
  baseUrl = defaultBaseUrl,
  outputDirectory = defaultOutputDirectory,
} = {}) {
  const [catalog, searchIndex] = await Promise.all([
    fetchJson(fetchImpl, baseUrl, '/catalog.json').then(validateLiveCatalog),
    fetchJson(fetchImpl, baseUrl, '/search-index.json').then(validateLiveSearchIndex),
  ])

  await mkdir(outputDirectory, { recursive: true })
  const stagingDirectory = await mkdtemp(resolve(outputDirectory, '.tmdb-restore-'))
  try {
    await Promise.all([
      writeFile(resolve(stagingDirectory, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8'),
      writeFile(resolve(stagingDirectory, 'search-index.json'), `${JSON.stringify(searchIndex)}\n`, 'utf8'),
    ])

    // Both remote artifacts are fetched and validated before either live file
    // is replaced. A failed read can therefore never publish a repository
    // placeholder or a locally derived partial fallback.
    await rename(resolve(stagingDirectory, 'catalog.json'), resolve(outputDirectory, 'catalog.json'))
    await rename(resolve(stagingDirectory, 'search-index.json'), resolve(outputDirectory, 'search-index.json'))
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true })
  }

  return {
    catalogTitles: catalog.titles.length,
    catalogGeneratedAt: catalog.generatedAt,
    searchEntries: searchIndex.entries.length,
    searchGeneratedAt: searchIndex.generatedAt,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  restoreLiveTmdbData()
    .then((result) => {
      console.log(
        `Reusing validated live TMDB data: ${result.catalogTitles} catalog titles and ${result.searchEntries} search entries.`,
      )
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
