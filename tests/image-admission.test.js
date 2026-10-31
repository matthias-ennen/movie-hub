import { afterEach, describe, expect, it, vi } from 'vitest'
import { createImageAdmission, imageAdmission, loadBudgetedImage } from '../src/performance/imageAdmission.js'

afterEach(() => { vi.useRealTimers() })

describe('shared image admission', () => {
  it('holds the two slots through decoding and starts pending work by priority', () => {
    const queue = createImageAdmission()
    const order = [], releases = []
    const add = (name, priority = 1) => queue.request({ priority, start: release => {
      order.push(name); releases.push(release)
    } })
    add('a'); add('b'); add('poster'); add('hero', 3)
    expect(queue.snapshot()).toEqual({ active: 2, pending: 2 })
    expect(order).toEqual(['a', 'b'])
    releases[0]()
    expect(order).toEqual(['a', 'b', 'hero'])
    releases[0]() // late duplicate completion cannot release another owner's slot
    expect(queue.snapshot()).toEqual({ active: 2, pending: 1 })
    releases[1]()
    expect(order).toEqual(['a', 'b', 'hero', 'poster'])
  })

  it('cancels obsolete pending work and active transports without starting them again', () => {
    const queue = createImageAdmission({ concurrency: 1 })
    const cancel = vi.fn(), stale = vi.fn(), next = vi.fn()
    const stop = queue.request({ start: () => {}, cancel })
    queue.request({ start: stale })()
    queue.request({ start: next })
    stop(); stop()
    expect(cancel).toHaveBeenCalledOnce()
    expect(stale).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
    expect(queue.snapshot()).toEqual({ active: 1, pending: 0 })
  })

  it('lets foreground content displace speculative work even with reentrant cancellation', () => {
    const queue = createImageAdmission({ concurrency: 1 })
    const starts = []
    queue.request({ priority: 0, start: () => starts.push('prefetch'), cancel: () => {
      queue.request({ priority: 0, start: () => starts.push('next prefetch') })
    } })
    const stop = queue.request({ priority: 3, start: () => starts.push('hero') })
    expect(starts).toEqual(['prefetch', 'hero'])
    stop()
    expect(starts).toEqual(['prefetch', 'hero', 'next prefetch'])
  })

  it('releases failed, timed out and aborted image work and ignores late decode results', async () => {
    vi.useFakeTimers()
    const images = [], loaded = vi.fn(), failed = vi.fn()
    let finishDecode
    class FakeImage {
      constructor() { images.push(this) }
      decode() { return new Promise(resolve => { finishDecode = resolve }) }
    }
    const stop = loadBudgetedImage({ src: '/decode.jpg' }, { ImageClass: FakeImage, onLoad: loaded, onError: failed })
    images[0].onload()
    expect(imageAdmission.snapshot().active).toBe(1)
    stop(); finishDecode(); await Promise.resolve(); await Promise.resolve()
    expect(loaded).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledOnce()
    expect(images[0].src).toBe('')
    loadBudgetedImage({ src: '/stalled.jpg' }, { ImageClass: FakeImage, timeoutMs: 100, onError: failed })
    vi.advanceTimersByTime(100)
    loadBudgetedImage({ src: '/failed.jpg' }, { ImageClass: FakeImage, onError: failed })
    images[2].onerror()
    expect(failed).toHaveBeenCalledTimes(3)
    expect(imageAdmission.snapshot()).toEqual({ active: 0, pending: 0 })
  })
})
