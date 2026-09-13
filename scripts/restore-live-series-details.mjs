import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SERIES_SEASON_BUCKET_COUNT, SERIES_SEASON_DATA_VERSION } from '../src/catalog/seriesNavigation.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = resolve(root, 'public/series-details')
const baseUrl = process.env.MOVIE_HUB_LIVE_URL || 'https://movie-hub-62459.web.app'

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`)
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json')) throw new Error(`${path} did not return JSON`)
  return response.json()
}

try {
  const manifest = await fetchJson('/series-details/manifest.json')
  if (
    manifest?.kind !== 'series-season-manifest'
    || Number(manifest?.version) !== SERIES_SEASON_DATA_VERSION
    || Number(manifest?.bucketCount) !== SERIES_SEASON_BUCKET_COUNT
    || !Array.isArray(manifest?.shards)
    || manifest.shards.length !== SERIES_SEASON_BUCKET_COUNT
  ) throw new Error('Live series-season manifest has an invalid format.')

  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(outputDirectory, { recursive: true })
  let restored = 0

  for (const shard of manifest.shards) {
    if (!/^[0-9a-f]{2}$/.test(String(shard?.bucket || ''))) {
      throw new Error('Live series-season manifest contains an invalid bucket id.')
    }
    const payload = await fetchJson(`/series-details/${shard.bucket}.json`)
    if (
      payload?.kind !== 'series-season-shard'
      || Number(payload?.version) !== SERIES_SEASON_DATA_VERSION
      || payload?.bucket !== shard.bucket
      || !Array.isArray(payload?.entries)
    ) throw new Error(`Live series-season shard ${shard.bucket} has an invalid format.`)

    restored += payload.entries.length
    await writeFile(resolve(outputDirectory, `${shard.bucket}.json`), `${JSON.stringify(payload)}\n`, 'utf8')
  }

  await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest)}\n`, 'utf8')
  console.log(`Reusing live series details with ${restored} seasons from ${manifest.generatedAt || 'unknown time'}.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
