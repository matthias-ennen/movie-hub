/**
 * MovieHub #336 / G2e QA: immutable, private Cloud Storage checkpoint for
 * SYNTHETIC XMLTV generations only. Never archive real 3rd-party EPG here.
 *
 * The same validated storage/readback contract can be considered for private
 * originals after a separate source-rights/retention approval. This pilot does
 * not touch the productive Waipu/Joyn/TMDB checkpoint paths or the Nightly.
 */
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from '../src/sources/xmltv/xmltvStationMappings.js'
import { buildXmltvPrivateSourceGeneration } from '../src/sources/xmltv/xmltvPrivateStaging.js'
import {
  replayXmltvPrivateLkg, isSafeXmltvG2dReplayReport,
} from '../src/sources/xmltv/xmltvPrivateLkgReplay.js'

const PREFIX = 'xmltv-g2e-synthetic-qa/v1'
const MAX_BYTES = 1024 * 1024
const MAX_MANIFEST_BYTES = 2048
const TTL_MS = 36 * 60 * 60 * 1000
const IDS = Object.freeze(['epgshare01', 'freeepg', 'iptv-epg-org'])
const syntheticTitle = 'QA_SYNTHETIC_XMLTV_NO_ORIGINAL_DATA'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const validRun = value => typeof value === 'string' && /^[0-9]{6,20}$/.test(value)
const validSource = value => IDS.includes(value)
const utc = value => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value))
const objectNames = (runId, sourceId) => ({
  data: PREFIX + '/' + runId + '/' + sourceId + '.json',
  manifest: PREFIX + '/' + runId + '/' + sourceId + '.manifest.json',
})
const assertIds = (runId, sourceId) => {
  if (!validRun(runId) || !validSource(sourceId)) {
    throw new TypeError('Invalid private QA checkpoint identity')
  }
}
const fakeOrInvalid = value =>
  value?.kind !== 'xmltv-private-source-staging' ||
  !Array.isArray(value.records) || !value.records.length ||
  value.records.some(row => row?.title !== syntheticTitle ||
    row?.description !== null || row?.subtitle !== null ||
    (Array.isArray(row?.episodeEvidence) && row.episodeEvidence.length) ||
    (Array.isArray(row?.categories) && row.categories.length))

function checkedReport(sourceId, generation, now) {
  // Compare the ENTIRE deterministic source-generation structure, including
  // nested episode/metadata/provenance, against fresh code-generated QA data.
  // Checking only the title would permit original source material to sneak
  // into optional fields and then be retained by Cloud Storage.
  if (fakeOrInvalid(generation) ||
      !utc(generation?.observedAt) ||
      JSON.stringify(generation) !== JSON.stringify(makeSyntheticGeneration({
        sourceId, now: Date.parse(generation.observedAt),
      }))) {
    throw new TypeError('Non-synthetic XMLTV data prohibited')
  }
  const report = replayXmltvPrivateLkg([
    { sourceId, lastKnownGood: generation },
  ], { now })
  if (!isSafeXmltvG2dReplayReport(report) ||
      report.restoredStationDecisions < 1 ||
      report.publishApproved !== false) {
    throw new TypeError('Invalid or stale private QA generation')
  }
  return report
}

/** Write immutable synthetic data and a checksum manifest; no mutable latest pointer. */
export async function uploadSyntheticXmltvCheckpoint({
  bucket, runId, sourceId, generation, now = Date.now(),
}) {
  assertIds(runId, sourceId)
  if (!Number.isFinite(now) || !bucket || typeof bucket.file !== 'function') {
    throw new TypeError('Invalid private QA checkpoint target')
  }
  checkedReport(sourceId, generation, now)
  const payload = Buffer.from(JSON.stringify(generation), 'utf8')
  if (!payload.length || payload.length > MAX_BYTES) {
    throw new RangeError('Private QA checkpoint exceeds fixed synthetic limit')
  }
  const names = objectNames(runId, sourceId)
  const manifest = {
    kind: 'xmltv-g2e-synthetic-qa-manifest',
    schemaVersion: 1, runId, sourceId,
    object: names.data,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
    bytes: payload.length,
    sha256: sha256(payload),
    originalProgrammeCheckpoint: false,
    publishApproved: false,
  }
  // No overwrite in concurrent or repeated runs. The manifest is committed
  // only after the immutable payload is saved. An orphan is not restorable.
  await bucket.file(names.data).save(payload, {
    resumable: false,
    contentType: 'application/json',
    preconditionOpts: { ifGenerationMatch: 0 },
  })
  await bucket.file(names.manifest).save(JSON.stringify(manifest), {
    resumable: false,
    contentType: 'application/json',
    preconditionOpts: { ifGenerationMatch: 0 },
  })
  return { storedSourceCount: 1, durableOriginalSourceSaved: false }
}

function validateManifest(manifest, { runId, sourceId, now }) {
  const names = objectNames(runId, sourceId)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      Object.keys(manifest).sort().join('|') !== [
        'kind', 'schemaVersion', 'runId', 'sourceId', 'object',
        'savedAt', 'expiresAt', 'bytes', 'sha256',
        'originalProgrammeCheckpoint', 'publishApproved',
      ].sort().join('|') ||
      manifest.kind !== 'xmltv-g2e-synthetic-qa-manifest' ||
      manifest.schemaVersion !== 1 ||
      manifest.runId !== runId || manifest.sourceId !== sourceId ||
      manifest.object !== names.data ||
      !utc(manifest.savedAt) || !utc(manifest.expiresAt) ||
      Date.parse(manifest.savedAt) > now ||
      Date.parse(manifest.expiresAt) !== Date.parse(manifest.savedAt) + TTL_MS ||
      now > Date.parse(manifest.expiresAt) ||
      !Number.isSafeInteger(manifest.bytes) ||
      manifest.bytes < 1 || manifest.bytes > MAX_BYTES ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      manifest.originalProgrammeCheckpoint !== false ||
      manifest.publishApproved !== false) {
    throw new TypeError('Invalid or expired private QA checkpoint manifest')
  }
}

