import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateWaipuLiveCatalog, writeWaipuLiveCatalog } from './waipu-live-catalog.mjs'

const DEFAULT_SOURCE = 'https://movie-hub-62459.web.app/waipu-live'
const DEFAULT_ARTIFACT_LIMITS = Object.freeze({
  manifest: 4 * 1024 * 1024,
  titles: 256 * 1024 * 1024,
  stationShard: 16 * 1024 * 1024,
})

function sourceUrl(value) {
  const url = new URL(String(value || DEFAULT_SOURCE))
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Waipu restore source must be a plain HTTPS URL.')
  }
  return url.toString().replace(/\/$/, '')
}

function safeStationId(value) {
  const stationId = String(value || '').trim()
  return /^[a-zA-Z0-9._-]{1,128}$/.test(stationId) ? stationId : null
}

async function fetchJson(url, { fetchImpl, maxBytes }) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Waipu restore failed with HTTP ${response.status}.`)
  const contentLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Waipu restore artifact exceeds its ${maxBytes}-byte size limit.`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > maxBytes) {
    throw new Error(`Waipu restore artifact exceeds its ${maxBytes}-byte size limit.`)
  }
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (cause) {
    throw new Error('Waipu restore artifact is not valid JSON.', { cause })
  }
}

export async function restoreLiveWaipuCatalog({
  baseUrl = DEFAULT_SOURCE,
  outputPath = resolve('public/waipu-live'),
  fetchImpl = globalThis.fetch,
  artifactLimits = DEFAULT_ARTIFACT_LIMITS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.')
  const base = sourceUrl(baseUrl)
  const limits = { ...DEFAULT_ARTIFACT_LIMITS, ...artifactLimits }
  const [index, stations, titles] = await Promise.all([
    fetchJson(`${base}/index.json`, { fetchImpl, maxBytes: limits.manifest }),
    fetchJson(`${base}/stations.json`, { fetchImpl, maxBytes: limits.manifest }),
    fetchJson(`${base}/titles.json`, { fetchImpl, maxBytes: limits.titles }),
  ])
  const stationList = Array.isArray(stations?.stations) ? stations.stations : []
  const stationIds = stationList.map(({ id }) => safeStationId(id))
  if (stationIds.some((id) => !id) || new Set(stationIds).size !== stationIds.length) {
    throw new Error('Waipu restore station index is invalid.')
  }
  const shards = Object.fromEntries(await Promise.all(stationIds.map(async (stationId) => ([
    stationId,
    await fetchJson(`${base}/stations/${encodeURIComponent(stationId)}.json`, {
      fetchImpl,
      maxBytes: limits.stationShard,
    }),
  ]))))
  const catalog = { index, stations, titles, shards }
  validateWaipuLiveCatalog(catalog)
  await writeWaipuLiveCatalog(outputPath, catalog)
  return index
}

async function main() {
  const index = await restoreLiveWaipuCatalog({
    baseUrl: process.env.WAIPU_LIVE_SOURCE_URL,
    outputPath: resolve(process.env.WAIPU_LIVE_OUTPUT || 'public/waipu-live'),
  })
  process.stdout.write(`Restored last valid Waipu catalog from ${index.generatedAt || 'unknown time'} (${index.counts?.titles || 0} titles).\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
