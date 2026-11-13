/**
 * MovieHub #336 G1l – reconcile two independent, private, read-only audits.
 *
 * The first G1j checkpoint audit has a deliberately small JSON file limit;
 * the second G1k audit actually loads the original Joyn matcher & lookup
 * caches up to a strictly bounded size. The former's "NOT READY" is not
 * automatically a permanent blocker when only the old file-size bound failed.
 *
 * This does NOT load source programmes or match/approve content. It consumes
 * ONLY the two independently produced, fixed-path private aggregate reports.
 * All outputs are allowlisted, aggregated, and never approve external calls.
 */
import { lstat, readFile, mkdir, open } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isSafeG1iOriginalReaderReport } from './epg-g1i-private-joyn-original-loader.mjs'

const MAX_REPORT_BYTES = 16 * 1024
const MAX_ENTRIES = 400_000
const EXPECTED_MISSING = new Set([
  'fresh_explicit_original_matcher_approval_receipts',
  'matcher_cache_files_above_safe_read_limit',
])

function boundedInt(v) {
  return Number.isSafeInteger(v) && v >= 0 && v <= MAX_ENTRIES
}
function age(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 48
}
function sourceShape(s) {
  const a = s?.auditLimits, g = s?.gate
  return s?.kind === 'g1e-private-checkpoint-readiness' &&
    s.schemaVersion === 1 && s.mode === 'private-read-only' &&
    a && g &&
    s.waipu?.syncComplete === true && s.joyn?.syncComplete === true &&
    boundedInt(s.waipu?.originalMatcherCacheEntries) &&
    boundedInt(s.joyn?.originalMatcherCacheEntries) &&
    boundedInt(s.joyn?.tmdbResponseCacheEntries) &&
    boundedInt(s.waipu?.checkpointSlots) &&
    boundedInt(s.joyn?.checkpointWindows) &&
    boundedInt(s.waipu?.programmesWithOriginalTitle) &&
    boundedInt(s.joyn?.programmesWithOriginalTitle) &&
    boundedInt(a.oversizedWaipuSampleFiles) &&
    boundedInt(a.oversizedJoynSampleFiles) &&
    boundedInt(a.oversizedMatcherCacheFiles) &&
    boundedInt(a.failedCacheStreamCounts) &&
    typeof a.streamedJoynMatchCache === 'boolean' &&
    typeof a.streamedJoynResponseCache === 'boolean' &&
    Array.isArray(g.missing) && g.missing.length <= 10 &&
    g.missing.every(x => typeof x === 'string' && x.length <= 96) &&
    g.g1iLiveSourceRequestApproval === false &&
    g.g1iActualSharedCacheSnapshotObserved === false &&
    g.fullMatchApprovalReceiptsAvailable === false &&
    g.canRunUnmodifiedOriginalMatcherAb === false &&
    g.actualAvoidedTmdbRequests === null
}

export function reconcilePrivateG1iPreflight({ source, originalReader } = {}) {
  const s = sourceShape(source) ? source : null
  const readerValid = isSafeG1iOriginalReaderReport(originalReader)
  const originalLoadable = readerValid &&
    originalReader.gate.bothOriginalReadersLoadable
  const sourceFresh = Boolean(s &&
    s.gate.recentHealthyOriginalSourceStatuses === true &&
    age(s.waipu.statusAgeHours) && age(s.joyn.statusAgeHours) &&
    s.gate.existingPrivateSourceDataAccessible === true &&
    s.gate.originalCachesPresent === true &&
    s.waipu.checkpointSlots > 0 && s.joyn.checkpointWindows > 0 &&
    s.waipu.programmesWithOriginalTitle > 0 &&
    s.joyn.programmesWithOriginalTitle > 0 &&
    s.waipu.originalMatcherCacheEntries > 0 &&
    s.joyn.originalMatcherCacheEntries > 0 &&
    s.joyn.tmdbResponseCacheEntries > 0)
  const countsEqual = Boolean(s && originalLoadable &&
    originalReader.matcher.count === s.joyn.originalMatcherCacheEntries &&
    originalReader.responses.count === s.joyn.tmdbResponseCacheEntries)
  const a = s?.auditLimits
  const oversizedJoynFiles =
    Number(a?.streamedJoynMatchCache === true) +
    Number(a?.streamedJoynResponseCache === true)
  // No Waipu oversize, no unreadable raw source sample, no failed stream.
  // Both historically oversized Joyn files must be proven loadable by
  // their ORIGINAL readers in the second independently generated report.
  const onlyOldFileLimit = Boolean(s && a.oversizedWaipuSampleFiles === 0 &&
    a.oversizedJoynSampleFiles === 0 && a.failedCacheStreamCounts === 0 &&
    a.oversizedMatcherCacheFiles === oversizedJoynFiles &&
    s.gate.missing.includes('fresh_explicit_original_matcher_approval_receipts') &&
    s.gate.missing.every(x => EXPECTED_MISSING.has(x)) &&
    (oversizedJoynFiles === 0
      ? s.gate.g1iPrivateCapturePreflightSuitable === true &&
        s.gate.originalCachesFullyLoadableWithinAuditLimit === true &&
        !s.gate.missing.includes('matcher_cache_files_above_safe_read_limit')
      : s.gate.g1iPrivateCapturePreflightSuitable === false &&
        s.gate.originalCachesFullyLoadableWithinAuditLimit === false &&
        s.gate.missing.includes('matcher_cache_files_above_safe_read_limit')))
  const readyForReview = sourceFresh && originalLoadable && countsEqual && onlyOldFileLimit
  const reasons = []
  if (!sourceFresh) reasons.push('source_freshness_or_provenance_unverified')
  if (!originalLoadable) reasons.push('original_cache_load_unverified')
  if (!countsEqual) reasons.push('original_cache_entry_counts_disagree')
  if (!onlyOldFileLimit) reasons.push('non_size_only_checkpoint_blocker')
  // No private keys, titles, paths, approval records, or raw hashes.
  return {
    kind: 'g1i-private-reconciled-preflight',
    schemaVersion: 1,
    mode: 'private-read-only',
    counts: {
      waipuMatcherEntries: s?.waipu.originalMatcherCacheEntries ?? null,
      joynMatcherEntries: s?.joyn.originalMatcherCacheEntries ?? null,
      joynSearchResponseEntries: s?.joyn.tmdbResponseCacheEntries ?? null,
    },
    gate: {
      recentHealthySourceCheckpoints: sourceFresh,
      originalJoynCacheReadersLoadable: originalLoadable,
      originalCacheEntryCountsAgree: countsEqual,
      historicalAuditSizeLimitOnly: onlyOldFileLimit,
      readyForIsolatedStagingDesignReview: readyForReview,
      // NEVER auto-activate actual capture, original matcher approval, or
      // production response cache. Positive gate is only for QA planning.
      liveSourceRequestsApproved: false,
      sourceMatcherApprovalsPresent: false,
      sharedTmdbResponseReadsApproved: false,
      xmltvPublicationApproved: false,
      measuredProductionSavings: null,
    },
    reasons,
  }
}

