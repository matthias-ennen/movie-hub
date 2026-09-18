import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const WAIPU_PROBE_HOSTS = new Set([
  'auth.waipu.tv',
  'web-proxy.waipu.tv',
  'user-stations.waipu.tv',
  'epg-cache.waipu.tv',
])
export const WAIPU_PROBE_HORIZON_DAYS = [0, 1, 3, 7, 14]
export const DEFAULT_MAX_STATIONS = 3
export const DEFAULT_MAX_DETAILS = 3
export const DEFAULT_MAX_REQUESTS = 180
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

const USER_AGENT = 'MovieHub-Waipu-Probe/0.1 (private read-only feasibility test)'
const DEVICE_AUTH_URL = 'https://auth.waipu.tv/oauth/device_authorization'
const TOKEN_URL = 'https://auth.waipu.tv/oauth/token'
const STATION_CONFIG_URL = 'https://web-proxy.waipu.tv/station-config'
const USER_STATIONS_URL = 'https://user-stations.waipu.tv/api/stations?omitted=false'

const SAFE_MESSAGES = Object.freeze({
  CONFIG_MISSING: 'Die autorisierte OAuth-Client-Authentifizierung fehlt.',
  CONFIG_INVALID: 'Die OAuth-Client-Authentifizierung ist ungültig formatiert.',
  REQUEST_BUDGET_EXCEEDED: 'Das festgelegte Request-Budget wurde überschritten.',
  HOST_NOT_ALLOWED: 'Ein nicht freigegebener API-Host wurde blockiert.',
  HTTPS_REQUIRED: 'Eine unverschlüsselte API-Adresse wurde blockiert.',
  NETWORK_ERROR: 'Eine API-Anfrage ist technisch fehlgeschlagen.',
  RESPONSE_TOO_LARGE: 'Eine API-Antwort überschreitet das Größenlimit.',
  RESPONSE_INVALID_JSON: 'Eine API-Antwort enthält kein gültiges JSON.',
  DEVICE_AUTH_FAILED: 'Der Geräte-Anmeldevorgang konnte nicht gestartet werden.',
  DEVICE_AUTH_INVALID: 'Die Geräte-Anmeldeantwort ist unvollständig.',
  DEVICE_AUTH_EXPIRED: 'Die Geräte-Anmeldung ist abgelaufen.',
  DEVICE_AUTH_DENIED: 'Die Geräte-Anmeldung wurde abgelehnt.',
  DEVICE_AUTH_ABORTED: 'Die Geräte-Anmeldung wurde abgebrochen.',
  TOKEN_FAILED: 'Die OAuth-Sitzung konnte nicht hergestellt werden.',
  REFRESH_FAILED: 'Die Token-Erneuerung ist fehlgeschlagen.',
  STATIONS_FAILED: 'Die persönliche Senderliste konnte nicht gelesen werden.',
  NO_VISIBLE_STATIONS: 'Das Konto liefert keine geeigneten sichtbaren Live-Sender.',
  EPG_FAILED: 'Es konnte kein aktuelles EPG-Fenster gelesen werden.',
  DETAILS_FAILED: 'Es konnte kein Programmdetail gelesen werden.',
  INTERNAL_ERROR: 'Der Diagnose-Lauf ist unerwartet fehlgeschlagen.',
})

export class WaipuProbeError extends Error {
  constructor(code, { stage = 'probe', status = null } = {}) {
    super(SAFE_MESSAGES[code] || SAFE_MESSAGES.INTERNAL_ERROR)
    this.name = 'WaipuProbeError'
    this.code = SAFE_MESSAGES[code] ? code : 'INTERNAL_ERROR'
    this.stage = stage
    this.status = Number.isInteger(status) ? status : null
  }
}

