import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPosterPrefetchQueue } from '../src/performance/posterPrefetch.js'
import { createWorkQueue } from '../src/performance/cooperativeWork.js'
import { loadConsistentTvRuntimeDay, loadTvRuntimeDay } from '../src/tv/tvRuntimeClient.js'
import { resolvePosterIndex } from '../src/navigation/posterFocus.js'
import { preloadPublicCatalog, readPublicCatalog, resetPublicCatalogForTests } from '../src/performance/publicCatalog.js'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); resetPublicCatalogForTests() })
describe('bounded background resources', () => {
  it('bounds background metadata work and discards queued work on account cleanup', async () => {
    const finish = [], started = []
    const queue = createWorkQueue(2, 3)
    for (let i = 0; i < 10; i += 1) queue.add(i, () => {
      started.push(i)
      return new Promise(resolve => finish.push(resolve))
    })
    await Promise.resolve()
    expect(started).toEqual([0, 1])
    expect(queue.snapshot()).toEqual({ active: 2, queued: 3 })
    queue.clear()
    finish.forEach(resolve => resolve())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(started).toEqual([0, 1])
    expect(queue.snapshot()).toEqual({ active: 0, queued: 0 })
  })
  it('caps image concurrency, drops obsolete queued work, bounds memory, and permits retry after failure', () => {
    const images = []
    class Image { constructor() { images.push(this) } }
    const queue = createPosterPrefetchQueue({ ImageClass: Image, concurrency: 2, cacheLimit: 3 })
    const requests = Array.from({ length: 8 }, (_, i) => ({ key: `p${i}`, src: `/${i}.jpg` }))
    queue.setWindow('row', requests)
    expect(queue.snapshot()).toMatchObject({ active: 2, queued: 6 })
    images[0].onload(); expect(queue.snapshot().active).toBe(2)
    images[1].onerror()
    queue.setWindow('row', [requests[1]])
    expect(queue.snapshot()).toMatchObject({ active: 1, queued: 0 })
    images.at(-1).onload()
    for (let i = 2; i < 8; i++) { queue.setWindow('row', [requests[i]]); images.at(-1).onload() }
    expect(queue.snapshot().remembered).toBe(3)
    queue.release('row'); expect(queue.snapshot()).toMatchObject({ active: 0, queued: 0, owners: 0 })
    queue.clear()
  })
  it('rejects mismatched generations and retries only once with a refreshed index', async () => {
    const payload = (generation) => ({ schemaVersion: 1, kind: 'moviehub-tv-runtime-day', key: '2026-10-31', generatedAt: generation, entries: [] })
    const fetchImpl = vi.fn(async (url) => ({ ok: true, json: async () => url.includes('index.json')
      ? { schemaVersion: 1, kind: 'moviehub-tv-runtime-index', generatedAt: 'new', days: [{ key: '2026-10-31' }] }
      : payload('new') }))
    await expect(loadTvRuntimeDay('2026-10-31', { generation: 'old', fetchImpl })).rejects.toMatchObject({ name: 'GenerationMismatchError' })
    fetchImpl.mockClear()
    const result = await loadConsistentTvRuntimeDay('2026-10-31', { generatedAt: 'old' }, { fetchImpl })
    expect(result.day.generatedAt).toBe('new'); expect(fetchImpl).toHaveBeenCalledTimes(3)
    const inconsistent = vi.fn(async (url) => ({ ok: true, json: async () => url.includes('index.json')
      ? { schemaVersion: 1, kind: 'moviehub-tv-runtime-index', generatedAt: 'old', days: [] } : payload('new') }))
    await expect(loadConsistentTvRuntimeDay('2026-10-31', { generatedAt: 'old' }, { fetchImpl: inconsistent })).rejects.toMatchObject({ name: 'GenerationMismatchError' })
    expect(inconsistent).toHaveBeenCalledTimes(3)
  })
  it('keeps focus on identity through insertion and chooses the next neighbour after removal', () => {
    expect(resolvePosterIndex([{ id: 'new' }, { id: 'a' }, { id: 'b' }], 'b', 1)).toBe(2)
    expect(resolvePosterIndex([{ id: 'a' }, { id: 'c' }], 'b', 1)).toBe(1)
    expect(resolvePosterIndex([{ id: 'a' }], 'b', 9)).toBe(0)
  })
  it('shares the public catalog preload while an individual consumer can cancel', async () => {
    let finish
    const fetchImpl = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    vi.stubGlobal('fetch', fetchImpl)
    const first = preloadPublicCatalog()
    const controller = new AbortController()
    const consumer = readPublicCatalog({ signal: controller.signal })
    await Promise.resolve(); controller.abort()
    await expect(consumer).rejects.toMatchObject({ name: 'AbortError' })
    const data = { titles: [{ id: 1 }], rowDefinitions: [] }
    finish({ ok: true, json: async () => data })
    expect(await first).toBe(data)
    expect(await preloadPublicCatalog()).toBe(data)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
  it('settles a completely unresponsive public catalog within the native watchdog budget', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const result = preloadPublicCatalog().then(() => 'unexpected', (error) => error.name)
    await vi.advanceTimersByTimeAsync(22501)
    expect(await result).toBe('TimeoutError')
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })
})