const EXPECTED_REASONS = new Set([
  'source_freshness_or_provenance_unverified',
  'original_cache_load_unverified',
  'original_cache_entry_counts_disagree',
  'non_size_only_checkpoint_blocker',
])
export function isSafeReconciledPrivateG1iReport(r) {
  const sameKeys = (v, allowed) =>
    v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).sort().join('|') === [...allowed].sort().join('|')
  const g = r?.gate, c = r?.counts
  return sameKeys(r, ['kind', 'schemaVersion', 'mode', 'counts', 'gate', 'reasons']) &&
    r.kind === 'g1i-private-reconciled-preflight' && r.schemaVersion === 1 &&
    r.mode === 'private-read-only' &&
    sameKeys(c, ['waipuMatcherEntries', 'joynMatcherEntries', 'joynSearchResponseEntries']) &&
    Object.values(c).every(v => v === null || boundedInt(v)) &&
    sameKeys(g, ['recentHealthySourceCheckpoints', 'originalJoynCacheReadersLoadable',
      'originalCacheEntryCountsAgree', 'historicalAuditSizeLimitOnly',
      'readyForIsolatedStagingDesignReview', 'liveSourceRequestsApproved',
      'sourceMatcherApprovalsPresent', 'sharedTmdbResponseReadsApproved',
      'xmltvPublicationApproved', 'measuredProductionSavings']) &&
    ['recentHealthySourceCheckpoints', 'originalJoynCacheReadersLoadable',
      'originalCacheEntryCountsAgree', 'historicalAuditSizeLimitOnly',
      'readyForIsolatedStagingDesignReview'].every(k => typeof g[k] === 'boolean') &&
    g.readyForIsolatedStagingDesignReview === (
      g.recentHealthySourceCheckpoints && g.originalJoynCacheReadersLoadable &&
      g.originalCacheEntryCountsAgree && g.historicalAuditSizeLimitOnly) &&
    g.liveSourceRequestsApproved === false &&
    g.sourceMatcherApprovalsPresent === false &&
    g.sharedTmdbResponseReadsApproved === false &&
    g.xmltvPublicationApproved === false &&
    g.measuredProductionSavings === null &&
    Array.isArray(r.reasons) && r.reasons.length <= EXPECTED_REASONS.size &&
    new Set(r.reasons).size === r.reasons.length &&
    r.reasons.every(reason => EXPECTED_REASONS.has(reason)) &&
    r.reasons.length === Number(!g.recentHealthySourceCheckpoints) +
      Number(!g.originalJoynCacheReadersLoadable) +
      Number(!g.originalCacheEntryCountsAgree) +
      Number(!g.historicalAuditSizeLimitOnly) &&
    JSON.stringify(r).length < 1800
}

async function readBoundedFixedReport(file) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() ||
      info.size < 1 || info.size > MAX_REPORT_BYTES) {
    throw new TypeError('Invalid isolated aggregate file')
  }
  return JSON.parse(await readFile(file, 'utf8'))
}

async function main(args) {
  if (args.length !== 4 || args[0] !== '--root' || args[2] !== '--output') {
    throw new TypeError('Expected private report directory and aggregate output path')
  }
  const root = resolve(args[1])
  const [source, originalReader] = await Promise.all([
    readBoundedFixedReport(join(root, 'aggregate.json')),
    readBoundedFixedReport(join(root, 'joyn-original-reader.json')),
  ])
  const result = reconcilePrivateG1iPreflight({ source, originalReader })
  if (!isSafeReconciledPrivateG1iReport(result)) throw new Error('Unsafe aggregate')
  const path = resolve(args[3])
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const handle = await open(path, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(result, null, 2) + '\n', 'utf8') }
  finally { await handle.close() }
  process.stdout.write(JSON.stringify(result) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.error('Private G1i readiness reconciliation unavailable.')
    process.exitCode = 1
  })
}
