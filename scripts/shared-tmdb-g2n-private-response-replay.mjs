/**
 * MovieHub #336 G2n - PRIVATE, opt-in read-only replay of verified TMDB
 * search RESPONSES across original Waipu/Joyn clients and XMLTV G1b.
 *
 * No identity decisions, TTL extensions, new persistence, TMDB tokens or
 * HTTP searches are ever created by this bridge. Its exact-request keys,
 * media types and original-match precedence are kept unchanged.
 *
 * This is NOT connected to productive Nightly. The offline A/B exercises
 * the actual original clients using FAKE HTTP responses, not live TMDB.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JoynTmdbSearchClient, matchJoynProgram } from './joyn-tmdb-matcher.mjs'
import { WaipuTmdbSearchClient, matchWaipuProgram } from './waipu-tmdb-matcher.mjs'
import {
  SharedTmdbResponseStore, loadOptionalSharedTmdbResponses,
  saveOptionalSharedTmdbResponses,
} from './shared-tmdb-response-store.mjs'
import {
  SHARED_TMDB_SEARCH_NAMESPACE,
  createSharedTmdbSearchResponseCache,
} from './shared-tmdb-search-response-cache.mjs'

const VALID_SOURCES = new Set(['waipu', 'joyn'])
const LANGUAGES = new Set(['de-DE', 'en-US'])
const MAX_QUERY = 255
const MAX_REPORT_BYTES = 520
const kinds = ['movie', 'series']

/**
 * Existing JoynLookupCache always has priority, exactly like today's Joyn
 * transport; a new verified response store may be used only on a legacy miss.
 * New HTTP responses still enter Joyn's original cache but never rewrite the
 * shared snapshot. Waipu's non-shared original path remains its fallback.
 */
export async function openG2nPrivateSharedTmdbRead({
  file, now = Date.now(), sourceId, enabled = false,
  originalJoynCache = null,
} = {}) {
  if (!VALID_SOURCES.has(sourceId)) {
    throw new TypeError('Unknown private G2n TMDB consumer')
  }
  if (!enabled) return null
  if (!Number.isFinite(now) ||
      (originalJoynCache !== null &&
       (sourceId !== 'joyn' ||
        typeof originalJoynCache.get !== 'function' ||
        typeof originalJoynCache.set !== 'function'))) {
    throw new TypeError('Invalid isolated TMDB shared read context')
  }
  const loaded = await loadOptionalSharedTmdbResponses(file, { now })
  const bridge = createSharedTmdbSearchResponseCache(loaded.store)
  let originalHits = 0
  let originalWrites = 0
  const responseCache = Object.freeze({
    get(key) {
      if (originalJoynCache) {
        try {
          const original = originalJoynCache.get(SHARED_TMDB_SEARCH_NAMESPACE, key)
          if (original != null) {
            originalHits++
            return original
          }
        } catch {
          // A broken optional source cache does not authorize an identity.
        }
      }
      // Store is EMPTY for missing/corrupt/expired, so caller falls back to
      // its own unmodified TMDB transport and retry budget.
      return loaded.status === 'loaded' ? bridge.get(key) : null
    },
    set(key, value) {
      if (originalJoynCache) {
        try {
          originalJoynCache.set(SHARED_TMDB_SEARCH_NAMESPACE, key, value)
          originalWrites++
        } catch {
          // Replay must never block the actual original matcher transport.
        }
      }
      // Explicit read-only replay: no mutation of the shared response store,
      // no lock file, no version change and no TTL refresh.
      return undefined
    },
  })
  return Object.freeze({
    sourceId,
    loadStatus: loaded.status,
    responseCache,
    summary() {
      const counts = bridge.counts()
      return {
        loadStatus: loaded.status,
        restoredExactSearchResponses: loaded.entries,
        sharedResponseHits: counts.hits,
        sharedResponseMisses: counts.misses,
        sourceOriginalCacheHits: originalHits,
        sourceOriginalCacheWrites: originalWrites,
        sharedSnapshotWrites: 0,
        productSourceWrites: 0,
        matcherIdentityApproved: false,
      }
    },
  })
}

/**
 * A read-only XMLTV candidate resolver for the existing G1b/Joyn matcher.
 * Only a literal, unambiguous TMDB SEARCH request already in the verified
 * shared store is considered. No year-agnostic/fuzzy lookup is synthesized.
 */
