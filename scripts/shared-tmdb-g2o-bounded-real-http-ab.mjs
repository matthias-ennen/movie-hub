/**
 * MovieHub #336 G2o: separately authorised, bounded REAL TMDB-HTTP A/B test.
 *
 * Exactly two already PUBLIC MovieHub catalog works (one movie, one series),
 * queried using the ORIGINAL Joyn and Waipu TMDB search clients.
 * Baseline: each client starts its own search.
 * Shared: Joyn searches, persists validated RESPONSES in an ephemeral 0600
 * snapshot; a new Waipu client reads the snapshot without HTTP.
 *
 * Only the two exact original search endpoints are permitted; maximum SIX
 * combined TMDB HTTP starts, retries disabled, no source EPG and no Nightly.
 * Anonymised counts only. This is not measured PRODUCTION savings.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { JoynTmdbSearchClient, matchJoynProgram } from './joyn-tmdb-matcher.mjs'
import { WaipuTmdbSearchClient, matchWaipuProgram } from './waipu-tmdb-matcher.mjs'
import {
  SharedTmdbResponseStore, saveOptionalSharedTmdbResponses,
} from './shared-tmdb-response-store.mjs'
import { createSharedTmdbSearchResponseCache } from './shared-tmdb-search-response-cache.mjs'
import { openG2nPrivateSharedTmdbRead } from './shared-tmdb-g2n-private-response-replay.mjs'
import {
  fetchExistingMovieHubTmdbCatalog, createXmltvG2mVerifiedLocalResolver,
} from './xmltv-g2m-live-catalog-match-preview.mjs'

export const G2O_CONFIRMATION = 'PRIVATE_G2O_HTTP_AB_MAX_6'
export const G2O_MAX_HTTP_STARTS = 6
export const G2T_CONFIRMATION = 'PRIVATE_G2T_SOURCE_BACKED_HTTP_AB_MAX_6'
const MAX_SOURCE_KEYS = 45_000
const exactNoYearKey = ({type,title}) => JSON.stringify([
  type === 'movie' ? '/search/movie' : '/search/tv',
  {language:'de-DE', query:title, include_adult:'false'},
])
const API = 'api.themoviedb.org'
const MAX_TITLE_LENGTH = 110
const MATCH_TYPES = ['movie', 'series']
const CONTRACT_FIELDS = [
  'kind', 'schemaVersion', 'mode', 'catalogTypesCompared',
  'baselineTransportStarts', 'sharedTransportStarts',
  'totalTransportStarts', 'sharedExactResponseHits',
  'responsesIdenticalAcrossArms', 'matcherDecisionsEquivalent',
  'expectedCatalogTmdbIdsPresent', 'matchedBaselineDecisions',
  'sharedSnapshotEntries', 'liveTmdbHttpStarted',
  'savingsWithinPrivatePilot', 'measuredProductionSavings',
  'originalEpgUsed', 'productiveWrites', 'publishApproved',
  'playbackRoutesApproved', 'nightlyEnabled',
]
const shape = value => value && typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...CONTRACT_FIELDS].sort().join('|')
const positiveId = value => Number.isSafeInteger(value) &&
  value > 0 && value < 100_000_000

function titleKey(row) {
  if (row?.source !== 'tmdb' || !MATCH_TYPES.includes(row?.type) ||
      !positiveId(row?.tmdbId) ||
      typeof row.title !== 'string' ||
      row.title !== row.title.trim() ||
      row.title.length < 5 || row.title.length > MAX_TITLE_LENGTH ||
      /[\u0000-\u001f\u007f]/u.test(row.title)) return null
  const key = normalizeWaipuText(row.title)
  return key.length > 3 ? row.type + ':' + key : null
}

/** Two current catalog entries, type-distinct, without ambiguous aliases. */
export function selectG2oCatalogSamples(catalog, {
  now = Date.now(), requiredSharedKeys = null,
} = {}) {
  if (requiredSharedKeys !== null && (!(requiredSharedKeys instanceof Set) ||
      requiredSharedKeys.size > MAX_SOURCE_KEYS)) {
    throw new TypeError('Invalid private exact source-key set')
  }
  // Same validated, fresh source as the already-green G2m real catalog pilot.
  createXmltvG2mVerifiedLocalResolver(catalog, { now })
  const frequencies = new Map()
  for (const row of catalog.titles) {
    const key = titleKey(row)
    if (!key) continue
    const values = frequencies.get(key) || new Set()
    values.add(row.tmdbId)
    frequencies.set(key, values)
  }
  const chosen = new Map()
  for (const row of catalog.titles) {
    const key = titleKey(row)
    if (!key || frequencies.get(key)?.size !== 1 ||
        chosen.has(row.type) || (requiredSharedKeys !== null &&
          !requiredSharedKeys.has(exactNoYearKey(row)))) continue
    chosen.set(row.type, Object.freeze({
      type: row.type, title: row.title, expectedTmdbId: row.tmdbId,
    }))
  }
  if (chosen.size !== MATCH_TYPES.length) {
    throw new TypeError('Live catalog lacks two unique, typed TMDB samples')
  }
  return MATCH_TYPES.map(type => chosen.get(type))
}

