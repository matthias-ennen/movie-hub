import { fetchJsonWithTimeout } from './fetchJson.js'
import { throwIfAborted } from './cooperativeWork.js'

// Shared by catalog details and search details. At most two downloads/parses;
// user-opened details overtake queued background hydration. Equal requests
// share a transport and only abort it when its final subscriber goes away.
export function createMetadataRequests({ concurrency = 2, cacheLimit = 4 } = {}) {
  const pending = [], jobs = new Map(), cache = new Map()
  let active = 0, sequence = 0
  const abortError = () => Object.assign(new Error('Metadatenabruf abgebrochen.'), { name: 'AbortError' })
  function pump() {
    pending.sort((a, b) => b.priority - a.priority || a.order - b.order)
    while (active < concurrency && pending.length) {
      const job = pending.shift()
      if (!job.listeners.size) continue
      job.started = true; active++
      fetchJsonWithTimeout(job.url, { fetchImpl: job.fetchImpl, signal: job.controller.signal, timeoutMs: 8000, cache: job.cacheMode })
        .then(value => {
          if (job.controller.signal.aborted) return
          cache.set(job.key, value)
          while (cache.size > cacheLimit) cache.delete(cache.keys().next().value)
          for (const listener of job.listeners) listener.resolve(value)
        }, error => { for (const listener of job.listeners) listener.reject(error) })
        .finally(() => {
          for (const listener of job.listeners) listener.cleanup()
          if (jobs.get(job.key) === job) jobs.delete(job.key)
          active--; pump()
        })
    }
  }
  const fetchIds = new WeakMap()
  let fetchSequence = 0
  return {
    load(url, { signal, priority = 10, fetchImpl = globalThis.fetch, cache: cacheMode = 'no-store' } = {}) {
      try { throwIfAborted(signal) } catch (error) { return Promise.reject(error) }
      if (!fetchIds.has(fetchImpl)) fetchIds.set(fetchImpl, ++fetchSequence)
      const key = `${fetchIds.get(fetchImpl)}:${url}`
      if (cache.has(key)) {
        const value = cache.get(key); cache.delete(key); cache.set(key, value)
        return Promise.resolve(value)
      }
      let job = jobs.get(key)
      if (!job) {
        if (pending.length >= 64) return Promise.reject(new Error('Metadatenwarteschlange ist ausgelastet.'))
        job = { key, url, fetchImpl, cacheMode, priority, order: sequence++, controller: new AbortController(), listeners: new Set(), started: false }
        jobs.set(key, job); pending.push(job)
      }
      job.priority = Math.max(job.priority, priority)
      const result = new Promise((resolve, reject) => {
        const listener = { resolve, reject, cleanup: () => signal?.removeEventListener('abort', cancel) }
        const cancel = () => {
          job.listeners.delete(listener); listener.cleanup(); reject(abortError())
          if (!job.listeners.size) {
            job.controller.abort()
            if (jobs.get(key) === job) jobs.delete(key)
            const index = pending.indexOf(job)
            if (index >= 0) pending.splice(index, 1)
          }
        }
        job.listeners.add(listener); signal?.addEventListener('abort', cancel, { once: true })
      })
      pump()
      return result
    },
    clear() { cache.clear() },
    snapshot: () => ({ active, queued: pending.length, cached: cache.size }),
  }
}

export const metadataRequests = createMetadataRequests()
