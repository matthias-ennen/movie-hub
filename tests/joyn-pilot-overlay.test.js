import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeSourceEnvelope } from '../src/sources/sourceAdapterContract.js'
import { buildJoynPilotOverlay } from '../scripts/joyn-pilot-overlay.mjs'

const cleanup = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function event(channelId, eventId) {
  return {
    kind: 'broadcast',
    eventId,
    titleRef: { mediaType: 'movie', tmdbId: 11 },
    channelId,
    channelName: channelId,
    startAt: '2026-09-26T18:00:00Z',
    endAt: '2026-09-26T20:00:00Z',
    playbackRoutes: [{
      providerId: 'waipu',
      mode: 'APP_DEEP_LINK',
      target: `https://app.waipu.tv/epgdetails/${channelId}/program-1`,
    }],
    sourceRefs: [{
      sourceId: 'waipu-epg',
      externalId: eventId,
      observedAt: '2026-09-26T12:00:00Z',
      expiresAt: '2026-09-26T20:00:00Z',
    }],
  }
}

describe('Joyn pilot overlay artifact', () => {
  it('enriches only approved pilot stations and preserves Waipu timing provenance', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-joyn-pilot-'))
    cleanup.push(root)
    const waipuPath = resolve(root, 'waipu-v1.json')
    const outputPath = resolve(root, 'overlay.json')

    const envelope = normalizeSourceEnvelope({
      contractVersion: 1,
      sourceId: 'waipu-epg',
      sourceGenerationId: 'waipu:test',
      generatedAt: '2026-09-26T12:00:00Z',
      fetchedAt: '2026-09-26T12:00:00Z',
      sourceStatus: 'healthy',
      records: [
        event('pro7', 'pro7-1'),
        event('sat1', 'sat1-1'),
        event('unknown', 'unknown-1'),
      ],
    })
    await writeFile(waipuPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8')

    const result = await buildJoynPilotOverlay({
      waipuPath,
      outputPath,
      verifiedAt: '2026-09-26T13:00:00Z',
    })

    expect(result.counts).toMatchObject({
      waipuEvents: 3,
      pilotCandidateEvents: 2,
      routesAdded: 2,
      stationsWithEvents: 2,
    })
    expect(result.records).toHaveLength(2)
    expect(result.records.every((item) => item.sourceRefs.some((ref) => ref.sourceId === 'waipu-epg'))).toBe(true)
    expect(result.records.every((item) => item.playbackRoutes.some((route) => route.providerId === 'joyn'))).toBe(true)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    expect(written.quality).toBe('web-fallback')
    expect(written.eventTimingSource).toBe('waipu')
  })
})
