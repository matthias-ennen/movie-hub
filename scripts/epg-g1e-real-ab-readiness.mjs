/**
 * #336 G1e – real Nightly replay readiness audit (read-only).
 *
 * A healthy SourceAdapter JSON envelope is NOT a matcher decision log.
 * The historical artifact contains TV airings, not original Waipu titles or
 * separate cache snapshots / approved match receipts. Report that boundary,
 * instead of fabricating a "real" A/B TMDB saving from matching TMDB IDs.
 *
 * No network calls, source mutation, cache restore, Firebase, or TMDB tokens.
 * Only aggregate numbers and booleans leave this process.
 */
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_RECORDS = 125_000
const MAX_JSON_BYTES = 150 * 1024 * 1024
const ASSET_PATHS = Object.freeze({
  waipuDecisions: 'artifacts/waipu-live/match-decisions.json',
  joynDecisions: 'artifacts/joyn-live/match-cache.json',
  joynResponseCache: 'artifacts/joyn-live/lookup-cache.json',
  waipuGrid: 'artifacts/waipu-sync',
  joynSource: 'artifacts/joyn-sync',
})

async function exists(path) {
  try {
    const file = await stat(path)
    return file.isFile() || file.isDirectory()
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function readBoundedJson(path) {
  const file = await stat(path)
  if (!file.isFile() || file.size > MAX_JSON_BYTES) {
    throw new RangeError('G1e audit input must be a bounded JSON file')
  }
  return JSON.parse(await readFile(path, 'utf8'))
}

function examineEnvelope(envelope, expectedSource) {
  if (!envelope || envelope.sourceId !== expectedSource ||
      !Array.isArray(envelope.records) || envelope.records.length > MAX_RECORDS) {
    throw new TypeError('G1e audit requires the exact bounded ' + expectedSource + ' envelope')
  }
  const summary = {
    sourceHealthy: envelope.sourceStatus === 'healthy',
    events: 0,
    originalTitlesInEnvelope: 0,
    positiveTmdbIdentities: 0,
    externalSourceReferences: 0,
    explicitApprovedMatcherReceipts: 0,
  }
  const sourceRef = expectedSource === 'waipu' ? 'waipu-epg' : 'joyn-epg'
  for (const row of envelope.records) {
    if (row?.kind !== 'broadcast') continue
    summary.events++
    const title = row?.extensions?.[expectedSource]?.rawTitle
    if (typeof title === 'string' && title.trim()) summary.originalTitlesInEnvelope++
    const id = Number(row?.titleRef?.tmdbId)
    if (Number.isSafeInteger(id) && id > 0 &&
        ['movie', 'series', 'tv'].includes(row?.titleRef?.mediaType)) {
      summary.positiveTmdbIdentities++
    }
    if (Array.isArray(row?.sourceRefs) &&
        row.sourceRefs.some(ref => ref?.sourceId === sourceRef &&
          typeof ref.externalId === 'string' && ref.externalId.trim())) {
      summary.externalSourceReferences++
    }
    // The SourceAdapter contract is a downstream publication. None of its
    // fields is an ORIGINAL, explicitly approved matcher receipt. Do not
    // count matchConfidence/matchReason/TMDB ID as a matcher approval.
  }
  return summary
}

/**
 * @returns {object} Aggregate-only suitability check. Never reports "ready"
 * from the published TV events or a match-cache artifact alone.
 */
export function evaluateRealEpgAbReadiness({
  waipuEnvelope, joynEnvelope, archiveAssets = {},
} = {}) {
  const waipu = examineEnvelope(waipuEnvelope, 'waipu')
  const joyn = examineEnvelope(joynEnvelope, 'joyn')
  const files = Object.fromEntries(Object.keys(ASSET_PATHS).map(k => [
    k, archiveAssets[k] === true,
  ]))
  const completeCacheSnapshot = files.waipuDecisions &&
    files.joynDecisions && files.joynResponseCache
  const rawInputsAvailable = files.waipuGrid && files.joynSource
  const inMemorySourceApprovalsAvailable = false // not represented by either historical envelope
  const prerequisites = {
    healthyWaipuAndJoyn: waipu.sourceHealthy && joyn.sourceHealthy,
    fullRawProgrammeInputsInArtifact: rawInputsAvailable,
    identicalInitialAdapterCacheSnapshotsInArtifact: completeCacheSnapshot,
    originalWaipuEpgTitlesInEnvelope: waipu.originalTitlesInEnvelope === waipu.events &&
      waipu.events > 0,
    freshOriginalMatcherApprovalsInArtifact: inMemorySourceApprovalsAvailable,
  }
  const missing = []
  if (!prerequisites.healthyWaipuAndJoyn) missing.push('healthy_source_generations')
  if (!prerequisites.fullRawProgrammeInputsInArtifact) missing.push('original_source_programme_inputs')
  if (!prerequisites.identicalInitialAdapterCacheSnapshotsInArtifact) missing.push('independent_starting_cache_snapshots')
  if (!prerequisites.originalWaipuEpgTitlesInEnvelope) missing.push('original_waipu_epg_title_provenance')
  if (!prerequisites.freshOriginalMatcherApprovalsInArtifact) missing.push('matcher_approved_receipts')
  return {
    kind: 'g1e-historical-ab-readiness-audit',
    schemaVersion: 1,
    mode: 'read-only-existing-artifact',
    sources: { waipu, joyn },
    archivedAssets: files,
    prerequisites,
    disposition: {
      canReplayPublishedEpgOverlap: prerequisites.healthyWaipuAndJoyn,
      canPerformComparableOriginalMatcherAb: false,
      canClaimActualAvoidedTmdbRequests: false,
      missing,
    },
    measurements: {
      actualAvoidedTmdbRequests: null,
      crossAdapterIndexEnabledInNightly: false,
    },
    nextStep: 'Capture source-programme original titles and approved matcher decisions in a separately opted-in, healthy source generation; restore independent identical matcher and TMDB response cache snapshots in a private QA job.',
  }
}

function usage(args) {
  if (!Array.isArray(args) || args.length !== 4 ||
      args[0] !== '--root' || args[2] !== '--output') {
    throw new TypeError('Usage: node scripts/epg-g1e-real-ab-readiness.mjs --root <unpacked-artifact> --output <aggregate-json>')
  }
  return { root: resolve(args[1]), output: resolve(args[3]) }
}

async function main(args) {
  const { root, output } = usage(args)
  const [waipuEnvelope, joynEnvelope, fileStatuses] = await Promise.all([
    readBoundedJson(join(root, 'artifacts/source-adapters/waipu-v1.json')),
    readBoundedJson(join(root, 'artifacts/source-adapters/joyn-v1-diagnostic.json')),
    Promise.all(Object.entries(ASSET_PATHS)
      .map(async ([k, p]) => [k, await exists(join(root, p))])),
  ])
  const result = evaluateRealEpgAbReadiness({
    waipuEnvelope, joynEnvelope,
    archiveAssets: Object.fromEntries(fileStatuses),
  })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf8')
  const s = result.sources
  process.stdout.write([
    '# G1e real A/B readiness – actual archived generation',
    '',
    '| Evidence | Waipu | Joyn |',
    '|---|---:|---:|',
    '| Published airings | ' + s.waipu.events + ' | ' + s.joyn.events + ' |',
    '| Original EPG titles in published envelope | ' +
       s.waipu.originalTitlesInEnvelope + ' | ' + s.joyn.originalTitlesInEnvelope + ' |',
    '| Original source programme references | ' +
       s.waipu.externalSourceReferences + ' | ' + s.joyn.externalSourceReferences + ' |',
    '| Explicit approved original matcher receipts | ' +
       s.waipu.explicitApprovedMatcherReceipts + ' | ' +
       s.joyn.explicitApprovedMatcherReceipts + ' |',
    '',
    '**Real A/B HTTP savings are NOT measurable from this historical published-artifact alone.**',
    '',
    'Missing: ' + result.disposition.missing.join(', '),
    '',
  ].join('\n'))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => {
    console.error('G1e A/B readiness audit failed:', String(e?.message || e))
    process.exitCode = 1
  })
}
