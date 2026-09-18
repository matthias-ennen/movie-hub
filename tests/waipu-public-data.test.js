import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeGrid,
  normalizeGridInfo,
  normalizeProgram,
  normalizeStations,
  WaipuEpgCache,
  WaipuPublicApiClient,
} from '../scripts/waipu-public-data.mjs'

const cleanups = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

async function temporaryCache(now = () => Date.parse('2026-09-18T12:30:00.000Z')) {
  const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-cache-'))
  cleanups.push(root)
  return { root, cache: new WaipuEpgCache({ root, now }) }
}

function capturedError(callback) {
  try {
    callback()
  } catch (error) {
    return error
  }
  throw new Error('Expected callback to throw.')
}

describe('Waipu public response normalization', () => {
  it('normalizes stations, grid info, grid programs and details', () => {
    expect(normalizeStations({ stations: [{
      id: 'ard',
      displayName: 'Das Erste HD',
      logoTemplateUrl: 'https://images.example/{format}.png',
      streamQualities: ['hd', 'hd'],
    }] })).toEqual([{ id: 'ard', displayName: 'Das Erste HD', logoTemplateUrl: 'https://images.example/{format}.png', streamQualities: ['hd'] }])
    expect(normalizeGridInfo({ slots: ['00', '04'], slotDurationHours: 4, timezone: 'UTC' }))
      .toEqual({ slots: ['00', '04'], slotDurationHours: 4, timezone: 'UTC' })
    expect(normalizeGrid([{ id: 'movie', title: 'Film', genre: 'Spielfilm', startTime: '2026-09-18T08:00:00Z', stopTime: '2026-09-18T10:00:00Z' }]))
      .toMatchObject([{ id: 'movie', title: 'Film', genre: 'Spielfilm' }])
    expect(normalizeProgram({ id: 'movie', textContent: { title: 'Film', titleOriginal: 'Movie' }, production: { year: 2024, countries: ['DE'] }, contentMeta: { mainGenre: 'Spielfilm' } }))
      .toMatchObject({ id: 'movie', title: 'Film', originalTitle: 'Movie', productionYear: 2024, productionCountries: ['DE'], mainGenre: 'Spielfilm' })
  })

  it('fails closed on missing required fields or invalid time ranges', () => {
    expect(capturedError(() => normalizeStations({ stations: [{ id: 'ard' }] }))).toMatchObject({ code: 'SCHEMA_INVALID' })
    expect(capturedError(() => normalizeGridInfo({ slots: ['00'], slotDurationHours: 6, timezone: 'UTC' }))).toMatchObject({ code: 'SCHEMA_INVALID' })
    expect(capturedError(() => normalizeGrid([{ id: 'x', title: 'X', startTime: '2026-09-18T10:00:00Z', stopTime: '2026-09-18T09:00:00Z' }]))).toMatchObject({ code: 'SCHEMA_INVALID' })
    expect(capturedError(() => normalizeProgram({ id: 'x' }))).toMatchObject({ code: 'SCHEMA_INVALID' })
  })
})

describe('WaipuPublicApiClient', () => {
  it('uses only GET and forwards cache validators without credentials', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init.method).toBe('GET')
      expect(init.headers.get('If-None-Match')).toBe('"v1"')
      expect(init.headers.has('Authorization')).toBe(false)
      expect(init.headers.has('Cookie')).toBe(false)
      return jsonResponse(null, 304, { ETag: '"v1"' })
    })
    const client = new WaipuPublicApiClient({ fetchImpl })
    await expect(client.getStations({ etag: '"v1"' })).resolves.toMatchObject({ status: 304, notModified: true })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('encodes path identifiers and rejects credential injection', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url.pathname).toContain('station%20one')
      expect(url.pathname).toContain('2026-09-18T08%3A00%3A00.000Z')
      return jsonResponse([])
    })
    const client = new WaipuPublicApiClient({ fetchImpl })
    await expect(client.getGrid('station one', '2026-09-18T08:00:00Z')).resolves.toMatchObject({ value: [] })
    await expect(client.getStations({ authorization: 'secret' })).rejects.toMatchObject({ code: 'CREDENTIALS_FORBIDDEN' })
  })

  it.each([
    [403, 'FORBIDDEN_STOP'],
    [429, 'RATE_LIMIT_STOP'],
    [503, 'UPSTREAM_ERROR'],
  ])('maps HTTP %i to %s without retrying', async (status, code) => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, status, status === 429 ? { 'Retry-After': '60' } : {}))
    const client = new WaipuPublicApiClient({ fetchImpl })
    await expect(client.getStations()).rejects.toMatchObject({ code, status })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('enforces the response size limit before parsing', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ stations: [] }), {
      status: 200,
      headers: { 'Content-Length': '4096' },
    }))
    const client = new WaipuPublicApiClient({ fetchImpl, maxResponseBytes: 1024 })
    await expect(client.getStations()).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
  })
})

