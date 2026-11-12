/**
 * #336 G1e – read-only, PRIVATE bounded Waipu A/B input preflight.
 *
 * Runs only after the existing secure Actions job restores already-existing
 * private checkpoints. No source API, no TMDB, no matcher, no replay.
 * Reports only vetted aggregate counts/booleans; never private paths, cache
 * keys, programme titles, TMDB IDs, hashes or source payloads.
 */
import { lstat, readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WAIPU_MATCHER_VERSION } from './waipu-tmdb-matcher.mjs'

export const MAX_WAIPU_AB_CACHE_BYTES = 24 * 1024 * 1024
const MAX_STATUS_BYTES = 1024 * 1024
const MAX_CACHE_ROWS = 200_000
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_STATUS_AGE_MS = DAY_MS
const MAX_STATUS_SKEW_MS = 12 * 60 * 60 * 1000

const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype ||
    Object.getPrototypeOf(x) === null)

function validGenerationTime(value, now) {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp > now ||
      now - timestamp > MAX_STATUS_AGE_MS) return null
  return timestamp
}

export function inspectPrivateWaipuAbPreflight({
  waipuStatus = null, joynStatus = null,
  waipuCacheBytes = null, waipuCache = null,
  now = Date.now(),
} = {}) {
  if (!Number.isFinite(now)) throw new TypeError('Invalid private G1e audit time')
  const waipuHealthy = waipuStatus?.kind === 'waipu-sync-status' &&
    waipuStatus.schemaVersion === 1 && waipuStatus.status === 'complete'
  const joynHealthy = joynStatus?.kind === 'joyn-sync-status' &&
    joynStatus.schemaVersion === 1 && joynStatus.status === 'complete'
  const wTime = waipuHealthy ? validGenerationTime(waipuStatus.generatedAt, now) : null
  const jTime = joynHealthy ? validGenerationTime(joynStatus.generatedAt, now) : null
  const alignedHealthyGenerations = wTime !== null && jTime !== null &&
    Math.abs(wTime - jTime) <= MAX_STATUS_SKEW_MS

  const cacheExists = Number.isSafeInteger(waipuCacheBytes) &&
    waipuCacheBytes >= 0
  const sizeFitsController = cacheExists &&
    waipuCacheBytes <= MAX_WAIPU_AB_CACHE_BYTES
  const validShape = sizeFitsController &&
    waipuCache?.kind === 'waipu-tmdb-match-decisions' &&
    waipuCache.schemaVersion === 1 &&
    waipuCache.matcherVersion === WAIPU_MATCHER_VERSION &&
    plain(waipuCache.decisions)
  const entries = validShape ? Object.keys(waipuCache.decisions).length : null
  const originalCacheUsable = validShape &&
    entries > 0 && entries <= MAX_CACHE_ROWS
  const missing = []
  if (!waipuHealthy || !joynHealthy) missing.push('two_complete_original_source_statuses')
  if (!alignedHealthyGenerations) missing.push('recent_aligned_original_source_generations')
  if (!cacheExists) missing.push('original_waipu_matcher_cache_file')
  else if (!sizeFitsController) missing.push('waipu_cache_exceeds_24_mib_ab_controller_limit')
  else if (!originalCacheUsable) missing.push('validated_original_waipu_matcher_cache')
  // Existing cache entries are NEVER fresh approved cross-adapter receipts.
  // No private replay inputs or explicit live TMDB request budget are present.
  missing.push('fresh_explicit_joyn_matcher_approval_receipts')
  missing.push('verified_original_waipu_replay_inputs')
  missing.push('separate_live_tmdb_request_opt_in')

  return {
    kind: 'g1e-private-waipu-ab-preflight',
    schemaVersion: 1,
    mode: 'private-read-only',
    sources: {
      waipuSyncComplete: Boolean(waipuHealthy),
      joynSyncComplete: Boolean(joynHealthy),
      recentAlignedSourceGenerations: alignedHealthyGenerations,
    },
    waipuMatcherCache: {
      exists: cacheExists,
      within24MiBLimit: sizeFitsController,
      validOriginalFormatAndVersion: Boolean(validShape),
      originalDecisionEntries: validShape && entries <= MAX_CACHE_ROWS ? entries : null,
      usableForBoundedAb: Boolean(originalCacheUsable),
    },
    gate: {
      readyForPrivateFreshEvidenceCollection:
        Boolean(alignedHealthyGenerations && originalCacheUsable),
      fullJoynApprovalReceiptsAvailable: false,
      originalWaipuReplayInputsReady: false,
      canRunLiveWaipuAb: false,
      measuredAvoidedTmdbHttpRequests: null,
      missing,
    },
    limitations: 'Private restored cache and source status preflight only; no fresh receipts, no matching, no live TMDB request, no production savings.',
  }
}

async function boundedJson(file, limit) {
  let info
  try { info = await lstat(file) } catch (error) {
    if (error?.code === 'ENOENT') return { value: null, size: null }
    throw error
  }
  // Neither symlinks nor oversized files may be followed/read.
  if (!info.isFile()) return { value: null, size: null }
  if (info.size > limit) return { value: null, size: info.size }
  try {
    const value = JSON.parse(await readFile(file, 'utf8'))
    return { value, size: info.size }
  } catch {
    // The filename and content stay private even when parsing fails.
    return { value: null, size: info.size }
  }
}

async function main(argv) {
  if (argv.length !== 4 || argv[0] !== '--root' || argv[2] !== '--output') {
    throw new TypeError('Expected --root <private-root> --output <aggregate-only-json>')
  }
  const root = resolve(argv[1])
  const output = resolve(argv[3])
  const [waipu, joyn, cache] = await Promise.all([
    boundedJson(join(root, 'artifacts/waipu-sync/status.json'), MAX_STATUS_BYTES),
    boundedJson(join(root, 'artifacts/joyn-sync/status.json'), MAX_STATUS_BYTES),
    boundedJson(join(root, 'artifacts/waipu-live/match-decisions.json'),
      MAX_WAIPU_AB_CACHE_BYTES),
  ])
  const report = inspectPrivateWaipuAbPreflight({
    waipuStatus: waipu.value, joynStatus: joyn.value,
    waipuCacheBytes: cache.size, waipuCache: cache.value,
  })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  // This exact JSON is safe to expose; do not print source file contents.
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.error('Private G1e bounded Waipu A/B preflight unavailable (no source data printed)')
    process.exitCode = 1
  })
}
