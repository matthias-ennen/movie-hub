/**
 * #336 G1e – explicitly isolated PRIVATE original-source pilot.
 *
 * This CLI is ONLY for a dedicated, credentialed, ephemeral GitHub Actions
 * checkout with already-restored private checkpoints. It is NOT a Nightly
 * task and NEVER writes an original title, receipt or cache to an artifact.
 *
 * 'capture': fresh Joyn source+original matcher capture, offline Waipu
 * original-source rehydration and aggregate-only overlap selection.
 * 'ab': same, then two original Waipu matcher sessions with a strict
 * maximum of 4 REAL TMDB transport attempts per arm.
 */
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectPrivateWaipuAbPreflight,
  MAX_WAIPU_AB_CACHE_BYTES } from './epg-g1e-private-waipu-ab-preflight.mjs'
import { runJoynAdapterDiagnostic } from './joyn-adapter-diagnostic.mjs'
import {
  buildWaipuLiveCatalog, readWaipuCacheRecords, localTmdbCandidates,
} from './waipu-live-catalog.mjs'
import { WaipuMatchDecisionStore } from './waipu-tmdb-matcher.mjs'
import { compareBoundedWaipuWithJoynEvidence } from
  './epg-g1e-waipu-bounded-ab-controller.mjs'
import { runIsolatedG1eCapturePilot } from
  './epg-g1e-isolated-pilot-core.mjs'
import { summarizePrivateJoynCaptureFailureTrace } from
  './epg-g1e-private-joyn-source-trace.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// A 14-day 56-window source run required 180 requests for 46 windows;
// allow the measured ~220 + bounded margin, plus limited matcher activity.
// NEVER used by productive Nightly; source-specific ceilings remain intact.
const MAX_GLOBAL_FETCHES = 450

// Report ONLY exact-reviewed reason codes. Source exception messages may
// contain query titles, request URLs, tokens, or programme IDs.
const SAFE_FAILURE_CODES = new Set([
  'G1E_NETWORK_REQUEST_LIMIT',
  'G1E_NETWORK_DESTINATION_BLOCKED',
  'G1E_PRIVATE_TMDB_TOKEN_REQUIRED',
  'G1E_PRIVATE_CHECKPOINT_PREFLIGHT_FAILED',
  'G1E_PRIVATE_INPUT_BOUNDS',
  'G1E_ORIGINAL_WAIPU_SOURCE_MISSING',
  'G1E_ORIGINAL_LOCAL_MATCHER_DATA_MISSING',
  'G1E_JOYN_ORIGINAL_EVIDENCE_NOT_APPROVED',
  'G1E_WAIPU_ORIGINAL_REPLAY_NOT_APPROVED',
  'G1E_ISOLATED_AB_RESULT_NOT_VERIFIED',
  'JOYN_EPG_REQUEST_BUDGET',
  'JOYN_TMDB_REQUEST_BUDGET',
  'JOYN_CLASSIFICATION_BUDGET',
  'JOYN_CLASSIFICATION_UNAVAILABLE',
  'TMDB_REQUEST_BUDGET',
])

export function sanitizePrivatePilotFailure(error, telemetry = {}) {
  const rawCode = typeof error?.code === 'string' ? error.code :
    typeof error?.message === 'string' ? error.message : ''
  const currentStage = String(telemetry.stage ?? '')
  const stages = new Set([
    'private-checkpoint-preflight', 'joyn-original-generation',
    'waipu-original-rehydration', 'waipu-ab-transport-comparison',
  ])
  return {
    kind: 'g1e-isolated-private-original-source-capture',
    schemaVersion: 1,
    status: 'failed-closed',
    mode: ['capture', 'ab'].includes(telemetry.mode)
      ? telemetry.mode : 'unavailable',
    phase: stages.has(currentStage) ? currentStage : 'private-checkpoint-preflight',
    failureClass: SAFE_FAILURE_CODES.has(rawCode)
      ? rawCode : 'UNCLASSIFIED_ORIGINAL_SOURCE_ERROR',
    boundedAllowlistedFetches: Number.isSafeInteger(telemetry.fetches) &&
      telemetry.fetches >= 0 && telemetry.fetches <= MAX_GLOBAL_FETCHES
      ? telemetry.fetches : null,
    globalFetchBudget: MAX_GLOBAL_FETCHES,
    originalTitlesOrIdsInReport: false,
    measuredProductionSavings: null,
  }
}