describe('WaipuEpgCache', () => {
  it('persists validators and serves a 304 from cache', async () => {
    const { cache } = await temporaryCache()
    const client = {
      getStations: vi.fn()
        .mockResolvedValueOnce({ value: [{ id: 'ard', displayName: 'Das Erste' }], etag: '"v1"', lastModified: 'Thu, 18 Sep 2026 10:00:00 GMT' })
        .mockImplementationOnce(async (conditions) => {
          expect(conditions).toEqual({ etag: '"v1"', lastModified: 'Thu, 18 Sep 2026 10:00:00 GMT' })
          return { notModified: true, status: 304 }
        }),
    }
    await expect(cache.getStations(client)).resolves.toMatchObject({ cache: 'miss' })
    await expect(cache.getStations(client)).resolves.toEqual({ value: [{ id: 'ard', displayName: 'Das Erste' }], cache: 'revalidated' })
  })

  it('freezes completed grid slots and does not request them twice', async () => {
    const { cache } = await temporaryCache()
    const client = {
      getGrid: vi.fn(async () => ({ value: [{ id: 'movie', title: 'Film' }], etag: '"grid-v1"' })),
    }
    const first = await cache.getGrid(client, 'ard', '2026-09-18T08:00:00Z')
    const second = await cache.getGrid(client, 'ard', '2026-09-18T08:00:00Z')
    expect(first.cache).toBe('miss')
    expect(second.cache).toBe('immutable')
    expect(client.getGrid).toHaveBeenCalledOnce()
  })

  it('revalidates future slots with ETag', async () => {
    const { cache } = await temporaryCache(() => Date.parse('2026-09-18T08:30:00Z'))
    const client = {
      getGrid: vi.fn()
        .mockResolvedValueOnce({ value: [{ id: 'movie' }], etag: '"grid-v1"' })
        .mockImplementationOnce(async (_station, _slot, conditions) => {
          expect(conditions).toEqual({ etag: '"grid-v1"', lastModified: null })
          return { notModified: true, status: 304 }
        }),
    }
    await cache.getGrid(client, 'ard', '2026-09-18T08:00:00Z')
    await expect(cache.getGrid(client, 'ard', '2026-09-18T08:00:00Z')).resolves.toMatchObject({ cache: 'revalidated' })
    expect(client.getGrid).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent program detail requests and then persists the result', async () => {
    const { cache } = await temporaryCache()
    let release
    const gate = new Promise((resolveGate) => { release = resolveGate })
    const client = {
      getProgram: vi.fn(async () => {
        await gate
        return { value: { id: 'movie', title: 'Film' }, etag: '"program-v1"' }
      }),
    }
    const first = cache.getProgram(client, 'movie')
    const second = cache.getProgram(client, 'movie')
    release()
    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: { id: 'movie', title: 'Film' }, cache: 'miss' },
      { value: { id: 'movie', title: 'Film' }, cache: 'miss' },
    ])
    await expect(cache.getProgram(client, 'movie')).resolves.toEqual({ value: { id: 'movie', title: 'Film' }, cache: 'immutable' })
    expect(client.getProgram).toHaveBeenCalledOnce()
  })

  it('fails closed when a persisted record is corrupt', async () => {
    const { root, cache } = await temporaryCache()
    await cache.write('program', 'movie', { value: { id: 'movie' } }, { immutable: true })
    const directory = resolve(root, 'program')
    const { readdir } = await import('node:fs/promises')
    const [name] = await readdir(directory)
    await writeFile(resolve(directory, name), '{broken', 'utf8')
    await expect(cache.read('program', 'movie')).rejects.toMatchObject({ code: 'CACHE_CORRUPT' })
  })
})
