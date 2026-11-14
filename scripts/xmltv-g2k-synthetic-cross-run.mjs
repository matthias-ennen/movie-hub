/**
 * MovieHub #336 G2k - synthetic-only multi-workflow-run source failover.
 *
 * A seed run commits three immutable G2e QA source generations. A DIFFERENT
 * workflow run can read them by explicit seed run id, simulate one feed outage,
 * produce fresh synthetic peers, and pass all three through the actual G2d/G2j
 * source selection and merge path. A third invocation can clean just this seed.
 *
 * NO original third-party programmes, publication, TMDB HTTP or Nightly.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  makeSyntheticGeneration, uploadSyntheticXmltvCheckpoint,
  readVerifiedSyntheticXmltvGeneration, deleteSyntheticXmltvCheckpoint,
} from './xmltv-g2e-synthetic-checkpoint.mjs'
import { replayXmltvPrivateLkg, isSafeXmltvG2dReplayReport } from
  '../src/sources/xmltv/xmltvPrivateLkgReplay.js'
import {
  runXmltvG2jPrivateIntegrationPreview,
} from './xmltv-g2j-private-integration-preview.mjs'

const SOURCES = Object.freeze(['epgshare01', 'freeepg', 'iptv-epg-org'])
const HOUR = 60 * 60 * 1000
const runIdValid = value => typeof value === 'string' && /^[0-9]{6,20}$/.test(value)
const isBucket = value => value && typeof value.file === 'function'
const validClock = now => Number.isFinite(now) && now > 0

const exactFields = (object, fields) => object && typeof object === 'object' &&
  !Array.isArray(object) &&
  Object.keys(object).sort().join('|') === [...fields].sort().join('|')
const int = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max

export function isSafeXmltvG2kSyntheticReport(report) {
  const fields = [
    'kind', 'schemaVersion', 'mode', 'sourcesExpected', 'sourcesRestored',
    'sourceRestoreUnavailable', 'simulatedOutageSource',
    'currentStationDecisions', 'restoredStationDecisions',
    'unavailableStationDecisions', 'independentFamiliesWithFutureCoverage',
    'stationsWithIndependentOverlap', 'selectedSyntheticCandidates',
    'matchedTitleIdentities', 'mergedAirings',
    'syntheticOnly', 'durableOriginalCheckpointVerified',
    'publishApproved', 'playbackRoutesApproved', 'tmdbIdentityApproved',
  ]
  return exactFields(report, fields) &&
    report.kind === 'xmltv-g2k-synthetic-cross-run-aggregate' &&
    report.schemaVersion === 1 &&
    report.mode === 'cross-workflow-run-private-qa-no-publication' &&
    report.sourcesExpected === SOURCES.length &&
    int(report.sourcesRestored, SOURCES.length) &&
    report.sourceRestoreUnavailable === SOURCES.length - report.sourcesRestored &&
    SOURCES.includes(report.simulatedOutageSource) &&
    int(report.currentStationDecisions, 18) &&
    int(report.restoredStationDecisions, 18) &&
    int(report.unavailableStationDecisions, 18) &&
    report.currentStationDecisions + report.restoredStationDecisions +
      report.unavailableStationDecisions === SOURCES.length * 6 &&
    report.currentStationDecisions === 2 &&
    int(report.independentFamiliesWithFutureCoverage, 2) &&
    int(report.stationsWithIndependentOverlap, 6) &&
    int(report.selectedSyntheticCandidates, SOURCES.length) &&
    report.selectedSyntheticCandidates ===
      report.currentStationDecisions + report.restoredStationDecisions &&
    report.matchedTitleIdentities === 0 &&
    report.mergedAirings === 0 &&
    report.syntheticOnly === true &&
    report.durableOriginalCheckpointVerified === false &&
    report.publishApproved === false &&
    report.playbackRoutesApproved === false &&
    report.tmdbIdentityApproved === false &&
    JSON.stringify(report).length < 850
}

/** First independent workflow run: three strictly sanitized immutable sources. */
export async function seedXmltvG2kSyntheticRun({
  bucket, runId, now = Date.now(),
} = {}) {
  if (!isBucket(bucket) || !runIdValid(runId) || !validClock(now)) {
    throw new TypeError('Invalid synthetic seed input')
  }
  for (const sourceId of SOURCES) {
    await uploadSyntheticXmltvCheckpoint({
      bucket, runId, sourceId,
      generation: makeSyntheticGeneration({ sourceId, now }), now,
    })
  }
  return { syntheticSourcesSeeded: SOURCES.length,
    originalProgrammesStored: 0, publishApproved: false }
}

/**
 * Second workflow run: independently restore an earlier seed.
 * A missing, stale or corrupt individual source becomes UNAVAILABLE only for
 * that source; the other two current feeds keep working. It never steals
 * another source's checkpoint or reuses a source with invalid provenance.
 */
