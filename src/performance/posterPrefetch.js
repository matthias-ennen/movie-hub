import { posterImageProps, posterSourceUrl } from './posterImages.js'
import { recordPerformanceEvent } from './performanceDiagnostics.js'
import { loadBudgetedImage } from './imageAdmission.js'

export const POSTER_PREFETCH_AHEAD = 5
export const POSTER_PREFETCH_BEHIND = 1
export const POSTER_PREFETCH_CONCURRENCY = 2
export const POSTER_PREFETCH_CACHE_LIMIT = 256

export function posterUrlForItem(item) { return posterSourceUrl(item) }
export function getPosterPrefetchWindow(items, focusIndex, { ahead = POSTER_PREFETCH_AHEAD, behind = POSTER_PREFETCH_BEHIND } = {}) {
  const source = Array.isArray(items) ? items : []
  const index = Math.max(0, Math.min(source.length - 1, Number(focusIndex) || 0))
  return source.slice(Math.max(0, index - Math.max(0, Number(behind) || 0)),
    Math.min(source.length, index + Math.max(0, Number(ahead) || 0) + 1))
}

export function createPosterPrefetchQueue({ ImageClass, concurrency = POSTER_PREFETCH_CONCURRENCY,
  cacheLimit = POSTER_PREFETCH_CACHE_LIMIT, timeoutMs = 10000, loadImage = null } = {}) {
  const owners = new Map(), active = new Map(), completed = new Map()
  let pending = []
  let pumping = false
  const wanted = (key) => [...owners.values()].some((requests) => requests.some((request) => request.key === key))
  function finish(key, success) {
    const job = active.get(key)
    if (!job) return
    clearTimeout(job.timer)
    if (job.image) { job.image.onload = null; job.image.onerror = null }
    active.delete(key)
    if (success) {
      completed.delete(key); completed.set(key, true)
      while (completed.size > cacheLimit) completed.delete(completed.keys().next().value)
    }
    pump()
  }
  function pump() {
    if (pumping) return
    pumping = true
    while (active.size < concurrency && pending.length) {
      const request = pending.shift()
      if (!wanted(request.key) || active.has(request.key) || completed.has(request.key)) continue
      if (loadImage) {
        const job = { cancel: null }
        active.set(request.key, job)
        job.cancel = loadImage(request, {
          onLoad: () => finish(request.key, true), onError: () => finish(request.key, false),
        })
        continue
      }
      const image = new ImageClass()
      const timer = setTimeout(() => { finish(request.key, false); image.src = '' }, timeoutMs)
      active.set(request.key, { image, timer })
      image.onload = () => finish(request.key, true)
      image.onerror = () => finish(request.key, false)
      image.decoding = 'async'; image.fetchPriority = 'low'
      if (request.sizes) image.sizes = request.sizes
      if (request.srcSet) image.srcset = request.srcSet
      image.src = request.src
    }
    pumping = false
  }
  function reconcile() {
    // Only retain the currently useful windows of mounted/most recent rows.
    pending = [...owners.values()].reverse().flat().filter((request, index, all) => (
      all.findIndex((candidate) => candidate.key === request.key) === index
      && !active.has(request.key) && !completed.has(request.key)
    )).slice(0, 24)
    for (const [key, job] of active) {
      if (wanted(key)) continue
      if (job.cancel) { active.delete(key); job.cancel(); continue }
      clearTimeout(job.timer); job.image.onload = null; job.image.onerror = null
      active.delete(key); job.image.src = ''
    }
    pump()
    recordPerformanceEvent('poster:prefetch', { active: active.size, queued: pending.length, remembered: completed.size })
  }
  return {
    setWindow(owner, requests) {
      const fresh = requests.filter((request) => !completed.has(request.key) && !active.has(request.key)
        && !pending.some((queued) => queued.key === request.key))
      owners.delete(owner); owners.set(owner, requests)
      while (owners.size > 8) owners.delete(owners.keys().next().value)
      reconcile()
      return fresh.map((request) => request.src)
    },
    release(owner) { owners.delete(owner); reconcile() },
    snapshot: () => ({ active: active.size, queued: pending.length, remembered: completed.size, owners: owners.size }),
    clear() { owners.clear(); reconcile(); completed.clear() },
  }
}

let queue = null
let queueImageClass = null
export function prefetchPosterWindow(items, focusIndex, options = {}) {
  if (typeof Image === 'undefined') return []
  if (!queue || queueImageClass !== Image) {
    queue?.clear(); queueImageClass = Image; queue = createPosterPrefetchQueue({ ImageClass: Image,
      loadImage: (props, handlers) => loadBudgetedImage(props, { ...handlers, ImageClass: Image, priority: 0 }),
    })
  }
  const requests = getPosterPrefetchWindow(items, focusIndex, options).filter(posterSourceUrl).map((item) => {
    const props = posterImageProps(item, { variant: options.variant || 'standard' })
    return { ...props, key: `${props.src}|${props.srcSet || ''}|${props.sizes || ''}` }
  })
  return queue.setWindow(options.owner || 'default', requests)
}
export function releasePosterPrefetch(owner) { queue?.release(owner) }
export function resetPosterPrefetchCacheForTests() { queue?.clear(); queue = null; queueImageClass = null }