function integerOption(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort()
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function isTrue(value) {
  return value === true
}

export function validateProbeUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new WaipuProbeError('HOST_NOT_ALLOWED', { stage: 'request' })
  }
  if (url.protocol !== 'https:') {
    throw new WaipuProbeError('HTTPS_REQUIRED', { stage: 'request' })
  }
  if (!WAIPU_PROBE_HOSTS.has(url.hostname)) {
    throw new WaipuProbeError('HOST_NOT_ALLOWED', { stage: 'request' })
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

export function buildProbeWindows(now = new Date(), horizons = WAIPU_PROBE_HORIZON_DAYS) {
  const start = now instanceof Date ? new Date(now.getTime()) : new Date(now)
  if (!Number.isFinite(start.getTime())) throw new TypeError('Invalid probe time.')
  return [...new Set(horizons.map(Number))]
    .filter((days) => Number.isInteger(days) && days >= 0)
    .sort((left, right) => left - right)
    .map((days) => ({
      days,
      start: alignToFourHourUtcWindow(new Date(start.getTime() + days * 86_400_000)),
    }))
}

function stationConfigMap(stationConfig) {
  return new Map(safeArray(safeObject(stationConfig).stations)
    .map((station) => safeObject(station))
    .filter((station) => typeof station.id === 'string' && station.id.trim())
    .map((station) => [station.id.trim().toLowerCase(), station]))
}

function isVodStation(station, config) {
  if (isTrue(station.newTv) || isTrue(station.vod) || isTrue(config.newTv)) return true
  const feeds = safeArray(config.feeds).map((value) => String(value).toLowerCase())
  return feeds.some((feed) => feed.includes('vod') || feed.includes('newtv'))
}

export function summarizeStations(userStations, stationConfig, maxStations = DEFAULT_MAX_STATIONS) {
  const stations = safeArray(userStations).map((station) => safeObject(station))
  const configs = stationConfigMap(stationConfig)
  const selected = []
  const summary = {
    total: stations.length,
    locked: 0,
    omitted: 0,
    missingConfiguration: 0,
    vodOrNewTv: 0,
    visibleLive: 0,
    favorite: 0,
    representativeCount: 0,
  }

  for (const station of stations) {
    if (isTrue(station.locked)) summary.locked += 1
    if (isTrue(station.omitted) || station.visible === false) summary.omitted += 1
    if (isTrue(station.favorite)) summary.favorite += 1

    const stationId = typeof station.stationId === 'string' ? station.stationId.trim() : ''
    const config = configs.get(stationId.toLowerCase())
    if (!stationId || !config) {
      summary.missingConfiguration += 1
      continue
    }
    if (isVodStation(station, config)) {
      summary.vodOrNewTv += 1
      continue
    }
    if (isTrue(station.locked) || isTrue(station.omitted) || station.visible === false) continue

    summary.visibleLive += 1
    if (selected.length < maxStations) selected.push({ stationId })
  }
  summary.representativeCount = selected.length
  return { summary, selected }
}

function sanitizeFailure(error, fallbackStage = 'probe') {
  if (error instanceof WaipuProbeError) {
    return {
      stage: error.stage || fallbackStage,
      code: error.code,
      message: SAFE_MESSAGES[error.code],
      ...(error.status === null ? {} : { httpStatus: error.status }),
    }
  }
  return {
    stage: fallbackStage,
    code: 'INTERNAL_ERROR',
    message: SAFE_MESSAGES.INTERNAL_ERROR,
  }
}

function createMetrics(maxRequests) {
  return {
    maxRequests,
    total: 0,
    responseBytes: 0,
    byHost: {},
    byStatus: {},
  }
}

function recordRequestStart(metrics, url) {
  metrics.total += 1
  metrics.byHost[url.hostname] = (metrics.byHost[url.hostname] || 0) + 1
}

function recordResponse(metrics, status, bytes) {
  metrics.responseBytes += bytes
  metrics.byStatus[String(status)] = (metrics.byStatus[String(status)] || 0) + 1
}

function authorizationHeader(clientAuth) {
  const value = String(clientAuth || '').trim()
  if (!value) throw new WaipuProbeError('CONFIG_MISSING', { stage: 'configuration' })
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new WaipuProbeError('CONFIG_INVALID', { stage: 'configuration' })
  }
  return `Basic ${value}`
}