/**
 * The original source sync already writes an ephemeral status.json on a
 * budget exception. Its error.message and coverage may contain private data.
 * Whitelist only numeric window counters, and only for a just-failed
 * Joyn EPG budget stop. No source titles/stations/time windows are emitted.
 */
export function summarizePrivateJoynEpgBudgetFailure(status, {
  now = Date.now(), maxRequests = 250,
} = {}) {
  const m = status?.metrics
  const time = Date.parse(status?.generatedAt)
  const integer = (x, upper) =>
    Number.isSafeInteger(x) && x >= 0 && x <= upper
  if (status?.kind !== 'joyn-sync-status' ||
      status.schemaVersion !== 1 || status.status !== 'failed' ||
      status.failure?.code !== 'JOYN_EPG_REQUEST_BUDGET' ||
      !Number.isFinite(now) || !Number.isFinite(time) ||
      time > now || now - time > 10 * 60_000 ||
      !integer(maxRequests, 250) || maxRequests < 73 ||
      !integer(m?.requestsStarted, maxRequests) ||
      m.requestsStarted !== maxRequests ||
      !integer(m?.windowsProcessed, 56) ||
      !integer(m?.cacheHits, 56) ||
      m.cacheHits > m.windowsProcessed ||
      !integer(m?.splitWindows, maxRequests) ||
      !integer(m?.retries, maxRequests)) return null
  return {
    baseWindows: 56,
    processedWindows: m.windowsProcessed,
    cacheHits: m.cacheHits,
    subdividedWindows: m.splitWindows,
    startedEpgRequests: m.requestsStarted,
    retryAttempts: m.retries,
    configuredEpgBudget: maxRequests,
    completedFullHorizon: false,
  }
}

const ALLOWED_HOSTS = new Set([
  'auth.joyn.de', 'api.joyn.de', 'www.joyn.de',
  'ffqrv35svv-dsn.algolia.net', 'api.themoviedb.org',
])

function networkBoundary(fetchImpl) {
  let started = 0
  const wrapped = async (input, init) => {
    // Reject all other network destinations rather than allowing a callback
    // to export private original source data to another host.
    let url
    try { url = new URL(typeof input === 'string' || input instanceof URL
      ? input : input?.url) } catch { throw new Error('G1E_NETWORK_DESTINATION_BLOCKED') }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
      throw new Error('G1E_NETWORK_DESTINATION_BLOCKED')
    }
    if (started >= MAX_GLOBAL_FETCHES) {
      throw new Error('G1E_NETWORK_REQUEST_LIMIT')
    }
    started++
    return fetchImpl(input, init)
  }
  return { fetchImpl: wrapped, count: () => started }
}

async function readBoundedJson(file, maxBytes) {
  const meta = await lstat(file)
  if (!meta.isFile() || meta.size > maxBytes) {
    throw new Error('G1E_PRIVATE_INPUT_BOUNDS')
  }
  return JSON.parse(await readFile(file, 'utf8'))
}

async function withQuietPrivateSources(fn) {
  const old = {
    log: console.log, info: console.info, warn: console.warn,
    error: console.error, stdout: process.stdout.write,
    stderr: process.stderr.write,
  }
  console.log = console.info = console.warn = console.error = () => {}
  process.stdout.write = () => true
  process.stderr.write = () => true
  try { return await fn() } finally {
    console.log = old.log
    console.info = old.info
    console.warn = old.warn
    console.error = old.error
    process.stdout.write = old.stdout
    process.stderr.write = old.stderr
  }
}

