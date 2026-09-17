import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { loadCompleteTitleMetadata } from '../catalog/loadCompleteTitleMetadata.js'
import { mergeEnrichedTitle, titleNeedsMetadataEnrichment } from '../catalog/titleMetadata.js'
import { firebaseReady } from '../lib/firebase.js'
import {
  canEncryptPersonalData,
  isEncryptedPersonalValue,
  protectPersonalValue,
  readPersonalValue,
} from '../lib/personalDataCrypto.js'
import { buildSharedMediaTitleRef } from './sharedMediaCatalogModel.js'
import { setSharedMediaCatalogPresence } from './sharedMediaCatalogRuntime.js'
import { normaliseMedia, titleMediaKey } from './sharedMediaModel.js'

export const SHARED_MEDIA_CHANGED_EVENT = 'moviehub:shared-media-changed'

const catalogMetadataRefreshes = new Map()
const LABEL_PURPOSE = 'sharedMedia.label'
const URL_PURPOSE = 'sharedMedia.url'

function decodeField(purpose, encryptedValue, legacyValue) {
  if (isEncryptedPersonalValue(encryptedValue) && canEncryptPersonalData()) {
    return readPersonalValue(purpose, encryptedValue).value
  }
  if (isEncryptedPersonalValue(legacyValue) && canEncryptPersonalData()) {
    return readPersonalValue(purpose, legacyValue).value
  }
  if (typeof legacyValue === 'string') return legacyValue
  throw new Error('Persönliches Movie-Hub-Feld ist auf diesem Client nicht lesbar.')
}

function decodeStoredMedia(raw, id = null) {
  const label = decodeField(LABEL_PURPOSE, raw?.labelEncrypted, raw?.label)
  const url = decodeField(URL_PURPOSE, raw?.urlEncrypted, raw?.url)
  return normaliseMedia({ id, ...raw, label, url })
}

function encryptedMediaFields(normalized) {
  if (!canEncryptPersonalData()) return {}
  return {
    labelEncrypted: protectPersonalValue(LABEL_PURPOSE, normalized.label),
    urlEncrypted: protectPersonalValue(URL_PURPOSE, normalized.url),
    cryptoVersion: 1,
  }
}

async function refreshCatalogMetadata(userId, entries, {
  loadDetail = loadCompleteTitleMetadata,
  resolveFirebase = () => firebaseReady,
  writeTitleRef = null,
  limit = 25,
} = {}) {
  const candidates = (Array.isArray(entries) ? entries : [])
    .filter((entry) => titleNeedsMetadataEnrichment(entry?.titleRef))
    .slice(0, Math.max(0, Number(limit) || 0))
  if (!userId || !candidates.length) return { candidates: candidates.length, updated: 0 }

  const firebase = writeTitleRef ? null : await resolveFirebase()
  let updated = 0
  for (const entry of candidates) {
    try {
      const detail = await loadDetail(entry.titleRef)
      if (titleNeedsMetadataEnrichment(detail)) continue
      const enriched = {
        ...mergeEnrichedTitle(entry.titleRef, detail),
        metadataUpdatedAt: new Date().toISOString(),
      }
      const nextTitleRef = buildSharedMediaTitleRef(enriched)
      if (writeTitleRef) {
        await writeTitleRef(entry.key, nextTitleRef)
      } else {
        await setDoc(doc(firebase.db, 'users', userId, 'sharedMedia', entry.key), {
          hasMedia: true,
          titleRef: nextTitleRef,
          updatedAt: serverTimestamp(),
        }, { merge: true })
      }
      setSharedMediaCatalogPresence(userId, enriched, true)
      updated++
    } catch (error) {
      console.warn(`Movie-Hub-Metadaten konnten für ${entry.key} nicht ergänzt werden.`, error)
    }
  }
  return { candidates: candidates.length, updated }
}

export function refreshSharedMediaCatalogMetadata(userId, entries, options = {}) {
  if (!userId) return Promise.resolve({ candidates: 0, updated: 0 })
  if (catalogMetadataRefreshes.has(userId)) return catalogMetadataRefreshes.get(userId)
  const promise = refreshCatalogMetadata(userId, entries, options)
    .finally(() => catalogMetadataRefreshes.delete(userId))
  catalogMetadataRefreshes.set(userId, promise)
  return promise
}

function notifySharedMediaChanged(userId, item, hasMedia) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SHARED_MEDIA_CHANGED_EVENT, {
    detail: {
      userId,
      titleKey: titleMediaKey(item),
      hasMedia,
    },
  }))
}

