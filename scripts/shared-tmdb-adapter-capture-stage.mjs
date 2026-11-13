/**
 * #336 G1i: explicit private-stage capture on the ORIGINAL Waipu and Joyn
 * TMDB transports. No reuse is permitted here: cache.get is always a miss
 * for Waipu, while Joyn keeps its original JoynLookupCache as first/only read.
 *
 * The original clients may submit newly fetched validated TMDB search
 * RESPONSES to an optional private, bounded store. This is NOT an EPG identity
 * decision and does not reduce a single production TMDB HTTP request.
 *
 * No Nightly/CI workflow sets the opt-in token. One source generation writes
 * once, only after its full original publication has succeeded. Failed
 * generation, invalid store, or writer conflict: fail-open ORIGINAL matching,
 * fail-closed auxiliary cache persistence.
 */
import { resolve } from 'node:path'
import {
  loadOptionalSharedTmdbResponses,
  saveOptionalSharedTmdbResponses,
} from './shared-tmdb-response-store.mjs'
import {
  SHARED_TMDB_SEARCH_NAMESPACE,
  createSharedTmdbSearchResponseCache,
} from './shared-tmdb-search-response-cache.mjs'

export const SHARED_TMDB_CAPTURE_OPT_IN = 'private-stage-capture-v1'
const SOURCE_IDS = new Set(['waipu', 'joyn'])
const RELATIVE_CACHE_FILE = 'artifacts/shared-tmdb/private/shared-tmdb-response-cache.json'

/**
 * Construct a bounded cache recorder; never return a source-cache HIT.
 *
 * In the actual program the enable flag comes from an exact, manual opt-in
 * environment token. In tests, enable can be supplied explicitly.
 */
export async function openOptionalSharedTmdbCapture({
  sourceId, enabled = false, projectRoot, now = Date.now(),
} = {}) {
  if (!SOURCE_IDS.has(sourceId)) throw new TypeError('Unsupported capture source')
  if (enabled !== true) return null
  if (typeof projectRoot !== 'string' || !projectRoot.trim() ||
      !Number.isFinite(now)) throw new TypeError('Invalid private capture context')
  const file = resolve(projectRoot, RELATIVE_CACHE_FILE)
  const loaded = await loadOptionalSharedTmdbResponses(file, { now })
  if (!['loaded', 'missing'].includes(loaded.status)) {
    return Object.freeze({
      sourceId,
      loadStatus: loaded.status,
      responseCache: null,
      async complete() { return { status: 'unavailable', stored: 0 } },
    })
  }

  const bridge = createSharedTmdbSearchResponseCache(loaded.store)
  let completed = false
  const responseCache = Object.freeze({
    // Capture-only means NO cross-adapter read or HTTP saving claims.
    get() { return null },
    set(requestKey, payload) { return bridge.set(requestKey, payload) },
  })
  return Object.freeze({
    sourceId,
    loadStatus: loaded.status,
    responseCache,
    async complete({ sourceGenerationComplete = false } = {}) {
      if (completed) return { status: 'already_finalized', stored: 0 }
      completed = true
      const counts = bridge.counts()
      if (sourceGenerationComplete !== true) {
        return { status: 'not_complete', stored: counts.stored }
      }
      if (counts.stored === 0) {
        return { status: 'no_new_responses', stored: 0 }
      }
      const write = await saveOptionalSharedTmdbResponses(file, loaded.store)
      return { status: write.status, stored: counts.stored }
    },
  })
}

/** Joyn's existing lookup behavior remains the only possible cache HIT. */
export function joynOriginalFirstResponseCache(originalLookupCache, captureSession = null) {
  if (!originalLookupCache || typeof originalLookupCache.get !== 'function' ||
      typeof originalLookupCache.set !== 'function') {
    throw new TypeError('Original Joyn lookup cache required')
  }
  return {
    get(key) {
      return originalLookupCache.get(SHARED_TMDB_SEARCH_NAMESPACE, key)
    },
    set(key, value) {
      originalLookupCache.set(SHARED_TMDB_SEARCH_NAMESPACE, key, value)
      // Deliberately side-effect-only; it never changes classification, cache
      // HIT status, retries, or the response returned by the original client.
      try { captureSession?.responseCache?.set(key, value) } catch {}
    },
  }
}