function createRequester({
  fetchImpl,
  metrics,
  maxResponseBytes,
  requestTimeoutMs,
}) {
  return async function requestJson(urlValue, init = {}) {
    const url = validateProbeUrl(urlValue)
    if (metrics.total >= metrics.maxRequests) {
      throw new WaipuProbeError('REQUEST_BUDGET_EXCEEDED', { stage: 'request' })
    }
    recordRequestStart(metrics, url)

    let response
    try {
      response = await fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal: init.signal || AbortSignal.timeout(requestTimeoutMs),
      })
    } catch (error) {
      if (error instanceof WaipuProbeError) throw error
      throw new WaipuProbeError('NETWORK_ERROR', { stage: 'request' })
    }

    const contentLength = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      throw new WaipuProbeError('RESPONSE_TOO_LARGE', {
        stage: 'request',
        status: response.status,
      })
    }

    let body
    try {
      const bytes = Buffer.from(await response.arrayBuffer())
      recordResponse(metrics, response.status, bytes.byteLength)
      if (bytes.byteLength > maxResponseBytes) {
        throw new WaipuProbeError('RESPONSE_TOO_LARGE', {
          stage: 'request',
          status: response.status,
        })
      }
      body = bytes.length ? JSON.parse(bytes.toString('utf8')) : null
    } catch (error) {
      if (error instanceof WaipuProbeError) throw error
      throw new WaipuProbeError('RESPONSE_INVALID_JSON', {
        stage: 'request',
        status: response.status,
      })
    }

    return { status: response.status, ok: response.ok, body }
  }
}

async function startDeviceAuthorization(requestJson, basicAuth, deviceId) {
  const response = await requestJson(DEVICE_AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ client_id: 'waipu', waipu_device_id: deviceId }),
  })
  if (!response.ok) {
    throw new WaipuProbeError('DEVICE_AUTH_FAILED', {
      stage: 'device-authorization',
      status: response.status,
    })
  }

  const body = safeObject(response.body)
  const required = ['verification_uri', 'user_code', 'device_code']
  if (required.some((key) => typeof body[key] !== 'string' || !body[key].trim())) {
    throw new WaipuProbeError('DEVICE_AUTH_INVALID', { stage: 'device-authorization' })
  }
  return {
    verificationUri: body.verification_uri,
    verificationUriComplete: typeof body.verification_uri_complete === 'string'
      ? body.verification_uri_complete
      : null,
    userCode: body.user_code,
    deviceCode: body.device_code,
    intervalSeconds: integerOption(body.interval, 5, { min: 1, max: 60 }),
    expiresInSeconds: integerOption(body.expires_in, 600, { min: 30, max: 3_600 }),
  }
}

async function pollDeviceToken({
  requestJson,
  basicAuth,
  deviceId,
  authorization,
  sleep,
  now,
  aborted,
}) {
  const deadline = now() + authorization.expiresInSeconds * 1_000
  let intervalSeconds = authorization.intervalSeconds
  while (now() < deadline) {
    if (aborted()) throw new WaipuProbeError('DEVICE_AUTH_ABORTED', { stage: 'token-poll' })
    await sleep(intervalSeconds * 1_000)
    const response = await requestJson(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({
        device_code: authorization.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        waipu_device_id: deviceId,
      }).toString(),
    })

    const body = safeObject(response.body)
    if (response.ok && typeof body.access_token === 'string' && typeof body.refresh_token === 'string') {
      return { accessToken: body.access_token, refreshToken: body.refresh_token }
    }

    if (body.error === 'authorization_pending') continue
    if (body.error === 'slow_down') {
      intervalSeconds = Math.min(60, intervalSeconds + 5)
      continue
    }
    if (body.error === 'access_denied') {
      throw new WaipuProbeError('DEVICE_AUTH_DENIED', {
        stage: 'token-poll',
        status: response.status,
      })
    }
    if (body.error === 'expired_token') {
      throw new WaipuProbeError('DEVICE_AUTH_EXPIRED', {
        stage: 'token-poll',
        status: response.status,
      })
    }
    throw new WaipuProbeError('TOKEN_FAILED', {
      stage: 'token-poll',
      status: response.status,
    })
  }
  throw new WaipuProbeError('DEVICE_AUTH_EXPIRED', { stage: 'token-poll' })
}