/** Can be called on a fresh runner, entirely separate from the upload runner. */
export async function restoreSyntheticXmltvCheckpoint({
  bucket, runId, sourceId, now = Date.now(),
}) {
  assertIds(runId, sourceId)
  if (!Number.isFinite(now) || !bucket || typeof bucket.file !== 'function') {
    throw new TypeError('Invalid private QA restore target')
  }
  const names = objectNames(runId, sourceId)
  const [manifestBytes] = await bucket.file(names.manifest).download()
  if (manifestBytes.length > MAX_MANIFEST_BYTES) {
    throw new TypeError('Private QA manifest too large')
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  validateManifest(manifest, { runId, sourceId, now })
  const [payload] = await bucket.file(names.data).download()
  if (payload.length !== manifest.bytes || sha256(payload) !== manifest.sha256) {
    throw new TypeError('Private QA checkpoint checksum mismatch')
  }
  const generation = JSON.parse(payload.toString('utf8'))
  const report = checkedReport(sourceId, generation, now)
  return {
    kind: 'xmltv-g2e-synthetic-qa-result',
    schemaVersion: 1, restoredStations: report.restoredStationDecisions,
    independentFamilies: report.availableIndependentFamilies,
    bytesVerified: true, restoredOnFreshRunnerCapable: true,
    originalsStored: false, productiveFallbackEnabled: false,
    publishApproved: false,
  }
}

export async function deleteSyntheticXmltvCheckpoint({ bucket, runId, sourceId }) {
  assertIds(runId, sourceId)
  if (!bucket || typeof bucket.file !== 'function') {
    throw new TypeError('Invalid private QA cleanup target')
  }
  const names = objectNames(runId, sourceId)
  await bucket.file(names.manifest).delete({ ignoreNotFound: true })
  await bucket.file(names.data).delete({ ignoreNotFound: true })
}

/** A bounded real-parser synthetic generator – never copies live feed data. */
export function makeSyntheticGeneration({ sourceId = 'epgshare01', now = Date.now() } = {}) {
  if (!validSource(sourceId) || !Number.isFinite(now)) {
    throw new TypeError('Invalid synthetic generator')
  }
  const t = Math.floor(now / 1000) * 1000
  const sourceIdForZdf = Object.entries(XMLTV_REVIEWED_STATION_MAPPINGS[sourceId])
    .find(([, station]) => station.stationId === 'zdf')?.[0]
  if (!sourceIdForZdf) throw new TypeError('Missing reviewed synthetic source mapping')
  const time = instant => new Date(instant).toISOString()
    .replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
  const start = time(t)
  const end = time(t + 24 * 60 * 60 * 1000)
  const xml = '<?xml version="1.0" encoding="UTF-8"?><tv>' +
    '<channel id="' + sourceIdForZdf + '"><display-name>ZDF</display-name></channel>' +
    '<programme channel="' + sourceIdForZdf + '" start="' + start +
    '" stop="' + end + '"><title lang="de">' + syntheticTitle +
    '</title></programme></tv>'
  const parsed = parseXmltvCandidates(xml, {
    sourceId, observedAt: new Date(t).toISOString(),
    stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS, mappedOnly: true,
  })
  return buildXmltvPrivateSourceGeneration(parsed, { now: t })
}

async function main() {
  if (process.argv.length !== 3 ||
      !['write', 'read', 'cleanup'].includes(process.argv[2]) ||
      process.env.MOVIEHUB_G2E_SYNTHETIC_QA !== 'enabled' ||
      process.env.DATA_CHECKPOINT_ENABLED !== 'true' ||
      process.env.DATA_CHECKPOINT_BUCKET !== 'movie-hub-62459-nightly-checkpoints' ||
      process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new TypeError('Not explicitly enabled for isolated synthetic main-branch QA')
  }
  const runId = process.env.GITHUB_RUN_ID
  const sourceId = 'epgshare01'
  assertIds(runId, sourceId)
  const { applicationDefault, initializeApp, deleteApp } = await import('firebase-admin/app')
  const { getStorage } = await import('firebase-admin/storage')
  const app = initializeApp({
    credential: applicationDefault(), projectId: 'movie-hub-62459',
  }, 'g2e-synthetic-xmltv-qa')
  try {
    const bucket = getStorage(app).bucket(process.env.DATA_CHECKPOINT_BUCKET)
    if (process.argv[2] === 'write') {
      await uploadSyntheticXmltvCheckpoint({
        bucket, runId, sourceId, generation: makeSyntheticGeneration(),
      })
      console.log('G2e synthetic-only immutable checkpoint committed privately')
    } else if (process.argv[2] === 'read') {
      const result = await restoreSyntheticXmltvCheckpoint({
        bucket, runId, sourceId,
      })
      console.log(JSON.stringify(result))
    } else {
      await deleteSyntheticXmltvCheckpoint({ bucket, runId, sourceId })
      console.log('G2e synthetic-only private checkpoint cleaned')
    }
  } finally {
    await deleteApp(app)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Never print underlying storage response, raw data, IDs or object URLs.
    console.error('G2e synthetic checkpoint QA failed closed')
    process.exitCode = 1
  })
}
