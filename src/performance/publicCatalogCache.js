import { validStartupCatalog, STARTUP_CACHE_MAX_AGE_MS } from '../catalog/startupCatalog.js'

// Public metadata only. One atomic record bounds storage and avoids mixed
// generations; private profile/auth data is deliberately not persisted here.
export function createPublicCatalogCache(indexedDB = globalThis.indexedDB) {
  async function transact(mode, work) {
    if (!indexedDB) return null
    return new Promise(resolve => {
      let db, done = false
      const finish = value => { if (done) return; done = true; clearTimeout(timer); db?.close(); resolve(value) }
      const timer = setTimeout(() => finish(null), 500)
      try {
        const open = indexedDB.open('moviehub-public-startup-v1', 1)
        open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('catalog')) open.result.createObjectStore('catalog') }
        open.onerror = () => finish(null)
        open.onblocked = () => finish(null)
        open.onsuccess = () => {
          db = open.result
          if (done) { db.close(); return }
          try {
            const tx = db.transaction('catalog', mode)
            const request = work(tx.objectStore('catalog'))
            tx.oncomplete = () => finish(request.result ?? true)
            tx.onabort = tx.onerror = () => finish(null)
          } catch { finish(null) }
        }
      } catch { finish(null) }
    })
  }
  return {
    async read(now = Date.now()) {
      const value = await transact('readonly', store => store.get('current'))
      return value && now >= value.savedAt && now - value.savedAt <= STARTUP_CACHE_MAX_AGE_MS
        && validStartupCatalog(value.catalog) ? value.catalog : null
    },
    write: catalog => transact('readwrite', store => store.put({ savedAt: Date.now(), catalog }, 'current')),
  }
}
