import { describe, it, expect } from 'vitest'
import {
  makeSyntheticGeneration,
  uploadSyntheticXmltvCheckpoint,
  restoreSyntheticXmltvCheckpoint,
  deleteSyntheticXmltvCheckpoint,
} from '../scripts/xmltv-g2e-synthetic-checkpoint.mjs'

const NOW = Date.parse('2026-11-13T20:00:00Z')
const ID = '43312345678'
const HOUR = 60 * 60 * 1000
const FORBIDDEN = 'REAL_ORIGINAL_XMLTV_TITLE_UNLICENSED'

function bucketView(objects = new Map()) {
  return {
    objects,
    file(path) {
      return {
        async save(raw, { preconditionOpts } = {}) {
          if (preconditionOpts?.ifGenerationMatch !== 0 ||
              objects.has(path)) throw Object.assign(new Error('PRECONDITION'), { code: 412 })
          objects.set(path, Buffer.from(raw))
        },
        async download() {
          if (!objects.has(path)) {
            throw Object.assign(new Error('NOT_FOUND'), { code: 404 })
          }
          return [Buffer.from(objects.get(path))]
        },
        async delete() { objects.delete(path) },
      }
    },
  }
}

describe('#336 G2e separate-runner private synthetic checkpoint', () => {
  it('stores immutable sanitized original-schema data and restores on an independent client', async () => {
    const sharedRemote = new Map()
    const writer = bucketView(sharedRemote)
    const generation = makeSyntheticGeneration({ now: NOW })
    const uploaded = await uploadSyntheticXmltvCheckpoint({
      bucket: writer, runId: ID, sourceId: 'epgshare01',
      generation, now: NOW,
    })
    expect(uploaded).toEqual({
      storedSourceCount: 1, durableOriginalSourceSaved: false,
    })
    expect(sharedRemote.size).toBe(2)
    expect([...sharedRemote.keys()].every(name =>
      name.startsWith('xmltv-g2e-synthetic-qa/v1/' + ID + '/'))).toBe(true)
    expect([...sharedRemote.values()].some(bytes =>
      bytes.toString().includes(FORBIDDEN))).toBe(false)

    // Independent storage-client object models a completely fresh runner.
    const reader = bucketView(sharedRemote)
    const restored = await restoreSyntheticXmltvCheckpoint({
      bucket: reader, runId: ID, sourceId: 'epgshare01',
      now: NOW + HOUR,
    })
    expect(restored).toEqual({
      kind: 'xmltv-g2e-synthetic-qa-result', schemaVersion: 1,
      restoredStations: 1, independentFamilies: 1,
      bytesVerified: true, restoredOnFreshRunnerCapable: true,
      originalsStored: false, productiveFallbackEnabled: false,
      publishApproved: false,
    })
    expect(JSON.stringify(restored)).not.toContain('QA_SYNTHETIC_XMLTV')
    await deleteSyntheticXmltvCheckpoint({
      bucket: reader, runId: ID, sourceId: 'epgshare01',
    })
    expect(sharedRemote.size).toBe(0)
  })

  it('rejects real source text and any injected approval before cloud write', async () => {
    const bucket = bucketView()
    const real = makeSyntheticGeneration({ now: NOW })
    real.records[0].title = FORBIDDEN
    await expect(uploadSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01', generation: real, now: NOW,
    })).rejects.toThrow()
    const approved = makeSyntheticGeneration({ now: NOW })
    approved.publishApproved = true
    await expect(uploadSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01', generation: approved, now: NOW,
    })).rejects.toThrow()
    expect(bucket.objects.size).toBe(0)
  })

  it('detects corruption of stored source body before trusting any LKG', async () => {
    const bucket = bucketView()
    await uploadSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01',
      generation: makeSyntheticGeneration({ now: NOW }), now: NOW,
    })
    const key = [...bucket.objects.keys()].find(name => name.endsWith('/epgshare01.json'))
    bucket.objects.set(key, Buffer.from('CORRUPTED', 'utf8'))
    await expect(restoreSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01', now: NOW + HOUR,
    })).rejects.toThrow('checksum mismatch')
  })

  it('rejects expired storage manifest and stale source generation', async () => {
    const bucket = bucketView()
    await uploadSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01',
      generation: makeSyntheticGeneration({ now: NOW }), now: NOW,
    })
    await expect(restoreSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01', now: NOW + 37 * HOUR,
    })).rejects.toThrow()
    const stale = makeSyntheticGeneration({ now: NOW - 37 * HOUR })
    await expect(uploadSyntheticXmltvCheckpoint({
      bucket: bucketView(), runId: '43312345679',
      sourceId: 'epgshare01', generation: stale, now: NOW,
    })).rejects.toThrow()
  })

  it('does not overwrite immutable checkpoints when upload retries', async () => {
    const bucket = bucketView()
    const data = {
      bucket, runId: ID, sourceId: 'epgshare01',
      generation: makeSyntheticGeneration({ now: NOW }), now: NOW,
    }
    await uploadSyntheticXmltvCheckpoint(data)
    const before = [...bucket.objects.values()].map(x => x.toString())
    await expect(uploadSyntheticXmltvCheckpoint(data)).rejects.toThrow()
    expect([...bucket.objects.values()].map(x => x.toString())).toEqual(before)
  })

  it('rejects wrong source identity and cross-run pointer substitutions', async () => {
    const bucket = bucketView()
    const gen = makeSyntheticGeneration({ now: NOW })
    await expect(uploadSyntheticXmltvCheckpoint({
      bucket, runId: '../evil', sourceId: 'epgshare01', generation: gen, now: NOW,
    })).rejects.toThrow()
    await expect(uploadSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'unreviewed', generation: gen, now: NOW,
    })).rejects.toThrow()
    await uploadSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01', generation: gen, now: NOW,
    })
    const key = [...bucket.objects.keys()].find(x => x.endsWith('/epgshare01.manifest.json'))
    const altered = JSON.parse(bucket.objects.get(key).toString('utf8'))
    altered.object = 'data-checkpoints/v1/joyn/latest.json'
    bucket.objects.set(key, Buffer.from(JSON.stringify(altered)))
    await expect(restoreSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01', now: NOW + HOUR,
    })).rejects.toThrow()
  })

  it('preserves independent source identities when testing multiple approved feed families', async () => {
    const bucket = bucketView()
    const sourceIds = ['freeepg', 'iptv-epg-org', 'epgshare01']
    for (const sourceId of sourceIds) {
      await uploadSyntheticXmltvCheckpoint({
        bucket, runId: ID, sourceId,
        generation: makeSyntheticGeneration({ sourceId, now: NOW }), now: NOW,
      })
    }
    const restored = await Promise.all(sourceIds.map(sourceId =>
      restoreSyntheticXmltvCheckpoint({
        bucket: bucketView(bucket.objects), runId: ID, sourceId,
        now: NOW + HOUR,
      })))
    expect(restored.every(x => x.restoredStations === 1)).toBe(true)
    expect(bucket.objects.size).toBe(6)
  })

  it('rejects malformed manifest even with a matching source data file', async () => {
    const bucket = bucketView()
    await uploadSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01',
      generation: makeSyntheticGeneration({ now: NOW }), now: NOW,
    })
    const key = [...bucket.objects.keys()].find(x => x.endsWith('.manifest.json'))
    const manifest = JSON.parse(bucket.objects.get(key).toString('utf8'))
    manifest.reuseRightsApproved = true
    bucket.objects.set(key, Buffer.from(JSON.stringify(manifest)))
    await expect(restoreSyntheticXmltvCheckpoint({
      bucket, runId: ID, sourceId: 'epgshare01', now: NOW + HOUR,
    })).rejects.toThrow()
  })
})
