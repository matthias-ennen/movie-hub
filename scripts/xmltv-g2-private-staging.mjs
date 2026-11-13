/**
 * #336 G2c: isolated TRUE XMLTV source staging, not publication.
 *
 * Download at most the three EXISTING reviewed XMLTV source URLs, parse with
 * the original bounded parser, preserve real original programme fields in
 * private runner-only source snapshots, and publish ONLY fixed aggregate QA.
 *
 * NO TMDB HTTP, shared identity index, Firebase, AIR link or Nightly writes.
 * Distinct feeds remain distinct even if two hosts share the same programme
 * content family. Failure of any one source does not discard shorter data
 * from another source. Nothing in this runner is a reuse-rights approval.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, open, link, unlink, readFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEEDS, downloadXmltvFeed } from './probe-xmltv-feeds.mjs'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import {
  XMLTV_REVIEWED_STATION_MAPPINGS, XMLTV_REVIEWED_STATIONS,
} from '../src/sources/xmltv/xmltvStationMappings.js'
import {
  XMLTV_VERIFIED_SOURCE_FAMILIES,
} from '../src/sources/xmltv/xmltvSourceReadiness.js'
import {
  buildXmltvPrivateSourceGeneration,
} from '../src/sources/xmltv/xmltvPrivateStaging.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const STATIONS = Object.freeze(XMLTV_REVIEWED_STATIONS.map(x => x.stationId))
const MAX_SOURCE_STAGING_BYTES = 96 * 1024 * 1024
const EXPECTED_FEEDS = new Map(FEEDS.map(feed => [feed.id, feed.url]))
const STATUSES = new Set(['staged', 'no_future_programmes', 'unavailable'])

async function writeNewPrivateSourceSnapshot(directory, sourceId, snapshot) {
  const raw = JSON.stringify(snapshot)
  if (Buffer.byteLength(raw, 'utf8') > MAX_SOURCE_STAGING_BYTES) {
    throw new RangeError('Staging snapshot exceeds private size limit')
  }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const filename = join(directory, sourceId + '.json')
  const temporary = join(directory, '.' + sourceId + '.' + randomUUID() + '.tmp')
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(raw + '\n', 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    // link() fails with EEXIST instead of replacing an existing generation.
    // A private-runner crash never exposes a partially written FINAL file.
    await link(temporary, filename)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

function sourceAggregate(sourceId, status, snapshot = null) {
  const stationCounts = Object.fromEntries(STATIONS.map(stationId =>
    [stationId, snapshot?.stationCounts?.[stationId] ?? 0]))
  const coverages = STATIONS.map(stationId =>
    snapshot?.coverage?.stations?.[stationId] ?? null)
  return {
    sourceId,
    contentFamily: XMLTV_VERIFIED_SOURCE_FAMILIES[sourceId],
    status,
    stagedProgrammes: snapshot?.stagedProgrammes ?? 0,
    rejectedOrOutsideWindow: snapshot?.rejectedOrOutsideWindow ?? 0,
    stationCounts,
    stationsWithProgrammes: STATIONS.filter(id => stationCounts[id] > 0).length,
    fiveDayCompleteStations: coverages.filter(x => x?.completeFiveDaysFromNow === true).length,
    maxContinuousMinutes: Math.max(0, ...coverages.map(x => x?.continuousFromNowMinutes ?? 0)),
    maxLatestProgrammeMinutes: Math.max(0, ...coverages.map(x => x?.latestProgrammeEndMinutes ?? 0)),
    recordedInPrivateWorkspace: status === 'staged',
  }
}

/** Fixed URLs only, bounded sequential downloads, isolated runner workspace. */
export async function runXmltvG2PrivateStaging({
  now = Date.now(), feedList = FEEDS, downloader = downloadXmltvFeed,
  privateRoot = join(ROOT, 'artifacts/xmltv-g2/private'),
} = {}) {
  if (!Number.isFinite(now) || !Array.isArray(feedList) ||
    feedList.length < 1 || feedList.length > FEEDS.length ||
    typeof downloader !== 'function' || typeof privateRoot !== 'string' ||
    !privateRoot.trim()) {
    throw new TypeError('Invalid bounded XMLTV staging job')
  }
  const seen = new Set()
  for (const feed of feedList) {
    if (EXPECTED_FEEDS.get(feed?.id) !== feed?.url || seen.has(feed.id)) {
      throw new TypeError('Unreviewed or duplicate XMLTV staging source')
    }
    seen.add(feed.id)
  }

  const sources = []
  for (const feed of feedList) {
    let aggregate
    try {
      const downloaded = await downloader(feed.url)
      const parsed = parseXmltvCandidates(downloaded.xml, {
        sourceId: feed.id,
        stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS,
        observedAt: new Date(now).toISOString(),
        mappedOnly: true,
      })
      const snapshot = buildXmltvPrivateSourceGeneration(parsed, { now })
      if (snapshot.stagedProgrammes === 0) {
        aggregate = sourceAggregate(feed.id, 'no_future_programmes')
      } else {
        await writeNewPrivateSourceSnapshot(privateRoot, feed.id, snapshot)
        aggregate = sourceAggregate(feed.id, 'staged', snapshot)
      }
    } catch {
      // Raw XML, URLs, cache paths, titles and OS exception strings stay out
      // of the report/log. An unavailable source cannot block a healthy one.
      aggregate = sourceAggregate(feed.id, 'unavailable')
    }
    sources.push(aggregate)
  }

  const totalStagedProgrammes = sources
    .reduce((sum, source) => sum + source.stagedProgrammes, 0)
  const contentFamilies = new Set(sources
    .filter(source => source.status === 'staged')
    .map(source => source.contentFamily))
  const report = {
    kind: 'xmltv-g2-private-staging-aggregate',
    schemaVersion: 1,
    mode: 'ephemeral-private-no-publication',
    observedAt: new Date(now).toISOString(),
    maxPreviewDays: 14,
    sources,
    totalStagedProgrammes,
    stagedSourceCount: sources.filter(source => source.status === 'staged').length,
    availableIndependentFamilies: contentFamilies.size,
    fiveDaysRequiredToKeepSource: false,
    publishApproved: false,
    tmdbIdentityApproved: false,
    playbackRoutesApproved: false,
    reuseRightsApproved: false,
  }
  if (!isSafeXmltvG2StagingReport(report)) {
    throw new TypeError('Unsafe private staging aggregate')
  }
  return report
}