async function refreshTokens(requestJson, basicAuth, deviceId, tokens) {
  const response = await requestJson(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
      waipu_device_id: deviceId,
    }).toString(),
  })
  const body = safeObject(response.body)
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new WaipuProbeError('REFRESH_FAILED', {
      stage: 'token-refresh',
      status: response.status,
    })
  }
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' && body.refresh_token
      ? body.refresh_token
      : tokens.refreshToken,
    refreshTokenRotated: typeof body.refresh_token === 'string'
      && body.refresh_token !== tokens.refreshToken,
  }
}

async function authenticatedGet(requestJson, url, accessToken) {
  return requestJson(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  })
}

function gridPrograms(body) {
  return safeArray(body).map((program) => safeObject(program))
}

function programId(program) {
  const candidate = program.id ?? program.programId ?? program.uuid
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

async function runWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await task(items[index], index)
    }
  }
  const count = Math.min(items.length, Math.max(1, concurrency))
  await Promise.all(Array.from({ length: count }, () => worker()))
  return results
}

function emptyReport(generatedAt, options) {
  return {
    kind: 'waipu-account-feasibility-report',
    version: 1,
    generatedAt: generatedAt.toISOString(),
    scope: {
      readOnly: true,
      firestoreWrites: false,
      catalogWrites: false,
      streaming: false,
      recordings: false,
      drm: false,
      requestedHorizonDays: [...WAIPU_PROBE_HORIZON_DAYS],
    },
    security: {
      passwordRequested: false,
      tokensPersisted: false,
      rawResponsesPersisted: false,
      identifiersPersisted: false,
      oauthClientAuthenticationPersisted: false,
      hostAllowlist: [...WAIPU_PROBE_HOSTS].sort(),
    },
    oauth: {
      deviceAuthorizationStarted: false,
      deviceAuthorizationCompleted: false,
      refreshAttempted: false,
      refreshSucceeded: false,
      refreshTokenRotated: null,
    },
    stations: null,
    epg: {
      representativeStations: 0,
      windowsAttempted: 0,
      windowsSucceeded: 0,
      windowsWithPrograms: 0,
      programmeCount: 0,
      reachableHorizonDays: null,
      programmeFieldNames: [],
    },
    programDetails: {
      attempted: 0,
      succeeded: 0,
      fieldNames: [],
    },
    requests: createMetrics(options.maxRequests),
    quality: {
      status: 'running',
      feasible: false,
      reasons: [],
    },
    failure: null,
  }
}

function finalizeQuality(report) {
  const reasons = []
  if (!report.oauth.deviceAuthorizationCompleted) reasons.push('Device OAuth wurde nicht abgeschlossen.')
  if (!report.oauth.refreshSucceeded) reasons.push('Token-Refresh wurde nicht bestätigt.')
  if (!report.stations || report.stations.visibleLive < 1) reasons.push('Keine sichtbaren Live-Sender bestätigt.')
  if (!report.epg.horizons?.some((horizon) => horizon.days === 0 && horizon.programmeCount > 0)) {
    reasons.push('Kein aktuelles EPG-Fenster mit Programmen bestätigt.')
  }
  if (report.programDetails.succeeded < 1) reasons.push('Kein Programmdetail bestätigt.')
  report.quality = {
    status: reasons.length ? 'fail' : 'pass',
    feasible: reasons.length === 0,
    reasons,
  }
  return report
}