export function xmltvExactTmdbSearchKey(row, type, language = 'de-DE') {
  if (!LANGUAGES.has(language)) return null
  if (!kinds.includes(type) || typeof row?.title !== 'string' ||
      row.title !== row.title.trim() || !row.title ||
      row.title.length > MAX_QUERY) return null
  const endpoint = type === 'movie' ? '/search/movie' : '/search/tv'
  const params = { language, query: row.title, include_adult: 'false' }
  // The Waipu original search uses a year only for movies; TV years
  // need the original firstAirDateYear flag, unavailable in raw XMLTV.
  const year = Number(row.productionYearEvidence)
  if (type === 'movie' && Number.isInteger(year) &&
      year >= 1888 && year <= 2100) {
    params.year = String(year)
  }
  return JSON.stringify([endpoint, params])
}

export function createG2nXmltvCachedResponseResolver(store, {
  language = 'de-DE',
} = {}) {
  if (!(store instanceof SharedTmdbResponseStore) ||
      !LANGUAGES.has(language)) {
    throw new TypeError('XMLTV shared response resolver requires verified private store')
  }
  const bridge = createSharedTmdbSearchResponseCache(store)
  return Object.freeze({
    localCandidatesFor(row, type) {
      const key = xmltvExactTmdbSearchKey(row, type, language)
      if (key === null) return []
      const response = bridge.get(key)
      return Array.isArray(response?.results)
        ? response.results.map(item => ({ ...item, type,
          source: 'tmdb-shared-search-response' }))
        : []
    },
    counts() {
      const c = bridge.counts()
      return { hits: c.hits, misses: c.misses, writes: 0 }
    },
  })
}

const CHECK_TITLE = 'QA ORIGINAL PRIVATE FILM 31415'
const CHECK_YEAR = 2020
const CHECK_ID = 31415
const SOURCE_INPUT = Object.freeze({
  type: 'movie', title: CHECK_TITLE, productionYear: CHECK_YEAR,
})
const mockedResponse = () => ({
  ok: true, status: 200, headers: new Headers(),
  json: async () => ({
    page: 1, total_pages: 1,
    results: [{ id: CHECK_ID, title: CHECK_TITLE,
      release_date: '2020-01-01' }],
  }),
  text: async () => '',
})
const mockedFetcher = counts => async () => {
  counts.calls++
  return mockedResponse()
}
const options = (fetchImpl, responseCache = null) => ({
  token: 'NOT_AN_API_KEY', fetchImpl, responseCache,
  maxRequests: 3, paceMs: 0, maxRetries: 0,
})

const identity = decision => decision?.status === 'matched' &&
  Number.isSafeInteger(decision.match?.tmdbId)
  ? decision.match.type + ':' + decision.match.tmdbId : null