async function runOriginalPilot({ mode, telemetry }) {
  telemetry.stage = 'private-checkpoint-preflight'
  const token = String(process.env.TMDB_API_READ_TOKEN ?? '').trim()
  if (!token) throw new Error('G1E_PRIVATE_TMDB_TOKEN_REQUIRED')
  const [waipuStatus, joynStatus, snapshot] = await Promise.all([
    readBoundedJson(join(ROOT, 'artifacts/waipu-sync/status.json'), 1024 * 1024),
    readBoundedJson(join(ROOT, 'artifacts/joyn-sync/status.json'), 1024 * 1024),
    readBoundedJson(join(ROOT, 'artifacts/waipu-live/match-decisions.json'),
      MAX_WAIPU_AB_CACHE_BYTES),
  ])
  const now = Date.now()
  const preflight = inspectPrivateWaipuAbPreflight({
    waipuStatus, joynStatus,
    waipuCacheBytes: Buffer.byteLength(JSON.stringify(snapshot)),
    waipuCache: snapshot, now,
  })
  if (!preflight.gate.readyForPrivateFreshEvidenceCollection ||
      !preflight.waipuMatcherCache.usableForBoundedAb) {
    throw new Error('G1E_PRIVATE_CHECKPOINT_PREFLIGHT_FAILED')
  }

  const [gridRecords, stationsRows, programRows, catalog, searchIndex] =
    await Promise.all([
      readWaipuCacheRecords(join(ROOT, 'artifacts/waipu-sync/cache'), 'grid'),
      readWaipuCacheRecords(join(ROOT, 'artifacts/waipu-sync/cache'), 'stations'),
      readWaipuCacheRecords(join(ROOT, 'artifacts/waipu-sync/cache'), 'program'),
      readBoundedJson(join(ROOT, 'public/catalog.json'), 128 * 1024 * 1024),
      readBoundedJson(join(ROOT, 'public/search-index.json'), 128 * 1024 * 1024),
    ])
  const selectedStations = new Set((waipuStatus.stations || []).map(x => x.id))
  const stations = (stationsRows[0]?.value || [])
    .filter(x => selectedStations.has(x?.id))
  const originals = new Map(programRows.map(x => [x.key, x.value]))
  if (!gridRecords.length || !stations.length || !originals.size) {
    throw new Error('G1E_ORIGINAL_WAIPU_SOURCE_MISSING')
  }
  const candidates = localTmdbCandidates({ catalog, searchIndex })
  if (!candidates.length) throw new Error('G1E_ORIGINAL_LOCAL_MATCHER_DATA_MISSING')

  const originalFetch = globalThis.fetch
  const boundary = networkBoundary(originalFetch)
  globalThis.fetch = boundary.fetchImpl
  try {
    const report = await withQuietPrivateSources(() =>
      runIsolatedG1eCapturePilot({
        mode, now: Date.now,
        onStage: stage => { telemetry.stage = stage },
        generateJoyn: options => {
          // Only a monotonic source-run boundary is retained. No original
          // title/programme identity is ever copied into telemetry.
          telemetry.joynStartedAt = Date.now()
          return runJoynAdapterDiagnostic({
            ...options,
            fetchImpl: boundary.fetchImpl,
            now: Date.now(),
            publicationOutput: join(ROOT, 'artifacts/g1e-private-pilot/joyn-local'),
          })
        },
        generateWaipu: options => buildWaipuLiveCatalog({
          gridRecords, stations,
          horizon: waipuStatus.horizon,
          loadProgramDetail: async id => originals.get(id) || null,
          candidates,
          // This is LOCAL private rehydration of already present original
          // records. In this phase there must be NO new Waipu/TMDB request.
          searchTmdb: null,
          decisions: new WaipuMatchDecisionStore(
            structuredClone(snapshot.decisions)),
          allowUnresolvedMatches: true,
          allowIncompleteDetails: true,
          releaseChannel: 'test',
          now: Date.now,
          ...options,
        }),
        compareWaipu: selection =>
          compareBoundedWaipuWithJoynEvidence({
            ...selection,
            waipuDecisionSnapshot: snapshot,
            token,
            fetchImpl: boundary.fetchImpl,
            now: Date.now(),
            maxRequestsPerArm: 4,
            paceMs: 250,
          }),
      }),
    )
    return {
      ...report,
      network: {
        boundedAllowlistedFetches: boundary.count(),
        globalFetchBudget: MAX_GLOBAL_FETCHES,
      },
      privacy: {
        originalTitlesOrIdsInReport: false,
        rawMatcherDecisionsExported: false,
        checkpointPersistedToCloud: false,
      },
    }
  } finally {
    telemetry.fetches = boundary.count()
    globalThis.fetch = originalFetch
  }
}

