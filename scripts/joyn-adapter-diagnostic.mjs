import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { localTmdbCandidates } from './waipu-live-catalog.mjs'
import { JoynTmdbSearchClient, matchJoynProgram } from './joyn-tmdb-matcher.mjs'
import { normalizeJoynLiveChannelsAndEpg } from '../src/sources/joyn/joynEpgNormalizer.js'
import { enrichJoynCandidatesWithV2 } from '../src/sources/joyn/joynEpgV2Enrichment.js'
import { classifyJoynAlgoliaHits } from '../src/sources/joyn/joynAlgoliaClassifier.js'
import { buildJoynStationMapping } from './joyn-station-mapping.mjs'
import { mapJoynCandidateToBroadcastEvent, buildJoynSourceEnvelope } from '../src/sources/adapters/joynContractMapper.js'
import { SourceSchemaObserver } from '../src/sources/sourceSchemaObserver.js'
import { syncJoynEpg, joynImportHorizon, writeJoynJson } from './joyn-epg-sync.mjs'
import { JoynMatchCache, JoynLookupCache, sharedJoynTmdbMetadata } from './joyn-match-cache.mjs'
import { readTmdbChangeSet, tmdbChangedTitleTimes } from './tmdb-change-queue.mjs'
import { JOYN_EPG_UPSTREAM_FIELD_POLICY } from '../src/sources/policies/joynUpstreamFieldPolicy.js'
import { writeFieldDiscoveryReport } from '../src/sources/fieldDiscoveryReport.js'
import {
  buildJoynLivePublication,
  enrichJoynDayTitleMetadata,
  writeJoynLivePublication,
} from './joyn-live-publication.mjs'
import {
  LiveTmdbMetadataClient,
  enrichLiveTitleMetadata,
  requireCompleteLiveTitleMetadata,
} from './waipu-title-metadata.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const JOYN_BASE = 'https://www.joyn.de'
const AUTH_URL = 'https://auth.joyn.de/auth/anonymous'
const GRAPHQL_URL = 'https://api.joyn.de/graphql'
const ALGOLIA_URL = 'https://ffqrv35svv-dsn.algolia.net/1/indexes/*/queries'
const ALGOLIA_APP_ID = 'FFQRV35SVV'
const ALGOLIA_INDEX = 'indexion_prod_vod'
const OPERATION = 'LiveChannelsAndEPG'
const SEARCH_OPERATION = 'SearchQ'
const SEARCH_HASH = 'bb2bab6cbe17321d7eddd5006e7f40765faedd79790b193a59d83f4640694856'
const LANDING_PAGE_OPERATION = 'LandingPageClient'
const LANDING_PAGE_HASH = 'd126aa8da9aae9a7abdabe014e8641ce54c17fd0a39c37f8a7bbcab258821508'
const FULL_EPG_QUERY = `query LiveChannelsAndEPG {
  liveStreams(filterLivestreamsTypes: [LINEAR], first: 5000, offset: 0, liveStreamGroupFilter: DEFAULT) {
    id
    title
    type
    quality
    logo { url }
    brand {
      id
      title
      brandCode
      livestream { logo { url(profile: "nextgen-web-artlogo-183x75") } }
    }
    epgEvents {
      startDate
      endDate
      program {
        __typename
        ... on EpgEntry {
          id
          title
          secondaryTitle
          startDate
          endDate
          images { id type url }
        }
        ... on Movie {
          id
          title
          path
          licenseTypes
          video { id }
        }
        ... on Episode {
          id
          title
          path
          licenseTypes
          number
          season { number }
          series { id title }
          video { id }
        }
      }
    }
  }
}`
const JOYN_EPG_V2_CHUNK_MINUTES = 360
const EPG_V2_QUERY = (from, to) => `query EpgEventsV2Enrichment {
  epgEventsV2(from: ${from}, to: ${to}) {
    items {
      start
      end
      livestream { id }
      program {
        __typename
        ... on EpgEntryV2 {
          id
          title
          secondaryTitle
          description
          images { id type url }
          ageRating { minAge description ratingSystem }
        }
      }
    }
  }
}`

const OBSERVED_PUBLIC_WEBCLIENT_KEY = '4f0fd9f18abbe3cf0e87fdb556bc39c8'

