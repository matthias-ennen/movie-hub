/**
 * MovieHub #336 / G2m: existing PUBLIC MovieHub TMDB catalog -> exact typed
 * in-memory candidates -> REAL G2c/G2l private XMLTV matcher/merge.
 *
 * One bounded read of the already-deployed MovieHub catalog (NOT a TMDB API
 * search). Only normalized, unique typed exact aliases enter the existing
 * G1b/Joyn decision logic. Same-title different-work collisions stay unmatched.
 *
 * The XMLTV originals stay in the ephemeral runner. No source originals or
 * title strings in outputs; no app, Firestore, Nightly or GCS writes.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { validateLiveCatalog } from './restore-live-tmdb-data.mjs'
import {
  runXmltvG2lPrivateAdapterCoordinator, isSafeXmltvG2lPrivateAdapterReport,
} from './xmltv-g2l-private-adapter-coordinator.mjs'

const CATALOG_URL = 'https://movie-hub-62459.web.app/catalog.json'
const MAX_CATALOG_BYTES = 96 * 1024 * 1024
const MAX_CATALOG_TITLES = 150_000
const MAX_ALIASES = 300_000
const MAX_AGE_MS = 14 * 86_400_000
const MAX_TITLE_CHARS = 400
const MAX_SOURCE_SNAPSHOT = 20_000
const validClock = now => Number.isFinite(now) && now > 0
const keys = (obj, names) => obj && typeof obj === 'object' &&
  !Array.isArray(obj) &&
  Object.keys(obj).sort().join('|') === [...names].sort().join('|')
const int = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max
const time = value => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value))
const validYear = n => Number.isInteger(n) && n >= 1888 && n <= 2100
const catalogMediaType = type => type === 'movie' ? 'movie' :
  type === 'series' ? 'series' : null

function catalogCandidate(row) {
  if (row?.source !== 'tmdb') return null
  const type = catalogMediaType(row.type)
  const tmdbId = row.tmdbId
  const title = row.title
  if (!type || !Number.isSafeInteger(tmdbId) || tmdbId < 1 ||
      tmdbId > 100_000_000 || typeof title !== 'string' ||
      !title.trim() || title.length > MAX_TITLE_CHARS ||
      (row.originalTitle !== null && row.originalTitle !== undefined &&
       (typeof row.originalTitle !== 'string' ||
        row.originalTitle.length > MAX_TITLE_CHARS))) return null
  const originalTitle = row.originalTitle || null
  const aliases = [...new Set([title, originalTitle]
    .filter(Boolean).map(normalizeWaipuText).filter(Boolean))]
  if (aliases.length < 1) return null
  let year = null
  if (validYear(row.productionYear)) year = row.productionYear
  else if (validYear(row.year)) year = row.year
  else if (typeof row.releaseDate === 'string' &&
           /^\d{4}-\d\d-\d\d$/.test(row.releaseDate) &&
           validYear(Number(row.releaseDate.slice(0,4)))) {
    year = Number(row.releaseDate.slice(0,4))
  }
  return {
    type, tmdbId, title, originalTitle,
    year, aliases,
  }
}

/**
 * Strictly public-app-catalog only: no arbitrary URLs, custom TMDB search
 * endpoint or unsafe redirect. Content is read with a byte budget BEFORE
 * JSON.parse. The caller cannot change the fixed app address.
 */
export async function fetchExistingMovieHubTmdbCatalog({
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function' || !validClock(now)) {
    throw new TypeError('Invalid private catalog read')
  }
  const response = await fetchImpl(CATALOG_URL, {
    method: 'GET',
    redirect: 'error',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response?.ok ||
      !String(response.headers?.get('content-type') || '')
        .toLowerCase().includes('application/json')) {
    throw new TypeError('Verified live MovieHub TMDB catalog unavailable')
  }
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_CATALOG_BYTES) {
    throw new RangeError('Private TMDB catalog size cap exceeded')
  }
  const parts = []
  let bytes = 0
  const stream = response.body
  if (!stream || typeof stream.getReader !== 'function') {
    throw new TypeError('Unstreamable live catalog')
  }
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_CATALOG_BYTES) {
        throw new RangeError('Private TMDB catalog size cap exceeded')
      }
      parts.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  if (bytes < 1) throw new TypeError('Empty verified live catalog')
  const catalog = JSON.parse(Buffer.concat(parts, bytes).toString('utf8'))
  // The exact existing MovieHub catalog contract is authoritative.
  validateLiveCatalog(catalog)
  if (!time(catalog.generatedAt) || Date.parse(catalog.generatedAt) > now ||
      now - Date.parse(catalog.generatedAt) > MAX_AGE_MS ||
      catalog.titles.length > MAX_CATALOG_TITLES) {
    throw new TypeError('Untrusted, oversized or stale MovieHub TMDB catalog')
  }
  return catalog
}

