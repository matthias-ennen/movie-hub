import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { JoynLookupCache } from '../scripts/joyn-match-cache.mjs'
import { JoynTmdbSearchClient } from '../scripts/joyn-tmdb-matcher.mjs'
import { WaipuTmdbSearchClient } from '../scripts/waipu-tmdb-matcher.mjs'
import {
  SHARED_TMDB_CAPTURE_OPT_IN,
  openOptionalSharedTmdbCapture,
  joynOriginalFirstResponseCache,
} from '../scripts/shared-tmdb-adapter-capture-stage.mjs'
import {
  SHARED_TMDB_SEARCH_NAMESPACE,
} from '../scripts/shared-tmdb-search-response-cache.mjs'
import {
  loadOptionalSharedTmdbResponses,
} from '../scripts/shared-tmdb-response-store.mjs'

const NOW = Date.parse('2026-11-13T16:00:00Z')
const TITLE = 'SYNTHETIC_TITLE_NOT_A_REAL_MATCH'
const MOVIE = { id: 111, title: TITLE, release_date: '2001-03-04' }
const KEY = JSON.stringify(['/search/movie', {
  language: 'de-DE', query: TITLE, include_adult: 'false',
}])
const response = () => ({
  ok: true, status: 200, headers: new Headers(),
  json: async () => ({ results: [MOVIE], page: 1, total_pages: 1 }),
  text: async () => '',
})

const roots = []
async function privateRoot() {
  const dir = await mkdtemp(join(tmpdir(), 'moviehub-336-capture-'))
  roots.push(dir)
  return dir
}
const cacheFile = root => join(root, 'artifacts/shared-tmdb/private/shared-tmdb-response-cache.json')
const session = (sourceId, projectRoot, now = NOW) =>
  openOptionalSharedTmdbCapture({ sourceId, projectRoot, enabled: true, now })

