import { recordPerformanceEvent, measurePerformance } from './performanceDiagnostics.js'

export const CATALOG_REQUEST_TIMEOUT_MS = 10_000

// Bound the complete request, including the body. Cancellation also settles
// the caller if a transport ignores AbortSignal (e.g. an old WebView bridge).
export async function fetchJsonWithTimeout(url, {
  fetchImpl = fetch,
  signal,
  timeoutMs = CATALOG_REQUEST_TIMEOUT_MS,
  cache = 'no-store',
  measureAs = null,
} = {}) {
  const controller = new AbortController()
  let timeoutError = null
  let rejectAborted
  const aborted = new Promise((_, reject) => { rejectAborted = reject })
  const onAbort = () => {
    const error = timeoutError || Object.assign(new Error('Datenabruf abgebrochen.'), { name: 'AbortError' })
    rejectAborted(error)
  }
  const cancel = () => controller.abort()
  controller.signal.addEventListener('abort', onAbort, { once: true })
  signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => {
    timeoutError = Object.assign(new Error('Zeitlimit beim Datenabruf überschritten.'), { name: 'TimeoutError' })
    controller.abort()
  }, timeoutMs)

  try {
    if (signal?.aborted) controller.abort()
    const request = Promise.resolve().then(async () => {
      if (controller.signal.aborted) return aborted
      const startedAt = performance.now()
      const response = await fetchImpl(url, { cache, signal: controller.signal })
      if (controller.signal.aborted) return aborted
      if (!response.ok) throw new Error(`Daten konnten nicht geladen werden (${response.status})`)
      if (measureAs && typeof response.text === 'function') {
        const text = await response.text()
        if (controller.signal.aborted) return aborted
        recordPerformanceEvent(`${measureAs}:download`, { durationMs: performance.now() - startedAt, characters: text.length })
        return measurePerformance(`${measureAs}:parse`, () => JSON.parse(text))
      }
      return response.json()
    })
    return await Promise.race([request, aborted])
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
    controller.signal.removeEventListener('abort', onAbort)
  }
}