/** Build a bounded non-persistent typed-exact index from the verified catalog. */
export function createXmltvG2mVerifiedLocalResolver(catalog, {
  now = Date.now(),
} = {}) {
  if (!validClock(now)) throw new TypeError('Invalid private matcher clock')
  validateLiveCatalog(catalog)
  if (!time(catalog.generatedAt) || Date.parse(catalog.generatedAt) > now ||
      now - Date.parse(catalog.generatedAt) > MAX_AGE_MS ||
      catalog.titles.length > MAX_CATALOG_TITLES) {
    throw new TypeError('Stale or oversized shared TMDB input')
  }
  const byAlias = new Map()
  let eligibleTitles = 0
  let skippedTitles = 0
  for (const row of catalog.titles) {
    const candidate = catalogCandidate(row)
    if (!candidate) {
      skippedTitles++
      continue
    }
    eligibleTitles++
    for (const alias of candidate.aliases) {
      const key = candidate.type + ':' + alias
      if (!byAlias.has(key)) {
        if (byAlias.size === MAX_ALIASES) {
          throw new RangeError('Bounded exact local TMDB alias index exceeded')
        }
        byAlias.set(key, new Map())
      }
      byAlias.get(key).set(candidate.type + ':' + candidate.tmdbId, candidate)
    }
  }
  if (!eligibleTitles) {
    throw new TypeError('No verified TMDB titles eligible for offline EPG lookup')
  }
  let ambiguousAliases = 0
  let uniqueAliases = 0
  const exact = new Map()
  for (const [key, values] of byAlias) {
    if (values.size !== 1) {
      ambiguousAliases++
      continue
    }
    uniqueAliases++
    exact.set(key, [...values.values()][0])
  }
  const summary = Object.freeze({
    catalogTitles: catalog.titles.length,
    eligibleTitles,
    skippedTitles,
    uniqueExactAliases: uniqueAliases,
    ambiguousAliases,
  })
  return Object.freeze({
    summary,
    // G2j calls with ORIGINAL candidate and independently inferred type.
    // No partial/fuzzy catalog scan or fallback to network allowed.
    localCandidatesFor(candidate, type) {
      if (!['movie', 'series'].includes(type) ||
          typeof candidate?.title !== 'string' ||
          candidate.title.length > MAX_TITLE_CHARS) return []
      const alias = normalizeWaipuText(candidate.title)
      const result = exact.get(type + ':' + alias)
      return result ? [result] : []
    },
  })
}

/** Follows actual G2l source receipts, G2d checks and G1b matcher/merge. */
export async function runXmltvG2mPrivateLiveCatalogPreview({
  catalog,
  now = Date.now(),
  coordinatorOptions = {},
} = {}) {
  if (!coordinatorOptions || typeof coordinatorOptions !== 'object' ||
      Array.isArray(coordinatorOptions) ||
      Object.prototype.hasOwnProperty.call(coordinatorOptions, 'localCandidatesFor') ||
      Object.prototype.hasOwnProperty.call(coordinatorOptions, 'now')) {
    throw new TypeError('Unsafe G2m private coordinator options')
  }
  const resolver = createXmltvG2mVerifiedLocalResolver(catalog, { now })
  const source = await runXmltvG2lPrivateAdapterCoordinator({
    ...coordinatorOptions,
    now,
    localCandidatesFor: resolver.localCandidatesFor,
    maxCandidates: Math.min(
      MAX_SOURCE_SNAPSHOT, coordinatorOptions.maxCandidates ?? MAX_SOURCE_SNAPSHOT,
    ),
  })
  if (!isSafeXmltvG2lPrivateAdapterReport(source)) {
    throw new TypeError('Invalid upstream G2l numeric report')
  }
  const out = {
    kind: 'xmltv-g2m-private-live-catalog-match-aggregate',
    schemaVersion: 1,
    mode: 'existing-app-catalog-offline-epg-no-publication',
    catalogTitles: resolver.summary.catalogTitles,
    catalogEligibleTitles: resolver.summary.eligibleTitles,
    catalogSkippedTitles: resolver.summary.skippedTitles,
    uniqueExactCatalogAliases: resolver.summary.uniqueExactAliases,
    ambiguousCatalogAliases: resolver.summary.ambiguousAliases,
    validatedXmltvSources: source.selectedSources,
    selectedOriginalCandidates: source.selectedCandidateCount,
    exactLocalMatches: source.locallyMatchedCount,
    locallyUnmatched: source.locallyUnmatchedCount,
    mergedAiringsWithXmltvPreview: source.mergedAiringsWithXmltvPreview,
    availableIndependentFamilies: source.availableIndependentFamilies,
    realTmdbApiRequestsMade: 0,
    productiveWrites: 0,
    publishApproved: false,
    tmdbIdentityApproved: false,
    playbackRoutesApproved: false,
    fiveDaysRequiredToKeepSource: false,
  }
  if (!isSafeXmltvG2mPrivateReport(out)) {
    throw new TypeError('Unsafe G2m matcher output')
  }
  return out
}

