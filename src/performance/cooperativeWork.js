import { recordPerformanceEvent } from './performanceDiagnostics.js'

export function throwIfAborted(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Arbeit abgebrochen.'), { name: 'AbortError' })
}

export async function yieldToMain(signal) {
  throwIfAborted(signal)
  if (typeof globalThis.scheduler?.yield === 'function') await globalThis.scheduler.yield()
  else await new Promise((resolve) => setTimeout(resolve, 0))
  throwIfAborted(signal)
}

// A time budget, not a fixed number of records: older WebViews get the same
// opportunity to paint and handle input. Callers publish only complete results.
export async function mapCooperatively(items, transform, { signal, budgetMs = 8 } = {}) {
  await yieldToMain(signal)
  let sliceStarted = performance.now()
  let maxSliceMs = 0, workMs = 0, yields = 1
  const result = []
  for (let index = 0; index < items.length; index += 1) {
    throwIfAborted(signal)
    result.push(transform(items[index], index))
    if ((index & 15) === 15 && performance.now() - sliceStarted >= budgetMs) {
      const duration = performance.now() - sliceStarted
      maxSliceMs = Math.max(maxSliceMs, duration); workMs += duration; yields += 1
      await yieldToMain(signal)
      sliceStarted = performance.now()
    }
  }
  const finalSlice = performance.now() - sliceStarted
  recordPerformanceEvent('runtime:work', { items: items.length, maxSliceMs: Math.max(maxSliceMs, finalSlice), workMs: workMs + finalSlice, yields })
  return result
}

export function sameItems(left, right) {
  return left === right || (left?.length === right?.length && left.every((item, index) => item === right[index]))
}

export function reuseRows(previous = [], next = []) {
  const byId = new Map(previous.map((row) => [row.id, row]))
  const result = next.map((row) => {
    const old = byId.get(row.id)
    return old && old.title === row.title && old.variant === row.variant
      && old.providerId === row.providerId && sameItems(old.items, row.items) ? old : row
  })
  return sameItems(previous, result) ? previous : result
}

export function createItemTransform(transform) {
  const cache = new WeakMap()
  return (item) => {
    if (!cache.has(item)) cache.set(item, transform(item))
    return cache.get(item)
  }
}

export function createItemMapper(transform) {
  const mapItem = createItemTransform(transform)
  let previous = []
  return (items) => {
    const next = items.map(mapItem)
    if (!sameItems(previous, next)) previous = next
    return previous
  }
}

export function createWorkQueue(concurrency = 2, maxPending = 20) {
  const pending = new Map(), active = new Set()
  function pump() {
    while (active.size < concurrency && pending.size) {
      const [key, work] = pending.entries().next().value
      pending.delete(key); active.add(key)
      Promise.resolve().then(work).catch(() => {}).finally(() => { active.delete(key); pump() })
    }
  }
  return {
    add(key, work) { if (active.has(key) || pending.has(key) || pending.size >= maxPending) return; pending.set(key, work); pump() },
    clear() { pending.clear() },
    snapshot: () => ({ active: active.size, queued: pending.size }),
  }
}

export async function withDeadline(work, timeoutMs, message = 'Daten konnten nicht rechtzeitig geladen werden.') {
  let timer
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(message), { name: 'TimeoutError' })), timeoutMs)
    })])
  } finally { clearTimeout(timer) }
}
