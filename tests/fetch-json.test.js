import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJsonWithTimeout } from '../src/performance/fetchJson.js'
import { loadCatalogWithRetry } from '../src/performance/catalogStartup.js'

afterEach(() => vi.useRealTimers())

describe('bounded catalog requests', () => {
  it('returns valid JSON without retaining its watchdog', async () => {
    vi.useFakeTimers()
    const data = { titles: [{ id: 'movie-1' }] }
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => data }))
    await expect(fetchJsonWithTimeout('/catalog.json', { fetchImpl })).resolves.toBe(data)
    expect(fetchImpl.mock.calls[0][1].cache).toBe('no-store')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['headers', 'body'])('times out stalled %s even when the transport ignores abort', async (phase) => {
    vi.useFakeTimers()
    let requestSignal
    const never = new Promise(() => {})
    const fetchImpl = vi.fn((_, { signal }) => {
      requestSignal = signal
      return phase === 'headers' ? never : Promise.resolve({ ok: true, json: () => never })
    })
    const request = fetchJsonWithTimeout('/catalog.json', { fetchImpl, timeoutMs: 100 })
    const assertion = expect(request).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(requestSignal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries a timeout but cancels permanently on navigation', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchImpl = vi.fn(() => new Promise(() => {}))
    const request = loadCatalogWithRetry(() => fetchJsonWithTimeout('/catalog.json', {
      fetchImpl, signal: controller.signal, timeoutMs: 100,
    }), { retryDelays: [0], wait: async () => {} })
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(100)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    controller.abort()
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start an already-cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn()
    await expect(fetchJsonWithTimeout('/catalog.json', { fetchImpl, signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects HTTP and invalid JSON responses', async () => {
    await expect(fetchJsonWithTimeout('/catalog.json', {
      fetchImpl: async () => ({ ok: false, status: 503 }),
    })).rejects.toThrow('503')
    await expect(fetchJsonWithTimeout('/catalog.json', {
      fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON') } }),
    })).rejects.toThrow('invalid JSON')
  })
})
