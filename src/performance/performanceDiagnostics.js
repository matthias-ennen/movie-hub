const MAX_EVENTS = 200
const MAX_RESOURCES = 120
const events = []
const spans = new Map()

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function round(value) {
  return Math.round(Number(value) * 100) / 100
}

function safePrimitive(value) {
  if (value === null || value === undefined) return value ?? null
  if (typeof value === 'string') return value.slice(0, 120)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  return null
}

function sanitizeDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {}
  return Object.fromEntries(Object.entries(detail)
    .slice(0, 20)
    .map(([key, value]) => [String(key).slice(0, 80), safePrimitive(value)]))
}

function trimEvents() {
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
}

function safeResourcePath(name) {
  try {
    const url = new URL(name, globalThis.location?.origin || 'https://movie-hub.invalid')
    const path = url.pathname
    const allowed = [
      '/catalog.json',
      '/search-index.json',
      '/live-availability-index.json',
      '/tv-14-days-summary.json',
      '/tv-runtime/',
      '/waipu-live/',
      '/joyn-live/',
      '/assets/',
    ]
    return allowed.some((prefix) => path === prefix || path.startsWith(prefix)) ? path : null
  } catch {
    return null
  }
}

function resourceSnapshot() {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return []
  return performance.getEntriesByType('resource')
    .map((entry) => {
      const path = safeResourcePath(entry.name)
      if (!path) return null
      return {
        path,
        initiatorType: String(entry.initiatorType || ''),
        startTimeMs: round(entry.startTime),
        durationMs: round(entry.duration),
        transferSize: Number(entry.transferSize) || 0,
        encodedBodySize: Number(entry.encodedBodySize) || 0,
        decodedBodySize: Number(entry.decodedBodySize) || 0,
      }
    })
    .filter(Boolean)
    .slice(-MAX_RESOURCES)
}

export function recordPerformanceEvent(name, detail = {}) {
  const normalizedName = String(name || '').trim().slice(0, 100)
  if (!normalizedName) return null
  const safeDetail = sanitizeDetail(detail)
  const event = {
    name: normalizedName,
    atMs: round(now()),
    detail: safeDetail,
  }
  events.push(event)
  trimEvents()

  try {
    performance?.mark?.(`moviehub:${normalizedName}`, { detail: safeDetail })
  } catch {
    // Older WebViews may not support PerformanceMarkOptions.detail.
    try { performance?.mark?.(`moviehub:${normalizedName}`) } catch { /* diagnostics only */ }
  }
  return event
}

export function startPerformanceSpan(name, key, detail = {}) {
  const spanName = String(name || '').trim().slice(0, 100)
  const spanKey = String(key ?? '').slice(0, 160)
  if (!spanName || !spanKey) return false
  spans.set(`${spanName}:${spanKey}`, {
    name: spanName,
    key: spanKey,
    startedAt: now(),
    detail: sanitizeDetail(detail),
  })
  recordPerformanceEvent(`${spanName}:start`, detail)
  return true
}

export function finishPerformanceSpan(name, key, detail = {}) {
  const spanName = String(name || '').trim().slice(0, 100)
  const spanKey = String(key ?? '').slice(0, 160)
  const id = `${spanName}:${spanKey}`
  const span = spans.get(id)
  if (!span) return null
  spans.delete(id)
  const durationMs = round(now() - span.startedAt)
  return recordPerformanceEvent(`${spanName}:ready`, {
    ...span.detail,
    ...sanitizeDetail(detail),
    durationMs,
  })
}

export function cancelPerformanceSpan(name, key, detail = {}) {
  const spanName = String(name || '').trim().slice(0, 100)
  const spanKey = String(key ?? '').slice(0, 160)
  const id = `${spanName}:${spanKey}`
  const span = spans.get(id)
  if (!span) return null
  spans.delete(id)
  return recordPerformanceEvent(`${spanName}:cancel`, {
    ...span.detail,
    ...sanitizeDetail(detail),
    durationMs: round(now() - span.startedAt),
  })
}

export function getPerformanceDiagnosticsSnapshot() {
  return {
    capturedAt: new Date().toISOString(),
    timeOrigin: Number(performance?.timeOrigin) || null,
    events: events.map((event) => ({ ...event, detail: { ...event.detail } })),
    resources: resourceSnapshot(),
    activeSpanCount: spans.size,
  }
}

export function clearPerformanceDiagnostics() {
  events.length = 0
  spans.clear()
}

export function installPerformanceDiagnostics(target = globalThis.window) {
  if (!target || target.__movieHubPerformance) return target?.__movieHubPerformance || null
  const api = Object.freeze({
    snapshot: getPerformanceDiagnosticsSnapshot,
    clear: clearPerformanceDiagnostics,
  })
  Object.defineProperty(target, '__movieHubPerformance', {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  })
  return api
}
