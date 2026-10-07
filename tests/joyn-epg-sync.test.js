import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { joynImportHorizon, syncJoynEpg, validateJoynWindowItems } from '../scripts/joyn-epg-sync.mjs'
const directories = []
const now = Date.parse('2026-10-07T01:00:00Z')
const horizon = joynImportHorizon(now)
const streams = [{ id: 'linear', title: 'Sender' }]
const item = (from, to, id = String(from)) => ({ start: from, end: to, livestream: { id: 'linear' }, program: { id, title: 'Titel', __typename: 'EpgEntryV2' } })
async function setup() { const directory = await mkdtemp(join(tmpdir(), 'joyn-sync-')); directories.push(directory); return { directory, streams, now, horizon, paceMs: 0, sleepImpl: async () => {} } }
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))) })
describe('Joyn complete rolling EPG import', () => {
  it('splits capped responses before deduplication and caches all 56 verified roots', async () => {
    const options = await setup()
    const requestWindow = vi.fn(async (from, to) => to - from > 10800
      ? [item(from, to, 'crossing'), item(from, to, 'crossing')]
      : [item(from, to)])
    const result = await syncJoynEpg({ ...options, responseLimit: 2, requestWindow })
    expect(result.status.metrics).toMatchObject({ windowsProcessed: 56, requestsStarted: 168, splitWindows: 56 })
    expect(result.streams[0].epgEvents).toHaveLength(112)
    expect(result.status.coverage[0].days).toHaveLength(14)
    const second = await syncJoynEpg({ ...options, now: now + 60000, responseLimit: 2, requestWindow })
    expect(second.status.metrics).toMatchObject({ requestsStarted: 0, cacheHits: 56 })
    expect(requestWindow).toHaveBeenCalledTimes(168)
  })
  it('resumes an interrupted budget with previously verified raw windows', async () => {
    const options = await setup()
    const requestWindow = vi.fn(async (from, to) => [item(from, to)])
    await expect(syncJoynEpg({ ...options, maxRequests: 3, requestWindow })).rejects.toMatchObject({ code: 'JOYN_EPG_REQUEST_BUDGET' })
    const saved = JSON.parse(await readFile(join(options.directory, 'checkpoint.json')))
    expect(Object.keys(saved.windows)).toHaveLength(3)
    const resumed = await syncJoynEpg({ ...options, now: now + 60000, requestWindow })
    expect(resumed.status.metrics).toMatchObject({ windowsProcessed: 56, requestsStarted: 53, cacheHits: 3 })
  })
  it('rejects a checkpoint whose raw cache was lost', async () => {
    const options = await setup()
    await syncJoynEpg({ ...options, requestWindow: async (from, to) => [item(from, to)] })
    await rm(join(options.directory, 'cache'), { recursive: true })
    await expect(syncJoynEpg({ ...options, requestWindow: vi.fn() })).rejects.toThrow('matching raw cache')
  })
  it('counts retries against the budget and does not retry authentication failures', async () => {
    const options = await setup()
    const requestWindow = vi.fn().mockRejectedValueOnce(Object.assign(new Error('limit'), { status: 429, retryAfter: 1 }))
      .mockImplementation(async (from, to) => [item(from, to)])
    const result = await syncJoynEpg({ ...options, requestWindow })
    expect(result.status.metrics).toMatchObject({ requestsStarted: 57, retries: 1 })
    const fresh = await setup()
    const forbidden = vi.fn(async () => { throw Object.assign(new Error('forbidden'), { status: 403 }) })
    await expect(syncJoynEpg({ ...fresh, requestWindow: forbidden })).rejects.toThrow('forbidden')
    expect(forbidden).toHaveBeenCalledTimes(1)
  })
  it('preserves IDs and seconds and explicitly excludes non-linear V2 events', async () => {
    const options = await setup()
    const result = await syncJoynEpg({ ...options, requestWindow: async (from, to) => [item(from, to),
      { start: from, end: to, livestream: { id: 'event-channel' }, program: { __typename: 'Episode' } }] })
    expect(result.status.metrics.outsideInventory).toBe(56)
    expect(result.streams[0].epgEvents[0]).toMatchObject({ startDate: Date.parse(horizon.start) / 1000, program: { id: String(Date.parse(horizon.start) / 1000) } })
  })
  it('accepts an inclusive crossing boundary, rejects malformed linear programs and missing station EPG', async () => {
    const from = Date.parse(horizon.start), to = from + 100000
    expect(validateJoynWindowItems([item(from / 1000 - 100, from / 1000)], { from, to, stationIds: new Set(['linear']) })).toHaveLength(1)
    expect(() => validateJoynWindowItems([{ ...item(from / 1000, to / 1000), program: {} }], { from, to, stationIds: new Set(['linear']) })).toThrow('Invalid Joyn EPG record')
    await expect(syncJoynEpg({ ...await setup(), streams: [...streams, { id: 'empty' }], requestWindow: async (from, to) => [item(from, to)] })).rejects.toThrow('missing its entire EPG')
  })
})
