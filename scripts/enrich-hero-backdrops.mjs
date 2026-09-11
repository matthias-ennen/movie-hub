import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const token = process.env.TMDB_API_READ_TOKEN
const CANDIDATES_PER_GROUP = 30
const REQUEST_CONCURRENCY = 3
const MAX_RETRIES = 4
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w1280'

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

function heroImageScore(image) {
  const voteAverage = Number.isFinite(Number(image?.vote_average)) ? Number(image.vote_average) : 0
  const voteCount = Number.isFinite(Number(image?.vote_count)) ? Number(image.vote_count) : 0
  const width = Number.isFinite(Number(image?.width)) ? Number(image.width) : 0
  return (voteAverage * 1000000) + (Math.min(voteCount, 9999) * 1000) + width
}

export function selectNeutralBackdrop(payload) {
  const candidates = (Array.isArray(payload?.backdrops) ? payload.backdrops : [])
    .filter((image) => image?.file_path && image.iso_639_1 == null)
    .sort((left, right) => heroImageScore(right) - heroImageScore(left))

  return candidates[0]?.file_path || null
}

export function collectHeroCandidates(titles, perGroup = CANDIDATES_PER_GROUP) {
  const source = Array.isArray(titles) ? titles : []
  const groups = [
    source.slice(0, perGroup),
    source.filter((title) => title?.type === 'movie').slice(0, perGroup),
    source.filter((title) => title?.type === 'series').slice(0, perGroup),
  ]

  const unique = new Map()
  for (const title of groups.flat()) {
    if (!title?.id || !Number.isFinite(Number(title.tmdbId))) continue
    unique.set(title.id, title)
  }
  return [...unique.values()]
}

async function tmdbFetchImages(title, attempt = 0) {
  const mediaPath = title.type === 'series' ? 'tv' : 'movie'
  const endpoint = new URL(`https://api.themoviedb.org/3/${mediaPath}/${title.tmdbId}/images`)
  endpoint.searchParams.set('include_image_language', 'null')

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfter = Number(response.headers.get('retry-after'))
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 750 * (2 ** attempt)
    await sleep(delay)
    return tmdbFetchImages(title, attempt + 1)
  }

  if (!response.ok) {
    throw new Error(`TMDB hero image request failed for ${title.id} with HTTP ${response.status}`)
  }

  return response.json()
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

export async function enrichHeroBackdrops(catalog) {
  if (!token) throw new Error('TMDB_API_READ_TOKEN is missing. Hero backdrops are generated only in trusted CI.')
  const candidates = collectHeroCandidates(catalog?.titles)
  console.log(`TMDB hero backdrops: checking ${candidates.length} likely hero candidates for language-neutral images`)

  const resolved = await mapWithConcurrency(candidates, REQUEST_CONCURRENCY, async (title) => {
    try {
      const payload = await tmdbFetchImages(title)
      const path = selectNeutralBackdrop(payload)
      return [title.id, path ? `${IMAGE_BASE}${path.startsWith('/') ? path : `/${path}`}` : null]
    } catch (error) {
      console.warn(error instanceof Error ? error.message : String(error))
      return [title.id, null]
    }
  })

  const heroBackdrops = new Map(resolved)
  let enriched = 0
  const titles = (Array.isArray(catalog?.titles) ? catalog.titles : []).map((title) => {
    if (!heroBackdrops.has(title.id)) return title
    const heroBackdropUrl = heroBackdrops.get(title.id)
    if (heroBackdropUrl) enriched += 1
    return { ...title, heroBackdropUrl }
  })

  console.log(`TMDB hero backdrops: ${enriched}/${candidates.length} candidates received a language-neutral backdrop`)
  return { ...catalog, titles }
}

async function main() {
  const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../public/catalog.json')
  const catalog = JSON.parse(await readFile(outputPath, 'utf8'))
  const enriched = await enrichHeroBackdrops(catalog)
  await writeFile(outputPath, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
