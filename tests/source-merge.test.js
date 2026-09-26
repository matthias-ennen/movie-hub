import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeSourceEnvelope } from '../src/sources/sourceAdapterContract.js'
import { mergeSourceGenerations } from '../src/sources/sourceMerge.js'
import { writeMergedSourcePublication } from '../scripts/source-merge-publication.mjs'

const cleanup = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function envelope(sourceId, providerId, {
  generatedAt = '2026-09-26T10:00:00Z',
  startAt = '2026-09-26T18:00:00Z',
  endAt = '2026-09-26T20:00:00Z',
  target = null,
} = {}) {
  return normalizeSourceEnvelope({
    contractVersion: 1,
    sourceId,
    sourceGenerationId: `${sourceId}:${generatedAt}`,
    generatedAt,
    fetchedAt: generatedAt,
    sourceStatus: 'healthy',
    records: [{
      kind: 'broadcast',
      eventId: `event-${sourceId}`,
      titleRef: { mediaType: 'movie', tmdbId: 11 },
      channelId: 'zdf',
      channelName: 'ZDF',
      startAt,
      endAt,
      playbackRoutes: [{
        providerId,
        mode: 'APP_DEEP_LINK',
        target: target || `${providerId}://play`,
      }],
      sourceRefs: [{
        sourceId,
        externalId: `${sourceId}-program`,
        observedAt: generatedAt,
        expiresAt: endAt,
      }],
    }],
  })
}

describe('multi-source merge', () => {
  it('merges the same neutral broadcast from two adapters and keeps both provider routes', () => {
    const merged = mergeSourceGenerations({
      generations: [
        envelope('waipu', 'waipu'),
        envelope('fixture-joyn', 'joyn'),
      ],
    }, { now: Date.parse('2026-09-26T12:00:00Z') })

    expect(merged.broadcastEvents).toHaveLength(1)
    expect(merged.broadcastEvents[0].playbackRoutes.map((route) => route.providerId).sort())
      .toEqual(['joyn', 'waipu'])
    expect(merged.broadcastEvents[0].sourceRefs).toHaveLength(2)
  })

  it('publishes a healthy source even when another source failed', () => {
    const merged = mergeSourceGenerations({
      generations: [envelope('waipu', 'waipu')],
      failures: [{ sourceId: 'fixture-joyn', code: 'HTTP_503', message: 'unavailable' }],
    }, { now: Date.parse('2026-09-26T12:00:00Z') })

    expect(merged.broadcastEvents).toHaveLength(1)
    expect(merged.sourceStatuses.find((status) => status.sourceId === 'waipu')?.status).toBe('healthy')
    expect(merged.sourceStatuses.find((status) => status.sourceId === 'fixture-joyn')).toMatchObject({
      status: 'failed',
      retainedPrevious: false,
    })
  })

  it('retains the last valid generation for a failed source but drops expired broadcasts', () => {
    const previous = normalizeSourceEnvelope({
      ...envelope('fixture-joyn', 'joyn'),
      records: [
        envelope('fixture-joyn', 'joyn', {
          startAt: '2026-09-26T18:00:00Z',
          endAt: '2026-09-26T20:00:00Z',
        }).records[0],
        envelope('fixture-joyn', 'joyn', {
          startAt: '2026-09-25T18:00:00Z',
          endAt: '2026-09-25T20:00:00Z',
        }).records[0],
      ],
    })

    const merged = mergeSourceGenerations({
      previousEnvelopes: [previous],
      failures: [{ sourceId: 'fixture-joyn', code: 'HTTP_503' }],
    }, { now: Date.parse('2026-09-26T12:00:00Z') })

    expect(merged.broadcastEvents).toHaveLength(1)
    expect(merged.sourceStatuses[0]).toMatchObject({
      sourceId: 'fixture-joyn',
      status: 'failed',
      retainedPrevious: true,
      recordsBeforeExpiry: 2,
      activeRecords: 1,
      expiredRecordsDropped: 1,
    })
  })

  it('writes the merged publication atomically and keeps machine-readable source status', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-source-merge-'))
    cleanup.push(root)
    const target = resolve(root, 'current.json')

    await writeMergedSourcePublication(target, {
      generations: [envelope('waipu', 'waipu')],
      failures: [{ sourceId: 'fixture-joyn', code: 'TIMEOUT' }],
    }, { now: Date.parse('2026-09-26T12:00:00Z') })

    const written = JSON.parse(await readFile(target, 'utf8'))
    expect(written.counts).toMatchObject({ sources: 2, broadcastEvents: 1, failedSources: 1 })
    expect(written.sourceStatuses.find((status) => status.sourceId === 'fixture-joyn')?.failure?.code)
      .toBe('TIMEOUT')
  })
})
