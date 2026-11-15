/**
 * #336 G1i: explicit private-stage capture on the ORIGINAL Waipu and Joyn
 * TMDB transports. In capture-only mode cache.get is always a miss
 * for Waipu, while Joyn keeps its original JoynLookupCache as first read.
 *
 * The original clients may submit newly fetched validated TMDB search
 * RESPONSES to an optional private, bounded store. This is NOT an EPG identity
 * decision. Capture-only does not reduce production HTTP requests.
 *
 * G2u permits explicit manual same-run reuse by Joyn only. Default Nightly
 * and CI do not set either token. One source generation writes
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
export const SHARED_TMDB_REUSE_OPT_IN = 'private-stage-reuse-v1'
const SOURCE_IDS = new Set(['waipu', 'joyn'])
const RELATIVE_CACHE_FILE = 'artifacts/shared-tmdb/private/shared-tmdb-response-cache.json'

/**
 * Construct a bounded recorder; explicit same-run Joyn reuse reads only
 * the preceding completed generation's exact keys.
 *
 * In the actual program the enable flag comes from an exact, manual opt-in
 * environment token. In tests, enable can be supplied explicitly.
 */
export async function openOptionalSharedTmdbCapture({
  sourceId, enabled = false, projectRoot, now = Date.now(), reuse = false,
} = {}) {
  if (!SOURCE_IDS.has(sourceId)) throw new TypeError('Unsupported capture source')
  if (enabled !== true) return null
  if (typeof projectRoot !== 'string' || !projectRoot.trim() ||
      !Number.isFinite(now)) throw new TypeError('Invalid private capture context')
  if (reuse !== false && (reuse !== true || sourceId !== 'joyn')) throw new TypeError('Same-run reuse is permitted only for the second adapter Joyn')
  const file = resolve(projectRoot, RELATIVE_CACHE_FILE)
  const loaded = await loadOptionalSharedTmdbResponses(file, { now })
  if (!['loaded', 'missing'].includes(loaded.status)) {
    return Object.freeze({
      sourceId,
      loadStatus: loaded.status,
      responseCache: null,
      summary: () => ({ loadStatus: loaded.status, restoredResponses: 0, sharedResponseHits: 0, capturedResponses: 0 }),
      async complete() { return { status: 'unavailable', stored: 0 } },
    })
  }

  const bridge = createSharedTmdbSearchResponseCache(loaded.store)
  // Only answers present at second-process startup are eligible.
  const initialKeys = reuse && loaded.status === 'loaded'
    ? new Set(loaded.store.snapshot().entries.map(entry => entry.requestKey)) : new Set()
  let completed = false
  const responseCache = Object.freeze({
    get(key) { return initialKeys.has(key) ? bridge.get(key) : null },
    set(requestKey, payload) { return bridge.set(requestKey, payload) },
  })
  return Object.freeze({
    sourceId,
    loadStatus: loaded.status,
    responseCache,
    summary() {
      const counts = bridge.counts()
      return { loadStatus: loaded.status, restoredResponses: loaded.entries,
        sharedResponseHits: counts.hits, capturedResponses: counts.stored }
    },
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

/** Joyn's original lookup has unconditional precedence; shared reuse is
 * only on a legacy miss and never refreshes the legacy TTL. */
export function joynOriginalFirstResponseCache(originalLookupCache, captureSession = null) {
  if (!originalLookupCache || typeof originalLookupCache.get !== 'function' ||
      typeof originalLookupCache.set !== 'function') {
    throw new TypeError('Original Joyn lookup cache required')
  }
  return {
    get(key) {
      const original = originalLookupCache.get(SHARED_TMDB_SEARCH_NAMESPACE, key)
      if (original != null) return original
      return captureSession?.responseCache?.get(key) ?? null
    },
    set(key, value) {
      originalLookupCache.set(SHARED_TMDB_SEARCH_NAMESPACE, key, value)
      // Store only new HTTP responses. Shared reads never invoke this setter;
      // the legacy TTL and independent matcher decisions remain unchanged.
      try { captureSession?.responseCache?.set(key, value) } catch {}
    },
  }
}

/** Count-only G2u observation; each hit bypasses one initial search, not retries. */
export function g2uSameRunObservation(sourceId, session, completion, actualSearchStarts) {
  if (!SOURCE_IDS.has(sourceId) || !Number.isSafeInteger(actualSearchStarts) || actualSearchStarts < 0) throw new TypeError('Invalid G2u observation')
  const counts = session.summary()
  if (!['loaded','missing','unavailable','invalid_path'].includes(counts.loadStatus) ||
      !['saved','unavailable','no_new_responses','not_complete','revision_conflict','too_large','invalid_input','already_finalized'].includes(completion.status) ||
      ![counts.restoredResponses,counts.sharedResponseHits,counts.capturedResponses].every(v=>Number.isSafeInteger(v)&&v>=0) ||
      (sourceId==='waipu' && counts.sharedResponseHits!==0)) throw new TypeError('Invalid G2u counts')
  return {kind:'g2u-original-adapter-same-run-reuse',sourceId,actualSearchStarts,
    restoredResponses:counts.restoredResponses,sharedResponseHits:counts.sharedResponseHits,
    avoidedInitialSearches:counts.sharedResponseHits,capturedResponses:counts.capturedResponses,
    loadStatus:counts.loadStatus,saveStatus:completion.status,measuredWholeNightSavings:null}
}