export async function replayXmltvG2kSyntheticAcrossRuns({
  bucket, seedRunId, failedSourceId = 'epgshare01', now = Date.now(),
} = {}) {
  if (!isBucket(bucket) || !runIdValid(seedRunId) ||
      !SOURCES.includes(failedSourceId) || !validClock(now)) {
    throw new TypeError('Invalid synthetic cross-run replay input')
  }
  const previous = new Map()
  for (const sourceId of SOURCES) {
    try {
      const verified = await readVerifiedSyntheticXmltvGeneration({
        bucket, runId: seedRunId, sourceId, now,
      })
      previous.set(sourceId, verified.generation)
    } catch {
      // Cannot trust this source's checkpoint. Do not mask with another feed.
    }
  }
  const feeds = SOURCES.map(sourceId => ({
    sourceId,
    current: sourceId === failedSourceId ? null :
      makeSyntheticGeneration({ sourceId, now }),
    lastKnownGood: previous.get(sourceId) ?? null,
  }))
  const replay = replayXmltvPrivateLkg(feeds, { now })
  if (!isSafeXmltvG2dReplayReport(replay)) {
    throw new TypeError('Unverified cross-run source selection')
  }

  // G2j's actual selection/matcher/merge integration is exercised with a
  // resolver that has NO synthetic title identities, so no TMDB match can
  // be invented and nothing is passed on to a publisher.
  const integrated = await runXmltvG2jPrivateIntegrationPreview(feeds, {
    now, localCandidatesFor: async () => [],
  })
  const report = {
    kind: 'xmltv-g2k-synthetic-cross-run-aggregate',
    schemaVersion: 1,
    mode: 'cross-workflow-run-private-qa-no-publication',
    sourcesExpected: SOURCES.length,
    sourcesRestored: previous.size,
    sourceRestoreUnavailable: SOURCES.length - previous.size,
    simulatedOutageSource: failedSourceId,
    currentStationDecisions: replay.sources.reduce((s, x) => s + x.currentStations, 0),
    restoredStationDecisions: replay.restoredStationDecisions,
    unavailableStationDecisions: replay.sources.reduce((s, x) => s + x.unavailableStations, 0),
    independentFamiliesWithFutureCoverage: replay.availableIndependentFamilies,
    stationsWithIndependentOverlap: replay.stationsWithIndependentOverlap,
    selectedSyntheticCandidates: integrated.selectedOriginalCandidates,
    matchedTitleIdentities: integrated.locallyMatched,
    mergedAirings: integrated.mergedAiringsWithXmltvPreview,
    syntheticOnly: true,
    durableOriginalCheckpointVerified: false,
    publishApproved: false,
    playbackRoutesApproved: false,
    tmdbIdentityApproved: false,
  }
  if (!isSafeXmltvG2kSyntheticReport(report)) {
    throw new TypeError('Unsafe synthetic cross-run report')
  }
  return report
}

/** Third independent workflow run: remove only the identified QA seed. */
export async function cleanupXmltvG2kSyntheticRun({
  bucket, seedRunId,
} = {}) {
  if (!isBucket(bucket) || !runIdValid(seedRunId)) {
    throw new TypeError('Invalid synthetic cleanup input')
  }
  for (const sourceId of SOURCES) {
    await deleteSyntheticXmltvCheckpoint({
      bucket, runId: seedRunId, sourceId,
    })
  }
  // No source data, raw object path or seed id in the result.
  return { syntheticSourcesCleaned: SOURCES.length, originalSourcesChanged: 0 }
}

async function main() {
  if (process.argv.length !== 3 ||
      !['seed', 'replay', 'cleanup'].includes(process.argv[2]) ||
      process.env.MOVIEHUB_G2K_SYNTHETIC_QA !== 'enabled' ||
      process.env.DATA_CHECKPOINT_ENABLED !== 'true' ||
      process.env.DATA_CHECKPOINT_BUCKET !== 'movie-hub-62459-nightly-checkpoints' ||
      process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new TypeError('G2k synthetic run not explicitly enabled on main')
  }
  const { applicationDefault, initializeApp, deleteApp } =
    await import('firebase-admin/app')
  const { getStorage } = await import('firebase-admin/storage')
  const app = initializeApp({
    credential: applicationDefault(), projectId: 'movie-hub-62459',
  }, 'g2k-synthetic-xmltv-qa')
  try {
    const bucket = getStorage(app).bucket(process.env.DATA_CHECKPOINT_BUCKET)
    const command = process.argv[2]
    const seedRunId = command === 'seed' ? process.env.GITHUB_RUN_ID :
      process.env.G2K_SEED_RUN_ID
    if (!runIdValid(seedRunId)) throw new TypeError('Invalid seed workflow run id')
    if (command === 'seed') {
      const status = await seedXmltvG2kSyntheticRun({ bucket, runId: seedRunId })
      console.log(JSON.stringify(status))
    } else if (command === 'replay') {
      // Offset is synthetic time-travel only, not claimed elapsed real hours.
      const status = await replayXmltvG2kSyntheticAcrossRuns({
        bucket, seedRunId, now: Date.now() + HOUR,
      })
      console.log(JSON.stringify(status))
      if (status.sourcesRestored !== SOURCES.length ||
          status.restoredStationDecisions !== 1 ||
          status.independentFamiliesWithFutureCoverage !== 2) {
        throw new TypeError('Cross-run synthetic source restore not healthy')
      }
    } else {
      const status = await cleanupXmltvG2kSyntheticRun({ bucket, seedRunId })
      // Verify all six source-specific synthetic objects were removed.
      for (const sourceId of SOURCES) {
        for (const suffix of ['.json', '.manifest.json']) {
          const path = `xmltv-g2e-synthetic-qa/v1/${seedRunId}/${sourceId}${suffix}`
          const [exists] = await bucket.file(path).exists()
          if (exists) throw new TypeError('Incomplete synthetic seed cleanup')
        }
      }
      console.log(JSON.stringify(status))
    }
  } finally {
    await deleteApp(app)
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // No source originals, object names, cloud response bodies or user tokens.
    console.error('G2k private synthetic cross-run test failed closed')
    process.exitCode = 1
  })
}