export async function runWaipuAccountProbe(options = {}) {
  const generatedAt = options.generatedAt ? new Date(options.generatedAt) : new Date()
  if (!Number.isFinite(generatedAt.getTime())) throw new TypeError('Invalid generatedAt.')
  const maxStations = integerOption(options.maxStations, DEFAULT_MAX_STATIONS, { min: 1, max: 5 })
  const maxDetails = integerOption(options.maxDetails, DEFAULT_MAX_DETAILS, { min: 1, max: 5 })
  const maxRequests = integerOption(options.maxRequests, DEFAULT_MAX_REQUESTS, { min: 10, max: 500 })
  const maxResponseBytes = integerOption(
    options.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    { min: 1024, max: 10 * 1024 * 1024 },
  )
  const requestTimeoutMs = integerOption(
    options.requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    { min: 100, max: 60_000 },
  )
  const concurrency = integerOption(options.concurrency, 1, { min: 1, max: 4 })
  const report = emptyReport(generatedAt, { maxRequests })
  const metrics = report.requests
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const sleep = options.sleep || ((milliseconds) => new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds)
  }))
  const now = options.now || Date.now
  const aborted = options.aborted || (() => false)
  const deviceId = options.deviceId || randomUUID()
  const outputPath = options.outputPath
    ? resolve(process.cwd(), options.outputPath)
    : resolve(root, 'artifacts/waipu-account-probe/report.json')
  let stage = 'configuration'

  try {
    const basicAuth = authorizationHeader(options.clientAuth)
    const requestJson = createRequester({
      fetchImpl,
      metrics,
      maxResponseBytes,
      requestTimeoutMs,
    })

    stage = 'device-authorization'
    const authorization = await startDeviceAuthorization(requestJson, basicAuth, deviceId)
    report.oauth.deviceAuthorizationStarted = true
    await options.onAuthorization?.({
      verificationUri: authorization.verificationUri,
      verificationUriComplete: authorization.verificationUriComplete,
      userCode: authorization.userCode,
      expiresInSeconds: authorization.expiresInSeconds,
    })

    stage = 'token-poll'
    let tokens = await pollDeviceToken({
      requestJson,
      basicAuth,
      deviceId,
      authorization,
      sleep,
      now,
      aborted,
    })
    report.oauth.deviceAuthorizationCompleted = true

    stage = 'token-refresh'
    report.oauth.refreshAttempted = true
    tokens = await refreshTokens(requestJson, basicAuth, deviceId, tokens)
    report.oauth.refreshSucceeded = true
    report.oauth.refreshTokenRotated = tokens.refreshTokenRotated

    stage = 'stations'
    const configResponse = await authenticatedGet(
      requestJson,
      STATION_CONFIG_URL,
      tokens.accessToken,
    )
    const stationsResponse = await authenticatedGet(
      requestJson,
      USER_STATIONS_URL,
      tokens.accessToken,
    )
    if (!configResponse.ok || !stationsResponse.ok) {
      throw new WaipuProbeError('STATIONS_FAILED', { stage: 'stations' })
    }
    const { summary, selected } = summarizeStations(
      stationsResponse.body,
      configResponse.body,
      maxStations,
    )
    report.stations = summary
    report.epg.representativeStations = selected.length
    if (!selected.length) throw new WaipuProbeError('NO_VISIBLE_STATIONS', { stage: 'stations' })

    stage = 'epg'
    const windows = buildProbeWindows(generatedAt)
    const gridTasks = selected.flatMap((station) => windows.map((window) => ({ station, window })))
    report.epg.windowsAttempted = gridTasks.length
    const detailIds = []
    const programmeFields = []
    const horizonStats = new Map(windows.map((window) => [window.days, {
      days: window.days,
      windowsAttempted: selected.length,
      windowsSucceeded: 0,
      programmeCount: 0,
    }]))

    const gridResults = await runWithConcurrency(gridTasks, concurrency, async ({ station, window }) => {
      const stationId = encodeURIComponent(station.stationId.toLowerCase())
      const timestamp = encodeURIComponent(window.start.toISOString())
      const response = await authenticatedGet(
        requestJson,
        `https://epg-cache.waipu.tv/api/grid/${stationId}/${timestamp}`,
        tokens.accessToken,
      )
      return { response, days: window.days }
    })

    for (const { response, days } of gridResults) {
      const horizon = horizonStats.get(days)
      if (!response.ok || !Array.isArray(response.body)) continue
      horizon.windowsSucceeded += 1
      report.epg.windowsSucceeded += 1
      const programs = gridPrograms(response.body)
      horizon.programmeCount += programs.length
      report.epg.programmeCount += programs.length
      if (programs.length) report.epg.windowsWithPrograms += 1
      for (const program of programs) {
        programmeFields.push(...Object.keys(program))
        const id = programId(program)
        if (id && detailIds.length < maxDetails && !detailIds.includes(id)) detailIds.push(id)
      }
    }
    report.epg.horizons = [...horizonStats.values()]
    report.epg.reachableHorizonDays = report.epg.horizons
      .filter((horizon) => horizon.programmeCount > 0)
      .reduce((maximum, horizon) => Math.max(maximum, horizon.days), -1)
    if (report.epg.reachableHorizonDays < 0) report.epg.reachableHorizonDays = null
    report.epg.programmeFieldNames = sortedUnique(programmeFields)
    if (!report.epg.horizons.some((horizon) => horizon.days === 0 && horizon.programmeCount > 0)) {
      throw new WaipuProbeError('EPG_FAILED', { stage: 'epg' })
    }

    stage = 'program-details'
    report.programDetails.attempted = detailIds.length
    const detailFields = []
    const detailResults = await runWithConcurrency(detailIds, concurrency, async (id) => (
      authenticatedGet(
        requestJson,
        `https://epg-cache.waipu.tv/api/programs/${encodeURIComponent(id)}`,
        tokens.accessToken,
      )
    ))
    for (const response of detailResults) {
      if (!response.ok || !response.body || typeof response.body !== 'object') continue
      report.programDetails.succeeded += 1
      detailFields.push(...Object.keys(response.body))
    }
    report.programDetails.fieldNames = sortedUnique(detailFields)
    if (report.programDetails.succeeded < 1) {
      throw new WaipuProbeError('DETAILS_FAILED', { stage: 'program-details' })
    }

    finalizeQuality(report)
    return report
  } catch (error) {
    report.failure = sanitizeFailure(error, stage)
    finalizeQuality(report)
    throw Object.assign(new WaipuProbeError(report.failure.code, {
      stage: report.failure.stage,
      status: report.failure.httpStatus,
    }), { report })
  } finally {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
}

