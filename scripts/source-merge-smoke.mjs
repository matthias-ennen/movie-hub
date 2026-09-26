import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizeSourceEnvelope } from '../src/sources/sourceAdapterContract.js'
import { mergeSourceGenerations } from '../src/sources/sourceMerge.js'
import { writeMergedSourcePublication } from './source-merge-publication.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'))
}

function fixtureEnvelopeFromWaipu(waipuEnvelope, {
  generatedAt = waipuEnvelope.generatedAt,
} = {}) {
  const first = waipuEnvelope.records.find((record) => record?.kind === 'broadcast')
  if (!first) throw new Error('Waipu envelope contains no broadcast event for merge smoke test.')

  const fixtureRecord = {
    ...first,
    eventId: `fixture-second-source:${first.eventId}`,
    playbackRoutes: [{
      providerId: 'fixture-provider',
      mode: 'APP_DEEP_LINK',
      target: `fixture://play/${encodeURIComponent(first.channelId)}`,
      requiresAuth: false,
      requiresSubscription: false,
      adSupported: false,
      geoRegion: null,
      drm: null,
      verifiedAt: generatedAt,
    }],
    sourceRefs: [{
      sourceId: 'fixture-second-source',
      externalId: `fixture:${first.eventId}`,
      observedAt: generatedAt,
      expiresAt: first.endAt,
    }],
    extensions: {
      fixture: {
        purpose: 'multi-source-smoke-test',
      },
    },
  }

  return normalizeSourceEnvelope({
    contractVersion: 1,
    sourceId: 'fixture-second-source',
    sourceGenerationId: `fixture-second-source:${generatedAt}`,
    generatedAt,
    fetchedAt: generatedAt,
    expiresAt: first.endAt,
    sourceStatus: 'healthy',
    sourceCoverage: {
      purpose: 'workflow-smoke-test',
      events: 1,
    },
    records: [fixtureRecord],
  })
}

function expiredFixtureEnvelope(healthyEnvelope, nowMs) {
  const active = healthyEnvelope.records[0]
  const startAt = new Date(nowMs - (3 * 60 * 60 * 1000)).toISOString()
  const endAt = new Date(nowMs - (2 * 60 * 60 * 1000)).toISOString()
  const expired = {
    ...active,
    eventId: `fixture-expired:${active.eventId}`,
    startAt,
    endAt,
    playbackRoutes: active.playbackRoutes.map((route) => ({
      ...route,
      target: `${route.target}/expired`,
    })),
    sourceRefs: active.sourceRefs.map((ref) => ({
      ...ref,
      externalId: `${ref.externalId}:expired`,
      observedAt: new Date(nowMs - (4 * 60 * 60 * 1000)).toISOString(),
      expiresAt: endAt,
    })),
  }

  return normalizeSourceEnvelope({
    ...healthyEnvelope,
    sourceGenerationId: `${healthyEnvelope.sourceGenerationId}:last-valid`,
    records: [active, expired],
  })
}

export async function runSourceMergeSmoke({
  waipuPath = resolve(root, 'artifacts/source-adapters/waipu-v1.json'),
  outputDir = resolve(root, 'artifacts/source-merge'),
  now = Date.now(),
} = {}) {
  const nowMs = typeof now === 'function' ? Number(now()) : Number(now)
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be finite.')

  const waipu = normalizeSourceEnvelope(await readJson(waipuPath))
  const fixture = fixtureEnvelopeFromWaipu(waipu)
  const healthyOutput = resolve(outputDir, 'healthy.json')
  const healthy = await writeMergedSourcePublication(healthyOutput, {
    generations: [waipu, fixture],
  }, { now: nowMs })

  const sharedEvent = healthy.broadcastEvents.find((event) => (
    event.playbackRoutes.some((route) => route.providerId === 'waipu')
    && event.playbackRoutes.some((route) => route.providerId === 'fixture-provider')
  ))
  if (!sharedEvent) throw new Error('Merge smoke failed: shared event does not retain both provider routes.')

  const previousFixture = expiredFixtureEnvelope(fixture, nowMs)
  const failure = mergeSourceGenerations({
    generations: [waipu],
    previousEnvelopes: [previousFixture],
    failures: [{
      sourceId: 'fixture-second-source',
      code: 'SIMULATED_SOURCE_FAILURE',
      message: 'Intentional #332 workflow fixture.',
      occurredAt: new Date(nowMs).toISOString(),
    }],
  }, { now: nowMs })

  const fixtureStatus = failure.sourceStatuses.find((status) => status.sourceId === 'fixture-second-source')
  if (!fixtureStatus?.retainedPrevious || fixtureStatus.status !== 'failed') {
    throw new Error('Merge smoke failed: last-valid fixture generation was not retained.')
  }
  if (fixtureStatus.expiredRecordsDropped !== 1) {
    throw new Error('Merge smoke failed: expired fixture record was not removed.')
  }
  if (!failure.broadcastEvents.some((event) => (
    event.playbackRoutes.some((route) => route.providerId === 'fixture-provider')
  ))) {
    throw new Error('Merge smoke failed: active last-valid fixture event disappeared.')
  }

  await mkdir(outputDir, { recursive: true })
  const failureOutput = resolve(outputDir, 'failure-fallback.json')
  await writeFile(failureOutput, `${JSON.stringify(failure, null, 2)}\n`, 'utf8')

  const summary = {
    generatedAt: new Date(nowMs).toISOString(),
    waipuGenerationId: waipu.sourceGenerationId,
    waipuRecords: waipu.records.length,
    healthy: {
      sources: healthy.counts.sources,
      broadcastEvents: healthy.counts.broadcastEvents,
      sharedEventRoutes: sharedEvent.playbackRoutes.map((route) => route.providerId).sort(),
    },
    failureFallback: {
      sourceStatus: fixtureStatus.status,
      retainedPrevious: fixtureStatus.retainedPrevious,
      activeRecords: fixtureStatus.activeRecords,
      expiredRecordsDropped: fixtureStatus.expiredRecordsDropped,
      mergedBroadcastEvents: failure.counts.broadcastEvents,
    },
  }
  await writeFile(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  return summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runSourceMergeSmoke()
    .then((summary) => process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
