/**
 * MovieHub #336 G1e – private checkpoint provenance preflight.
 *
 * READ ONLY. Intended for a dedicated, nonpublishing Actions runner which has
 * restored the already existing Waipu/Joyn PRIVATE snapshots. Does not request
 * new EPG programmes, match titles, query TMDB, or touch the production caches.
 *
 * Every emitted value is an aggregate/boolean. No titles, programme IDs,
 * source keys, cache payloads, credentials or hashes of private payloads may
 * enter logs, summaries or downloadable artifacts.
 */
import { readFile, readdir, mkdir, stat, writeFile, appendFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countPrivateCacheEntries } from './epg-g1e-stream-private-cache-count.mjs'

const MAX_JSON_BYTES = 128 * 1024 * 1024
const MAX_SAMPLE_FILES = 12
const MAX_SAMPLE_FILE_BYTES = 16 * 1024 * 1024
const MAX_CACHE_ROWS = 400_000
const DAY = 86_400_000

const safeObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const validTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const title = (value) => typeof value === 'string' && value.trim().length > 0

function countObject(value) {
  if (!safeObject(value)) return null
  const count = Object.keys(value).length
  if (count > MAX_CACHE_ROWS) throw new RangeError('Private source snapshot exceeds bounded audit limits')
  return count
}

function ageDays(value, now) {
  if (!validTime(value)) return null
  const elapsed = now - Date.parse(value)
  if (elapsed < 0 || elapsed > 3650 * DAY) return null
  return Math.round(elapsed / DAY * 10) / 10
}

function waipuProgrammeCount(records) {
  let recordsInspected = 0
  let programmesWithId = 0
  let programmesWithOriginalTitle = 0
  for (const record of records) {
    if (!safeObject(record) || record.kind !== 'grid' || !Array.isArray(record.value)) continue
    recordsInspected++
    for (const event of record.value) {
      if (title(event?.id)) programmesWithId++
      if (title(event?.id) && title(event?.title)) programmesWithOriginalTitle++
    }
  }
  return { cacheGridRecordsInspected: recordsInspected, programmesWithId,
    programmesWithOriginalTitle }
}

function joynProgrammeCount(windows) {
  let windowsInspected = 0
  let programmesWithId = 0
  let programmesWithOriginalTitle = 0
  for (const window of windows) {
    if (!safeObject(window) || !Array.isArray(window.items)) continue
    windowsInspected++
    for (const item of window.items) {
      if (title(item?.program?.id)) programmesWithId++
      if (title(item?.program?.id) && title(item?.program?.title)) programmesWithOriginalTitle++
    }
  }
  return { rawWindowsInspected: windowsInspected, programmesWithId,
    programmesWithOriginalTitle }
}

/**
 * Pure aggregate report from PRIVATE source records and matcher/response caches.
 * Positive title availability is NOT an approved TMDB matcher receipt.
 * The old decisions can be read, but may be too old to create G1e receipts.
 */