afterEach(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

describe('#336: actual Waipu/Joyn TMDB transports in private capture-only staging', () => {
  it('stays completely inactive without the exact opt-in and never opens a cache file', async () => {
    const root = await privateRoot()
    expect(SHARED_TMDB_CAPTURE_OPT_IN).toBe('private-stage-capture-v1')
    expect(await openOptionalSharedTmdbCapture({ sourceId: 'waipu', enabled: false }))
      .toBeNull()
    await expect(stat(cacheFile(root))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(openOptionalSharedTmdbCapture({
      sourceId: 'xmltv', enabled: true, projectRoot: root,
    })).rejects.toThrow(/source/)
  })

  it('captures Waipu ORIGINAL HTTP replies, but never serves a shared-cache hit', async () => {
    const root = await privateRoot()
    const capture = await session('waipu', root)
    expect(capture.loadStatus).toBe('missing')
    const fetchImpl = vi.fn(async () => response())
    const client = new WaipuTmdbSearchClient({
      token: 'test', responseCache: capture.responseCache,
      fetchImpl, paceMs: 0, maxRetries: 0,
    })
    await client.search({ type: 'movie', title: TITLE })
    expect(client.requestsStarted).toBe(1)
    expect(capture.responseCache.get(KEY)).toBeNull()
    // Even if the same key was captured before the next adapter starts, it
    // is not reused in a capture-only A/B baseline.
    const second = new WaipuTmdbSearchClient({
      token: 'test', responseCache: capture.responseCache,
      fetchImpl, paceMs: 0, maxRetries: 0,
    })
    await second.search({ type: 'movie', title: TITLE })
    expect(second.requestsStarted).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const saved = await capture.complete({ sourceGenerationComplete: true })
    expect(saved).toEqual({ status: 'saved', stored: 2 })
    expect(JSON.stringify(saved)).not.toContain(TITLE)
    const file = cacheFile(root)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    const loaded = await loadOptionalSharedTmdbResponses(file, { now: NOW })
    expect(loaded.entries).toBe(1)
    expect(loaded.store.get(SHARED_TMDB_SEARCH_NAMESPACE, KEY).results[0].id).toBe(111)
  })

  it('preserves the original Joyn response cache on HIT and does not falsely capture it', async () => {
    const root = await privateRoot()
    const original = new JoynLookupCache({}, NOW)
    original.set(SHARED_TMDB_SEARCH_NAMESPACE, KEY, { results: [MOVIE] })
    const capture = await session('joyn', root)
    const fetchImpl = vi.fn(async () => { throw new Error('Should not call TMDB') })
    const client = new JoynTmdbSearchClient({
      token: 'test', fetchImpl,
      responseCache: joynOriginalFirstResponseCache(original, capture),
      paceMs: 0, maxRetries: 0,
    })
    const found = await client.search({ type: 'movie', title: TITLE })
    expect(found[0].id).toBe(111)
    expect(client.requestsStarted).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect((await capture.complete({ sourceGenerationComplete: true })).status)
      .toBe('no_new_responses')
    await expect(stat(cacheFile(root))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('captures Joyn NEW original TMDB responses while preserving its legacy lookup', async () => {
    const root = await privateRoot()
    const original = new JoynLookupCache({}, NOW)
    const capture = await session('joyn', root)
    const client = new JoynTmdbSearchClient({
      token: 'test',
      fetchImpl: vi.fn(async () => response()),
      responseCache: joynOriginalFirstResponseCache(original, capture),
      paceMs: 0, maxRetries: 0,
    })
    expect((await client.search({ type: 'movie', title: TITLE }))[0].id).toBe(111)
    expect(client.requestsStarted).toBe(1)
    expect(original.get(SHARED_TMDB_SEARCH_NAMESPACE, KEY).results[0].id).toBe(111)
    expect((await capture.complete({ sourceGenerationComplete: true })).status).toBe('saved')
    expect((await loadOptionalSharedTmdbResponses(cacheFile(root), { now: NOW })).entries)
      .toBe(1)
  })

  it('records two consecutive complete sources, without skipping any ORIGINAL HTTP requests', async () => {
    const root = await privateRoot()
    const waipu = await session('waipu', root)
    const wFetch = vi.fn(async () => response())
    const w = new WaipuTmdbSearchClient({
      token: 'test', fetchImpl: wFetch,
      responseCache: waipu.responseCache, paceMs: 0, maxRetries: 0,
    })
    await w.search({ type: 'movie', title: TITLE })
    expect((await waipu.complete({ sourceGenerationComplete: true })).status).toBe('saved')

    const joyn = await session('joyn', root, NOW + 1000)
    expect(joyn.loadStatus).toBe('loaded')
    const jFetch = vi.fn(async () => response())
    const j = new JoynTmdbSearchClient({
      token: 'test', fetchImpl: jFetch,
      responseCache: joynOriginalFirstResponseCache(new JoynLookupCache({}, NOW + 1000), joyn),
      paceMs: 0, maxRetries: 0,
    })
    await j.search({ type: 'movie', title: TITLE })
    expect(w.requestsStarted).toBe(1)
    expect(j.requestsStarted).toBe(1)
    expect(wFetch).toHaveBeenCalledOnce()
    expect(jFetch).toHaveBeenCalledOnce()
    expect((await joyn.complete({ sourceGenerationComplete: true })).status).toBe('saved')
    const restored = await loadOptionalSharedTmdbResponses(cacheFile(root), { now: NOW + 1000 })
    expect(restored.entries).toBe(1)
    // Capturing on a later HTTP fetch updates the request's source-agnostic
    // timestamp, but does not imply production HTTP savings.
  })

  it('refuses persistence when the full source generation did not finish', async () => {
    const root = await privateRoot()
    const capture = await session('waipu', root)
    expect(capture.responseCache.set(KEY, { results: [MOVIE] })).toBe(true)
    expect(await capture.complete({ sourceGenerationComplete: false }))
      .toEqual({ status: 'not_complete', stored: 1 })
    await expect(stat(cacheFile(root))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await capture.complete({ sourceGenerationComplete: true })).status)
      .toBe('already_finalized')
  })

  it('does not overwrite a broken existing shared snapshot during original matching', async () => {
    const root = await privateRoot()
    const file = cacheFile(root)
    await (await import('node:fs/promises')).mkdir(join(root, 'artifacts/shared-tmdb/private'), {
      recursive: true,
    })
    await writeFile(file, '{broken', 'utf8')
    const capture = await session('waipu', root)
    expect(capture.loadStatus).toBe('unavailable')
    expect(capture.responseCache).toBeNull()
    expect(await capture.complete({ sourceGenerationComplete: true }))
      .toEqual({ status: 'unavailable', stored: 0 })
    expect(await readFile(file, 'utf8')).toBe('{broken')
  })

  it('returns revision_conflict instead of losing other generation\'s changes', async () => {
    const root = await privateRoot()
    const one = await session('waipu', root)
    const two = await session('joyn', root)
    one.responseCache.set(KEY, { results: [MOVIE] })
    two.responseCache.set(KEY, { results: [MOVIE] })
    expect((await one.complete({ sourceGenerationComplete: true })).status).toBe('saved')
    expect((await two.complete({ sourceGenerationComplete: true })).status)
      .toBe('revision_conflict')
    const restored = await loadOptionalSharedTmdbResponses(cacheFile(root), { now: NOW })
    expect(restored.entries).toBe(1)
  })

  it('never turns an invalid TMDB error response into a shared-cache entry', async () => {
    const root = await privateRoot()
    const capture = await session('joyn', root)
    expect(capture.responseCache.set(KEY, { status_code: 429, results: [MOVIE] })).toBe(false)
    expect(capture.responseCache.set(KEY, { results: [{ id: -3, title: TITLE }] })).toBe(false)
    expect((await capture.complete({ sourceGenerationComplete: true })).status)
      .toBe('no_new_responses')
  })

  it('has no activation in the deployed Nightly workflow', async () => {
    const { readFile } = await import('node:fs/promises')
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')
    expect(workflow).not.toContain('MOVIEHUB_SHARED_TMDB_CAPTURE')
    expect(workflow).not.toContain(SHARED_TMDB_CAPTURE_OPT_IN)
  })
})