/** Strict boundary around the REAL original clients, including all retries. */
export function createG2oTmdbNetworkBoundary({
  fetchImpl, token, inputs, maxStarts = G2O_MAX_HTTP_STARTS,
} = {}) {
  if (typeof fetchImpl !== 'function' || !String(token || '').trim() ||
      !Array.isArray(inputs) || inputs.length !== 2 ||
      !Number.isInteger(maxStarts) || maxStarts < 1 ||
      maxStarts > G2O_MAX_HTTP_STARTS) {
    throw new TypeError('Invalid bounded TMDB HTTP context')
  }
  const allowed = new Set(inputs.map(row =>
    '/3/search/' + (row.type === 'movie' ? 'movie' : 'tv') + ':' + row.title))
  let starts = 0
  return Object.freeze({
    async fetch(input, init = {}) {
      let url
      try {
        url = new URL(String(input))
      } catch {
        throw new TypeError('Non-TMDB destination rejected')
      }
      const keys = [...url.searchParams.keys()].sort()
      const key = url.pathname + ':' + url.searchParams.get('query')
      if (url.protocol !== 'https:' ||
          url.hostname !== API ||
          !allowed.has(key) ||
          keys.join('|') !== 'include_adult|language|query' ||
          url.searchParams.get('language') !== 'de-DE' ||
          url.searchParams.get('include_adult') !== 'false' ||
          init?.method && init.method !== 'GET' ||
          init?.headers?.Authorization !== 'Bearer ' + token) {
        throw new TypeError('Out-of-scope TMDB request rejected')
      }
      if (starts >= maxStarts) throw new RangeError('TMDB G2o transport cap reached')
      starts++
      return fetchImpl(url, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(15_000),
      })
    },
    starts: () => starts,
  })
}

const clientOptions = (token, fetchImpl, responseCache = null) => ({
  token, fetchImpl, responseCache, language: 'de-DE',
  maxRequests: 2, maxRetries: 0, paceMs: 0,
})
const normalizedIds = rows => Array.isArray(rows)
  ? rows.map(row => [row?.type, row?.id, row?.title || row?.name])
  : []
const sameRows = (left, right) =>
  JSON.stringify(normalizedIds(left)) === JSON.stringify(normalizedIds(right))
const matchRef = decision => ({
  status: decision?.status ?? null,
  reason: decision?.reason ?? null,
  type: decision?.status === 'matched'
    ? decision.match?.type ?? null : null,
  id: decision?.status === 'matched'
    ? decision.match?.tmdbId ?? null : null,
})
const sameMatch = (left, right) =>
  JSON.stringify(matchRef(left)) === JSON.stringify(matchRef(right))
const matchesCatalogId = (rows, id) =>
  Array.isArray(rows) && rows.some(row => row?.id === id)
const clientMatch = async (sourceId, input, rows, now) =>
  sourceId === 'joyn'
    ? matchJoynProgram(input, { localCandidates: rows })
    : matchWaipuProgram(input, {
      localCandidates: rows, now: () => now,
    })