/** A/B measured at original client requestsStarted; all HTTP is MOCKED. */
export async function runG2nSyntheticOfflineTransportComparison({
  now = Date.now(),
} = {}) {
  if (!Number.isFinite(now) || now <= 0) throw new TypeError('Invalid G2n clock')
  const directory = await mkdtemp(join(tmpdir(), 'moviehub-g2n-'))
  const file = join(directory, 'shared-tmdb-response-cache.json')
  try {
    const baselineFetches = { calls: 0 }
    const baselineJoyn = new JoynTmdbSearchClient(
      options(mockedFetcher(baselineFetches)))
    const baselineWaipu = new WaipuTmdbSearchClient(
      options(mockedFetcher(baselineFetches)))
    const baselineJ = await baselineJoyn.search(SOURCE_INPUT)
    const baselineW = await baselineWaipu.search(SOURCE_INPUT)
    const baselineJDecision = await matchJoynProgram(SOURCE_INPUT, {
      localCandidates: baselineJ,
    })
    const baselineWDecision = await matchWaipuProgram(SOURCE_INPUT, {
      localCandidates: baselineW, now: () => now,
    })

    // Seed via one real ORIGINAL Joyn client and the existing private
    // single-writer response-store. Restart the consumer on a fresh object.
    const seeded = new SharedTmdbResponseStore({ now })
    const sharedFetches = { calls: 0 }
    const seedJoyn = new JoynTmdbSearchClient(options(
      mockedFetcher(sharedFetches),
      createSharedTmdbSearchResponseCache(seeded),
    ))
    const indexedJoynCandidates = await seedJoyn.search(SOURCE_INPUT)
    const save = await saveOptionalSharedTmdbResponses(file, seeded)
    if (save.status !== 'saved') throw new TypeError('G2n safe seed failed')
    const replay = await openG2nPrivateSharedTmdbRead({
      file, now: now + 1_000, sourceId: 'waipu', enabled: true,
    })
    if (replay?.loadStatus !== 'loaded') {
      throw new TypeError('G2n replay failed')
    }
    const indexedWaipu = new WaipuTmdbSearchClient(options(
      mockedFetcher(sharedFetches), replay.responseCache,
    ))
    const indexedWaipuCandidates = await indexedWaipu.search(SOURCE_INPUT)
    const indexedJDecision = await matchJoynProgram(SOURCE_INPUT, {
      localCandidates: indexedJoynCandidates,
    })
    const indexedWDecision = await matchWaipuProgram(SOURCE_INPUT, {
      localCandidates: indexedWaipuCandidates, now: () => now,
    })

    const reported = replay.summary()
    const report = {
      kind: 'g2n-private-synthetic-transport-ab-aggregate',
      schemaVersion: 1,
      baselineOriginalClientRequestsStarted:
        baselineJoyn.requestsStarted + baselineWaipu.requestsStarted,
      sharedOriginalClientRequestsStarted:
        seedJoyn.requestsStarted + indexedWaipu.requestsStarted,
      baselineMockHttpCalls: baselineFetches.calls,
      sharedMockHttpCalls: sharedFetches.calls,
      sharedWaipuCacheHits: reported.sharedResponseHits,
      identitiesPreserved:
        identity(baselineJDecision) === identity(indexedJDecision) &&
        identity(baselineWDecision) === identity(indexedWDecision) &&
        Boolean(identity(baselineJDecision)) && Boolean(identity(baselineWDecision)),
      liveTmdbRequestsStarted: 0,
      measuredProductionRequestsAvoided: null,
      originalSourcesPublished: false,
      matcherIdentityApproved: false,
      sharedSnapshotWrites: 1,
    }
    if (!isSafeG2nSyntheticAbReport(report)) {
      throw new TypeError('Unsafe G2n A/B aggregate')
    }
    return report
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export function isSafeG2nSyntheticAbReport(x) {
  return x && typeof x === 'object' && !Array.isArray(x) &&
    Object.keys(x).sort().join('|') === [
      'kind', 'schemaVersion', 'baselineOriginalClientRequestsStarted',
      'sharedOriginalClientRequestsStarted', 'baselineMockHttpCalls',
      'sharedMockHttpCalls', 'sharedWaipuCacheHits', 'identitiesPreserved',
      'liveTmdbRequestsStarted', 'measuredProductionRequestsAvoided',
      'originalSourcesPublished', 'matcherIdentityApproved',
      'sharedSnapshotWrites',
    ].sort().join('|') &&
    x.kind === 'g2n-private-synthetic-transport-ab-aggregate' &&
    x.schemaVersion === 1 &&
    x.baselineOriginalClientRequestsStarted === 2 &&
    x.sharedOriginalClientRequestsStarted === 1 &&
    x.baselineMockHttpCalls === 2 &&
    x.sharedMockHttpCalls === 1 &&
    x.sharedWaipuCacheHits === 1 &&
    x.identitiesPreserved === true &&
    x.liveTmdbRequestsStarted === 0 &&
    x.measuredProductionRequestsAvoided === null &&
    x.originalSourcesPublished === false &&
    x.matcherIdentityApproved === false &&
    x.sharedSnapshotWrites === 1 &&
    JSON.stringify(x).length < MAX_REPORT_BYTES
}

async function main() {
  if (process.argv.length !== 2 ||
      process.env.MOVIEHUB_G2N_OFFLINE_QA !== 'enabled') {
    throw new TypeError('Offline G2n QA was not opted in')
  }
  const report = await runG2nSyntheticOfflineTransportComparison()
  console.log(JSON.stringify(report))
}
if (process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error('Private G2n synthetic transport A/B failed closed')
    process.exitCode = 1
  })
}
