import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const WAIPU_PUBLIC_HORIZON_DAYS = Object.freeze([0, 7, 14])
export const DEFAULT_MAX_STATIONS = 3
export const DEFAULT_MAX_DETAILS = 2
export const DEFAULT_MAX_REQUESTS = 20
export const DEFAULT_PACE_MS = 1_000
export const DEFAULT_JITTER_MS = 250
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

const USER_AGENT = 'MovieHub-Waipu-Public-Contract-Probe/1.0 (read-only; contact via repository)'
const STATION_CONFIG_URL = 'https://web-proxy.waipu.tv/station-config'
const GRID_INFO_URL = 'https://epg-cache.waipu.tv/api/grid/info'

const SAFE_MESSAGES = Object.freeze({
  REQUEST_BUDGET_EXCEEDED: 'Das festgelegte Request-Budget wurde erreicht.',
  HTTPS_REQUIRED: 'Eine unverschlüsselte API-Adresse wurde blockiert.',
  ENDPOINT_NOT_ALLOWED: 'Ein nicht freigegebener Waipu-Endpunkt wurde blockiert.',
  METHOD_NOT_ALLOWED: 'Der öffentliche Prüf-Runner erlaubt ausschließlich GET-Anfragen.',
  AUTHORIZATION_FORBIDDEN: 'Der öffentliche Prüf-Runner darf keine Zugangsdaten senden.',
  NETWORK_ERROR: 'Eine API-Anfrage ist technisch fehlgeschlagen.',
  RESPONSE_TOO_LARGE: 'Eine API-Antwort überschreitet das Größenlimit.',
  RESPONSE_INVALID_JSON: 'Eine API-Antwort enthält kein gültiges JSON.',
  FORBIDDEN_STOP: 'Waipu hat den Zugriff abgewiesen. Der Lauf wurde sofort beendet.',
  RATE_LIMIT_STOP: 'Waipu hat eine Begrenzung signalisiert. Der Lauf wurde sofort beendet.',
  UPSTREAM_STOP: 'Waipu ist vorübergehend nicht verfügbar. Der Lauf wurde ohne Wiederholung beendet.',
  HTTP_ERROR: 'Waipu hat einen unerwarteten HTTP-Status geliefert.',
  STATION_SCHEMA_INVALID: 'Der Senderstamm entspricht nicht dem erwarteten Mindestvertrag.',
  GRID_INFO_INVALID: 'Die Grid-Konfiguration entspricht nicht dem erwarteten Mindestvertrag.',
  NO_REPRESENTATIVE_STATIONS: 'Es konnten nicht genügend repräsentative Sender gewählt werden.',
  GRID_SCHEMA_INVALID: 'Ein EPG-Fenster entspricht nicht dem erwarteten Mindestvertrag.',
  NO_PROGRAM_DETAILS: 'Es konnte kein geeignetes Programmdetail geprüft werden.',
  INTERNAL_ERROR: 'Der öffentliche Waipu-Vertragscheck ist unerwartet fehlgeschlagen.',
})

export class WaipuPublicProbeError extends Error {
  constructor(code, { stage = 'probe', status = null, retryAfterSeconds = null } = {}) {
    super(SAFE_MESSAGES[code] || SAFE_MESSAGES.INTERNAL_ERROR)
    this.name = 'WaipuPublicProbeError'
    this.code = SAFE_MESSAGES[code] ? code : 'INTERNAL_ERROR'
    this.stage = stage
    this.status = Number.isInteger(status) ? status : null
    this.retryAfterSeconds = Number.isInteger(retryAfterSeconds) ? retryAfterSeconds : null
  }
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function integerOption(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort()
}

function schemaFields(value) {
  if (Array.isArray(value)) return sortedUnique(value.flatMap((entry) => Object.keys(safeObject(entry))))
  return Object.keys(safeObject(value)).sort()
}

export function schemaHash(fields) {
  return createHash('sha256').update(sortedUnique(fields).join('\n')).digest('hex')
}

function endpointAllowed(url) {
  if (url.hostname === 'web-proxy.waipu.tv') return url.pathname === '/station-config'
  if (url.hostname !== 'epg-cache.waipu.tv') return false
  return url.pathname === '/api/grid/info'
    || /^\/api\/grid\/[^/]+\/[^/]+$/.test(url.pathname)
    || /^\/api\/programs\/[^/]+$/.test(url.pathname)
}

export function validatePublicProbeUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new WaipuPublicProbeError('ENDPOINT_NOT_ALLOWED', { stage: 'request' })
  }
  if (url.protocol !== 'https:') {
    throw new WaipuPublicProbeError('HTTPS_REQUIRED', { stage: 'request' })
  }
  if (url.username || url.password || url.search || !endpointAllowed(url)) {
    throw new WaipuPublicProbeError('ENDPOINT_NOT_ALLOWED', { stage: 'request' })
  }
  return url
}

