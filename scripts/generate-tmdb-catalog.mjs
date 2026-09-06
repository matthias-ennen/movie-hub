import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeTmdbTitle, toMovieHubTitle } from '../src/services/tmdb.js'

const token = process.env.TMDB_API_READ_TOKEN
const language = process.env.TMDB_LANGUAGE || 'de-DE'

if (!token) {
  console.error('TMDB_API_READ_TOKEN is missing. Catalog generation must run only in a trusted server/CI context.')
  process.exit(2)
}

const targets = [
  { key: 'dune-2', mediaType: 'movie', query: 'Dune: Part Two', year: 2024, accent: '#c88953', accent2: '#50311f' },
  { key: 'blade-runner', mediaType: 'movie', query: 'Blade Runner 2049', year: 2017, accent: '#d45d36', accent2: '#23314c' },
  { key: 'arrival', mediaType: 'movie', query: 'Arrival', year: 2016, accent: '#7199a7', accent2: '#25353a' },
  { key: 'interstellar', mediaType: 'movie', query: 'Interstellar', year: 2014, accent: '#6d8291', accent2: '#1a212b' },
  { key: 'oppenheimer', mediaType: 'movie', query: 'Oppenheimer', year: 2023, accent: '#d76c2d', accent2: '#421d10' },
  { key: 'civil-war', mediaType: 'movie', query: 'Civil War', year: 2024, accent: '#87634a', accent2: '#2b211a' },
  { key: 'shogun', mediaType: 'tv', query: 'Shogun', year: 2024, accent: '#b04a35', accent2: '#321b18' },
  { key: 'severance', mediaType: 'tv', query: 'Severance', year: 2022, accent: '#57777b', accent2: '#182628' },
  { key: 'dark', mediaType: 'tv', query: 'Dark', year: 2017, accent: '#4f6672', accent2: '#121a1e' },
  { key: 'expanse', mediaType: 'tv', query: 'The Expanse', year: 2015, accent: '#497ea8', accent2: '#16283a' },
  { key: 'andor', mediaType: 'tv', query: 'Andor', year: 2022, accent: '#68768b', accent2: '#1c222d' },
  { key: 'three-body', mediaType: 'tv', query: '3 Body Problem', year: 2024, accent: '#7168a5', accent2: '#241f3c' },
]

const rowBlueprints = [
  { id: 'top', title: 'Aktuell im Movie Hub', keys: ['dune-2', 'oppenheimer', 'shogun', 'interstellar', 'severance', 'andor'] },
  { id: 'scifi', title: 'Science-Fiction & Technik', keys: ['blade-runner', 'arrival', 'interstellar', 'expanse', 'three-body', 'andor'] },
  { id: 'series', title: 'Serien entdecken', keys: ['shogun', 'severance', 'dark', 'expanse', 'andor', 'three-body'] },
  { id: 'drama', title: 'Drama & große Geschichten', keys: ['oppenheimer', 'civil-war', 'arrival', 'dune-2', 'shogun', 'dark'] },
]

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

async function resolveTarget(target) {
  const searchPath = target.mediaType === 'tv' ? '/search/tv' : '/search/movie'
  const yearKey = target.mediaType === 'tv' ? 'first_air_date_year' : 'year'
  const searchResult = await tmdbFetch(searchPath, {
    query: target.query,
    language,
    include_adult: false,
    [yearKey]: target.year,
  })

  const match = Array.isArray(searchResult.results) ? searchResult.results[0] : null
  if (!match?.id) throw new Error(`No TMDB match found for ${target.query} (${target.year})`)

  const detailPath = target.mediaType === 'tv' ? `/tv/${match.id}` : `/movie/${match.id}`
  const payload = await tmdbFetch(detailPath, {
    language,
    append_to_response: 'credits',
  })

  const normalized = normalizeTmdbTitle(payload, target.mediaType)
  return toMovieHubTitle(normalized, {
    id: target.key,
    accent: target.accent,
    accent2: target.accent2,
  })
}

try {
  const titles = []
  for (const target of targets) {
    console.log(`TMDB catalog: ${target.query} (${target.year})`)
    titles.push(await resolveTarget(target))
  }

  const availableIds = new Set(titles.map((title) => title.id))
  const rowDefinitions = rowBlueprints.map((row) => ({
    id: row.id,
    title: row.title,
    ids: row.keys.filter((key) => availableIds.has(key)),
  }))

  const catalog = {
    source: 'tmdb',
    language,
    generatedAt: new Date().toISOString(),
    attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    titles,
    rowDefinitions,
  }

  const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../public/catalog.json')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  console.log(`TMDB catalog generated: ${titles.length} titles -> public/catalog.json`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
