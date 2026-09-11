import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEARCH_DETAIL_BUCKET_COUNT, SEARCH_DETAIL_VERSION } from '../src/search/lazySearchDetails.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = resolve(root, 'public/search-details')
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
  const manifest = await fetchJson('/search-details/manifest.json')
  if (
    manifest?.kind !== 'search-detail-manifest'
    || Number(manifest?.version) !== SEARCH_DETAIL_VERSION
    || Number(manifest?.bucketCount) !== SEARCH_DETAIL_BUCKET_COUNT
    || !Array.isArray(manifest?.shards)
    || manifest.shards.length !== SEARCH_DETAIL_BUCKET_COUNT
  ) {
    throw new Error('Live search-detail manifest has an invalid format.')
  }

  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(outputDirectory, { recursive: true })

  let restored = 0
  for (const shard of manifest.shards) {
    if (!/^[0-9a-f]{2}$/.test(String(shard?.bucket || ''))) {
      throw new Error('Live search-detail manifest contains an invalid bucket id.')
    }
    const payload = await fetchJson(`/search-details/${shard.bucket}.json`)
    if (
      payload?.kind !== 'search-detail-shard'
      || Number(payload?.version) !== SEARCH_DETAIL_VERSION
      || payload?.bucket !== shard.bucket
      || !Array.isArray(payload?.entries)
    ) {
      throw new Error(`Live search-detail shard ${shard.bucket} has an invalid format.`)
    }
    restored += payload.entries.length
    await writeFile(
      resolve(outputDirectory, `${shard.bucket}.json`),
      `${JSON.stringify(payload)}\n`,
      'utf8',
    )
  }

  await writeFile(
    resolve(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest)}\n`,
    'utf8',
  )
  console.log(`Reusing live lazy search details with ${restored} entries from ${manifest.generatedAt || 'unknown time'}.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