function reportSummary(report, outputPath) {
  const horizon = report.epg.reachableHorizonDays === null
    ? 'nicht nachgewiesen'
    : `${report.epg.reachableHorizonDays} Tage`
  const lines = [
    '## Waipu account feasibility probe',
    '',
    `**Status:** ${report.quality.status.toUpperCase()}`,
    '',
    `- Requests: ${report.requests.total}/${report.requests.maxRequests}`,
    `- Sichtbare Live-Sender: ${report.stations?.visibleLive ?? 'nicht geprüft'}`,
    `- Repräsentative Sender: ${report.epg.representativeStations}`,
    `- EPG-Fenster erfolgreich: ${report.epg.windowsSucceeded}/${report.epg.windowsAttempted}`,
    `- Gemessener Horizont: ${horizon}`,
    `- Programmdetails erfolgreich: ${report.programDetails.succeeded}/${report.programDetails.attempted}`,
    `- Bericht: ${outputPath}`,
    ...(report.failure
      ? [`- Abbruch: ${report.failure.code} – ${report.failure.message}`]
      : []),
    '',
    ...report.quality.reasons.map((reason) => `- ${reason}`),
  ]
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputPath = process.env.WAIPU_PROBE_REPORT_PATH
    || 'artifacts/waipu-account-probe/report.json'
  let interrupted = false
  process.once('SIGINT', () => { interrupted = true })
  try {
    const report = await runWaipuAccountProbe({
      clientAuth: process.env.WAIPU_OAUTH_CLIENT_AUTH_B64,
      outputPath,
      maxStations: process.env.WAIPU_PROBE_MAX_STATIONS,
      maxDetails: process.env.WAIPU_PROBE_MAX_DETAILS,
      maxRequests: process.env.WAIPU_PROBE_MAX_REQUESTS,
      concurrency: process.env.WAIPU_PROBE_CONCURRENCY,
      aborted: () => interrupted,
      onAuthorization: ({ verificationUri, verificationUriComplete, userCode, expiresInSeconds }) => {
        console.log('Waipu-Geräteanmeldung gestartet.')
        console.log(`Öffnen: ${verificationUriComplete || verificationUri}`)
        console.log(`Code: ${userCode}`)
        console.log(`Gültig für höchstens ${expiresInSeconds} Sekunden.`)
      },
    })
    console.log(reportSummary(report, outputPath))
  } catch (error) {
    const report = error?.report
    if (report) console.error(reportSummary(report, outputPath))
    else console.error(SAFE_MESSAGES.INTERNAL_ERROR)
    process.exitCode = 2
  }
}