export function inspectPrivateG1eSourceState({
  waipuCheckpoint, joynCheckpoint, waipuStatus = null, joynStatus = null,
  waipuDecisions = null, joynMatchCache = null, joynLookupCache = null,
  waipuGridSamples = [], joynWindowSamples = [],
  oversizedWaipuSampleFiles = 0, oversizedJoynSampleFiles = 0,
  oversizedMatcherCacheFiles = 0,
  joynMatchStream = null, joynLookupStream = null,
  failedCacheStreamCounts = 0,
  now = Date.now(),
} = {}) {
  if (!Number.isFinite(now) || !Array.isArray(waipuGridSamples) ||
      !Array.isArray(joynWindowSamples) ||
      waipuGridSamples.length > MAX_SAMPLE_FILES ||
      joynWindowSamples.length > MAX_SAMPLE_FILES) {
    throw new TypeError('Private checkpoint audit inputs must be bounded')
  }
  if (waipuCheckpoint?.kind !== 'waipu-sync-checkpoint' ||
      waipuCheckpoint.schemaVersion !== 1 ||
      !safeObject(waipuCheckpoint.slots) ||
      joynCheckpoint?.kind !== 'joyn-sync-checkpoint' ||
      joynCheckpoint.schemaVersion !== 1 ||
      !safeObject(joynCheckpoint.windows)) {
    throw new TypeError('Expected two validated private sync checkpoint generations')
  }
  const waipuSlots = countObject(waipuCheckpoint.slots)
  const joynWindows = countObject(joynCheckpoint.windows)
  const waipuCount = waipuProgrammeCount(waipuGridSamples)
  const joynCount = joynProgrammeCount(joynWindowSamples)
  const waipuDecisionEntries = waipuDecisions?.kind === 'waipu-tmdb-match-decisions' &&
    waipuDecisions?.schemaVersion === 1 ? countObject(waipuDecisions.decisions) : null
  const joynDecisionEntries = joynMatchCache?.kind === 'joyn-match-cache' &&
    joynMatchCache?.schemaVersion === 1 ? countObject(joynMatchCache.entries)
    : joynMatchStream?.kind === 'joyn-match-cache' && joynMatchStream?.schemaVersion === 1 &&
      joynMatchStream?.streamed === true &&
      Number.isSafeInteger(joynMatchStream?.entries) && joynMatchStream.entries >= 0
      ? joynMatchStream.entries : null
  const joynResponseEntries = joynLookupCache?.kind === 'joyn-lookup-cache' &&
    joynLookupCache?.schemaVersion === 1 ? countObject(joynLookupCache.entries)
    : joynLookupStream?.kind === 'joyn-lookup-cache' && joynLookupStream?.schemaVersion === 1 &&
      joynLookupStream?.streamed === true &&
      Number.isSafeInteger(joynLookupStream?.entries) && joynLookupStream.entries >= 0
      ? joynLookupStream.entries : null

  const cacheSnapshotsPresent = waipuDecisionEntries !== null &&
    joynDecisionEntries !== null && joynResponseEntries !== null
  const rawSourceTitlesSampled =
    waipuCount.programmesWithOriginalTitle > 0 &&
    joynCount.programmesWithOriginalTitle > 0
  const waipuSyncComplete = waipuStatus?.status === 'complete'
  const joynSyncComplete = joynStatus?.status === 'complete'
  const sourceStatusAvailable = waipuSyncComplete && joynSyncComplete

  const missing = []
  if (!sourceStatusAvailable) missing.push('complete_waipu_and_joyn_sync_status')
  if (waipuSlots === 0 || joynWindows === 0) missing.push('populated_source_checkpoint')
  if (!rawSourceTitlesSampled) missing.push('original_raw_epg_title_sample')
  if (!cacheSnapshotsPresent) missing.push('all_original_matcher_and_response_caches')
  // G1e approved receipts are generated only by the explicit live matcher
  // callbacks. A restored decision cache is not itself such a receipt.
  if (oversizedWaipuSampleFiles || oversizedJoynSampleFiles) {
    missing.push('sampled_raw_source_files_above_safe_read_limit')
  }
  if (oversizedMatcherCacheFiles) {
    missing.push('matcher_cache_files_above_safe_read_limit')
  }
  if (failedCacheStreamCounts) missing.push('private_cache_stream_count_failed')
  missing.push('fresh_explicit_original_matcher_approval_receipts')

  return {
    kind: 'g1e-private-checkpoint-readiness',
    schemaVersion: 1,
    mode: 'private-read-only',
    waipu: {
      syncComplete: waipuSyncComplete,
      checkpointSlots: waipuSlots,
      checkpointAgeDays: ageDays(waipuCheckpoint.updatedAt, now),
      ...waipuCount,
      originalMatcherCacheEntries: waipuDecisionEntries,
    },
    joyn: {
      syncComplete: joynSyncComplete,
      checkpointWindows: joynWindows,
      ...joynCount,
      originalMatcherCacheEntries: joynDecisionEntries,
      tmdbResponseCacheEntries: joynResponseEntries,
    },
    auditLimits: {
      oversizedWaipuSampleFiles,
      oversizedJoynSampleFiles,
      oversizedMatcherCacheFiles,
      streamedJoynMatchCache: joynMatchStream?.streamed === true,
      streamedJoynResponseCache: joynLookupStream?.streamed === true,
      failedCacheStreamCounts,
    },
    gate: {
      existingPrivateSourceDataAccessible: rawSourceTitlesSampled &&
        waipuSlots > 0 && joynWindows > 0,
      originalCachesPresent: cacheSnapshotsPresent,
      originalCachesFullyLoadableWithinAuditLimit:
        cacheSnapshotsPresent && oversizedMatcherCacheFiles === 0,
      fullMatchApprovalReceiptsAvailable: false,
      canRunUnmodifiedOriginalMatcherAb: false,
      actualAvoidedTmdbRequests: null,
      missing,
    },
    limitations: 'Sampled PRIVATE source caches only; no matching, TMDB requests, provider routes or cache publication.',
  }
}