/** Validate an EXACT schema before any report may leave the private runner. */
export function isSafeXmltvG2StagingReport(report) {
  const keys = (value, wanted) => value && typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('|') === [...wanted].sort().join('|')
  const int = (v, max = 250_000) =>
    Number.isSafeInteger(v) && v >= 0 && v <= max
  const utc = v => typeof v === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) &&
    Number.isFinite(Date.parse(v))
  if (!keys(report, [
    'kind', 'schemaVersion', 'mode', 'observedAt', 'maxPreviewDays',
    'sources', 'totalStagedProgrammes', 'stagedSourceCount',
    'availableIndependentFamilies', 'fiveDaysRequiredToKeepSource',
    'publishApproved', 'tmdbIdentityApproved', 'playbackRoutesApproved',
    'reuseRightsApproved',
  ]) || report.kind !== 'xmltv-g2-private-staging-aggregate' ||
    report.schemaVersion !== 1 || report.mode !== 'ephemeral-private-no-publication' ||
    !utc(report.observedAt) || report.maxPreviewDays !== 14 ||
    report.fiveDaysRequiredToKeepSource !== false ||
    report.publishApproved !== false ||
    report.tmdbIdentityApproved !== false ||
    report.playbackRoutesApproved !== false ||
    report.reuseRightsApproved !== false ||
    !Array.isArray(report.sources) || report.sources.length < 1 ||
    report.sources.length > FEEDS.length) return false

  const seen = new Set()
  for (const source of report.sources) {
    if (!keys(source, [
      'sourceId', 'contentFamily', 'status', 'stagedProgrammes',
      'rejectedOrOutsideWindow', 'stationCounts', 'stationsWithProgrammes',
      'fiveDayCompleteStations', 'maxContinuousMinutes',
      'maxLatestProgrammeMinutes', 'recordedInPrivateWorkspace',
    ]) || !EXPECTED_FEEDS.has(source.sourceId) || seen.has(source.sourceId) ||
      source.contentFamily !== XMLTV_VERIFIED_SOURCE_FAMILIES[source.sourceId] ||
      !STATUSES.has(source.status) ||
      !keys(source.stationCounts, STATIONS) ||
      !Object.values(source.stationCounts).every(v => int(v)) ||
      !int(source.stagedProgrammes) ||
      Object.values(source.stationCounts).reduce((a, b) => a + b, 0) !==
        source.stagedProgrammes ||
      !int(source.rejectedOrOutsideWindow) ||
      !int(source.stationsWithProgrammes, STATIONS.length) ||
      source.stationsWithProgrammes !==
        STATIONS.filter(id => source.stationCounts[id] > 0).length ||
      !int(source.fiveDayCompleteStations, STATIONS.length) ||
      !int(source.maxContinuousMinutes, 14 * 24 * 60) ||
      !int(source.maxLatestProgrammeMinutes, 14 * 24 * 60) ||
      source.recordedInPrivateWorkspace !== (source.status === 'staged') ||
      (source.status !== 'staged' && source.stagedProgrammes !== 0) ||
      (source.status === 'staged' && source.stagedProgrammes === 0)) return false
    seen.add(source.sourceId)
  }
  const expectedFamilies = new Set(report.sources
    .filter(source => source.status === 'staged').map(source => source.contentFamily))
  return int(report.totalStagedProgrammes, FEEDS.length * 250_000) &&
    report.totalStagedProgrammes === report.sources
      .reduce((n, source) => n + source.stagedProgrammes, 0) &&
    int(report.stagedSourceCount, FEEDS.length) &&
    report.stagedSourceCount === report.sources
      .filter(source => source.status === 'staged').length &&
    int(report.availableIndependentFamilies, FEEDS.length) &&
    report.availableIndependentFamilies === expectedFamilies.size &&
    JSON.stringify(report).length < 2500
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No source URL or path arguments accepted')
  const report = await runXmltvG2PrivateStaging()
  const output = join(ROOT, 'artifacts/xmltv-g2/report.json')
  await mkdir(dirname(output), { recursive: true, mode: 0o700 })
  const handle = await open(output, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(report, null, 2) + '\n', 'utf8') }
  finally { await handle.close() }
  // The private source snapshots are never printed or uploaded.
  process.stdout.write(JSON.stringify(report) + '\n')
  if (!report.stagedSourceCount) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('XMLTV private staging unavailable. No data published.')
    process.exitCode = 1
  })
}
