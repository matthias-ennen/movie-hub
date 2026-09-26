import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { localTmdbCandidates } from './waipu-live-catalog.mjs'
import { JoynTmdbSearchClient, matchJoynProgram } from './joyn-tmdb-matcher.mjs'
import { normalizeJoynLiveChannelsAndEpg } from '../src/sources/joyn/joynEpgNormalizer.js'
import { buildJoynStationMapping } from './joyn-station-mapping.mjs'
import { mapJoynCandidateToBroadcastEvent, buildJoynSourceEnvelope } from '../src/sources/adapters/joynContractMapper.js'
import { SourceSchemaObserver } from '../src/sources/sourceSchemaObserver.js'
import { JOYN_EPG_UPSTREAM_FIELD_POLICY } from '../src/sources/policies/joynUpstreamFieldPolicy.js'
import { writeFieldDiscoveryReport } from '../src/sources/fieldDiscoveryReport.js'
import { buildJoynLivePublication, writeJoynLivePublication } from './joyn-live-publication.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const JOYN_BASE = 'https://www.joyn.de'
const AUTH_URL = 'https://auth.joyn.de/auth/anonymous'
const GRAPHQL_URL = 'https://api.joyn.de/graphql'
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
const OBSERVED_PUBLIC_WEBCLIENT_KEY = '4f0fd9f18abbe3cf0e87fdb556bc39c8'

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
      const apiKey = process.env.JOYN_GRAPHQL_API_KEY || OBSERVED_PUBLIC_WEBCLIENT_KEY
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
      return { data: body.data, token, apiKey }
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts) await sleep(500 * (2 ** (attempt - 1)))
    }
  }
  throw lastError || new Error('Joyn GraphQL failed after retries.')
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
    ? { type: unique[0], reason: 'exact_joyn_search' }
    : { type: null, reason: unique.length > 1 ? 'ambiguous_joyn_search' : 'no_joyn_type' }
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

  const observer = new SourceSchemaObserver({
    sourceId: 'joyn-epg-upstream',
    policy: JOYN_EPG_UPSTREAM_FIELD_POLICY,
  })
  observer.observe(raw, { operation: OPERATION })
  const schemaReport = observer.report({ phase: 'diagnostic-complete' })

  const allCandidates = normalizeJoynLiveChannelsAndEpg(raw)
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

  const [catalog, searchIndex] = await Promise.all([
    readJson(resolve(root, 'public/catalog.json'), { titles: [] }),
    readJson(resolve(root, 'public/search-index.json'), { entries: [] }),
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
      maxRequests: Number(process.env.JOYN_TMDB_REQUEST_BUDGET || 120),
      paceMs: Number(process.env.JOYN_TMDB_PACE_MS || 200),
    })
    : null

  const decisions = new Map()
  const rejected = {}
  const joynClassification = { movie: 0, series: 0, unknown: 0 }
  let joynSearchRequests = 0
  let tmdbBudgetExhausted = false
  for (const [programId, entry] of uniquePrograms) {
    const localCandidates = candidatesFor(entry.candidate.title)
    let decision = await matchJoynProgram(
      { title: entry.candidate.title },
      { localCandidates, searchTmdb: null },
    )

    let joynType = null
    if (decision.status !== 'matched') {
      const classified = await searchJoynTitle(entry.candidate.title, {
        fetchImpl,
        token: loaded.token,
        apiKey: loaded.apiKey,
      })
      joynSearchRequests += 1
      joynType = classified.type
      if (joynType) joynClassification[joynType] += 1
      else joynClassification.unknown += 1

      try {
        decision = await matchJoynProgram(
          { title: entry.candidate.title, type: joynType },
          {
            localCandidates,
            searchTmdb: tmdbSearch && !tmdbBudgetExhausted
              ? (input) => tmdbSearch.search(input)
              : null,
          },
        )
      } catch (error) {
        if (error?.code !== 'TMDB_REQUEST_BUDGET') throw error
        tmdbBudgetExhausted = true
        decision = {
          matcherVersion: 1,
          status: 'unmatched',
          reason: 'tmdb_budget_exhausted',
          source: 'local',
          match: null,
        }
      }
    }

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

  const summary = {
    schemaVersion: 1,
    kind: 'joyn-adapter-diagnostic',
    generatedAt,
    upstream: {
      streams: Array.isArray(raw?.liveStreams) ? raw.liveStreams.length : 0,
      programs: allCandidates.length,
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
      searchAssistedMatches: [...decisions.values()].filter((d) => d.status === 'matched' && d.source === 'local+tmdb-search').length,
      tmdbRequests: tmdbSearch?.requestsStarted || 0,
      joynSearchRequests,
      joynClassification,
      tmdbBudgetExhausted,
      rejected,
    },
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
  await writeJson(resolve(root, 'artifacts/joyn-adapter/station-mapping.json'), stationMapping)
  await writeJson(resolve(root, 'artifacts/source-adapters/joyn-v1-diagnostic.json'), envelope)
  await writeJoynLivePublication(publication, resolve(root, 'artifacts/joyn-live'))
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