async function readJson(path, { required = true, maxBytes = MAX_JSON_BYTES } = {}) {
  let info
  try { info = await stat(path) } catch (error) {
    if (!required && error?.code === 'ENOENT') return null
    throw error
  }
  if (!info.isFile()) throw new TypeError('Private checkpoint input is not a regular file')
  if (info.size > maxBytes) {
    // Optional cache snapshots may be huge. A read-only audit should report
    // their bounded-availability status, not try to load or inflate them.
    if (!required) return null
    throw new RangeError('Required private checkpoint input exceeds bounded file size')
  }
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function sampleJsonFiles(directory, { maxBytes = MAX_SAMPLE_FILE_BYTES } = {}) {
  let files
  try { files = (await readdir(directory)).filter(name => name.endsWith('.json')).sort() }
  catch (error) {
    if (error?.code === 'ENOENT') return { records: [], oversizedFiles: 0 }
    throw error
  }
  if (files.length > MAX_CACHE_ROWS) throw new RangeError('Private source cache has excessive file count')
  const selected = []
  let oversizedFiles = 0
  // Deterministic spacing samples early/middle/late positions, not filename
  // content or random/private identifiers.
  const count = Math.min(files.length, MAX_SAMPLE_FILES)
  for (let i = 0; i < count; i++) {
    const index = count === 1 ? 0 : Math.floor(i * (files.length - 1) / (count - 1))
    const path = join(directory, files[index])
    const info = await stat(path)
    if (!info.isFile() || info.size > maxBytes) {
      oversizedFiles++
      continue
    }
    selected.push(await readJson(path, { maxBytes }))
  }
  return { records: selected, oversizedFiles }
}

export async function readOptionalBoundedJson(path, { maxBytes = MAX_JSON_BYTES } = {}) {
  return readJson(path, { required: false, maxBytes })
}

async function exceedsLimit(path, limit) {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > limit
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function args(argv) {
  if (argv.length !== 4 || argv[0] !== '--root' || argv[2] !== '--output') {
    throw new TypeError('Expected --root <isolated-private-cache-root> --output <aggregate-report>')
  }
  return { root: resolve(argv[1]), output: resolve(argv[3]) }
}

function markdown(report) {
  return [
    '# G1e – private source checkpoint readiness (read-only)',
    '',
    '| Source/caches | Waipu | Joyn |',
    '|---|---:|---:|',
    '| Original raw programmes with title in bounded sample | ' +
      report.waipu.programmesWithOriginalTitle + ' | ' +
      report.joyn.programmesWithOriginalTitle + ' |',
    '| Original matcher decision cache entries | ' +
      (report.waipu.originalMatcherCacheEntries ?? 'unavailable') + ' | ' +
      (report.joyn.originalMatcherCacheEntries ?? 'unavailable') + ' |',
    '| Checkpoint slots/windows | ' +
      report.waipu.checkpointSlots + ' | ' + report.joyn.checkpointWindows + ' |',
    '',
    '**No original matcher approval receipts are reconstructed from cached decisions.**',
    '**No real TMDB request reduction has been measured.**',
    '',
    'Large Joyn caches streamed: matcher=' + report.auditLimits.streamedJoynMatchCache +
      ', TMDB response=' + report.auditLimits.streamedJoynResponseCache +
      ', failed scans=' + report.auditLimits.failedCacheStreamCounts,
    '',
    'Size-limited sampled files: ' +
      (report.auditLimits.oversizedWaipuSampleFiles + report.auditLimits.oversizedJoynSampleFiles) +
      '; oversized original caches: ' + report.auditLimits.oversizedMatcherCacheFiles,
    '',
  ].join('\n')
}

async function main(argv) {
  const { root, output } = args(argv)
  const file = p => join(root, p)
  const [
    waipuCheckpoint, joynCheckpoint, waipuStatus, joynStatus,
    waipuDecisions, joynMatchCache, joynLookupCache, waipuGridSamples,
    joynWindowSamples,
  ] = await Promise.all([
    readJson(file('artifacts/waipu-sync/checkpoint.json')),
    readJson(file('artifacts/joyn-sync/checkpoint.json')),
    readJson(file('artifacts/waipu-sync/status.json'), { required: false }),
    readJson(file('artifacts/joyn-sync/status.json'), { required: false }),
    readJson(file('artifacts/waipu-live/match-decisions.json'), { required: false }),
    readJson(file('artifacts/joyn-live/match-cache.json'), { required: false }),
    readJson(file('artifacts/joyn-live/lookup-cache.json'), { required: false }),
    sampleJsonFiles(file('artifacts/waipu-sync/cache/grid')),
    sampleJsonFiles(file('artifacts/joyn-sync/cache')),
  ])
  const cacheOverLimits = await Promise.all([
    'artifacts/waipu-live/match-decisions.json',
    'artifacts/joyn-live/match-cache.json',
    'artifacts/joyn-live/lookup-cache.json',
  ].map(path => exceedsLimit(file(path), MAX_JSON_BYTES)))
  let failedCacheStreamCounts = 0
  async function countOversizedJoynCache(path, expectedKind, isOversized) {
    if (!isOversized) return null
    try {
      return await countPrivateCacheEntries(file(path), { expectedKind })
    } catch {
      // No raw JSON contents or private filesystem error text ever appear.
      failedCacheStreamCounts++
      return null
    }
  }
  const [joynMatchStream, joynLookupStream] = await Promise.all([
    countOversizedJoynCache('artifacts/joyn-live/match-cache.json',
      'joyn-match-cache', cacheOverLimits[1]),
    countOversizedJoynCache('artifacts/joyn-live/lookup-cache.json',
      'joyn-lookup-cache', cacheOverLimits[2]),
  ])
  const report = inspectPrivateG1eSourceState({
    waipuCheckpoint, joynCheckpoint, waipuStatus, joynStatus, waipuDecisions,
    joynMatchCache, joynLookupCache, joynMatchStream, joynLookupStream,
    failedCacheStreamCounts,
    waipuGridSamples: waipuGridSamples.records,
    joynWindowSamples: joynWindowSamples.records,
    oversizedWaipuSampleFiles: waipuGridSamples.oversizedFiles,
    oversizedJoynSampleFiles: joynWindowSamples.oversizedFiles,
    oversizedMatcherCacheFiles: cacheOverLimits.filter(Boolean).length,
  })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  const summary = markdown(report)
  process.stdout.write(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    // Do not print raw source/JSON parse errors: inputs are private.
    console.error('Private G1e source readiness audit failed (' +
      (error instanceof RangeError ? 'bounded input' : 'invalid or unavailable input') + ')')
    process.exitCode = 1
  })
}