export function isSafeXmltvG2mPrivateReport(value) {
  return keys(value, [
    'kind', 'schemaVersion', 'mode', 'catalogTitles', 'catalogEligibleTitles',
    'catalogSkippedTitles', 'uniqueExactCatalogAliases',
    'ambiguousCatalogAliases', 'validatedXmltvSources',
    'selectedOriginalCandidates', 'exactLocalMatches', 'locallyUnmatched',
    'mergedAiringsWithXmltvPreview', 'availableIndependentFamilies',
    'realTmdbApiRequestsMade', 'productiveWrites', 'publishApproved',
    'tmdbIdentityApproved', 'playbackRoutesApproved',
    'fiveDaysRequiredToKeepSource',
  ]) && value.kind === 'xmltv-g2m-private-live-catalog-match-aggregate' &&
    value.schemaVersion === 1 &&
    value.mode === 'existing-app-catalog-offline-epg-no-publication' &&
    int(value.catalogTitles, MAX_CATALOG_TITLES) &&
    int(value.catalogEligibleTitles, MAX_CATALOG_TITLES) &&
    int(value.catalogSkippedTitles, MAX_CATALOG_TITLES) &&
    value.catalogEligibleTitles + value.catalogSkippedTitles === value.catalogTitles &&
    int(value.uniqueExactCatalogAliases, MAX_ALIASES) &&
    int(value.ambiguousCatalogAliases, MAX_ALIASES) &&
    int(value.validatedXmltvSources, 3) &&
    int(value.selectedOriginalCandidates, MAX_SOURCE_SNAPSHOT) &&
    int(value.exactLocalMatches, MAX_SOURCE_SNAPSHOT) &&
    int(value.locallyUnmatched, MAX_SOURCE_SNAPSHOT) &&
    value.exactLocalMatches + value.locallyUnmatched === value.selectedOriginalCandidates &&
    int(value.mergedAiringsWithXmltvPreview, MAX_SOURCE_SNAPSHOT) &&
    int(value.availableIndependentFamilies, 2) &&
    value.realTmdbApiRequestsMade === 0 &&
    value.productiveWrites === 0 &&
    value.publishApproved === false &&
    value.tmdbIdentityApproved === false &&
    value.playbackRoutesApproved === false &&
    value.fiveDaysRequiredToKeepSource === false &&
    JSON.stringify(value).length < 640
}

async function main() {
  if (process.argv.length !== 2 ||
      process.env.MOVIEHUB_XMLTV_G2M_PRIVATE_QA !== 'enabled' ||
      process.env.GITHUB_EVENT_NAME !== 'pull_request' ||
      process.env.GITHUB_HEAD_REF !==
        'feature/336-g2m-verified-live-tmdb-catalog-local-match') {
    throw new TypeError('G2m private real-source/catalog test not opted in')
  }
  const now = Date.now()
  const catalog = await fetchExistingMovieHubTmdbCatalog({ now })
  const result = await runXmltvG2mPrivateLiveCatalogPreview({ catalog, now })
  console.log(JSON.stringify(result))
  if (!result.validatedXmltvSources) {
    throw new TypeError('No valid private XMLTV sources for G2m')
  }
}

if (process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error('G2m private verified catalog pilot failed closed; no data published')
    process.exitCode = 1
  })
}
