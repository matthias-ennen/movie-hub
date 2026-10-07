import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JoynSourceGuard } from '../scripts/joyn-source-guard.mjs'
import { loadJoynEpg, searchJoynTitle } from '../scripts/joyn-adapter-diagnostic.mjs'
import { applyArchive, makeArchive } from '../scripts/durable-data-checkpoint.mjs'
const directories = []
const now = Date.parse('2026-10-07T10:00:00Z')
const searchUrl = 'https://api.joyn.de/graphql?operationName=SearchQ'
const algoliaUrl = 'https://ffqrv35svv-dsn.algolia.net/1/indexes/*/queries'
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers })
async function setup(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'joyn-source-guard-')); directories.push(root)
  const directory = join(root, 'artifacts/joyn-sync')
  const config = { directory, now: () => now, sleep: async () => {}, ...options }
  return { root, config, guard: await JoynSourceGuard.load(config) }
}
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
describe('durable Joyn source protection', () => {
  it('preserves genuine empty search results as successful evidence', async () => {
    const fetchImpl = vi.fn(async () => response({ data: { search: { results: [] } } }))
    const { guard } = await setup({ fetchImpl })
    expect(await searchJoynTitle('Titel', { fetchImpl: guard.fetch, token: 'private', apiKey: 'private' })).toMatchObject({ reason: 'no_joyn_type' })
    expect(guard.snapshot().run).toMatchObject({ requests: { titleSearch: 1 }, errors: {} })
  })
  it('does not turn GraphQL schema failures into unmatched titles', async () => {
    const { guard, config } = await setup({ fetchImpl: async () => response({ errors: [{ message: 'query changed' }] }) })
    await expect(searchJoynTitle('Titel', { fetchImpl: guard.fetch, token: 'private', apiKey: 'private' })).rejects.toMatchObject({ code: 'JOYN_SOURCE_SCHEMA' })
    const fetchImpl = vi.fn()
    const resumed = await JoynSourceGuard.load({ ...config, fetchImpl })
    await expect(resumed.fetch(searchUrl)).rejects.toMatchObject({ code: 'JOYN_SOURCE_PAUSED' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('rejects a malformed Algolia payload rather than caching it as zero hits', async () => {
    const { guard } = await setup({ fetchImpl: async () => response({ results: [] }) })
    await expect(guard.fetch(algoliaUrl)).rejects.toMatchObject({ code: 'JOYN_SOURCE_SCHEMA' })
  })
  it.each(['1200', 'Wed, 07 Oct 2026 10:20:00 GMT'])('persists Retry-After %s across runners and resumes after expiry', async retryAfter => {
    const { guard, config } = await setup({ fetchImpl: async () => response({}, 429, { 'retry-after': retryAfter }) })
    await expect(guard.fetch(searchUrl)).rejects.toMatchObject({ code: 'JOYN_SOURCE_RATE_LIMIT' })
    expect(guard.snapshot().circuit.blockedUntil).toBe('2026-10-07T10:20:00.000Z')
    const fetchImpl = vi.fn(async () => response({ data: { search: { results: [] } } }))
    const paused = await JoynSourceGuard.load({ ...config, fetchImpl })
    await expect(paused.fetch(searchUrl)).rejects.toMatchObject({ code: 'JOYN_SOURCE_PAUSED' })
    expect(fetchImpl).not.toHaveBeenCalled()
    const resumed = await JoynSourceGuard.load({ ...config, fetchImpl, now: () => now + 21 * 60000 })
    expect((await resumed.fetch(searchUrl)).ok).toBe(true)
  })
  it('retains a forbidden stop in a private archive, including before the first EPG window', async () => {
    const fetchImpl = vi.fn(async () => response({}, 403))
    const { root, config, guard } = await setup({ fetchImpl })
    await expect(loadJoynEpg(guard.fetch, { sleep: async () => {} })).rejects.toMatchObject({ code: 'JOYN_SOURCE_FORBIDDEN' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await guard.finish('failed', Object.assign(new Error(), { code: 'JOYN_SOURCE_FORBIDDEN' }))
    const archive = await makeArchive({ root, group: 'joyn' })
    try {
      await rm(config.directory, { recursive: true })
      await applyArchive({ root, group: 'joyn', archive: archive.archive, sha256: archive.sha256 })
      const nextFetch = vi.fn()
      const restored = await JoynSourceGuard.load({ ...config, fetchImpl: nextFetch })
      await expect(restored.fetch(searchUrl)).rejects.toMatchObject({ code: 'JOYN_SOURCE_PAUSED' })
      expect(nextFetch).not.toHaveBeenCalled()
      const reset = await JoynSourceGuard.load({ ...config, resetCircuit: true })
      expect(() => reset.assertAvailable()).not.toThrow()
      const persisted = await readFile(join(config.directory, 'source-health.json'), 'utf8')
      expect(persisted).not.toContain('private')
      expect(persisted).not.toContain('Bearer')
    } finally { await rm(archive.directory, { recursive: true, force: true }) }
  })
  it('retries a temporary server failure and exposes actual requests and recovered errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({}, 503))
      .mockImplementation(async () => response({ results: [{ hits: [] }] }))
    const { guard } = await setup({ fetchImpl, budgets: { algolia: 3 } })
    expect((await guard.fetch(algoliaUrl)).ok).toBe(true)
    expect(guard.snapshot().run).toMatchObject({ requests: { algolia: 2 }, retries: 1, errors: { http_503: 1 } })
  })
  it('stops after three failed requests and retains a protection pause', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network failure with private URL') })
    const { guard } = await setup({ fetchImpl })
    await expect(guard.fetch(searchUrl)).rejects.toMatchObject({ code: 'JOYN_SOURCE_UNAVAILABLE' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(guard.snapshot().circuit.blockedUntil).toBe('2026-10-07T10:15:00.000Z')
  })
  it('counts retries against the hard HTTP budget', async () => {
    const fetchImpl = vi.fn(async () => response({}, 503))
    const { guard } = await setup({ fetchImpl, budgets: { algolia: 1 } })
    await expect(guard.fetch(algoliaUrl)).rejects.toMatchObject({ code: 'JOYN_SOURCE_REQUEST_BUDGET' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('keeps an unavailable optional detail page distinct from a source outage', async () => {
    const { guard } = await setup({ fetchImpl: async () => response({}, 404) })
    expect((await guard.fetch('https://api.joyn.de/graphql?operationName=LandingPageClient')).status).toBe(404)
    expect(guard.snapshot().circuit.automaticRunsDisabled).toBe(false)
  })
})
