/**
 * MovieHub #336 / G2l - the FIRST actual G2c file -> G2d source validation
 * -> G2j local matcher / Waipu-Joyn airing-merge execution in one runner.
 *
 * Original third-party EPG is read ONLY from G2c's private 0700 workspace.
 * No persistent checkpoint, database, app publication, remote search or
 * network access. This module emits only a fixed, numeric aggregate.
 */
import { lstat, readdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isSafeXmltvG2StagingReport } from './xmltv-g2-private-staging.mjs'
import { replayXmltvPrivateLkg } from
  '../src/sources/xmltv/xmltvPrivateLkgReplay.js'
import { runXmltvG2jPrivateIntegrationPreview } from
  './xmltv-g2j-private-integration-preview.mjs'
import { XMLTV_VERIFIED_SOURCE_FAMILIES } from
  '../src/sources/xmltv/xmltvSourceReadiness.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_REPORT = join(ROOT, 'artifacts/xmltv-g2/report.json')
const DEFAULT_PRIVATE = join(ROOT, 'artifacts/xmltv-g2/private')
const IDS = Object.freeze(Object.keys(XMLTV_VERIFIED_SOURCE_FAMILIES))
const MAX_SNAPSHOT_BYTES = 96 * 1024 * 1024
const MAX_REPORT_BYTES = 8192
const MAX_REPORT_AGE_MS = 36 * 60 * 60 * 1000
const STATUSES = Object.freeze(['selected', 'unavailable', 'invalid'])
const keys = (value, fields) => value && typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...fields].sort().join('|')
const int = (value, max) => Number.isSafeInteger(value) &&
  value >= 0 && value <= max

const safePrivateFile = async (path, maxBytes) => {
  const st = await lstat(path)
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 ||
      st.size < 1 || st.size > maxBytes) {
    throw new TypeError('Unsafe private XMLTV source file')
  }
  return JSON.parse(await readFile(path, 'utf8'))
}

/** No original title, sourceRef, private filename or matcher output may escape. */
export function isSafeXmltvG2lPrivateAdapterReport(report) {
  const fields = [
    'kind', 'schemaVersion', 'mode', 'matcherCatalogMode', 'sources',
    'selectedSources', 'unavailableSources', 'invalidSources',
    'availableIndependentFamilies', 'stationsWithIndependentOverlap',
    'selectedCandidateCount', 'locallyMatchedCount', 'locallyUnmatchedCount',
    'baselineMergedAirings', 'mergedAiringsWithXmltvPreview',
    'maximumPreviewDays', 'fiveDaysRequiredToKeepSource',
    'originalCloudObjectsCreated', 'productiveWrites',
    'publishApproved', 'tmdbIdentityApproved', 'playbackRoutesApproved',
  ]
  if (!keys(report, fields) ||
      report.kind !== 'xmltv-g2l-private-adapter-aggregate' ||
      report.schemaVersion !== 1 ||
      report.mode !== 'same-run-original-source-offline-no-publication' ||
      !['empty-local-catalog', 'provided-local-only'].includes(report.matcherCatalogMode) ||
      !Array.isArray(report.sources) || report.sources.length < 1 ||
      report.sources.length > IDS.length ||
      !int(report.selectedSources, IDS.length) ||
      !int(report.unavailableSources, IDS.length) ||
      !int(report.invalidSources, IDS.length) ||
      report.selectedSources + report.unavailableSources +
        report.invalidSources !== report.sources.length ||
      !int(report.availableIndependentFamilies, 2) ||
      !int(report.stationsWithIndependentOverlap, 6) ||
      !int(report.selectedCandidateCount, 20_000) ||
      !int(report.locallyMatchedCount, 20_000) ||
      !int(report.locallyUnmatchedCount, 20_000) ||
      report.locallyMatchedCount + report.locallyUnmatchedCount !==
        report.selectedCandidateCount ||
      !int(report.baselineMergedAirings, 100_000) ||
      !int(report.mergedAiringsWithXmltvPreview, 120_000) ||
      report.maximumPreviewDays !== 14 ||
      report.fiveDaysRequiredToKeepSource !== false ||
      report.originalCloudObjectsCreated !== 0 ||
      report.productiveWrites !== 0 ||
      report.publishApproved !== false ||
      report.tmdbIdentityApproved !== false ||
      report.playbackRoutesApproved !== false) return false
  const seen = new Set()
  for (const source of report.sources) {
    if (!keys(source, [
      'sourceId', 'contentFamily', 'status', 'currentStations',
      'selectedCandidates', 'matchedCandidates', 'unmatchedCandidates',
    ]) || !IDS.includes(source.sourceId) || seen.has(source.sourceId) ||
        source.contentFamily !== XMLTV_VERIFIED_SOURCE_FAMILIES[source.sourceId] ||
        !STATUSES.includes(source.status) ||
        !int(source.currentStations, 6) ||
        !int(source.selectedCandidates, 20_000) ||
        !int(source.matchedCandidates, 20_000) ||
        !int(source.unmatchedCandidates, 20_000) ||
        source.selectedCandidates !== source.matchedCandidates +
          source.unmatchedCandidates ||
        (source.status !== 'selected' &&
          (source.currentStations !== 0 || source.selectedCandidates !== 0)) ||
        (source.status === 'selected' && source.currentStations === 0)) {
      return false
    }
    seen.add(source.sourceId)
  }
  return report.selectedSources ===
      report.sources.filter(source => source.status === 'selected').length &&
    report.unavailableSources ===
      report.sources.filter(source => source.status === 'unavailable').length &&
    report.invalidSources ===
      report.sources.filter(source => source.status === 'invalid').length &&
    report.selectedCandidateCount ===
      report.sources.reduce((sum, source) => sum + source.selectedCandidates, 0) &&
    report.locallyMatchedCount ===
      report.sources.reduce((sum, source) => sum + source.matchedCandidates, 0) &&
    report.locallyUnmatchedCount ===
      report.sources.reduce((sum, source) => sum + source.unmatchedCandidates, 0) &&
    report.availableIndependentFamilies <= new Set(report.sources
      .filter(source => source.status === 'selected')
      .map(source => source.contentFamily)).size &&
    JSON.stringify(report).length < 1700
}