export function isSafeG2oAbReport(x) {
  const count = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max
  return shape(x) &&
    (x.kind === 'g2o-original-client-real-http-ab-aggregate' &&
      x.originalEpgUsed === false ||
      x.kind === 'g2t-source-backed-original-client-http-ab-aggregate' &&
      x.originalEpgUsed === true) &&
    x.schemaVersion === 1 &&
    ['fixture-only', 'manual-private-real-http'].includes(x.mode) &&
    x.catalogTypesCompared === 2 &&
    count(x.baselineTransportStarts, 4) &&
    count(x.sharedTransportStarts, 2) &&
    x.totalTransportStarts ===
      x.baselineTransportStarts + x.sharedTransportStarts &&
    count(x.totalTransportStarts, G2O_MAX_HTTP_STARTS) &&
    count(x.sharedExactResponseHits, 2) &&
    typeof x.responsesIdenticalAcrossArms === 'boolean' &&
    typeof x.matcherDecisionsEquivalent === 'boolean' &&
    count(x.expectedCatalogTmdbIdsPresent, 2) &&
    count(x.matchedBaselineDecisions, 4) &&
    count(x.sharedSnapshotEntries, 2) &&
    count(x.liveTmdbHttpStarted, G2O_MAX_HTTP_STARTS) &&
    x.liveTmdbHttpStarted === (x.mode === 'manual-private-real-http'
      ? x.totalTransportStarts : 0) &&
    count(x.savingsWithinPrivatePilot, 2) &&
    x.savingsWithinPrivatePilot ===
      x.baselineTransportStarts - x.sharedTransportStarts &&
    x.measuredProductionSavings === null &&
    x.productiveWrites === 0 &&
    x.publishApproved === false &&
    x.playbackRoutesApproved === false &&
    x.nightlyEnabled === false &&
    JSON.stringify(x).length < 700
}

/**
 * G2o uses the public catalog alone; G2t additionally restricts samples to
 * the validated original-source exact demand intersection. No productive
 * cache. Original TMDB clients, empty initial
 * caches in BOTH A/B arms. All four client sessions are independent.
 * The shared arm persists an ephemeral 0600 response store; Waipu restores
 * it as a fresh client, demonstrating process-independent reuse.
 */
