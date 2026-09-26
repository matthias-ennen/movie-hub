import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const JOYN_BASE = 'https://www.joyn.de'
const AUTH_URL = 'https://auth.joyn.de/auth/anonymous'
const GRAPHQL_URL = 'https://api.joyn.de/graphql'
const OPERATION = 'LiveChannelsAndEpg'
const HASH = 'b7703103ddd0516be6b49ed66186092a6c6f6d815ccc502a9f50800a8cc18dd2'
// Public Joyn web-client key observed in the open-source GrayJay Joyn adapter.
// Diagnostic fallback only: never persist it to artifacts and do not treat it as a secret or stable contract.
const OBSERVED_PUBLIC_WEBCLIENT_KEY = '4f0fd9f18abbe3cf0e87fdb556bc39c8'

function baseHeaders() {
  return {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    origin: JOYN_BASE,
    referer: JOYN_BASE + '/',
    'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
  }
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`)
    error.status = response.status
    error.body = text.slice(0, 1000)
    throw error
  }
  return { response, text }
}

async function anonymousToken() {
  const { text } = await fetchText(AUTH_URL, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ client_id: 'web', client_name: 'joyn-web' }),
  })
  const data = JSON.parse(text)
  const token = data.access_token || data.accessToken
  if (!token) throw new Error('Joyn anonymous auth response contains no access token.')
  return { token, userId: data.userId || data.user_id || null }
}

function apiKeyCandidates(text) {
  const patterns = [
    /["']x-api-key["']\s*[:=]\s*["']([a-f0-9]{32})["']/gi,
    /["']xApiKey["']\s*[:=]\s*["']([a-f0-9]{32})["']/gi,
    /["']apiKey["']\s*[:=]\s*["']([a-f0-9]{32})["']/gi,
  ]
  const found = new Set()
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) found.add(match[1])
  }
  return [...found]
}

function scriptUrls(html) {
  const urls = []
  const pattern = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    try { urls.push(new URL(match[1], JOYN_BASE).href) } catch {}
  }
  return [...new Set(urls)]
}

async function discoverGraphqlApiKey() {
  const { text: html } = await fetchText(JOYN_BASE, { headers: baseHeaders() })
  const direct = apiKeyCandidates(html)
  if (direct.length) return { apiKey: direct[0], source: 'homepage' }

  const scripts = scriptUrls(html)
  for (const url of scripts.slice(0, 20)) {
    try {
      const { text } = await fetchText(url, { headers: baseHeaders() })
      const candidates = apiKeyCandidates(text)
      if (candidates.length) return { apiKey: candidates[0], source: 'public-script' }
    } catch {}
  }
  return {
    apiKey: OBSERVED_PUBLIC_WEBCLIENT_KEY,
    source: 'observed-public-webclient-fallback',
  }
}

function walk(value, path = '$', fields = new Map()) {
  if (Array.isArray(value)) {
    fields.set(path, { type: 'array', count: value.length })
    for (const item of value.slice(0, 3)) walk(item, path + '[]', fields)
    return fields
  }
  if (value && typeof value === 'object') {
    fields.set(path, { type: 'object' })
    for (const [key, child] of Object.entries(value)) walk(child, path === '$' ? key : path + '.' + key, fields)
    return fields
  }
  fields.set(path, { type: value === null ? 'null' : typeof value })
  return fields
}

function summarizeEpg(data) {
  const streams = Array.isArray(data?.liveStreams) ? data.liveStreams : []
  const typenameCounts = {}
  const channelSummaries = []
  let earliest = null
  let latest = null
  let totalEvents = 0

  for (const stream of streams) {
    const events = Array.isArray(stream?.epgEvents) ? stream.epgEvents : []
    totalEvents += events.length
    for (const event of events) {
      const program = event?.program || {}
      const typename = String(program?.__typename || 'unknown')
      typenameCounts[typename] = Number(typenameCounts[typename] || 0) + 1
      const start = Date.parse(program?.startDate || event?.startDate)
      const end = Date.parse(program?.endDate || event?.endDate)
      if (Number.isFinite(start)) earliest = earliest === null ? start : Math.min(earliest, start)
      if (Number.isFinite(end)) latest = latest === null ? end : Math.max(latest, end)
    }
    channelSummaries.push({
      id: String(stream?.id || ''),
      title: String(stream?.title || ''),
      eventCount: events.length,
      firstStart: events.length ? (events[0]?.program?.startDate || events[0]?.startDate || null) : null,
      lastEnd: events.length ? (events.at(-1)?.program?.endDate || events.at(-1)?.endDate || null) : null,
    })
  }

  return {
    liveStreamCount: streams.length,
    epgEventCount: totalEvents,
    programTypenames: Object.fromEntries(Object.entries(typenameCounts).sort(([a], [b]) => a.localeCompare(b))),
    earliestStart: earliest === null ? null : new Date(earliest).toISOString(),
    latestEnd: latest === null ? null : new Date(latest).toISOString(),
    channels: channelSummaries,
  }
}

function countLikelyPrograms(value) {
  let count = 0
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    const keys = Object.keys(node)
    if (
      keys.some((k) => /start(Time|At)?|begin/i.test(k)) &&
      keys.some((k) => /end(Time|At)?|stop/i.test(k)) &&
      keys.some((k) => /title|name/i.test(k))
    ) count += 1
    for (const child of Object.values(node)) visit(child)
  }
  visit(value)
  return count
}

async function run() {
  const outDir = resolve('artifacts/joyn-probe')
  await mkdir(outDir, { recursive: true })

  const report = {
    generatedAt: new Date().toISOString(),
    auth: { anonymous: false, userIdPresent: false },
    apiKey: { discovered: false, source: null },
    graphql: { operation: OPERATION, httpStatus: null, hasData: false, errorCount: 0 },
    schema: { fields: [], likelyProgramObjects: 0 },
  }

  try {
    const auth = await anonymousToken()
    report.auth = { anonymous: true, userIdPresent: Boolean(auth.userId) }

    const key = await discoverGraphqlApiKey()
    report.apiKey = { discovered: key.source !== 'observed-public-webclient-fallback', source: key.source }

    const params = new URLSearchParams()
    params.set('operationName', OPERATION)
    params.set('enable_user_location', 'true')
    params.set('watch_assistant_variant', 'true')
    params.set('variables', JSON.stringify({}))
    params.set('extensions', JSON.stringify({
      persistedQuery: { version: 1, sha256Hash: HASH },
    }))

    const response = await fetch(GRAPHQL_URL + '?' + params.toString(), {
      headers: {
        ...baseHeaders(),
        authorization: 'Bearer ' + auth.token,
        accept: 'application/json',
        'content-type': 'application/json',
        'x-api-key': key.apiKey,
        'joyn-platform': 'web',
        'joyn-country': 'DE',
        'joyn-distribution-tenant': 'JOYN',
        'joyn-client-version': '5.1370.0',
      },
    })

    report.graphql.httpStatus = response.status
    const bodyText = await response.text()
    let body = null
    try { body = JSON.parse(bodyText) } catch {}

    report.graphql.hasData = Boolean(body?.data)
    report.graphql.errorCount = Array.isArray(body?.errors) ? body.errors.length : 0
    if (body?.errors) {
      report.graphql.errors = body.errors.slice(0, 5).map((error) => ({
        message: String(error?.message || 'unknown').slice(0, 500),
        path: error?.path || null,
      }))
    }

    if (body?.data) {
      const fields = walk(body.data)
      report.schema.fields = [...fields.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, meta]) => ({ path, ...meta }))
      report.schema.likelyProgramObjects = countLikelyPrograms(body.data)
      report.epg = summarizeEpg(body.data)
    }
  } catch (error) {
    report.failure = {
      message: String(error?.message || error).slice(0, 1000),
      status: error?.status || null,
    }
  }

  await writeFile(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')

  if (!report.auth.anonymous || !report.graphql.hasData) {
    process.exitCode = 1
  }
}

await run()