const GRAPHQL_KEY_PATTERNS = [
  /["']x-api-key["']\s*[:=]\s*["']([a-f0-9]{32})["']/gi,
  /(?:["'])?xApiKey(?:["'])?\s*[:=]\s*["']([a-f0-9]{32})["']/gi,
  /(?:["'])?graphqlApiKey(?:["'])?\s*[:=]\s*["']([a-f0-9]{32})["']/gi,
]

export function extractJoynGraphqlApiKey(text = '') {
  const source = String(text || '')
  for (const pattern of GRAPHQL_KEY_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(source)
    if (match?.[1]) return match[1]
  }
  return null
}

async function discoverJoynGraphqlApiKey(fetchImpl = fetch) {
  const page = await fetchImpl(JOYN_BASE, { headers: headers() })
  if (!page.ok) throw new Error(`Joyn webclient page failed: HTTP ${page.status}`)
  const html = await page.text()
  const direct = extractJoynGraphqlApiKey(html)
  if (direct) return direct

  const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => {
      try {
        return new URL(match[1], JOYN_BASE).href
      } catch {
        return null
      }
    })
    .filter((url) => url && url.startsWith('https://www.joyn.de/'))
    .slice(0, 30)

  for (const url of scriptUrls) {
    try {
      const response = await fetchImpl(url, { headers: headers() })
      if (!response.ok) continue
      const key = extractJoynGraphqlApiKey(await response.text())
      if (key) return key
    } catch {
      // A single chunk must never block discovery of the remaining public chunks.
    }
  }

  return null
}

function headers() {
  return {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    origin: JOYN_BASE,
    referer: JOYN_BASE + '/',
    'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function anonymousToken(fetchImpl = fetch) {
  const response = await fetchImpl(AUTH_URL, {
    method: 'POST',
    headers: { ...headers(), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: 'web', client_name: 'joyn-web' }),
  })
  if (!response.ok) throw new Error(`Joyn anonymous auth failed: HTTP ${response.status}`)
  const body = await response.json()
  const token = body?.access_token || body?.accessToken
  if (!token) throw new Error('Joyn anonymous auth returned no token.')
  return token
}

export async function loadJoynEpg(fetchImpl = fetch, {
  maxAttempts = 3,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
} = {}) {
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const token = await anonymousToken(fetchImpl)
      const discoveredApiKey = process.env.JOYN_GRAPHQL_API_KEY ? null : await discoverJoynGraphqlApiKey(fetchImpl).catch(() => null)
      const apiKey = process.env.JOYN_GRAPHQL_API_KEY
        || discoveredApiKey
        || OBSERVED_PUBLIC_WEBCLIENT_KEY
      const params = new URLSearchParams()
      params.set('operationName', OPERATION)
      params.set('enable_user_location', 'true')
      params.set('watch_assistant_variant', 'true')
      params.set('query', FULL_EPG_QUERY)

      const response = await fetchImpl(GRAPHQL_URL + '?' + params.toString(), {
        headers: {
          ...headers(),
          authorization: 'Bearer ' + token,
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'joyn-platform': 'web',
          'joyn-country': 'DE',
          'joyn-distribution-tenant': 'JOYN',
          'joyn-client-version': '5.1370.0',
        },
      })
      if (!response.ok) throw new Error(`Joyn GraphQL failed: HTTP ${response.status}`)
      const body = await response.json()
      if (Array.isArray(body?.errors) && body.errors.length) {
        throw new Error(`Joyn GraphQL returned errors: ${body.errors.map((e) => e?.message).join('; ')}`)
      }
      if (!body?.data) throw new Error('Joyn GraphQL returned no data.')
      return {
        data: body.data,
        token,
        apiKey,
        apiKeySource: process.env.JOYN_GRAPHQL_API_KEY
          ? 'environment'
          : discoveredApiKey
            ? 'public-webclient'
            : 'observed-fallback',
      }
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts) await sleep(500 * (2 ** (attempt - 1)))
    }
  }
  throw lastError || new Error('Joyn GraphQL failed after retries.')
}

async function loadJoynEpgV2({
  fetchImpl = fetch,
  token,
  apiKey,
  fromMs,
  toMs,
} = {}) {
  if (!token || !apiKey || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return { data: { epgEventsV2: { items: [] } }, requests: 0, status: 'not_requested' }
  }

  const items = []
  const chunkMs = JOYN_EPG_V2_CHUNK_MINUTES * 60_000
  let requests = 0
  for (let start = fromMs; start < toMs; start += chunkMs) {
    const end = Math.min(toMs, start + chunkMs)
    const from = Math.floor(start / 1000)
    const to = Math.ceil(end / 1000)
    const params = new URLSearchParams()
    params.set('operationName', 'EpgEventsV2Enrichment')
    params.set('enable_user_location', 'true')
    params.set('watch_assistant_variant', 'true')
    params.set('query', EPG_V2_QUERY(from, to))
    requests += 1
    const response = await fetchImpl(GRAPHQL_URL + '?' + params.toString(), {
      headers: {
        ...headers(),
        authorization: 'Bearer ' + token,
        accept: 'application/json',
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'joyn-platform': 'web',
        'joyn-country': 'DE',
        'joyn-distribution-tenant': 'JOYN',
        'joyn-client-version': '5.1370.0',
      },
    })
    if (!response.ok) {
      return { data: { epgEventsV2: { items: [] } }, requests, status: `http_${response.status}` }
    }
    const body = await response.json().catch(() => null)
    if (!body?.data || body?.errors?.length) {
      return { data: { epgEventsV2: { items: [] } }, requests, status: 'graphql_error' }
    }
    items.push(...(Array.isArray(body?.data?.epgEventsV2?.items) ? body.data.epgEventsV2.items : []))
  }

  return {
    data: { epgEventsV2: { items } },
    requests,
    status: 'ready',
  }
}

export async function requestJoynEpgWindow({ fetchImpl = fetch, token, apiKey, from, to }) {
  const params = new URLSearchParams({ operationName: 'EpgEventsV2Enrichment', query: EPG_V2_QUERY(from, to) })
  const response = await fetchImpl(GRAPHQL_URL + '?' + params, {
    headers: { ...headers(), authorization: 'Bearer ' + token, 'x-api-key': apiKey,
      accept: 'application/json', 'joyn-platform': 'web', 'joyn-country': 'DE',
      'joyn-distribution-tenant': 'JOYN', 'joyn-client-version': '5.1370.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    const error = new Error(`Joyn EPG request failed: HTTP ${response.status}`)
    error.status = response.status
    error.retryAfter = Number(response.headers?.get?.('retry-after'))
    throw error
  }
  const body = await response.json()
  if (body.errors?.length || !Array.isArray(body?.data?.epgEventsV2?.items)) throw new Error('Joyn EPG schema/request failed.')
  return body.data.epgEventsV2.items
}

async function loadJoynAlgoliaSearchKey({
  fetchImpl = fetch,
  token,
  apiKey,
} = {}) {
  const params = new URLSearchParams()
  params.set('operationName', 'AlgoliaApiKey')
  params.set('enable_user_location', 'true')
  params.set('watch_assistant_variant', 'true')
  params.set('query', 'query AlgoliaApiKey { searchApiKey }')
  const response = await fetchImpl(GRAPHQL_URL + '?' + params.toString(), {
    headers: {
      ...headers(),
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'joyn-platform': 'web',
      'joyn-country': 'DE',
      'joyn-distribution-tenant': 'JOYN',
      'joyn-client-version': '5.1370.0',
    },
  })
  if (!response.ok) return { key: null, status: 'http_' + response.status }
  const body = await response.json().catch(() => null)
  if (!body?.data || body?.errors?.length || !String(body?.data?.searchApiKey || '').trim()) {
    return { key: null, status: 'graphql_error' }
  }
  return { key: String(body.data.searchApiKey).trim(), status: 'ready' }
}

async function searchJoynAlgoliaTitle(title, {
  fetchImpl = fetch,
  searchApiKey,
} = {}) {
  const response = await fetchImpl(ALGOLIA_URL, {
    method: 'POST',
    headers: {
      'x-algolia-application-id': ALGOLIA_APP_ID,
      'x-algolia-api-key': searchApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        indexName: ALGOLIA_INDEX,
        params: 'query=' + encodeURIComponent(title) + '&hitsPerPage=20&page=0',
      }],
    }),
  })
  if (!response.ok) return { hits: [], status: 'http_' + response.status }
  const body = await response.json().catch(() => null)
  const hits = Array.isArray(body?.results?.[0]?.hits) ? body.results[0].hits : []
  return { hits, status: 'ready' }
}

