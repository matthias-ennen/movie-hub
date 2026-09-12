import { normalizeSharedMediaCatalogEntry } from './sharedMediaCatalogModel.js'
import { titleMediaKey } from './sharedMediaModel.js'

let snapshot = {
  uid: null,
  entries: [],
  loading: true,
  error: null,
}

const listeners = new Set()

function emit() {
  listeners.forEach((listener) => listener(snapshot))
}

export function getSharedMediaCatalogSnapshot() {
  return snapshot
}

export function subscribeSharedMediaCatalog(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateSharedMediaCatalogSnapshot(patch) {
  snapshot = { ...snapshot, ...patch }
  emit()
}

export function resetSharedMediaCatalogSnapshot({ loading = false } = {}) {
  snapshot = { uid: null, entries: [], loading, error: null }
  emit()
}

export function replaceSharedMediaCatalogDocuments(uid, docs) {
  const entries = []
  for (const source of Array.isArray(docs) ? docs : []) {
    const entry = normalizeSharedMediaCatalogEntry(source.id, source.data)
    if (entry) entries.push(entry)
  }
  entries.sort((a, b) => a.titleRef.title.localeCompare(b.titleRef.title, 'de'))
  updateSharedMediaCatalogSnapshot({ uid, entries, loading: false, error: null })
}

export function setSharedMediaCatalogPresence(uid, item, hasMedia) {
  if (!uid || snapshot.uid !== uid || typeof hasMedia !== 'boolean') return
  const key = titleMediaKey(item)
  const remaining = snapshot.entries.filter((entry) => entry.key !== key)
  if (hasMedia) {
    const normalized = normalizeSharedMediaCatalogEntry(key, { hasMedia: true, titleRef: item })
    if (normalized) remaining.push(normalized)
  }
  remaining.sort((a, b) => a.titleRef.title.localeCompare(b.titleRef.title, 'de'))
  updateSharedMediaCatalogSnapshot({ entries: remaining })
}
