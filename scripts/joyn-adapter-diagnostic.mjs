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
import { JOYN_EPG_UPSTREAM_FIELD_POLICY } from '../src/sources/policies/joynUpstreamFieldPolicy.js'
import { writeFieldDiscoveryReport } from '../src/sources/fieldDiscoveryReport.js'
import { buildJoynLivePublication, writeJoynLivePublication } from './joyn-live-publication.mjs'
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

async function loadJoynEpg(fetchImpl = fetch, {
  maxAttempts = 3,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
} = {}) {
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const token = await anonymousToken(fetchImpl)
      const discoveredApiKey = await discoverJoynGraphqlApiKey(fetchImpl).catch(() => null)
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
  const exact = (Array.isArray(body?.data?.search?.results) ? body.data.search.results : [])
    .filter((result) => normalizeWaipuText(result?.title) === input)
    .map((result) => {
      if (result?.__typename === 'Movie') return 'movie'
      if (result?.__typename === 'Series' || result?.__typename === 'Episode') return 'series'
      return null
    })
    .filter(Boolean)
  const unique = [...new Set(exact)]
  return unique.length === 1
    ? { type: unique[0], reason: 'exact_joyn_search', exactTypes: unique, exactCount: exact.length }
    : {
      type: null,
      reason: unique.length > 1 ? 'ambiguous_joyn_search' : 'no_joyn_type',
      exactTypes: unique,
      exactCount: exact.length,
    }
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

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

export async function runJoynAdapterDiagnostic({
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  const generatedAt = new Date(now).toISOString()
  const loaded = await loadJoynEpg(fetchImpl)
  const raw = loaded.data
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
  const v2Loaded = await loadJoynEpgV2({
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
    .filter((entry) => entry.station)

  const [catalog, searchIndex, previousJoynTitles] = await Promise.all([
    readJson(resolve(root, 'public/catalog.json'), { titles: [] }),
    readJson(resolve(root, 'public/search-index.json'), { entries: [] }),
    readJson(resolve(root, 'public/joyn-live/titles.json'), { entries: [] }),
  ])
  const tmdbCandidates = localTmdbCandidates({ catalog, searchIndex })
  const candidatesFor = titleLookup(tmdbCandidates)

  const uniquePrograms = new Map()
  for (const entry of mapped) {
    if (!uniquePrograms.has(entry.candidate.joynProgramId)) uniquePrograms.set(entry.candidate.joynProgramId, entry)
  }

  const tmdbSearch = process.env.TMDB_API_READ_TOKEN
    ? new JoynTmdbSearchClient({
      token: process.env.TMDB_API_READ_TOKEN,
      language: process.env.TMDB_LANGUAGE || 'de-DE',
      maxRequests: Number(process.env.JOYN_TMDB_REQUEST_BUDGET || 3600),
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
  const algoliaRequestBudget = Math.max(0, Number(process.env.JOYN_ALGOLIA_REQUEST_BUDGET || 800))
  let algoliaRequests = 0
  let joynSearchRequests = 0
  let tmdbBudgetExhausted = false
  for (const [programId, entry] of uniquePrograms) {
    const localCandidates = candidatesFor(entry.candidate.title)
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
      const classified = await searchJoynTitle(entry.candidate.title, {
        fetchImpl,
        token: loaded.token,
        apiKey: loaded.apiKey,
      })
      joynSearchRequests += 1
      joynClassificationResult = classified
      joynType = classified.type

      let algoliaResult = { type: null, reason: 'not_needed', evidence: [] }
      if (!joynType && algoliaKey.key) {
        const cacheKey = normalizeWaipuText(entry.candidate.title)
        if (algoliaCache.has(cacheKey)) {
          algoliaResult = algoliaCache.get(cacheKey)
        } else if (algoliaRequests < algoliaRequestBudget) {
          const searched = await searchJoynAlgoliaTitle(entry.candidate.title, {
            fetchImpl,
            searchApiKey: algoliaKey.key,
          }).catch(() => ({ hits: [], status: 'error' }))
          algoliaRequests += 1
          algoliaResult = searched.status === 'ready'
            ? classifyJoynAlgoliaHits({
              title: entry.candidate.title,
              secondaryTitle: entry.candidate.secondaryTitle,
            }, searched.hits)
            : { type: null, reason: 'algolia_' + searched.status, evidence: [] }
          algoliaCache.set(cacheKey, algoliaResult)
        } else {
          algoliaResult = { type: null, reason: 'algolia_budget_exhausted', evidence: [] }
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
        } else if (algoliaRequests < algoliaRequestBudget) {
          const searched = await searchJoynAlgoliaTitle(compoundQuery, {
            fetchImpl,
            searchApiKey: algoliaKey.key,
          }).catch(() => ({ hits: [], status: 'error' }))
          algoliaRequests += 1
          algoliaEpisodeResult = searched.status === 'ready'
            ? classifyJoynAlgoliaHits({
              title: entry.candidate.title,
              secondaryTitle: entry.candidate.secondaryTitle,
            }, searched.hits)
            : { type: null, reason: 'algolia_' + searched.status, evidence: [] }
          algoliaEpisodeCache.set(episodeCacheKey, algoliaEpisodeResult)
        } else {
          algoliaEpisodeResult = { type: null, reason: 'algolia_budget_exhausted', evidence: [] }
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
          decision = await matchJoynProgram(
            {
              title: entry.candidate.title,
              description: entry.candidate.description,
              type: joynType,
              productionYear: joynClassificationResult?.algolia?.productionYear ?? null,
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
    if (decision.status !== 'matched') {
      rejected[decision.reason || 'unmatched'] = Number(rejected[decision.reason || 'unmatched'] || 0) + 1
    }
  }

  const events = []
  for (const entry of mapped) {
    const decision = decisions.get(entry.candidate.joynProgramId)
    if (decision?.status !== 'matched') continue
    const event = mapJoynCandidateToBroadcastEvent(entry.candidate, {
      tmdbId: decision.match.tmdbId,
      type: decision.match.type,
    }, {
      channelId: entry.channelId,
      observedAt: generatedAt,
    })
    if (event && Date.parse(event.endAt) > now) events.push(event)
  }

  const envelope = buildJoynSourceEnvelope(events, {
    generatedAt,
    sourceGenerationId: `joyn-diagnostic:${generatedAt}`,
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

  const tmdbMetadataClient = process.env.TMDB_API_READ_TOKEN
    ? new LiveTmdbMetadataClient({
      token: process.env.TMDB_API_READ_TOKEN,
      language: process.env.TMDB_LANGUAGE || 'de-DE',
      country: process.env.TMDB_COUNTRY || 'DE',
      maxRequests: Number(process.env.JOYN_TMDB_METADATA_REQUEST_BUDGET || 4000),
    })
    : null

  const metadata = await enrichLiveTitleMetadata(publication.titles.entries, {
    providerId: 'joyn',
    catalogTitles: catalog.titles,
    cachedTitles: previousJoynTitles.entries,
    loadTitleMetadata: tmdbMetadataClient
      ? (entry, updatedAt) => tmdbMetadataClient.loadTitle(entry, updatedAt)
      : null,
    concurrency: Number(process.env.JOYN_TMDB_METADATA_CONCURRENCY || 3),
    cacheMaxAgeDays: Number(process.env.JOYN_TMDB_METADATA_MAX_AGE_DAYS || 30),
    onProgress: ({ processed, total, fromCatalog, fromCache, fetched }) => {
      process.stdout.write(
        `Joyn-TMDB-Metadaten: ${processed}/${total} vollständig`
        + ` · ${fromCatalog} aus Katalog · ${fromCache} aus Cache · ${fetched} neu geladen\n`,
      )
    },
  })
  publication.titles.entries = metadata.entries
  publication.titles.count = metadata.entries.length
  publication.index.metadata = {
    required: true,
    generatedAt: metadata.generatedAt,
    ...metadata.metrics,
  }
  publication.index.runtime = {
    ...(publication.index.runtime || {}),
    tmdbSearchRequests: tmdbSearch?.requestsStarted || 0,
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
      if (/^https:\/\/www\.joyn\.de\/live-tv\//.test(target)) counts.confirmedChannelSlug += 1
      else if (/^https:\/\/www\.joyn\.de\/play\/live-tv\?channel_id=/.test(target)) counts.channelIdFallback += 1
      else counts.other += 1
    }
    return counts
  }, {
    withRoute: 0,
    withoutRoute: 0,
    confirmedChannelSlug: 0,
    channelIdFallback: 0,
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
  await writeJoynLivePublication(
    publication,
    resolve(root, process.env.JOYN_LIVE_OUTPUT || 'artifacts/joyn-live'),
  )
  await writeFieldDiscoveryReport(schemaReport, {
    jsonPath: resolve(root, 'artifacts/source-schema/joyn-epg-upstream.json'),
    markdownPath: resolve(root, 'artifacts/source-schema/joyn-epg-upstream.md'),
  })

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
  return { summary, envelope }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runJoynAdapterDiagnostic().catch((error) => {
    process.stderr.write((error?.stack || String(error)) + '\n')
    process.exitCode = 1
  })
}