async function searchJoynTitle(title, {
  fetchImpl = fetch,
  token,
  apiKey,
} = {}) {
  const params = new URLSearchParams()
  params.set('operationName', SEARCH_OPERATION)
  params.set('enable_user_location', 'true')
  params.set('watch_assistant_variant', 'true')
  params.set('variables', JSON.stringify({ text: title, first: 10, offset: 0 }))
  params.set('extensions', JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: SEARCH_HASH },
  }))
  const response = await fetchImpl(GRAPHQL_URL + '?' + params.toString(), {
    headers: {
      ...headers(),
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'joyn-platform': 'web',
      'joyn-country': 'DE',
      'joyn-distribution-tenant': 'JOYN',
      'joyn-client-version': '5.1370.0',
    },
  })
  if (!response.ok) return { type: null, reason: 'http_error' }
  const body = await response.json().catch(() => null)
  if (!body?.data || body?.errors?.length) return { type: null, reason: 'graphql_error' }
  const input = normalizeWaipuText(title)
  const exactResults = (Array.isArray(body?.data?.search?.results) ? body.data.search.results : [])
    .filter((result) => normalizeWaipuText(result?.title) === input)
    .map((result) => {
      let type = null
      if (result?.__typename === 'Movie') type = 'movie'
      if (result?.__typename === 'Series' || result?.__typename === 'Episode') type = 'series'
      if (!type) return null
      return {
        type,
        joynType: result?.__typename || null,
        id: joynText(result?.id),
        title: joynText(result?.title),
        path: joynText(result?.path),
        fullPath: joynText(result?.fullPath),
      }
    })
    .filter(Boolean)
  const exact = exactResults.map((result) => result.type)
  const unique = [...new Set(exact)]
  return unique.length === 1
    ? {
        type: unique[0],
        reason: 'exact_joyn_search',
        exactTypes: unique,
        exactCount: exact.length,
        exactResults,
      }
    : {
      type: null,
      reason: unique.length > 1 ? 'ambiguous_joyn_search' : 'no_joyn_type',
      exactTypes: unique,
      exactCount: exact.length,
      exactResults,
    }
}

function joynText(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function collectJoynDetailAliases(data, primaryTitle) {
  const page = data?.page || data?.asset || null
  const asset = page?.asset || data?.asset || page || null
  const series = asset?.series || page?.series || data?.series || asset || null
  const values = [
    series?.originalTitle,
    series?.titleOriginal,
    series?.originalName,
    series?.titles?.OV,
    series?.title,
    asset?.originalTitle,
    asset?.titleOriginal,
    asset?.originalName,
    asset?.titles?.OV,
  ].map(joynText).filter(Boolean)
  const primary = normalizeWaipuText(primaryTitle)
  return [...new Set(values)]
    .filter((value) => normalizeWaipuText(value) !== primary)
    .slice(0, 3)
}

async function loadJoynSeriesDetail(path, {
  fetchImpl = fetch,
  token,
  apiKey,
} = {}) {
  const normalizedPath = joynText(path)
  if (!normalizedPath || !token || !apiKey) {
    return { status: 'not_requested', path: normalizedPath, aliases: [] }
  }
  const params = new URLSearchParams()
  params.set('operationName', LANDING_PAGE_OPERATION)
  params.set('variables', JSON.stringify({ path: normalizedPath, variation: 'Default' }))
  params.set('extensions', JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: LANDING_PAGE_HASH },
  }))
  const response = await fetchImpl(GRAPHQL_URL + '?' + params.toString(), {
    headers: {
      ...headers(),
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'joyn-platform': 'web',
      'joyn-country': 'DE',
      'joyn-distribution-tenant': 'JOYN',
      'joyn-client-version': '5.1370.0',
    },
  })
  if (!response.ok) return { status: 'http_' + response.status, path: normalizedPath, aliases: [] }
  const body = await response.json().catch(() => null)
  if (!body?.data || body?.errors?.length) {
    return { status: 'graphql_error', path: normalizedPath, aliases: [] }
  }
  return {
    status: 'ready',
    path: normalizedPath,
    aliases: collectJoynDetailAliases(body.data, null),
    data: body.data,
  }
}

export function trustedJoynSeriesDetailPaths(classification) {
  if (classification?.type !== 'series') return []
  const values = []

  if (classification?.reason === 'exact_joyn_search') {
    for (const result of Array.isArray(classification?.exactResults) ? classification.exactResults : []) {
      if (result?.type !== 'series' || String(result?.joynType || '').toUpperCase() !== 'SERIES') continue
      values.push(result?.fullPath, result?.path)
    }
  }

  const algolia = [
    classification?.algolia,
    classification?.algoliaBase,
    classification?.algoliaEpisode,
  ].filter(Boolean)
  for (const result of algolia) {
    if (result?.type !== 'series' || result?.reason !== 'validated_algolia_search') continue
    for (const evidence of Array.isArray(result?.evidence) ? result.evidence : []) {
      if (evidence?.type !== 'series') continue
      const joynType = String(evidence?.joynType || '').toUpperCase()
      if (joynType === 'SERIES') {
        values.push(evidence?.fullPath, evidence?.path, evidence?.seriesPath, evidence?.topLevelPath)
      } else if (joynType === 'EPISODE') {
        values.push(evidence?.seriesPath, evidence?.topLevelPath)
      }
    }
  }
  return [...new Set(values.map(joynText).filter(Boolean))].slice(0, 2)
}

function titleLookup(candidates) {
  const map = new Map()
  for (const candidate of candidates) {
    for (const value of [candidate?.title, candidate?.originalTitle, ...(candidate?.aliases || [])]) {
      const key = normalizeWaipuText(value)
      if (!key) continue
      if (!map.has(key)) map.set(key, new Map())
      map.get(key).set(`${candidate.type}:${candidate.tmdbId}`, candidate)
    }
  }
  return (title) => [...(map.get(normalizeWaipuText(title))?.values() || [])]
}