/**
 * Re-read a G2c private workspace, reject unexpected files and bind each
 * generation to the observed G2c source/status. One broken source is excluded
 * without stopping a healthy peer; a compromised directory/report aborts all.
 */
export async function runXmltvG2lPrivateAdapterCoordinator({
  now = Date.now(),
  stagingReportPath = DEFAULT_REPORT,
  privateRoot = DEFAULT_PRIVATE,
  localCandidatesFor = null,
  maxCandidates = 20_000,
} = {}) {
  if (!Number.isFinite(now) || typeof stagingReportPath !== 'string' ||
      !stagingReportPath.trim() || typeof privateRoot !== 'string' ||
      !privateRoot.trim() ||
      (localCandidatesFor !== null && typeof localCandidatesFor !== 'function') ||
      !Number.isSafeInteger(maxCandidates) || maxCandidates < 1 ||
      maxCandidates > 20_000) {
    throw new TypeError('Invalid private XMLTV adapter coordinator options')
  }
  const folder = await lstat(privateRoot)
  if (!folder.isDirectory() || folder.isSymbolicLink() ||
      (folder.mode & 0o077) !== 0) {
    throw new TypeError('Unsafe private XMLTV workspace')
  }
  const report = await safePrivateFile(stagingReportPath, MAX_REPORT_BYTES)
  const reportAt = Date.parse(report.observedAt)
  if (!isSafeXmltvG2StagingReport(report) ||
      !Number.isFinite(reportAt) || reportAt > now ||
      now - reportAt > MAX_REPORT_AGE_MS) {
    throw new TypeError('Invalid or stale XMLTV staging source report')
  }
  const staged = new Set(report.sources
    .filter(source => source.status === 'staged').map(source => source.sourceId))
  const filenames = await readdir(privateRoot)
  if (filenames.some(name => !IDS.some(sourceId =>
      name === sourceId + '.json') ||
      !staged.has(name.slice(0, -5)))) {
    throw new TypeError('Unexpected source file in private workspace')
  }

  const entries = []
  const states = new Map()
  for (const source of report.sources) {
    const id = source.sourceId
    let selected = null
    let state = source.status === 'staged' ? 'invalid' : 'unavailable'
    if (source.status === 'staged') {
      try {
        const generation = await safePrivateFile(
          join(privateRoot, id + '.json'), MAX_SNAPSHOT_BYTES,
        )
        if (generation.sourceId !== id ||
            generation.observedAt !== report.observedAt ||
            generation.stagedProgrammes !== source.stagedProgrammes ||
            Object.entries(source.stationCounts).some(([station, n]) =>
              generation.stationCounts?.[station] !== n)) {
          throw new TypeError('Private generation does not match source receipt')
        }
        // G2d deeply validates all original programme fields, mappings,
        // chronology, generation age, explicit timezone and sourceRef.
        const checked = replayXmltvPrivateLkg([
          { sourceId: id, current: generation },
        ], { now })
        if (checked.sources[0].currentStations === 0) {
          throw new TypeError('No validated current source programme')
        }
        selected = generation
        state = 'selected'
      } catch {
        // No errors, original data or paths in the public-facing aggregate.
      }
    }
    states.set(id, state)
    entries.push({ sourceId: id, current: selected, lastKnownGood: null })
  }

  // Real source data now pass through G2j's local matcher and the same shared
  // airing merge code used for Waipu/Joyn. With NO local TMDB catalogue,
  // explicitly return 0 matches; this is not a quality-rate measurement.
  const match = await runXmltvG2jPrivateIntegrationPreview(entries, {
    now, maxCandidates,
    localCandidatesFor: localCandidatesFor ?? (async () => []),
  })
  const perSource = report.sources.map(source => {
    const result = match.sources.find(item => item.sourceId === source.sourceId)
    return {
      sourceId: source.sourceId,
      contentFamily: XMLTV_VERIFIED_SOURCE_FAMILIES[source.sourceId],
      status: states.get(source.sourceId),
      currentStations: result.currentStations,
      selectedCandidates: result.selectedCurrent,
      matchedCandidates: result.locallyMatched,
      unmatchedCandidates: result.locallyUnmatched,
    }
  })
  const out = {
    kind: 'xmltv-g2l-private-adapter-aggregate',
    schemaVersion: 1,
    mode: 'same-run-original-source-offline-no-publication',
    matcherCatalogMode: localCandidatesFor
      ? 'provided-local-only' : 'empty-local-catalog',
    sources: perSource,
    selectedSources: perSource.filter(source => source.status === 'selected').length,
    unavailableSources: perSource.filter(source => source.status === 'unavailable').length,
    invalidSources: perSource.filter(source => source.status === 'invalid').length,
    availableIndependentFamilies: match.independentFamiliesWithFutureCoverage,
    stationsWithIndependentOverlap: match.stationsWithIndependentOverlap,
    selectedCandidateCount: match.selectedOriginalCandidates,
    locallyMatchedCount: match.locallyMatched,
    locallyUnmatchedCount: match.locallyUnmatched,
    baselineMergedAirings: match.baselineMergedAirings,
    mergedAiringsWithXmltvPreview: match.mergedAiringsWithXmltvPreview,
    maximumPreviewDays: 14,
    fiveDaysRequiredToKeepSource: false,
    originalCloudObjectsCreated: 0,
    productiveWrites: 0,
    publishApproved: false,
    tmdbIdentityApproved: false,
    playbackRoutesApproved: false,
  }
  if (!isSafeXmltvG2lPrivateAdapterReport(out)) {
    throw new TypeError('Unsafe private XMLTV adapter result')
  }
  return out
}

async function main() {
  if (process.argv.length !== 2) {
    throw new TypeError('No source URLs, original files or arguments accepted')
  }
  const report = await runXmltvG2lPrivateAdapterCoordinator()
  process.stdout.write(JSON.stringify(report) + '\n')
  if (report.selectedSources === 0) process.exitCode = 1
}

if (process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error('Private XMLTV adapter preview failed closed. No data published.')
    process.exitCode = 1
  })
}