export async function loadSharedMedia(userId, item) {
  const { db } = await firebaseReady
  const parentRef = doc(db, 'users', userId, 'sharedMedia', titleMediaKey(item))
  const [snapshot, parentSnapshot] = await Promise.all([
    getDocs(collection(parentRef, 'entries')),
    getDoc(parentRef),
  ])
  const entries = []
  const migrations = []

  for (const entry of snapshot.docs) {
    const raw = entry.data()
    try {
      const normalized = decodeStoredMedia(raw, entry.id)
      entries.push(normalized)

      const migration = {}
      if (raw.type === 'provider' || raw.type === 'smb' || raw.providerId) {
        migration.type = normalized.type
        migration.providerId = null
      }
      if (canEncryptPersonalData()
          && (!isEncryptedPersonalValue(raw.labelEncrypted)
            || !isEncryptedPersonalValue(raw.urlEncrypted))) {
        Object.assign(migration, encryptedMediaFields(normalized))
      }
      if (Object.keys(migration).length) {
        migration.updatedAt = serverTimestamp()
        migrations.push(setDoc(entry.ref, migration, { merge: true }))
      }
    } catch (error) {
      console.warn(`Movie-Hub-Medieneintrag ${entry.id} konnte nicht gelesen werden.`, error)
    }
  }

  // A failed background migration must not make otherwise valid media vanish.
  await Promise.allSettled(migrations)
  const nextTitleRef = buildSharedMediaTitleRef(item)
  const storedTitleRef = parentSnapshot.data()?.titleRef
  const titleRefNeedsRefresh = !storedTitleRef
    || Number(storedTitleRef.metadataVersion || 0) < Number(nextTitleRef.metadataVersion || 0)
    || (nextTitleRef.collectionChecked === true && storedTitleRef.collectionChecked !== true)
    || (nextTitleRef.collectionDetails && !storedTitleRef.collectionDetails)
    || ((nextTitleRef.artwork?.posterPaths?.length || 0) > (storedTitleRef.artwork?.posterPaths?.length || 0))
    || ((nextTitleRef.artwork?.heroBackdropPaths?.length || 0) > (storedTitleRef.artwork?.heroBackdropPaths?.length || 0))
  if (entries.length && (
    !parentSnapshot.exists()
    || parentSnapshot.data()?.hasMedia !== true
    || titleRefNeedsRefresh
  )) {
    await setDoc(parentRef, {
      hasMedia: true,
      titleRef: nextTitleRef,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch((error) => {
      console.warn('Movie-Hub-Katalogeintrag konnte nicht nachgezogen werden.', error)
    })
  } else if (!entries.length && parentSnapshot.exists()) {
    await deleteDoc(parentRef).catch((error) => {
      console.warn('Leerer Movie-Hub-Katalogeintrag konnte nicht bereinigt werden.', error)
    })
  }
  setSharedMediaCatalogPresence(userId, item, entries.length > 0)
  return entries.sort((a, b) => a.label.localeCompare(b.label, 'de'))
}

export async function saveSharedMedia(userId, item, entry) {
  const { db } = await firebaseReady
  const normalized = normaliseMedia(entry)
  const entryCollection = collection(db, 'users', userId, 'sharedMedia', titleMediaKey(item), 'entries')
  const entryRef = normalized.id ? doc(entryCollection, normalized.id) : doc(entryCollection)
  const id = entryRef.id
  const batch = writeBatch(db)
  batch.set(entryRef, {
    // Temporary dual-write for old installed APKs. Remove plaintext fields via #223
    // after all supported devices have the native MovieHubCrypto bridge.
    label: normalized.label,
    url: normalized.url,
    ...encryptedMediaFields(normalized),
    type: normalized.type,
    providerId: null,
    titleRef: {
      tmdbId: Number.isFinite(Number(item?.tmdbId)) ? Number(item.tmdbId) : null,
      type: item?.type === 'series' ? 'series' : 'movie',
      title: String(item?.title || '').slice(0, 160),
    },
    updatedAt: serverTimestamp(),
  }, { merge: true })
  batch.set(doc(db, 'users', userId, 'sharedMedia', titleMediaKey(item)), {
    hasMedia: true,
    titleRef: buildSharedMediaTitleRef(item),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  await batch.commit()
  setSharedMediaCatalogPresence(userId, item, true)
  notifySharedMediaChanged(userId, item, true)
  return id
}

export async function removeSharedMedia(userId, item, id) {
  const { db } = await firebaseReady
  const parentRef = doc(db, 'users', userId, 'sharedMedia', titleMediaKey(item))
  const entryCollection = collection(parentRef, 'entries')
  const remaining = await getDocs(entryCollection)
  const hasMedia = remaining.docs.some((entry) => {
    if (entry.id === id) return false
    try {
      decodeStoredMedia(entry.data(), entry.id)
      return true
    } catch {
      return false
    }
  })
  const batch = writeBatch(db)
  batch.delete(doc(entryCollection, id))
  if (hasMedia) {
    batch.set(parentRef, {
      hasMedia: true,
      titleRef: buildSharedMediaTitleRef(item),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } else {
    batch.delete(parentRef)
  }
  await batch.commit()
  setSharedMediaCatalogPresence(userId, item, hasMedia)
  notifySharedMediaChanged(userId, item, hasMedia)
}