export function trustedJoynTitleAliases(classification, primaryTitle) {
  if (!['movie', 'series'].includes(classification?.type)) return []
  const algolia = [
    classification?.algolia,
    classification?.algoliaBase,
    classification?.algoliaEpisode,
  ].filter(Boolean)
  const values = []
  for (const result of algolia) {
    if (result?.type !== classification.type || result?.reason !== 'validated_algolia_search') continue
    for (const evidence of Array.isArray(result?.evidence) ? result.evidence : []) {
      if (evidence?.type !== classification.type) continue
      const joynType = String(evidence?.joynType || '').toUpperCase()
      if (classification.type === 'series') {
        if (joynType === 'EPISODE') {
          values.push(evidence?.topLevelTitleOv)
        } else if (joynType === 'SERIES') {
          values.push(evidence?.topLevelTitleOv, evidence?.titleOv)
        }
      } else if (classification.type === 'movie' && joynType === 'MOVIE') {
        values.push(evidence?.titleOv)
      }
    }
  }
  const primary = normalizeWaipuText(primaryTitle)
  return [...new Set(values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .filter((value) => normalizeWaipuText(value) !== primary))]
    .slice(0, 3)
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

export async function runJoynAdapterDiagnostic({
  fetchImpl = fetch,
  now = Date.now(),
  publicationOutput = resolve(root, 'artifacts/joyn-live'),
  sourceGenerationPrefix = 'joyn-diagnostic',
  fullHorizon = sourceGenerationPrefix === 'joyn-catalog',
} = {}) {
  const generatedAt = new Date(now).toISOString()
  const loaded = await loadJoynEpg(fetchImpl)
  let raw = loaded.data
  let epgSync = null
  if (fullHorizon) {
    const waipu = await readJson(resolve(root, 'public/waipu-live/index.json'), {})
    const waipuAt = Date.parse(waipu.generatedAt)
    const horizon = Number.isFinite(waipuAt) && waipuAt <= now && now - waipuAt < 12 * 3600000
      && Date.parse(waipu.horizon?.endExclusive) - Date.parse(waipu.horizon?.start) === 14 * 86400000
      ? waipu.horizon : joynImportHorizon(now)
    epgSync = await syncJoynEpg({
      streams: raw.liveStreams, now, horizon,
      directory: resolve(root, 'artifacts/joyn-sync'),
      maxRequests: Number(process.env.JOYN_EPG_REQUEST_BUDGET || 500),
      requestWindow: (from, to) => requestJoynEpgWindow({ fetchImpl, token: loaded.token, apiKey: loaded.apiKey, from, to }),
      onProgress: (metrics) => console.log(`Joyn EPG: ${metrics.windowsProcessed}/56 Fenster · ${metrics.requestsStarted} Requests · ${metrics.cacheHits} aus Cache`),
    })
    raw = { ...raw, liveStreams: epgSync.streams }
  }
  const algoliaKey = await loadJoynAlgoliaSearchKey({
    fetchImpl,
    token: loaded.token,
    apiKey: loaded.apiKey,
  }).catch(() => ({ key: null, status: 'error' }))

  const observer = new SourceSchemaObserver({
    sourceId: 'joyn-epg-upstream',
    policy: JOYN_EPG_UPSTREAM_FIELD_POLICY,
  })
  observer.observe(raw, { operation: OPERATION })
  const schemaReport = observer.report({ phase: 'diagnostic-complete' })

  const baseCandidates = normalizeJoynLiveChannelsAndEpg(raw)
  const candidateStarts = baseCandidates.map((candidate) => Date.parse(candidate.startTime)).filter(Number.isFinite)
  const candidateEnds = baseCandidates.map((candidate) => Date.parse(candidate.endTime)).filter(Number.isFinite)
  const v2Loaded = epgSync ? { data: { epgEventsV2: { items: epgSync.items } }, requests: epgSync.status.metrics.requestsStarted, status: 'ready' } : await loadJoynEpgV2({
    fetchImpl,
    token: loaded.token,
    apiKey: loaded.apiKey,
    fromMs: candidateStarts.length ? Math.min(...candidateStarts) : NaN,
    toMs: candidateEnds.length ? Math.max(...candidateEnds) : NaN,
  })
  const v2Enrichment = enrichJoynCandidatesWithV2(baseCandidates, v2Loaded.data)
  const allCandidates = v2Enrichment.entries
  const stationMapping = buildJoynStationMapping(raw?.liveStreams)
  const stationByJoynId = new Map(
    stationMapping.entries.map((entry) => [entry.joynId, entry]),
  )
  const mapped = allCandidates
    .map((candidate) => {
      const station = stationByJoynId.get(candidate.joynChannelId) || null
      const canonicalChannelId = station?.status === 'matched' ? station.canonicalId : null
      return {
        candidate,
        station,
        channelId: canonicalChannelId || `joyn.${candidate.joynChannelId}`,
        canonicalChannelId,
      }
    })
    .filter((entry) => entry.station && Date.parse(entry.candidate.endTime) > now)

  const [catalog, searchIndex, previousJoynTitles, waipuTitles] = await Promise.all([
    readJson(resolve(root, 'public/catalog.json'), { titles: [] }),
    readJson(resolve(root, 'public/search-index.json'), { entries: [] }),
    readJson(resolve(root, 'public/joyn-live/titles.json'), { entries: [] }),
    readJson(resolve(root, 'public/waipu-live/titles.json'), { entries: [] }),
  ])
  const sharedMetadata = sharedJoynTmdbMetadata([...waipuTitles.entries, ...previousJoynTitles.entries])
  const tmdbCandidates = localTmdbCandidates({ catalog, searchIndex, liveTitles: sharedMetadata })
  const candidatesFor = titleLookup(tmdbCandidates)

  const uniquePrograms = new Map()
  for (const entry of mapped) {
    if (!uniquePrograms.has(entry.candidate.joynProgramId)) uniquePrograms.set(entry.candidate.joynProgramId, entry)
  }

  const matchCachePath = resolve(root, 'artifacts/joyn-live/match-cache.json')
  const matchCache = await JoynMatchCache.load(matchCachePath, now)
  const lookupCachePath = resolve(root, 'artifacts/joyn-live/lookup-cache.json')
  const lookupCache = await JoynLookupCache.load(lookupCachePath, now)

  const tmdbSearch = process.env.TMDB_API_READ_TOKEN
    ? new JoynTmdbSearchClient({
      token: process.env.TMDB_API_READ_TOKEN,
      responseCache: { get: (key) => lookupCache.get('tmdb-search-v1', key), set: (key, value) => lookupCache.set('tmdb-search-v1', key, value) },
      language: process.env.TMDB_LANGUAGE || 'de-DE',
      maxRequests: Number(process.env.JOYN_TMDB_REQUEST_BUDGET || 6000),
      paceMs: Number(process.env.JOYN_TMDB_PACE_MS || 200),
      detailMaxRequests: Number(process.env.JOYN_TMDB_DETAIL_REQUEST_BUDGET || 300),
    })
    : null

  const decisions = new Map()
  const programDiagnostics = new Map()
  const rejected = {}
  const joynClassification = { movie: 0, series: 0, unknown: 0 }
  const algoliaClassification = { movie: 0, series: 0, unknown: 0 }
  const algoliaCache = new Map()
  const algoliaEpisodeCache = new Map()
  const algoliaRequestBudget = Math.max(0, Number(process.env.JOYN_ALGOLIA_REQUEST_BUDGET || 3600))
  const seriesDetailCache = new Map()
  const seriesDetailRequestBudget = Math.max(0, Number(process.env.JOYN_SERIES_DETAIL_REQUEST_BUDGET || 100))
  let algoliaRequests = 0
  let seriesDetailRequests = 0
  let seriesDetailAliasRetries = 0
  let seriesDetailMatches = 0
  let joynSearchRequests = 0
  let tmdbBudgetExhausted = false
  async function matchingProgress() {
    if (decisions.size % 100 !== 0 && decisions.size !== uniquePrograms.size) return
    const progress = { kind: 'joyn-matching-progress', generatedAt, updatedAt: new Date().toISOString(), status: 'running',
      processed: decisions.size, total: uniquePrograms.size, matchCacheHits: matchCache.hits,
      lookupCacheHits: lookupCache.hits, tmdbRequests: tmdbSearch?.requestsStarted || 0, algoliaRequests }
    console.log(`Joyn-Zuordnung: ${progress.processed}/${progress.total} Programme · ${progress.matchCacheHits} aus Cache · ${progress.tmdbRequests}/${tmdbSearch?.client?.maxRequests ?? 'nicht verfügbar'} TMDB · ${algoliaRequests}/${algoliaRequestBudget} Algolia`)
    await writeJson(resolve(root, 'artifacts/joyn-live/matching-progress.json'), progress)
  }
  try {
    for (const [programId, entry] of uniquePrograms) {
      const localCandidates = candidatesFor(entry.candidate.title)
      const cached = matchCache.get(entry.candidate, localCandidates)
      if (cached) {
        const diagnostic = { ...cached, joynProgramId: programId, channelId: entry.channelId,
          channelTitle: entry.candidate.channelTitle, startTime: entry.candidate.startTime, endTime: entry.candidate.endTime }
        decisions.set(programId, diagnostic.decision)
        programDiagnostics.set(programId, diagnostic)
        if (diagnostic.decision.status !== 'matched') rejected[diagnostic.decision.reason || 'unmatched'] = (rejected[diagnostic.decision.reason || 'unmatched'] || 0) + 1
        await matchingProgress()
        continue
      }
      const startMs = Date.parse(entry.candidate.startTime)
      const endMs = Date.parse(entry.candidate.endTime)
      const broadcastDurationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? (endMs - startMs) / 60_000
        : null

      let decision = await matchJoynProgram(
        {
          title: entry.candidate.title,
          description: entry.candidate.description,
          broadcastDurationMinutes,
        },
        { localCandidates, searchTmdb: null },
      )

      let joynType = null
      let joynClassificationResult = { type: null, reason: 'not_needed', exactTypes: [], exactCount: 0 }
      if (decision.status !== 'matched') {
        const classified = await lookupCache.lookup('joyn-title-v1', entry.candidate.title, async () => {
          joynSearchRequests += 1
          await new Promise(done => setTimeout(done, 100))
          return searchJoynTitle(entry.candidate.title, {
            fetchImpl,
            token: loaded.token,
            apiKey: loaded.apiKey,
          })
        })
        joynClassificationResult = classified
        joynType = classified.type

        let algoliaResult = { type: null, reason: 'not_needed', evidence: [] }
        const needsAlgoliaTitleResolution = Boolean(algoliaKey.key)
          && (
            !joynType
            || joynType === 'movie'
            || joynType === 'series'
          )
        if (needsAlgoliaTitleResolution) {
          const cacheKey = JSON.stringify([normalizeWaipuText(entry.candidate.title), normalizeWaipuText(entry.candidate.secondaryTitle)])
          if (algoliaCache.has(cacheKey)) {
            algoliaResult = algoliaCache.get(cacheKey)
          } else {
            const searched = await lookupCache.lookup('algolia-hits-v1', entry.candidate.title, async () => {
              if (algoliaRequests >= algoliaRequestBudget) return { hits: [], status: 'budget_exhausted' }
              algoliaRequests += 1
              await new Promise(done => setTimeout(done, 100))
              return searchJoynAlgoliaTitle(entry.candidate.title, { fetchImpl, searchApiKey: algoliaKey.key })
                .catch(() => ({ hits: [], status: 'error' }))
            })
            algoliaResult = searched.status === 'ready'
              ? classifyJoynAlgoliaHits({
                title: entry.candidate.title,
                secondaryTitle: entry.candidate.secondaryTitle,
              }, searched.hits)
              : { type: null, reason: 'algolia_' + searched.status, evidence: [] }
            algoliaCache.set(cacheKey, algoliaResult)
          }
        }

        let algoliaEpisodeResult = { type: null, reason: 'not_needed', evidence: [] }
        const needsEpisodeResolution = Boolean(entry.candidate.secondaryTitle)
          && algoliaKey.key
          && (
            !algoliaResult.type
            || (
              algoliaResult.type === 'series'
              && algoliaResult.seasonNumber === null
              && algoliaResult.episodeNumber === null
            )
          )
        if (needsEpisodeResolution) {
          const compoundQuery = [entry.candidate.title, entry.candidate.secondaryTitle]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .join(' ')
          const episodeCacheKey = normalizeWaipuText(compoundQuery)
          if (algoliaEpisodeCache.has(episodeCacheKey)) {
            algoliaEpisodeResult = algoliaEpisodeCache.get(episodeCacheKey)
          } else {
            const searched = await lookupCache.lookup('algolia-hits-v1', compoundQuery, async () => {
              if (algoliaRequests >= algoliaRequestBudget) return { hits: [], status: 'budget_exhausted' }
              algoliaRequests += 1
              await new Promise(done => setTimeout(done, 100))
              return searchJoynAlgoliaTitle(compoundQuery, { fetchImpl, searchApiKey: algoliaKey.key })
                .catch(() => ({ hits: [], status: 'error' }))
            })
            algoliaEpisodeResult = searched.status === 'ready'
              ? classifyJoynAlgoliaHits({
                title: entry.candidate.title,
                secondaryTitle: entry.candidate.secondaryTitle,
              }, searched.hits)
              : { type: null, reason: 'algolia_' + searched.status, evidence: [] }
            algoliaEpisodeCache.set(episodeCacheKey, algoliaEpisodeResult)
          }
        }

        const effectiveAlgolia = (
          algoliaEpisodeResult.type === 'series'
          && (
            algoliaEpisodeResult.seasonNumber !== null
            || algoliaEpisodeResult.episodeNumber !== null
            || algoliaEpisodeResult.seriesId
          )
        ) ? algoliaEpisodeResult : algoliaResult

        if (!joynType && effectiveAlgolia.type) {
          joynType = effectiveAlgolia.type
          joynClassificationResult = {
            ...classified,
            type: joynType,
            reason: effectiveAlgolia.reason,
            algolia: effectiveAlgolia,
            algoliaBase: algoliaResult,
            algoliaEpisode: algoliaEpisodeResult,
          }
        } else if (joynType && algoliaEpisodeResult.type === 'series') {
          joynClassificationResult = {
            ...classified,
            algolia: algoliaEpisodeResult,
            algoliaBase: algoliaResult.type === joynType ? algoliaResult : null,
            algoliaEpisode: algoliaEpisodeResult,
          }
        } else if (joynType && algoliaResult.type === joynType) {
          joynClassificationResult = {
            ...classified,
            algolia: algoliaResult,
            algoliaBase: algoliaResult,
            algoliaEpisode: algoliaEpisodeResult,
          }
        } else if (!joynType) {
          joynClassificationResult = {
            ...classified,
            algolia: effectiveAlgolia,
            algoliaBase: algoliaResult,
            algoliaEpisode: algoliaEpisodeResult,
          }
        }

        if (joynType) joynClassification[joynType] += 1
        else joynClassification.unknown += 1
        if (algoliaResult.reason === 'validated_algolia_search' && algoliaResult.type) {
          algoliaClassification[algoliaResult.type] += 1
        } else if (!joynType) {
          algoliaClassification.unknown += 1
        }

        if (tmdbSearch && tmdbBudgetExhausted && decision.status !== 'matched') {
          decision = {
            matcherVersion: 3,
            status: 'unmatched',
            reason: 'tmdb_search_skipped_budget',
            source: 'local',
            match: null,
          }
        } else {
          try {
            const trustedAliases = trustedJoynTitleAliases(joynClassificationResult, entry.candidate.title)
            decision = await matchJoynProgram(
              {
                title: entry.candidate.title,
                aliases: trustedAliases,
                description: entry.candidate.description,
                type: joynType,
                productionYear: joynClassificationResult?.algoliaBase?.productionYear
                  ?? joynClassificationResult?.algolia?.productionYear
                  ?? null,
                seasonNumber: joynClassificationResult?.algolia?.seasonNumber ?? null,
                episodeNumber: joynClassificationResult?.algolia?.episodeNumber ?? null,
                seriesId: joynClassificationResult?.algolia?.seriesId ?? null,
                broadcastDurationMinutes,
              },
              {
                localCandidates,
                searchTmdb: tmdbSearch
                  ? (input) => tmdbSearch.search(input)
                  : null,
                loadTmdbDetails: tmdbSearch
                  ? (candidate) => tmdbSearch.detail(candidate)
                  : null,
              },
            )
          } catch (error) {
            if (error?.code !== 'TMDB_REQUEST_BUDGET') throw error
            tmdbBudgetExhausted = true
            decision = {
              matcherVersion: 3,
              status: 'unmatched',
              reason: 'tmdb_budget_exhausted',
              source: 'local',
              match: null,
            }
          }
        }

        let seriesDetail = null
        if (
          decision.status !== 'matched'
          && ['no_candidate', 'below_threshold'].includes(decision.reason)
          && joynType === 'series'
          && tmdbSearch
          && !tmdbBudgetExhausted
        ) {
          const detailPaths = trustedJoynSeriesDetailPaths(joynClassificationResult)
          const detailPath = detailPaths[0] || null
          if (detailPath) {
            if (seriesDetailCache.has(detailPath)) {
              seriesDetail = seriesDetailCache.get(detailPath)
            } else {
              seriesDetail = await lookupCache.lookup('series-detail-v1', detailPath, async () => {
                if (seriesDetailRequests >= seriesDetailRequestBudget) return { status: 'budget_exhausted', path: detailPath, aliases: [] }
                seriesDetailRequests += 1
                await new Promise(done => setTimeout(done, 100))
                return loadJoynSeriesDetail(detailPath, { fetchImpl, token: loaded.token, apiKey: loaded.apiKey })
                  .catch(() => ({ status: 'error', path: detailPath, aliases: [] }))
              })
              seriesDetailCache.set(detailPath, seriesDetail)
            }

            const primary = normalizeWaipuText(entry.candidate.title)
            const detailAliases = [...new Set((seriesDetail?.aliases || [])
              .map((value) => String(value || '').trim())
              .filter(Boolean)
              .filter((value) => normalizeWaipuText(value) !== primary))]
              .slice(0, 3)

            if (detailAliases.length) {
              const baseAliases = trustedJoynTitleAliases(joynClassificationResult, entry.candidate.title)
              const aliases = [...new Set([...baseAliases, ...detailAliases])].slice(0, 3)
              seriesDetailAliasRetries += 1
              try {
                decision = await matchJoynProgram(
                  {
                    title: entry.candidate.title,
                    aliases,
                    description: entry.candidate.description,
                    type: joynType,
                    productionYear: joynClassificationResult?.algoliaBase?.productionYear
                      ?? joynClassificationResult?.algolia?.productionYear
                      ?? null,
                    seasonNumber: joynClassificationResult?.algolia?.seasonNumber ?? null,
                    episodeNumber: joynClassificationResult?.algolia?.episodeNumber ?? null,
                    seriesId: joynClassificationResult?.algolia?.seriesId ?? null,
                    broadcastDurationMinutes,
                  },
                  {
                    localCandidates,
                    searchTmdb: (input) => tmdbSearch.search(input),
                    loadTmdbDetails: (candidate) => tmdbSearch.detail(candidate),
                  },
                )
                if (decision.status === 'matched') seriesDetailMatches += 1
              } catch (error) {
                if (error?.code !== 'TMDB_REQUEST_BUDGET') throw error
                tmdbBudgetExhausted = true
                decision = {
                  matcherVersion: 3,
                  status: 'unmatched',
                  reason: 'tmdb_budget_exhausted',
                  source: 'local',
                  match: null,
                }
              }
            }
          }
        }

        joynClassificationResult = {
          ...joynClassificationResult,
          seriesDetail,
        }
      }

      programDiagnostics.set(programId, {
        joynProgramId: programId,
        title: entry.candidate.title,
        secondaryTitle: entry.candidate.secondaryTitle || null,
        channelId: entry.channelId,
        channelTitle: entry.candidate.channelTitle,
        startTime: entry.candidate.startTime,
        endTime: entry.candidate.endTime,
        broadcastDurationMinutes,
        epgV2Enriched: Boolean(entry.candidate.epgV2Enriched),
        hasDescription: Boolean(entry.candidate.description),
        description: entry.candidate.description || null,
        joynClassification: joynClassificationResult,
        trustedTitleAliases: trustedJoynTitleAliases(joynClassificationResult, entry.candidate.title),
        trustedSeriesDetailPaths: trustedJoynSeriesDetailPaths(joynClassificationResult),
        localCandidates: localCandidates.slice(0, 20).map((candidate) => ({
          tmdbId: candidate.tmdbId,
          type: candidate.type,
          title: candidate.title,
          originalTitle: candidate.originalTitle || null,
          year: candidate.year ?? null,
          hasDescription: Boolean(candidate.description),
        })),
        decision,
      })

      decisions.set(programId, decision)
      await matchingProgress()
      matchCache.set(entry.candidate, programDiagnostics.get(programId), localCandidates)
      if (fullHorizon && (tmdbBudgetExhausted || (decision.status !== 'matched'
          && JSON.stringify(joynClassificationResult).includes('budget_exhausted')))) {
        const error = new Error('Joyn matching budget reached; progress saved, retaining the last complete publication.')
        error.code = tmdbBudgetExhausted ? 'JOYN_TMDB_REQUEST_BUDGET' : 'JOYN_CLASSIFICATION_BUDGET'
        throw error
      }
      if (decisions.size % 100 === 0) {
        await matchCache.save(matchCachePath)
        await lookupCache.save(lookupCachePath)
      }
      if (decision.status !== 'matched') {
        rejected[decision.reason || 'unmatched'] = Number(rejected[decision.reason || 'unmatched'] || 0) + 1
      }
    }
  } catch (error) {
    await writeJson(resolve(root, 'artifacts/joyn-live/matching-progress.json'), {
      kind: 'joyn-matching-progress', generatedAt, status: 'failed',
      processed: decisions.size, total: uniquePrograms.size, matchCacheHits: matchCache.hits,
      lookupCacheHits: lookupCache.hits, tmdbRequests: tmdbSearch?.requestsStarted || 0,
      algoliaRequests, failure: { code: error.code || 'JOYN_MATCH_FAILED', message: error.message },
    })
    throw error
  } finally {
    await matchCache.save(matchCachePath)
    await lookupCache.save(lookupCachePath)
  }

  await writeJson(resolve(root, 'artifacts/joyn-live/matching-progress.json'), {
    kind: 'joyn-matching-progress', generatedAt, status: 'complete', processed: decisions.size, total: uniquePrograms.size,
    matchCacheHits: matchCache.hits, lookupCacheHits: lookupCache.hits, tmdbRequests: tmdbSearch?.requestsStarted || 0, algoliaRequests,
  })

  const events = []
  for (const entry of mapped) {
    const decision = decisions.get(entry.candidate.joynProgramId)
    if (decision?.status !== 'matched') continue
    const episodeEvidence = programDiagnostics.get(entry.candidate.joynProgramId)?.joynClassification?.algolia
    const event = mapJoynCandidateToBroadcastEvent(entry.candidate, {
      tmdbId: decision.match.tmdbId,
      type: decision.match.type,
      seasonNumber: episodeEvidence?.seasonNumber ?? null,
      episodeNumber: episodeEvidence?.episodeNumber ?? null,
    }, {
      channelId: entry.channelId,
      observedAt: generatedAt,
    })
    if (event && Date.parse(event.endAt) > now) events.push(event)
  }

  const envelope = buildJoynSourceEnvelope(events, {
    generatedAt,
    sourceGenerationId: `${sourceGenerationPrefix}:${generatedAt}`,
    sourceCoverage: {
      mode: 'all-joyn-stations',
      upstreamStreams: Array.isArray(raw?.liveStreams) ? raw.liveStreams.length : 0,
      upstreamPrograms: allCandidates.length,
      epgV2Status: v2Loaded.status,
      epgV2Requests: v2Loaded.requests,
      epgV2EnrichedPrograms: v2Enrichment.metrics.enriched,
      epgV2Descriptions: v2Enrichment.metrics.descriptions,
      canonicalMappedStreams: stationMapping.counts.matched,
      joynOnlyStreams: stationMapping.counts.unmatched + stationMapping.counts.ambiguous,
      candidatePrograms: mapped.length,
      uniquePrograms: uniquePrograms.size,
    },
  })

  const publication = buildJoynLivePublication({
    rawStreams: raw?.liveStreams,
    stationMapping,
    envelope,
    generatedAt,
  })
  if (epgSync) publication.index.import = { ...epgSync.status, coverage: epgSync.status.coverage }

  const tmdbMetadataClient = process.env.TMDB_API_READ_TOKEN
    ? new LiveTmdbMetadataClient({
      token: process.env.TMDB_API_READ_TOKEN,
      language: process.env.TMDB_LANGUAGE || 'de-DE',
      country: process.env.TMDB_COUNTRY || 'DE',
      maxRequests: Number(process.env.JOYN_TMDB_METADATA_REQUEST_BUDGET || 4000),
    })
    : null

  const metadataCachePath = resolve(root, 'artifacts/joyn-live/metadata-cache.json')
  const savedMetadata = await readJson(metadataCachePath, { kind: 'joyn-metadata-cache', schemaVersion: 1, entries: [] })
  if (savedMetadata.kind !== 'joyn-metadata-cache' || savedMetadata.schemaVersion !== 1 || !Array.isArray(savedMetadata.entries)) throw new Error('Invalid Joyn metadata cache.')
  const metadataCache = new Map(savedMetadata.entries.filter((entry) => now - Date.parse(entry.metadataUpdatedAt) < 30 * 86400000)
    .map((entry) => [`${entry.type}:${entry.tmdbId}`, entry]))
  let metadataWrites = Promise.resolve()
  let metadata
  try {
    metadata = await enrichLiveTitleMetadata(publication.titles.entries, {
      providerId: 'joyn',
      catalogTitles: catalog.titles,
      cachedTitles: [...sharedMetadata, ...metadataCache.values()],
      loadTitleMetadata: tmdbMetadataClient
        ? async (entry, updatedAt) => {
          const value = await tmdbMetadataClient.loadTitle(entry, updatedAt)
          metadataCache.set(`${entry.type}:${entry.tmdbId}`, value)
          if (tmdbMetadataClient.requestsStarted % 100 === 0) {
            metadataWrites = metadataWrites.then(() => writeJoynJson(metadataCachePath, { kind: 'joyn-metadata-cache', schemaVersion: 1, entries: [...metadataCache.values()] }))
            await metadataWrites
          }
          return value
        }
        : null,
      concurrency: Number(process.env.JOYN_TMDB_METADATA_CONCURRENCY || 3),
      cacheMaxAgeDays: Number(process.env.JOYN_TMDB_METADATA_MAX_AGE_DAYS || 30),
      changedTitleKeys: tmdbChangedTitleTimes(await readTmdbChangeSet()),
      onProgress: ({ processed, total, fromCatalog, fromCache, fetched }) => {
        process.stdout.write(
          `Joyn-TMDB-Metadaten: ${processed}/${total} vollständig`
          + ` · ${fromCatalog} aus Katalog · ${fromCache} aus Cache · ${fetched} neu geladen\n`,
        )
      },
    })
  } finally {
    await metadataWrites
    await writeJoynJson(metadataCachePath, { kind: 'joyn-metadata-cache', schemaVersion: 1, entries: [...metadataCache.values()] })
  }
  publication.titles.entries = metadata.entries
  publication.titles.count = metadata.entries.length
  publication.days = enrichJoynDayTitleMetadata(publication).days
  publication.index.metadata = {
    required: true,
    generatedAt: metadata.generatedAt,
    ...metadata.metrics,
  }
  publication.index.runtime = {
    ...(publication.index.runtime || {}),
    tmdbSearchRequests: tmdbSearch?.requestsStarted || 0,
    tmdbSearchBudget: tmdbSearch?.client?.maxRequests ?? null,
    matchCacheHits: matchCache.hits,
    lookupCacheHits: lookupCache.hits,
    tmdbMetadataRequests: tmdbMetadataClient?.requestsStarted || 0,
  }
  requireCompleteLiveTitleMetadata(publication.titles.entries)

  const playbackCoverage = envelope.records.reduce((counts, event) => {
    const joynRoutes = (Array.isArray(event?.playbackRoutes) ? event.playbackRoutes : [])
      .filter((route) => route?.providerId === 'joyn')
    if (!joynRoutes.length) {
      counts.withoutRoute += 1
      return counts
    }
    counts.withRoute += 1
    for (const route of joynRoutes) {
      const target = String(route?.target || '')
      if (/^https:\/\/www\.joyn\.de\/play\/live-tv\?channel_id=/.test(target)) counts.channelIdRoute += 1
      else if (/^https:\/\/www\.joyn\.de\/live-tv\//.test(target)) counts.legacyChannelSlug += 1
      else counts.other += 1
    }
    return counts
  }, {
    withRoute: 0,
    withoutRoute: 0,
    channelIdRoute: 0,
    legacyChannelSlug: 0,
    other: 0,
  })

  const unresolvedPrograms = [...programDiagnostics.values()]
    .filter((entry) => entry.decision?.status !== 'matched')
    .sort((left, right) => (
      String(left.decision?.reason || '').localeCompare(String(right.decision?.reason || ''))
      || String(left.title || '').localeCompare(String(right.title || ''), 'de')
    ))

  const joynClassificationReasons = [...programDiagnostics.values()].reduce((counts, entry) => {
    const reason = entry.joynClassification?.reason || 'unknown'
    counts[reason] = Number(counts[reason] || 0) + 1
    return counts
  }, {})

  const unresolvedByReason = unresolvedPrograms.reduce((counts, entry) => {
    const reason = entry.decision?.reason || 'unmatched'
    counts[reason] = Number(counts[reason] || 0) + 1
    return counts
  }, {})

  const unresolvedSignalCoverage = unresolvedPrograms.reduce((counts, entry) => {
    counts.total += 1
    if (entry.epgV2Enriched) counts.epgV2Enriched += 1
    if (entry.hasDescription) counts.withDescription += 1
    if (entry.secondaryTitle) counts.withSecondaryTitle += 1
    if (entry.localCandidates.length) counts.withLocalCandidates += 1
    if (entry.joynClassification?.type) counts.withJoynType += 1
    return counts
  }, {
    total: 0,
    epgV2Enriched: 0,
    withDescription: 0,
    withSecondaryTitle: 0,
    withLocalCandidates: 0,
    withJoynType: 0,
  })

  const summary = {
    schemaVersion: 1,
    kind: 'joyn-adapter-diagnostic',
    generatedAt,
    upstream: {
      streams: Array.isArray(raw?.liveStreams) ? raw.liveStreams.length : 0,
      programs: allCandidates.length,
      graphqlApiKeySource: loaded.apiKeySource || 'unknown',
      epgV2Status: v2Loaded.status,
      epgV2Requests: v2Loaded.requests,
      epgV2Programs: v2Enrichment.metrics.v2Programs,
      epgV2Enriched: v2Enrichment.metrics.enriched,
      epgV2Descriptions: v2Enrichment.metrics.descriptions,
      epgV2Images: v2Enrichment.metrics.images,
    },
    stationMapping: {
      ...stationMapping.counts,
      unmatchedStations: stationMapping.entries
        .filter((entry) => entry.status === 'unmatched')
        .map(({ joynId, joynTitle }) => ({ joynId, joynTitle })),
      ambiguousStations: stationMapping.entries
        .filter((entry) => entry.status === 'ambiguous')
        .map(({ joynId, joynTitle, candidates }) => ({ joynId, joynTitle, candidates })),
    },
    mapped: {
      broadcastRows: mapped.length,
      uniquePrograms: uniquePrograms.size,
      canonicalStationRows: mapped.filter((entry) => entry.canonicalChannelId).length,
      joynOnlyStationRows: mapped.filter((entry) => !entry.canonicalChannelId).length,
    },
    matching: {
      matchCacheHits: matchCache.hits,
      localTmdbCandidates: tmdbCandidates.length,
      matchedPrograms: [...decisions.values()].filter((d) => d.status === 'matched').length,
      localOnlyMatches: [...decisions.values()].filter((d) => d.status === 'matched' && d.source === 'local').length,
      searchAssistedMatches: [...decisions.values()].filter((d) => d.status === 'matched' && String(d.source || '').includes('local+tmdb-search')).length,
      yearAssistedMatches: [...decisions.values()].filter((d) => d.status === 'matched' && String(d.source || '').includes('+year')).length,
      descriptionAssistedMatches: [...decisions.values()].filter((d) => d.status === 'matched' && String(d.source || '').includes('+description')).length,
      durationAssistedMatches: [...decisions.values()].filter((d) => d.status === 'matched' && String(d.source || '').includes('+duration')).length,
      tmdbRequests: tmdbSearch?.requestsStarted || 0,
      tmdbDetailRequests: tmdbSearch?.detailRequestsStarted || 0,
      tmdbMetadataRequests: tmdbMetadataClient?.requestsStarted || 0,
      metadataComplete: metadata.metrics.complete,
      joynSearchRequests,
      joynClassification,
      algolia: {
        keyStatus: algoliaKey.status,
        requestBudget: algoliaRequestBudget,
        requests: algoliaRequests,
        cachedTitles: algoliaCache.size,
        cachedEpisodeQueries: algoliaEpisodeCache.size,
        classification: algoliaClassification,
      },
      seriesDetail: {
        requestBudget: seriesDetailRequestBudget,
        requests: seriesDetailRequests,
        cachedPaths: seriesDetailCache.size,
        aliasRetries: seriesDetailAliasRetries,
        matches: seriesDetailMatches,
      },
      joynClassificationReasons,
      tmdbBudgetExhausted,
      rejected,
      unresolvedByReason,
      unresolvedSignalCoverage,
    },
    playback: playbackCoverage,
    output: {
      broadcastEvents: envelope.records.length,
      publishedStations: publication.index.stationCount,
      publishedAirings: publication.index.airingCount,
      publishedDays: publication.index.days.length,
      sourceId: envelope.sourceId,
      contractVersion: envelope.contractVersion,
    },
    schema: schemaReport.summary,
  }

  await writeJson(resolve(root, 'artifacts/joyn-adapter/diagnostic.json'), summary)
  await writeJson(resolve(root, 'artifacts/joyn-adapter/unresolved-programs.json'), {
    schemaVersion: 1,
    kind: 'joyn-unresolved-programs',
    generatedAt,
    count: unresolvedPrograms.length,
    entries: unresolvedPrograms,
  })
  await writeJson(resolve(root, 'artifacts/joyn-adapter/station-mapping.json'), stationMapping)
  await writeJson(resolve(root, 'artifacts/source-adapters/joyn-v1-diagnostic.json'), envelope)
  await writeJoynLivePublication(publication, publicationOutput)
  await writeFieldDiscoveryReport(schemaReport, {
    jsonPath: resolve(root, 'artifacts/source-schema/joyn-epg-upstream.json'),
    markdownPath: resolve(root, 'artifacts/source-schema/joyn-epg-upstream.md'),
  })

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
  return { summary, envelope, publication }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runJoynAdapterDiagnostic().catch((error) => {
    process.stderr.write((error?.stack || String(error)) + '\n')
    process.exitCode = 1
  })
}