async function main(args) {
  if (args.length !== 2 || args[0] !== '--mode' ||
      !['capture', 'ab'].includes(args[1])) {
    throw new TypeError('G1E_PRIVATE_EXPLICIT_MODE_REQUIRED')
  }
  const mode = args[1]
  const expected = mode === 'capture'
    ? 'PRIVATE_G1E_CAPTURE_ONLY'
    : 'PRIVATE_G1E_AB_MAX_4_PER_ARM'
  if (process.env.G1E_PRIVATE_PILOT_CONFIRM !== expected ||
      process.env.G1E_PRIVATE_PILOT_ISOLATED !== '1') {
    throw new Error('G1E_PRIVATE_EXPLICIT_CONFIRMATION_REQUIRED')
  }
  const output = resolve(ROOT, 'artifacts/g1e-private-pilot/aggregate.json')
  const telemetry = { mode, stage: 'private-checkpoint-preflight', fetches: 0 }
  let result
  try {
    result = await runOriginalPilot({ mode, telemetry })
  } catch (error) {
    // Intentional: do not log a raw source exception on an isolated QA run.
    result = sanitizePrivatePilotFailure(error, telemetry)
    if (result.phase === 'joyn-original-generation' &&
        result.failureClass === 'JOYN_EPG_REQUEST_BUDGET') {
      try {
        const latestStatus = await readBoundedJson(
          join(ROOT, 'artifacts/joyn-sync/status.json'), 1024 * 1024)
        const epg = summarizePrivateJoynEpgBudgetFailure(latestStatus, {
          now: Date.now(),
          maxRequests: Number(process.env.JOYN_EPG_REQUEST_BUDGET),
        })
        if (epg) result.joynEpg = epg
      } catch {
        // A missing or contradictory private status must not be exposed.
      }
    }
    if (result.phase === 'joyn-original-generation') {
      let epgStatus = null
      let matcherProgress = null
      try {
        epgStatus = await readBoundedJson(
          join(ROOT, 'artifacts/joyn-sync/status.json'), 1024 * 1024)
      } catch { /* No raw source errors in a failed pilot report. */ }
      try {
        matcherProgress = await readBoundedJson(
          join(ROOT, 'artifacts/joyn-live/matching-progress.json'), 1024 * 1024)
      } catch { /* Original matcher state may not exist yet. */ }
      const sourceTrace = summarizePrivateJoynCaptureFailureTrace({
        epgStatus, matcherProgress, startedAt: telemetry.joynStartedAt,
        now: Date.now(),
        maxEpgRequests: Number(process.env.JOYN_EPG_REQUEST_BUDGET),
      })
      if (sourceTrace) result.sourceTrace = sourceTrace
    }
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf8')
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    process.exitCode = 1
    return
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf8')
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    // Never stringify the original source exception: some upstream errors
    // include private query titles, tokens, URLs or response fragments.
    console.error('G1e private isolated source pilot failed closed. No private source content disclosed.')
    process.exitCode = 1
  })
}

export { networkBoundary }
