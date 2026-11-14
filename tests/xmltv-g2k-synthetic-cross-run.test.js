import { describe, expect, it } from 'vitest'
import {
  seedXmltvG2kSyntheticRun, replayXmltvG2kSyntheticAcrossRuns,
  cleanupXmltvG2kSyntheticRun, isSafeXmltvG2kSyntheticReport,
} from '../scripts/xmltv-g2k-synthetic-cross-run.mjs'

const NOW = Date.parse('2026-11-14T10:00:00Z')
const HOUR = 60 * 60_000
const SEED = '43599999101'
const OTHER = '43599999102'
const PRIVATE = 'REAL_ORIGINAL_XMLTV_TITLE_UNLICENSED'

function fakeBucket(objects = new Map()) {
  return {
    objects,
    file(path) {
      return {
        async save(raw, { preconditionOpts } = {}) {
          if (preconditionOpts?.ifGenerationMatch !== 0 || objects.has(path)) {
            throw Object.assign(new Error('IMMUTABLE'), { code: 412 })
          }
          objects.set(path, Buffer.from(raw))
        },
        async download() {
          if (!objects.has(path)) throw Object.assign(new Error('MISSING'), { code: 404 })
          return [Buffer.from(objects.get(path))]
        },
        async delete() { objects.delete(path) },
        async exists() { return [objects.has(path)] },
      }
    },
  }
}