export function alignToFourHourUtcWindow(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid date.')
  date.setUTCMinutes(0, 0, 0)
  date.setUTCHours(date.getUTCHours() - (date.getUTCHours() % 4))
  return date
}

export function buildPublicProbeWindows(now = new Date(), horizons = WAIPU_PUBLIC_HORIZON_DAYS) {
  const start = now instanceof Date ? new Date(now.getTime()) : new Date(now)
  if (!Number.isFinite(start.getTime())) throw new TypeError('Invalid probe time.')
  return [...new Set(horizons.map(Number)
    .filter((days) => Number.isInteger(days) && days >= 0))]
    .sort((left, right) => left - right)
    .map((days) => ({
      days,
      start: alignToFourHourUtcWindow(new Date(start.getTime() + days * 86_400_000)),
    }))
}

function stationArray(body) {
  if (Array.isArray(body)) return body
  const object = safeObject(body)
  return safeArray(object.stations || object.channels)
}

function stationIdentity(station) {
  const object = safeObject(station)
  const id = object.id ?? object.stationId ?? object.uuid
  const name = object.displayName ?? object.name ?? object.title
  if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) return null
  return { id: id.trim(), name: name.trim(), raw: object }
}

function stationClass(name) {
  if (/das erste|\bard\b|\bzdf\b/i.test(name)) return 'public-service'
  if (/\brtl\b|pro\s*7|prosieben|sat\.?\s*1/i.test(name)) return 'commercial'
  if (/\barte\b|\b3sat\b|phoenix/i.test(name)) return 'culture-information'
  return 'other'
}

export function selectRepresentativeStations(body, maximum = DEFAULT_MAX_STATIONS) {
  const identities = stationArray(body).map(stationIdentity).filter(Boolean)
  const selected = []
  const usedIds = new Set()
  const preferredClasses = ['public-service', 'commercial', 'culture-information']

  for (const targetClass of preferredClasses) {
    const match = identities.find((station) => (
      stationClass(station.name) === targetClass && !usedIds.has(station.id)
    ))
    if (match) {
      usedIds.add(match.id)
      selected.push({ stationId: match.id, displayName: match.name, stationClass: targetClass })
    }
    if (selected.length >= maximum) return selected
  }

  for (const station of identities) {
    if (usedIds.has(station.id)) continue
    usedIds.add(station.id)
    selected.push({
      stationId: station.id,
      displayName: station.name,
      stationClass: stationClass(station.name),
    })
    if (selected.length >= maximum) break
  }
  return selected
}

function gridPrograms(body) {
  if (Array.isArray(body)) return body.map(safeObject)
  return safeArray(safeObject(body).programs).map(safeObject)
}

function programId(program) {
  const candidate = program.id ?? program.programId ?? program.uuid
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

export function classifyGridProgram(program) {
  const object = safeObject(program)
  const searchable = [
    object.genre,
    object.mainGenre,
    object.type,
    object.category,
  ].filter(Boolean).join(' ').toLowerCase()
  if (object.seriesId || object.episodeTitle || /serie|series|episode/.test(searchable)) return 'series'
  if (/film|movie|cinema|spielfilm/.test(searchable)) return 'film'
  return 'unknown'
}

function parseRetryAfter(value, nowMilliseconds) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const date = Date.parse(value)
  if (!Number.isFinite(date)) return null
  return Math.max(0, Math.ceil((date - nowMilliseconds) / 1_000))
}

