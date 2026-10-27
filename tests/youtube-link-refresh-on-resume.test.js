import {describe,it,expect,vi} from 'vitest'
import {createYoutubeLinkRefreshController} from '../src/providers/youtubeLinkRefreshController.js'
import {loadYoutubeCuratedTitleHints} from '../src/providers/youtubeCuratedEditorialRuntime.js'
import {loadYoutubeVerifiedTitleRoutes} from '../src/providers/youtubeVerifiedRouteRuntime.js'

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return {promise, resolve}
}

describe('foreground YouTube link refresh', () => {
  it('rechecks all links, clears old targets, coalesces focus events and ignores slow stale replies', async () => {
    let currentTime = 1000
    const pending = [[], [], []]
    const loads = pending.map(queue => vi.fn(() => {
      const request = deferred()
      queue.push(request)
      return request.promise
    }))
    const values = [[], [], []]
    const sets = values.map(queue => value => queue.push(value))
    const controller = createYoutubeLinkRefreshController({
      loadVerified: loads[0], loadCurated: loads[1], loadBestEffort: loads[2],
      setVerified: sets[0], setCurated: sets[1], setBestEffort: sets[2],
      now: () => currentTime,
    })
    controller.refresh()
    await settle()
    expect(loads.map(load => load.mock.calls.length)).toEqual([1, 1, 1])
    expect(values.map(v => v.at(-1))).toEqual([null, null, null])
    currentTime += 100
    controller.refresh()
    await settle()
    expect(loads.map(load => load.mock.calls.length)).toEqual([1, 1, 1])
    currentTime += 1100
    controller.refresh()
    await settle()
    expect(loads.map(load => load.mock.calls.length)).toEqual([2, 2, 2])
    for (let i = 0; i < 3; i++) pending[i][0].resolve({stale: true})
    await settle()
    expect(values.map(v => v.at(-1))).toEqual([null, null, null])
    for (let i = 0; i < 3; i++) pending[i][1].resolve({new: i})
    await settle()
    expect(values.map(v => v.at(-1))).toEqual([{new: 0}, {new: 1}, {new: 2}])
    controller.stop()
  })

  it('stops late callbacks on unmount and treats failed refreshes as search fallback', async () => {
    let at = 1000
    const bad = deferred()
    const changes = []
    const controller = createYoutubeLinkRefreshController({
      loadVerified: () => bad.promise,
      loadCurated: () => Promise.reject(Error('offline')),
      loadBestEffort: () => null,
      setVerified: value => changes.push(['verified', value]),
      setCurated: value => changes.push(['curated', value]),
      setBestEffort: value => changes.push(['best', value]),
      now: () => at,
    })
    controller.refresh()
    await settle()
    expect(changes).toContainEqual(['curated', null])
    expect(changes).toContainEqual(['best', null])
    controller.stop()
    const before = changes.length
    bad.resolve({stale: true})
    await settle()
    expect(changes).toHaveLength(before)
    at += 2000
    controller.refresh()
    await settle()
    expect(changes).toHaveLength(before)
  })

  it('fetches updated curated and verified lists, not the old session promise', async () => {
    const original = globalThis.fetch
    const curated = version => ({
      kind: 'moviehub-youtube-curated-editorial-title-hints',
      schemaVersion: 1, providerId: 'youtube',
      publicationAuthority: 'editorial-playlist-only',
      verifiedDEOffers: 0, verifiedPlaybackRoutes: 0,
      count: version, entries: Array.from({length: version}, (_, i) => ({key: 'movie:' + i})),
    })
    const verified = version => ({
      kind: 'moviehub-youtube-verified-title-routes', schemaVersion: 1,
      providerId: 'youtube', count: version,
      entries: Array.from({length: version}, (_, i) => ({key: 'movie:' + i})),
    })
    let version = 1
    const request = vi.fn(async url => ({
      ok: true, json: async () => url.includes('curated')
        ? curated(version) : verified(version),
    }))
    globalThis.fetch = request
    try {
      expect((await loadYoutubeCuratedTitleHints()).count).toBe(1)
      expect((await loadYoutubeVerifiedTitleRoutes()).count).toBe(1)
      version = 2
      expect((await loadYoutubeCuratedTitleHints()).count).toBe(2)
      expect((await loadYoutubeVerifiedTitleRoutes()).count).toBe(2)
      expect(request).toHaveBeenCalledTimes(4)
      for (const [, options] of request.mock.calls) {
        expect(options).toMatchObject({redirect: 'error', cache: 'no-store'})
      }
    } finally {
      globalThis.fetch = original
    }
  })
})