describe('#336 G2k: independent-workflow-run synthetic source fallback', () => {
  it('restores previous generation only for the simulated outage, while other sources stay fresh', async () => {
    const remote = new Map()
    const seeded = await seedXmltvG2kSyntheticRun({
      bucket: fakeBucket(remote), runId: SEED, now: NOW,
    })
    expect(seeded).toEqual({
      syntheticSourcesSeeded: 3, originalProgrammesStored: 0,
      publishApproved: false,
    })
    expect(remote.size).toBe(6)
    expect([...remote.keys()].every(key => key.startsWith(
      'xmltv-g2e-synthetic-qa/v1/' + SEED + '/',
    ))).toBe(true)
    const result = await replayXmltvG2kSyntheticAcrossRuns({
      bucket: fakeBucket(remote), seedRunId: SEED,
      failedSourceId: 'epgshare01', now: NOW + HOUR,
    })
    expect(result).toMatchObject({
      sourcesExpected: 3,
      sourcesRestored: 3, sourceRestoreUnavailable: 0,
      simulatedOutageSource: 'epgshare01',
      currentStationDecisions: 2, restoredStationDecisions: 1,
      unavailableStationDecisions: 15,
      independentFamiliesWithFutureCoverage: 2,
      stationsWithIndependentOverlap: 1,
      selectedSyntheticCandidates: 3,
      matchedTitleIdentities: 0, mergedAirings: 0,
      syntheticOnly: true, publishApproved: false,
      tmdbIdentityApproved: false, playbackRoutesApproved: false,
      durableOriginalCheckpointVerified: false,
    })
    expect(isSafeXmltvG2kSyntheticReport(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain('QA_SYNTHETIC_XMLTV')
    expect(JSON.stringify(result)).not.toContain(PRIVATE)
    expect(JSON.stringify(result)).not.toContain('sourceRef')
    expect([...remote.values()].every(bytes =>
      !bytes.toString('utf8').includes(PRIVATE))).toBe(true)
  })

  it('drops only a corrupt failed-source checkpoint while preserving healthy peers', async () => {
    const shared = new Map()
    await seedXmltvG2kSyntheticRun({
      bucket: fakeBucket(shared), runId: SEED, now: NOW,
    })
    const badKey = [...shared.keys()].find(key => key.endsWith('/epgshare01.json'))
    shared.set(badKey, Buffer.from('CORRUPT_UNKNOWN_PROGRAMME'))
    const result = await replayXmltvG2kSyntheticAcrossRuns({
      bucket: fakeBucket(shared), seedRunId: SEED, now: NOW + HOUR,
    })
    expect(result).toMatchObject({
      sourcesRestored: 2, sourceRestoreUnavailable: 1,
      currentStationDecisions: 2, restoredStationDecisions: 0,
      unavailableStationDecisions: 16, selectedSyntheticCandidates: 2,
      independentFamiliesWithFutureCoverage: 1,
      stationsWithIndependentOverlap: 0,
    })
  })

  it('refuses to reuse 37-hour-old checkpoints but continues current synthetic sources', async () => {
    const shared = new Map()
    await seedXmltvG2kSyntheticRun({
      bucket: fakeBucket(shared), runId: SEED, now: NOW,
    })
    const result = await replayXmltvG2kSyntheticAcrossRuns({
      bucket: fakeBucket(shared), seedRunId: SEED, now: NOW + 37 * HOUR,
    })
    expect(result).toMatchObject({
      sourcesRestored: 0, sourceRestoreUnavailable: 3,
      currentStationDecisions: 2, restoredStationDecisions: 0,
      unavailableStationDecisions: 16,
      independentFamiliesWithFutureCoverage: 1,
    })
    expect(isSafeXmltvG2kSyntheticReport(result)).toBe(true)
  })

  it('restores each content family by exact source, even if a different feed is out', async () => {
    const shared = new Map()
    await seedXmltvG2kSyntheticRun({
      bucket: fakeBucket(shared), runId: SEED, now: NOW,
    })
    const result = await replayXmltvG2kSyntheticAcrossRuns({
      bucket: fakeBucket(shared), seedRunId: SEED,
      failedSourceId: 'freeepg', now: NOW + HOUR,
    })
    expect(result.restoredStationDecisions).toBe(1)
    expect(result.simulatedOutageSource).toBe('freeepg')
    expect(result.independentFamiliesWithFutureCoverage).toBe(2)
    expect(result.currentStationDecisions).toBe(2)
  })

  it('cleans only the intended seed across runs and leaves other synthetic seeds intact', async () => {
    const shared = new Map()
    await seedXmltvG2kSyntheticRun({
      bucket: fakeBucket(shared), runId: SEED, now: NOW,
    })
    await seedXmltvG2kSyntheticRun({
      bucket: fakeBucket(shared), runId: OTHER, now: NOW,
    })
    const cleaned = await cleanupXmltvG2kSyntheticRun({
      bucket: fakeBucket(shared), seedRunId: SEED,
    })
    expect(cleaned).toEqual({
      syntheticSourcesCleaned: 3, originalSourcesChanged: 0,
    })
    expect(shared.size).toBe(6)
    expect([...shared.keys()].every(key => key.startsWith(
      'xmltv-g2e-synthetic-qa/v1/' + OTHER + '/',
    ))).toBe(true)
    const next = await replayXmltvG2kSyntheticAcrossRuns({
      bucket: fakeBucket(shared), seedRunId: OTHER, now: NOW + HOUR,
    })
    expect(next.sourcesRestored).toBe(3)
  })

  it('rejects invalid IDs and forged report fields before any unknown bucket reads', async () => {
    const bucket = fakeBucket()
    await expect(seedXmltvG2kSyntheticRun({
      bucket, runId: '../other', now: NOW,
    })).rejects.toThrow()
    await expect(replayXmltvG2kSyntheticAcrossRuns({
      bucket, seedRunId: SEED, failedSourceId: 'unknown', now: NOW,
    })).rejects.toThrow()
    await expect(cleanupXmltvG2kSyntheticRun({
      bucket, seedRunId: 'other/../seed',
    })).rejects.toThrow()
    expect(bucket.objects.size).toBe(0)
    const safe = await replayXmltvG2kSyntheticAcrossRuns({
      bucket, seedRunId: SEED, now: NOW,
    })
    expect(isSafeXmltvG2kSyntheticReport({ ...safe, publishApproved: true })).toBe(false)
    expect(isSafeXmltvG2kSyntheticReport({ ...safe, title: PRIVATE })).toBe(false)
    expect(isSafeXmltvG2kSyntheticReport({
      ...safe, restoredStationDecisions: 9,
    })).toBe(false)
  })
})