export async function compareG2oBoundedOriginalClients({
  catalog, now = Date.now(), token, fetchImpl,
  mode = 'fixture-only', requiredSharedKeys = null,
} = {}) {
  if (!['fixture-only', 'manual-private-real-http'].includes(mode) ||
      !Number.isFinite(now) ||
      typeof token !== 'string' || !token.trim()) {
    throw new TypeError('Invalid isolated G2o A/B configuration')
  }
  if (mode === 'manual-private-real-http' && (
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    (requiredSharedKeys === null
      ? process.env.G2O_CONFIRMATION !== G2O_CONFIRMATION
      : process.env.G2T_CONFIRMATION !== G2T_CONFIRMATION)
  )) throw new TypeError('Real TMDB HTTP requires exact manual private approval')

  const inputs = selectG2oCatalogSamples(catalog, { now, requiredSharedKeys })
  const boundary = createG2oTmdbNetworkBoundary({fetchImpl, token, inputs})
  const tempDir = await mkdtemp(join(tmpdir(), 'moviehub-g2o-private-'))
  const snapshot = join(tempDir, 'shared-tmdb-response-cache.json')
  try {
    const baseline = []
    let baselineStarted = 0
    for (const input of inputs) {
      const joyn = new JoynTmdbSearchClient(
        clientOptions(token, boundary.fetch))
      const waipu = new WaipuTmdbSearchClient(
        clientOptions(token, boundary.fetch))
      const clientInput = { type: input.type, title: input.title }
      const jr = await joyn.search(clientInput)
      const wr = await waipu.search(clientInput)
      baseline.push({
        joynRows: jr, waipuRows: wr,
        joynMatch: await clientMatch('joyn', clientInput, jr, now),
        waipuMatch: await clientMatch('waipu', clientInput, wr, now),
      })
      baselineStarted += joyn.requestsStarted + waipu.requestsStarted
    }

    const seed = new SharedTmdbResponseStore({ now })
    const bridge = createSharedTmdbSearchResponseCache(seed)
    const sharedJoyn = []
    let sharedStarted = 0
    for (const input of inputs) {
      const joyn = new JoynTmdbSearchClient(
        clientOptions(token, boundary.fetch, bridge))
      const clientInput = { type: input.type, title: input.title }
      const jr = await joyn.search(clientInput)
      sharedJoyn.push({
        joynRows: jr,
        joynMatch: await clientMatch('joyn', clientInput, jr, now),
      })
      sharedStarted += joyn.requestsStarted
    }

    const saved = await saveOptionalSharedTmdbResponses(snapshot, seed)
    if (saved.status !== 'saved' || saved.entries !== 2) {
      throw new TypeError('Private TMDB response snapshot not safely saved')
    }
    const shared = []
    let hits = 0
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]
      const replay = await openG2nPrivateSharedTmdbRead({
        file: snapshot, now: now + 1000,
        sourceId: 'waipu', enabled: true,
      })
      if (replay?.loadStatus !== 'loaded' ||
          replay.summary().restoredExactSearchResponses !== 2) {
        throw new TypeError('Private TMDB response replay unavailable')
      }
      const waipu = new WaipuTmdbSearchClient(
        clientOptions(token, boundary.fetch, replay.responseCache))
      const clientInput = { type: input.type, title: input.title }
      const wr = await waipu.search(clientInput)
      hits += replay.summary().sharedResponseHits
      sharedStarted += waipu.requestsStarted
      shared.push({
        joynRows: sharedJoyn[i].joynRows, waipuRows: wr,
        joynMatch: sharedJoyn[i].joynMatch,
        waipuMatch: await clientMatch('waipu', clientInput, wr, now),
      })
    }
    const responseParity = inputs.every((_, i) =>
      sameRows(baseline[i].joynRows, baseline[i].waipuRows) &&
      sameRows(baseline[i].joynRows, shared[i].joynRows) &&
      sameRows(baseline[i].joynRows, shared[i].waipuRows))
    const identityParity = inputs.every((_, i) =>
      sameMatch(baseline[i].joynMatch, shared[i].joynMatch) &&
      sameMatch(baseline[i].waipuMatch, shared[i].waipuMatch))
    const idCount = inputs.filter((input,i) =>
      matchesCatalogId(baseline[i].joynRows, input.expectedTmdbId) &&
      matchesCatalogId(baseline[i].waipuRows, input.expectedTmdbId) &&
      matchesCatalogId(shared[i].joynRows, input.expectedTmdbId) &&
      matchesCatalogId(shared[i].waipuRows, input.expectedTmdbId)).length
    const baselineMatches = baseline.reduce((n, item) =>
      n + Number(item.joynMatch?.status === 'matched') +
        Number(item.waipuMatch?.status === 'matched'), 0)
    const report = {
      kind: requiredSharedKeys === null
        ? 'g2o-original-client-real-http-ab-aggregate'
        : 'g2t-source-backed-original-client-http-ab-aggregate',
      schemaVersion: 1,
      mode,
      catalogTypesCompared: inputs.length,
      baselineTransportStarts: baselineStarted,
      sharedTransportStarts: sharedStarted,
      totalTransportStarts: boundary.starts(),
      sharedExactResponseHits: hits,
      responsesIdenticalAcrossArms: responseParity,
      matcherDecisionsEquivalent: identityParity,
      expectedCatalogTmdbIdsPresent: idCount,
      matchedBaselineDecisions: baselineMatches,
      sharedSnapshotEntries: saved.entries,
      liveTmdbHttpStarted: mode === 'manual-private-real-http'
        ? boundary.starts() : 0,
      savingsWithinPrivatePilot: baselineStarted - sharedStarted,
      measuredProductionSavings: null,
      originalEpgUsed: requiredSharedKeys !== null,
      productiveWrites: 0,
      publishApproved: false,
      playbackRoutesApproved: false,
      nightlyEnabled: false,
    }
    if (!isSafeG2oAbReport(report)) {
      throw new TypeError('Unsafe G2o anonymous A/B report')
    }
    return report
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function main() {
  if (process.argv.length !== 2 ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      process.env.G2O_CONFIRMATION !== G2O_CONFIRMATION) {
    throw new TypeError('G2o must be manually approved on main')
  }
  const token = String(process.env.TMDB_API_READ_TOKEN || '').trim()
  if (!token) throw new TypeError('G2o private TMDB API token missing')
  const now = Date.now()
  const catalog = await fetchExistingMovieHubTmdbCatalog({ now })
  const result = await compareG2oBoundedOriginalClients({
    catalog, token, now, fetchImpl: fetch, mode: 'manual-private-real-http',
  })
  console.log(JSON.stringify(result))
  if (result.totalTransportStarts !== G2O_MAX_HTTP_STARTS ||
      result.sharedExactResponseHits !== 2 ||
      !result.responsesIdenticalAcrossArms ||
      !result.matcherDecisionsEquivalent ||
      result.expectedCatalogTmdbIdsPresent !== 2 ||
      result.matchedBaselineDecisions === 0) {
    throw new TypeError('G2o real HTTP parity gates not met')
  }
}

if (process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error('G2o manual bounded TMDB HTTP A/B failed closed; no titles or tokens emitted')
    process.exitCode = 1
  })
}
