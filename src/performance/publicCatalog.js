import { fetchJsonWithTimeout } from './fetchJson.js'
import { loadCatalogWithRetry } from './catalogStartup.js'
import { throwIfAborted } from './cooperativeWork.js'

let request = null
let cached = null
let loadedAt = 0

// Public data can overlap authentication/profile loading. Retry budget is at
// most 3 * 7 s + 0.5 s + 1 s, below the existing native 30 s watchdog.
export function preloadPublicCatalog() {
  if (cached && Date.now() - loadedAt < 5 * 60 * 1000) return Promise.resolve(cached)
  if (request) return request
  request = loadCatalogWithRetry(async () => {
    const data = await fetchJsonWithTimeout('/catalog.json', { timeoutMs: 7000 })
    if (!Array.isArray(data?.titles) || !data.titles.length || !Array.isArray(data.rowDefinitions)) {
      throw new Error('Der geladene Katalog ist unvollständig.')
    }
    return data
  }, { retryDelays: [500, 1000] }).then((data) => {
    cached = data; loadedAt = Date.now(); return data
  }).finally(() => { request = null })
  return request
}

export async function readPublicCatalog({ signal } = {}) {
  throwIfAborted(signal)
  let cancel
  const aborted = new Promise((_, reject) => {
    cancel = () => reject(Object.assign(new Error('Start abgebrochen.'), { name: 'AbortError' }))
    signal?.addEventListener('abort', cancel, { once: true })
  })
  try { return await Promise.race([preloadPublicCatalog(), aborted]) }
  finally { signal?.removeEventListener('abort', cancel) }
}

export function resetPublicCatalogForTests() { request = null; cached = null; loadedAt = 0 }
