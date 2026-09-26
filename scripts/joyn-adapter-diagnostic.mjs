import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { localTmdbCandidates } from './waipu-live-catalog.mjs'
import { JoynTmdbSearchClient, matchJoynProgram } from './joyn-tmdb-matcher.mjs'
import { normalizeJoynLiveChannelsAndEpg } from '../src/sources/joyn/joynEpgNormalizer.js'
import { JOYN_PILOT_STATIONS } from '../src/sources/joyn/joynPilotStations.js'
import { mapJoynCandidateToBroadcastEvent, buildJoynSourceEnvelope } from '../src/sources/adapters/joynContractMapper.js'
import { SourceSchemaObserver } from '../src/sources/sourceSchemaObserver.js'
import { JOYN_EPG_UPSTREAM_FIELD_POLICY } from '../src/sources/policies/joynUpstreamFieldPolicy.js'
import { writeFieldDiscoveryReport } from '../src/sources/fieldDiscoveryReport.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const JOYN_BASE = 'https://www.joyn.de'
const AUTH_URL = 'https://auth.joyn.de/auth/anonymous'
const GRAPHQL_URL = 'https://api.joyn.de/graphql'
const OPERATION = 'LiveChannelsAndEpg'
const HASH = 'b7703103ddd0516be6b49ed66186092a6c6f6d815ccc502a9f50800a8cc18dd2'
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
  const params = new URLSearchParams()
  params.set('operationName', OPERATION)
  params.set('enable_user_location', 'true')
  params.set('watch_assistant_variant', 'true')
  params.set('variables', JSON.stringify({}))
  params.set('extensions', JSON.stringify({ persistedQuery: { version: 1, sha256Hash: HASH } }))

  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const token = await anonymousToken(fetchImpl)
      const response = await fetchImpl(GRAPHQL_URL + '?' + params.toString(), {
        headers: {
          ...headers(),
          authorization: 'Bearer ' + token,
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': process.env.JOYN_GRAPHQL_API_KEY || OBSERVED_PUBLIC_WEBCLIENT_KEY,
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
      return body.data
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts) await sleep(500 * (2 ** (attempt - 1)))
    }
  }
  throw lastError || new Error('Joyn GraphQL failed after retries.')
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

function stationLookup() {
  const map = new Map()
  for (const station of JOYN_PILOT_STATIONS) {
    map.set(normalizeWaipuText(station.name), station)
  }
  return (name) => map.get(normalizeWaipuText(name)) || null
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
  const raw = await loadJoynEpg(fetchImpl)

  const observer = new SourceSchemaObserver({
    sourceId: 'joyn-epg-upstream',
    policy: JOYN_EPG_UPSTREAM_FIELD_POLICY,
  })
  observer.observe(raw, { operation: OPERATION })
  const schemaReport = observer.report({ phase: 'diagnostic-complete' })

  const allCandidates = normalizeJoynLiveChannelsAndEpg(raw)
  const stationFor = stationLookup()
  const pilot = allCandidates
    .map((candidate) => ({ candidate, station: stationFor(candidate.channelTitle) }))
    .filter((entry) => entry.station)

  const [catalog, searchIndex] = await Promise.all([
    readJson(resolve(root, 'public/catalog.json'), { titles: [] }),
    readJson(resolve(root, 'public/search-index.json'), { entries: [] }),
  ])
  const tmdbCandidates = localTmdbCandidates({ catalog, searchIndex })
  const candidatesFor = titleLookup(tmdbCandidates)

  const uniquePrograms = new Map()
  for (const entry of pilot) {
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
  for (const [programId, entry] of uniquePrograms) {
    const decision = await matchJoynProgram(
      { title: entry.candidate.title },
      {
        localCandidates: candidatesFor(entry.candidate.title),
        searchTmdb: tmdbSearch ? (input) => tmdbSearch.search(input) : null,
      },
    )
    decisions.set(programId, decision)
    if (decision.status !== 'matched') {
      rejected[decision.reason || 'unmatched'] = Number(rejected[decision.reason || 'unmatched'] || 0) + 1
    }
  }

  const events = []
  for (const entry of pilot) {
    const decision = decisions.get(entry.candidate.joynProgramId)
    if (decision?.status !== 'matched') continue
    const event = mapJoynCandidateToBroadcastEvent(entry.candidate, {
      tmdbId: decision.best.candidate.tmdbId,
      type: decision.best.candidate.type,
    }, {
      channelId: entry.station.waipuStationId,
      observedAt: generatedAt,
    })
    if (event && Date.parse(event.endAt) > now) events.push(event)
  }

  const envelope = buildJoynSourceEnvelope(events, {
    generatedAt,
    sourceGenerationId: `joyn-diagnostic:${generatedAt}`,
    sourceCoverage: {
      mode: 'pilot-six-stations',
      upstreamStreams: Array.isArray(raw?.liveStreams) ? raw.liveStreams.length : 0,
      upstreamPrograms: allCandidates.length,
      pilotPrograms: pilot.length,
      uniquePilotPrograms: uniquePrograms.size,
    },
  })

  const summary = {
    schemaVersion: 1,
    kind: 'joyn-adapter-diagnostic',
    generatedAt,
    upstream: {
      streams: Array.isArray(raw?.liveStreams) ? raw.liveStreams.length : 0,
      programs: allCandidates.length,
    },
    pilot: {
      stationsConfigured: JOYN_PILOT_STATIONS.length,
      broadcastRows: pilot.length,
      uniquePrograms: uniquePrograms.size,
    },
    matching: {
      localTmdbCandidates: tmdbCandidates.length,
      matchedPrograms: [...decisions.values()].filter((d) => d.status === 'matched').length,
      localOnlyMatches: [...decisions.values()].filter((d) => d.status === 'matched' && d.source === 'local').length,
      searchAssistedMatches: [...decisions.values()].filter((d) => d.status === 'matched' && d.source === 'local+tmdb-search').length,
      tmdbRequests: tmdbSearch?.requestsStarted || 0,
      rejected,
    },
    output: {
      broadcastEvents: envelope.records.length,
      sourceId: envelope.sourceId,
      contractVersion: envelope.contractVersion,
    },
    schema: schemaReport.summary,
  }

  await writeJson(resolve(root, 'artifacts/joyn-adapter/diagnostic.json'), summary)
  await writeJson(resolve(root, 'artifacts/source-adapters/joyn-v1-diagnostic.json'), envelope)
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
