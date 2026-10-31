import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMetadataRequests } from '../src/performance/metadataRequests.js'
import { bootstrapPersonalTitleState, hydratePersonalStates } from '../src/library/personalTitleMetadata.js'
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
afterEach(() => vi.useRealTimers())

describe('bounded and cancellable metadata admission', () => {
  it('admits at most two transports, promotes foreground work and cancels obsolete subscribers', async () => {
    const queue = createMetadataRequests(), finish = new Map(), urls = []
    const fetchImpl = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      urls.push(url); finish.set(url, value => resolve({ ok: true, json: async () => value }))
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const controller = new AbortController()
    const first = queue.load('/a', { fetchImpl, priority: 0 })
    const shared = queue.load('/a', { fetchImpl, signal: controller.signal })
    const sharedOutcome = shared.catch(error => error.name)
    const second = queue.load('/b', { fetchImpl, priority: 0 })
    const back = queue.load('/c', { fetchImpl, priority: 0 })
    const front = queue.load('/d', { fetchImpl })
    await tick(); expect(urls).toEqual(['/a', '/b']); expect(queue.snapshot().active).toBe(2)
    controller.abort(); expect(await sharedOutcome).toBe('AbortError')
    finish.get('/a')({ id: 'a' }); await first; await tick()
    expect(urls).toEqual(['/a', '/b', '/d'])
    finish.get('/b')({ id: 'b' }); await second; await tick()
    finish.get('/d')({ id: 'd' }); finish.get('/c')({ id: 'c' }); await Promise.all([front, back]); await tick()
    expect(queue.snapshot()).toEqual({ active: 0, queued: 0, cached: 4 })
    await queue.load('/a', { fetchImpl }); expect(fetchImpl).toHaveBeenCalledTimes(4)
  })
  it('removes queued jobs and aborts active work when its last owner leaves', async () => {
    const queue = createMetadataRequests({ concurrency: 1 }), controller = new AbortController()
    const fetchImpl = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const outcomes = ['/a', '/b', '/c'].map(url => queue.load(url, { fetchImpl, signal: controller.signal }).catch(error => error.name))
    await tick(); controller.abort()
    expect(await Promise.all(outcomes)).toEqual(['AbortError', 'AbortError', 'AbortError']); await tick()
    expect(fetchImpl).toHaveBeenCalledOnce(); expect(queue.snapshot()).toEqual({ active: 0, queued: 0, cached: 0 })
  })
  it('releases the budget even when a transport ignores abort and never answers', async () => {
    vi.useFakeTimers()
    const queue = createMetadataRequests({ concurrency: 1 })
    const first = queue.load('/hung', { fetchImpl: () => new Promise(() => {}) }).catch(error => error.name)
    const second = queue.load('/next', { fetchImpl: async () => ({ ok: true, json: async () => ({ ready: true }) }) })
    await vi.advanceTimersByTimeAsync(8001)
    expect(await first).toBe('TimeoutError'); expect(await second).toEqual({ ready: true })
  })
  it('publishes personal flags without detail requests and hydrates unknown titles with two workers', async () => {
    const states = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i), bootstrapPersonalTitleState({ watchlist: true,
      titleRef: { catalogId: `tmdb-movie-${i + 1}`, tmdbId: i + 1, type: 'movie' } })]))
    expect(Object.values(states).every(state => state.watchlist)).toBe(true)
    const loadDetail = vi.fn(async () => { active++; peak = Math.max(peak, active); await tick(); active--; return null })
    let active = 0, peak = 0, delivered = 0
    await hydratePersonalStates(states, { getListing: ref => Number(ref.tmdbId) < 51
      ? { id: ref.catalogId, tmdbId: ref.tmdbId, type: 'movie', title: 'Bekannter Titel', detailDeferred: true } : null,
      loadDetail, onBatch: entries => { expect(entries.length).toBeLessThanOrEqual(8); delivered += entries.length } })
    expect(loadDetail).toHaveBeenCalledTimes(50); expect(peak).toBe(2); expect(delivered).toBe(100)
  })
  it('never publishes hydrated data after a profile abort', async () => {
    const controller = new AbortController(), onBatch = vi.fn()
    const states = { a: bootstrapPersonalTitleState({ watchlist: true, titleRef: { catalogId: 'a', tmdbId: 1, type: 'movie' } }) }
    const result = hydratePersonalStates(states, { signal: controller.signal, getListing: () => null, onBatch,
      loadDetail: async () => { controller.abort(); return null } })
    await expect(result).rejects.toMatchObject({ name: 'AbortError' }); expect(onBatch).not.toHaveBeenCalled()
  })
})
