import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadJoynLiveStationCatalog } from '../src/joyn/joynTvCatalog.js'
import { loadWaipuLiveStationCatalog } from '../src/waipu/waipuTvCatalog.js'

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
afterEach(() => vi.useRealTimers())

function abortAwareFetch() {
  return vi.fn((_url, options = {}) => new Promise((_resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    options.signal?.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  }))
}

describe('Live-Senderkataloge werden sauber abgebrochen', () => {
  it.each([
    ['Waipu', loadWaipuLiveStationCatalog],
    ['Joyn', loadJoynLiveStationCatalog],
  ])('%s reicht das AbortSignal an beide Netzwerkrequests weiter', async (_provider, loader) => {
    const controller = new AbortController()
    const fetchImpl = abortAwareFetch()
    const request = loader({ fetchImpl, signal: controller.signal })
    await Promise.resolve()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.signal.aborted).toBe(false)
    }

    controller.abort()
    for (const [, options] of fetchImpl.mock.calls) expect(options.signal.aborted).toBe(true)

    await expect(request).resolves.toMatchObject({
      status: 'unavailable',
      stations: [],
    })
  })

  it.each([
    ['Waipu', loadWaipuLiveStationCatalog],
    ['Joyn', loadJoynLiveStationCatalog],
  ])('%s beendet auch einen Transport, der AbortSignal ignoriert', async (_provider, loader) => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(() => new Promise(() => {}))
    const request = loader({ fetchImpl })
    await vi.advanceTimersByTimeAsync(10001)
    await expect(request).resolves.toMatchObject({ status: 'unavailable', stations: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bindet beide React-Effects an einen realen AbortController', () => {
    expect(appSource).toContain('loadWaipuLiveStationCatalog({ signal: controller.signal })')
    expect(appSource).toContain('loadJoynLiveStationCatalog({ signal: controller.signal })')
  })
})