function cacheFacts(headers) {
  return {
    cacheControl: headers.get('cache-control') || null,
    hasEtag: Boolean(headers.get('etag')),
    hasLastModified: Boolean(headers.get('last-modified')),
    hasRateLimitHeader: [...headers.keys()].some((name) => /^(x-)?ratelimit/i.test(name)),
    hasRetryAfter: headers.has('retry-after'),
  }
}

function createMetrics(maxRequests, paceMs, jitterMs) {
  return {
    maxRequests,
    paceMs,
    jitterMs,
    concurrency: 1,
    total: 0,
    responseBytes: 0,
    byHost: {},
    byStatus: {},
  }
}

function sanitizeFailure(error, fallbackStage = 'probe') {
  if (error instanceof WaipuPublicProbeError) {
    return {
      stage: error.stage || fallbackStage,
      code: error.code,
      message: SAFE_MESSAGES[error.code],
      ...(error.status === null ? {} : { httpStatus: error.status }),
      ...(error.retryAfterSeconds === null ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
    }
  }
  return { stage: fallbackStage, code: 'INTERNAL_ERROR', message: SAFE_MESSAGES.INTERNAL_ERROR }
}

function createRequester({
  fetchImpl,
  metrics,
  paceMs,
  jitterMs,
  random,
  sleep,
  now,
  maxResponseBytes,
  requestTimeoutMs,
}) {
  let previousRequestStarted = false
  return async function requestJson(urlValue, init = {}) {
    const url = validatePublicProbeUrl(urlValue)
    const method = String(init.method || 'GET').toUpperCase()
    if (method !== 'GET') throw new WaipuPublicProbeError('METHOD_NOT_ALLOWED', { stage: 'request' })
    const headers = new Headers(init.headers || {})
    if (headers.has('authorization') || headers.has('cookie')) {
      throw new WaipuPublicProbeError('AUTHORIZATION_FORBIDDEN', { stage: 'request' })
    }
    if (metrics.total >= metrics.maxRequests) {
      throw new WaipuPublicProbeError('REQUEST_BUDGET_EXCEEDED', { stage: 'request' })
    }
    if (previousRequestStarted) {
      await sleep(paceMs + Math.floor(random() * (jitterMs + 1)))
    }
    previousRequestStarted = true
    headers.set('Accept', 'application/json')
    headers.set('User-Agent', USER_AGENT)
    metrics.total += 1
    metrics.byHost[url.hostname] = (metrics.byHost[url.hostname] || 0) + 1

    let response
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: init.signal || AbortSignal.timeout(requestTimeoutMs),
      })
    } catch (error) {
      if (error instanceof WaipuPublicProbeError) throw error
      throw new WaipuPublicProbeError('NETWORK_ERROR', { stage: 'request' })
    }

    metrics.byStatus[String(response.status)] = (metrics.byStatus[String(response.status)] || 0) + 1
    const facts = cacheFacts(response.headers)
    if (response.status === 403) {
      throw new WaipuPublicProbeError('FORBIDDEN_STOP', { stage: 'request', status: 403 })
    }
    if (response.status === 429) {
      throw new WaipuPublicProbeError('RATE_LIMIT_STOP', {
        stage: 'request',
        status: 429,
        retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after'), now()),
      })
    }
    if (response.status >= 500) {
      throw new WaipuPublicProbeError('UPSTREAM_STOP', { stage: 'request', status: response.status })
    }
    if (response.status === 304) return { status: 304, ok: true, body: null, headers: facts }
    if (!response.ok) {
      throw new WaipuPublicProbeError('HTTP_ERROR', { stage: 'request', status: response.status })
    }

    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      throw new WaipuPublicProbeError('RESPONSE_TOO_LARGE', {
        stage: 'request',
        status: response.status,
      })
    }

    let bytes
    try {
      bytes = Buffer.from(await response.arrayBuffer())
    } catch {
      throw new WaipuPublicProbeError('NETWORK_ERROR', { stage: 'request' })
    }
    metrics.responseBytes += bytes.byteLength
    if (bytes.byteLength > maxResponseBytes) {
      throw new WaipuPublicProbeError('RESPONSE_TOO_LARGE', {
        stage: 'request',
        status: response.status,
      })
    }
    try {
      return {
        status: response.status,
        ok: true,
        body: bytes.length ? JSON.parse(bytes.toString('utf8')) : null,
        headers: facts,
        etag: response.headers.get('etag') || null,
      }
    } catch {
      throw new WaipuPublicProbeError('RESPONSE_INVALID_JSON', {
        stage: 'request',
        status: response.status,
      })
    }
  }
}

