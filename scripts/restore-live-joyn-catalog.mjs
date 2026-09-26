import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  JOYN_LIVE_PUBLICATION_VERSION,
  writeJoynLivePublication,
} from './joyn-live-publication.mjs'

const DEFAULT_SOURCE = 'https://movie-hub-62459.web.app/joyn-live'
const DEFAULT_LIMITS = Object.freeze({
  manifest: 8 * 1024 * 1024,
  dayShard: 64 * 1024 * 1024,
})

function sourceUrl(value) {
  const url = new URL(String(value || DEFAULT_SOURCE))
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Joyn restore source must be a plain HTTPS URL.')
  }
  return url.toString().replace(/\/$/, '')
}

async function fetchJson(url, { fetchImpl, maxBytes }) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Joyn restore failed with HTTP ${response.status}.`)
  const contentLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Joyn restore artifact exceeds its ${maxBytes}-byte size limit.`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > maxBytes) {
    throw new Error(`Joyn restore artifact exceeds its ${maxBytes}-byte size limit.`)
  }
  return JSON.parse(bytes.toString('utf8'))
}

function validate(index, stations, days) {
  if (index?.schemaVersion !== JOYN_LIVE_PUBLICATION_VERSION
      || index?.kind !== 'joyn-live-index'
      || index?.status !== 'complete') {
    throw new Error('Joyn restore index is not a complete supported publication.')
  }
  if (stations?.schemaVersion !== JOYN_LIVE_PUBLICATION_VERSION
      || stations?.kind !== 'joyn-live-stations'
      || !Array.isArray(stations?.stations)
      || !stations.stations.length) {
    throw new Error('Joyn restore station catalog is invalid.')
  }
  const keys = (Array.isArray(index.days) ? index.days : []).map(({ key }) => String(key || ''))
  if (keys.some((key) => !/^\d{4}-\d{2}-\d{2}$/.test(key))
      || new Set(keys).size !== keys.length) {
    throw new Error('Joyn restore day index is invalid.')
  }
  for (const key of keys) {
    const shard = days[key]
    if (shard?.schemaVersion !== JOYN_LIVE_PUBLICATION_VERSION
        || shard?.kind !== 'joyn-live-day'
        || shard?.key !== key
        || !Array.isArray(shard?.airings)) {
      throw new Error(`Joyn restore day shard ${key} is invalid.`)
    }
  }
}

export async function restoreLiveJoynCatalog({
  baseUrl = DEFAULT_SOURCE,
  outputPath = resolve('public/joyn-live'),
  fetchImpl = globalThis.fetch,
  limits = DEFAULT_LIMITS,
} = {}) {
  const base = sourceUrl(baseUrl)
  const [index, stations, titles] = await Promise.all([
    fetchJson(`${base}/index.json`, { fetchImpl, maxBytes: limits.manifest }),
    fetchJson(`${base}/stations.json`, { fetchImpl, maxBytes: limits.manifest }),
    fetchJson(`${base}/titles.json`, { fetchImpl, maxBytes: limits.dayShard }),
  ])
  const dayKeys = (Array.isArray(index?.days) ? index.days : []).map(({ key }) => String(key || ''))
  const days = Object.fromEntries(await Promise.all(dayKeys.map(async (key) => ([
    key,
    await fetchJson(`${base}/days/${key}.json`, { fetchImpl, maxBytes: limits.dayShard }),
  ]))))
  validate(index, stations, days)
  if (titles?.schemaVersion !== JOYN_LIVE_PUBLICATION_VERSION
      || titles?.kind !== 'joyn-live-titles'
      || !Array.isArray(titles?.entries)) {
    throw new Error('Joyn restore title index is invalid.')
  }
  await writeJoynLivePublication({ index, stations, titles, days }, outputPath)
  return index
}

async function main() {
  const index = await restoreLiveJoynCatalog({
    baseUrl: process.env.JOYN_LIVE_SOURCE_URL,
    outputPath: resolve(process.env.JOYN_LIVE_OUTPUT || 'public/joyn-live'),
  })
  process.stdout.write(`Restored last valid Joyn catalog from ${index.generatedAt || 'unknown time'} (${index.stationCount || 0} stations, ${index.airingCount || 0} airings).\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
