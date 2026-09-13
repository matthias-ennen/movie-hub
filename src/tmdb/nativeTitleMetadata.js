import { normalizePersonalTmdbTitle } from './tmdbCatalogModel.js'

const pending = new Map()
let nextRequestId = 0
let handlerInstalled = false

function parsePayload(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function ensureResultHandler(target) {
  if (handlerInstalled || !target) return
  target.__movieHubTmdbTitleMetadataResult = (rawPayload) => {
    let payload
    try {
      payload = parsePayload(rawPayload)
    } catch {
      return
    }
    const request = pending.get(String(payload?.requestId || ''))
    if (!request) return
    pending.delete(String(payload.requestId))
    clearTimeout(request.timeoutId)
    if (!payload.ok || !payload.title) {
      request.resolve(null)
      return
    }
    try {
      request.resolve(normalizePersonalTmdbTitle({
        ...payload.title,
        syncedAt: payload.syncedAt || null,
        metadataUpdatedAt: payload.syncedAt || null,
      }))
    } catch {
      request.resolve(null)
    }
  }
  handlerInstalled = true
}

export function loadNativeTmdbTitleMetadata(item, {
  target = globalThis.window,
  timeoutMs = 25000,
} = {}) {
  const bridge = target?.MovieHubNative
  const tmdbId = Number(item?.tmdbId)
  if (typeof bridge?.requestTmdbTitleMetadata !== 'function'
    || !Number.isFinite(tmdbId)
    || tmdbId <= 0) return Promise.resolve(null)

  ensureResultHandler(target)
  const requestId = `title-${Date.now()}-${++nextRequestId}`
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pending.delete(requestId)
      resolve(null)
    }, timeoutMs)
    pending.set(requestId, { resolve, timeoutId })
    try {
      bridge.requestTmdbTitleMetadata(
        item?.type === 'series' || item?.mediaType === 'tv' ? 'tv' : 'movie',
        String(tmdbId),
        requestId,
      )
    } catch {
      clearTimeout(timeoutId)
      pending.delete(requestId)
      resolve(null)
    }
  })
}

export function resetNativeTitleMetadataForTests() {
  for (const request of pending.values()) clearTimeout(request.timeoutId)
  pending.clear()
  handlerInstalled = false
  nextRequestId = 0
}
