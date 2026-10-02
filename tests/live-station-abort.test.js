import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { loadJoynLiveStationCatalog } from '../src/joyn/joynTvCatalog.js'
import { loadWaipuLiveStationCatalog } from '../src/waipu/waipuTvCatalog.js'

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

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

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.signal).toBe(controller.signal)
    }

    controller.abort()

    await expect(request).resolves.toMatchObject({
      status: 'unavailable',
      stations: [],
    })
  })

  it('bindet beide React-Effects an einen realen AbortController', () => {
    expect(appSource).toContain('loadWaipuLiveStationCatalog({ signal: controller.signal })')
    expect(appSource).toContain('loadJoynLiveStationCatalog({ signal: controller.signal })')
  })
})
