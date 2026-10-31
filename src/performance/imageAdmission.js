import { recordPerformanceEvent } from './performanceDiagnostics.js'

// One budget for real DOM images and speculative Image requests. Foreground
// hero/details can displace speculative work; owner release cancels transport.
export function createImageAdmission({ concurrency = 2 } = {}) {
  const pending = new Map(), active = new Map()
  let sequence = 0, pumping = false
  function pump() {
    if (pumping) return
    pumping = true
    try {
      while (active.size < concurrency && pending.size) {
        const job = [...pending.values()].sort((a, b) => b.priority - a.priority || a.id - b.id)[0]
        pending.delete(job.id); active.set(job.id, job)
        job.start(() => finish(job.id))
      }
    } finally { pumping = false }
    recordPerformanceEvent('images:budget', { active: active.size, pending: pending.size })
  }
  function finish(id) { active.delete(id); pending.delete(id); pump() }
  return {
    request({ priority = 1, start, cancel = () => {} }) {
      const id = ++sequence
      pending.set(id, { id, priority, start, cancel })
      if (priority >= 3 && active.size >= concurrency) {
        const speculative = [...active.values()].find((job) => job.priority === 0)
        if (speculative) { active.delete(speculative.id); speculative.cancel() }
      }
      pump()
      return () => {
        const job = active.get(id)
        active.delete(id); pending.delete(id)
        job?.cancel()
        pump()
      }
    },
    snapshot: () => ({ active: active.size, pending: pending.size }),
  }
}

export const imageAdmission = createImageAdmission()

export function loadBudgetedImage(props, { priority = 0, ImageClass = globalThis.Image,
  timeoutMs = 10000, onLoad = () => {}, onError = () => {} } = {}) {
  let image, timer, done = false
  const clear = () => {
    clearTimeout(timer)
    if (image) { image.onload = null; image.onerror = null; image.srcset = ''; image.src = '' }
  }
  return imageAdmission.request({ priority,
    start(release) {
      if (!ImageClass) { release(); onError(); return }
      image = new ImageClass()
      const finish = (success) => {
        if (done) return
        done = true; clearTimeout(timer); image.onload = null; image.onerror = null
        release(); (success ? onLoad : onError)(image)
      }
      image.onload = () => {
        if (typeof image.decode === 'function') image.decode().catch(() => {}).then(() => finish(true))
        else finish(true)
      }
      image.onerror = () => finish(false)
      timer = setTimeout(() => { clear(); finish(false) }, timeoutMs)
      image.decoding = 'async'; image.fetchPriority = priority >= 3 ? 'high' : 'low'
      if (props.sizes) image.sizes = props.sizes
      if (props.srcSet) image.srcset = props.srcSet
      image.src = props.src
    },
    cancel() { const unfinished = !done; done = true; clear(); if (unfinished) onError() },
  })
}

let observer = null
const waiting = new Map()
export function observeImage(element, activate) {
  if (typeof IntersectionObserver === 'undefined') { activate(); return () => {} }
  if (!observer) observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const callback = waiting.get(entry.target)
      waiting.delete(entry.target); observer.unobserve(entry.target); callback?.()
    }
  }, { rootMargin: '120px' })
  waiting.set(element, activate); observer.observe(element)
  return () => { waiting.delete(element); observer?.unobserve(element) }
}