export function buildRequestMatrix(stationCount = 398) {
  const counts = [...new Set([5, 20, 50, Number(stationCount)]
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((left, right) => left - right)
  return counts.map((stations) => ({
    stations,
    initialGridRequestsFor16Days: stations * 6 * 16,
    newOuterHorizonGridRequestsPerDay: stations * 6,
    programDetailRequests: 'nicht enthalten; dedupliziert und nur für Film-/Serienkandidaten',
  }))
}

function emptyReport(generatedAt, options) {
  return {
    kind: 'waipu-public-contract-report',
    version: 1,
    generatedAt: generatedAt.toISOString(),
    scope: {
      readOnly: true,
      authenticated: false,
      authorizationHeadersSent: false,
      catalogWrites: false,
      stressTest: false,
      requestedHorizonDays: [...WAIPU_PUBLIC_HORIZON_DAYS],
      maximumStations: options.maxStations,
      maximumProgramDetails: options.maxDetails,
    },
    stationConfig: null,
    gridInfo: null,
    representativeStations: [],
    grid: {
      windowsAttempted: 0,
      windowsSucceeded: 0,
      windowsWithPrograms: 0,
      programmeCount: 0,
      programmeFieldNames: [],
      programmeSchemaHash: null,
      horizons: [],
    },
    programDetails: {
      attempted: 0,
      succeeded: 0,
      types: { film: false, series: false, unknown: false },
      fieldNames: [],
      schemaHash: null,
    },
    conditionalRequests: { stationConfig304: false, grid304: false },
    requests: createMetrics(options.maxRequests, options.paceMs, options.jitterMs),
    requestMatrix: buildRequestMatrix(),
    quality: { status: 'running', feasible: false, reasons: [] },
    failure: null,
  }
}

function finalizeQuality(report) {
  const reasons = []
  if (!report.stationConfig || report.stationConfig.stationCount < 1) {
    reasons.push('Senderstamm nicht bestätigt.')
  }
  if (!report.gridInfo) reasons.push('Grid-Konfiguration nicht bestätigt.')
  if (report.representativeStations.length < 3) reasons.push('Weniger als drei Senderklassen geprüft.')
  for (const days of WAIPU_PUBLIC_HORIZON_DAYS) {
    const horizon = report.grid.horizons.find((entry) => entry.days === days)
    if (!horizon || horizon.windowsSucceeded < report.representativeStations.length) {
      reasons.push(`EPG-Horizont Tag ${days} nicht für alle Stichprobensender bestätigt.`)
    }
  }
  if (!report.conditionalRequests.stationConfig304) {
    reasons.push('ETag/304 für den Senderstamm nicht bestätigt.')
  }
  if (!report.conditionalRequests.grid304) reasons.push('ETag/304 für ein Grid-Fenster nicht bestätigt.')
  if (!report.programDetails.types.film) reasons.push('Kein Film-Programmdetail bestätigt.')
  if (!report.programDetails.types.series) reasons.push('Kein Serien-Programmdetail bestätigt.')
  report.quality = {
    status: reasons.length ? 'incomplete' : 'pass',
    feasible: reasons.length === 0,
    reasons,
  }
  return report
}

export async function runWaipuPublicContractProbe(options = {}) {
  const generatedAt = options.generatedAt ? new Date(options.generatedAt) : new Date()
  if (!Number.isFinite(generatedAt.getTime())) throw new TypeError('Invalid generatedAt.')
  const maxStations = integerOption(options.maxStations, DEFAULT_MAX_STATIONS, { min: 3, max: 5 })
  const maxDetails = integerOption(options.maxDetails, DEFAULT_MAX_DETAILS, { min: 2, max: 2 })
  const maxRequests = integerOption(options.maxRequests, DEFAULT_MAX_REQUESTS, { min: 1, max: 20 })
  const paceMs = integerOption(options.paceMs, DEFAULT_PACE_MS, { min: 750, max: 10_000 })
  const jitterMs = integerOption(options.jitterMs, DEFAULT_JITTER_MS, { min: 0, max: 2_000 })
  const maxResponseBytes = integerOption(
    options.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    { min: 1_024, max: 4 * 1024 * 1024 },
  )
  const requestTimeoutMs = integerOption(
    options.requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    { min: 1_000, max: 30_000 },
  )
  const outputPath = options.outputPath
    ? resolve(process.cwd(), options.outputPath)
    : resolve(root, 'artifacts/waipu-public-contract/report.json')
  const report = emptyReport(generatedAt, { maxStations, maxDetails, maxRequests, paceMs, jitterMs })
  const requestJson = createRequester({
    fetchImpl: options.fetchImpl || globalThis.fetch,
    metrics: report.requests,
    paceMs,
    jitterMs,
    random: options.random || Math.random,
    sleep: options.sleep || ((milliseconds) => new Promise((resolveSleep) => {
      setTimeout(resolveSleep, milliseconds)
    })),
    now: options.now || Date.now,
    maxResponseBytes,
    requestTimeoutMs,
  })
  let stage = 'station-config'

  try {
    const stationResponse = await requestJson(STATION_CONFIG_URL)
    const stations = stationArray(stationResponse.body)
    const identities = stations.map(stationIdentity).filter(Boolean)
    if (!identities.length) {
      throw new WaipuPublicProbeError('STATION_SCHEMA_INVALID', { stage })
    }
    const stationFields = schemaFields(stations)
    report.stationConfig = {
      stationCount: identities.length,
      fieldNames: stationFields,
      schemaHash: schemaHash(stationFields),
      cache: stationResponse.headers,
    }
    if (stationResponse.etag) {
      const conditional = await requestJson(STATION_CONFIG_URL, {
        headers: { 'If-None-Match': stationResponse.etag },
      })
      report.conditionalRequests.stationConfig304 = conditional.status === 304
    }

    stage = 'grid-info'
    const gridInfoResponse = await requestJson(GRID_INFO_URL)
    const gridInfoFields = schemaFields(gridInfoResponse.body)
    if (!gridInfoFields.length) throw new WaipuPublicProbeError('GRID_INFO_INVALID', { stage })
    report.gridInfo = {
      fieldNames: gridInfoFields,
      schemaHash: schemaHash(gridInfoFields),
      cache: gridInfoResponse.headers,
    }

    stage = 'station-selection'
    const selected = selectRepresentativeStations(stationResponse.body, maxStations)
    if (selected.length < 3) {
      throw new WaipuPublicProbeError('NO_REPRESENTATIVE_STATIONS', { stage })
    }
    report.representativeStations = selected

    stage = 'grid'
    const windows = buildPublicProbeWindows(generatedAt)
    const horizons = new Map(windows.map(({ days }) => [days, {
      days,
      windowsAttempted: selected.length,
      windowsSucceeded: 0,
      windowsWithPrograms: 0,
      programmeCount: 0,
    }]))
    const programmeFields = []
    const detailCandidates = new Map()
    let firstGridForConditional = null
    report.grid.windowsAttempted = selected.length * windows.length

    for (const station of selected) {
      for (const window of windows) {
        const gridUrl = `https://epg-cache.waipu.tv/api/grid/${encodeURIComponent(station.stationId)}/${encodeURIComponent(window.start.toISOString())}`
        const response = await requestJson(gridUrl)
        const programs = gridPrograms(response.body)
        const horizon = horizons.get(window.days)
        horizon.windowsSucceeded += 1
        horizon.programmeCount += programs.length
        report.grid.windowsSucceeded += 1
        report.grid.programmeCount += programs.length
        if (programs.length) {
          horizon.windowsWithPrograms += 1
          report.grid.windowsWithPrograms += 1
        }
        const fields = schemaFields(programs)
        if (programs.length && !fields.length) {
          throw new WaipuPublicProbeError('GRID_SCHEMA_INVALID', { stage })
        }
        programmeFields.push(...fields)
        for (const program of programs) {
          const id = programId(program)
          if (!id) continue
          const type = classifyGridProgram(program)
          if (!detailCandidates.has(type)) detailCandidates.set(type, id)
        }
        if (!firstGridForConditional && response.etag) {
          firstGridForConditional = { url: gridUrl, etag: response.etag }
        }
      }
    }
    report.grid.horizons = [...horizons.values()]
    report.grid.programmeFieldNames = sortedUnique(programmeFields)
    report.grid.programmeSchemaHash = schemaHash(report.grid.programmeFieldNames)

    if (firstGridForConditional) {
      const conditional = await requestJson(firstGridForConditional.url, {
        headers: { 'If-None-Match': firstGridForConditional.etag },
      })
      report.conditionalRequests.grid304 = conditional.status === 304
    }

    stage = 'program-details'
    const candidates = []
    for (const type of ['film', 'series', 'unknown']) {
      const id = detailCandidates.get(type)
      if (id && candidates.length < maxDetails) candidates.push({ id, type })
    }
    report.programDetails.attempted = candidates.length
    if (!candidates.length) throw new WaipuPublicProbeError('NO_PROGRAM_DETAILS', { stage })
    const detailFields = []
    for (const candidate of candidates) {
      const response = await requestJson(
        `https://epg-cache.waipu.tv/api/programs/${encodeURIComponent(candidate.id)}`,
      )
      if (!response.body || typeof response.body !== 'object') continue
      report.programDetails.succeeded += 1
      report.programDetails.types[candidate.type] = true
      detailFields.push(...schemaFields(response.body))
    }
    report.programDetails.fieldNames = sortedUnique(detailFields)
    report.programDetails.schemaHash = schemaHash(report.programDetails.fieldNames)
    finalizeQuality(report)
    return report
  } catch (error) {
    report.failure = sanitizeFailure(error, stage)
    finalizeQuality(report)
    throw Object.assign(new WaipuPublicProbeError(report.failure.code, {
      stage: report.failure.stage,
      status: report.failure.httpStatus,
      retryAfterSeconds: report.failure.retryAfterSeconds,
    }), { report })
  } finally {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
}

function reportSummary(report, outputPath) {
  const lines = [
    '## Waipu public contract probe',
    '',
    `**Status:** ${report.quality.status.toUpperCase()}`,
    '',
    `- Schonender Einzelclient: ja; Stress-/Lasttest: nein`,
    `- Requests: ${report.requests.total}/${report.requests.maxRequests}`,
    `- Parallelität: ${report.requests.concurrency}`,
    `- Mindestpause: ${report.requests.paceMs} ms + bis zu ${report.requests.jitterMs} ms Jitter`,
    `- Senderstamm: ${report.stationConfig?.stationCount ?? 'nicht bestätigt'}`,
    `- Stichprobensender: ${report.representativeStations.length}`,
    `- EPG-Fenster: ${report.grid.windowsSucceeded}/${report.grid.windowsAttempted}`,
    `- Programmdetails: ${report.programDetails.succeeded}/${report.programDetails.attempted}`,
    `- Senderstamm 304: ${report.conditionalRequests.stationConfig304 ? 'ja' : 'nein'}`,
    `- Grid 304: ${report.conditionalRequests.grid304 ? 'ja' : 'nein'}`,
    `- Bericht: ${outputPath}`,
    ...(report.failure ? [`- Abbruch: ${report.failure.code} – ${report.failure.message}`] : []),
    '',
    ...report.quality.reasons.map((reason) => `- ${reason}`),
  ]
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputPath = process.env.WAIPU_PUBLIC_PROBE_REPORT_PATH
    || 'artifacts/waipu-public-contract/report.json'
  try {
    const report = await runWaipuPublicContractProbe({
      outputPath,
      maxRequests: process.env.WAIPU_PUBLIC_PROBE_MAX_REQUESTS,
      paceMs: process.env.WAIPU_PUBLIC_PROBE_PACE_MS,
      jitterMs: process.env.WAIPU_PUBLIC_PROBE_JITTER_MS,
    })
    console.log(reportSummary(report, outputPath))
    if (!report.quality.feasible) process.exitCode = 2
  } catch (error) {
    const report = error?.report
    if (report) console.error(reportSummary(report, outputPath))
    else console.error(SAFE_MESSAGES.INTERNAL_ERROR)
    process.exitCode = 2
  }
}
