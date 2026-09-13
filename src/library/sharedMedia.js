import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import { buildSharedMediaTitleRef } from './sharedMediaCatalogModel.js'
import { setSharedMediaCatalogPresence } from './sharedMediaCatalogRuntime.js'
import { normaliseMedia, titleMediaKey } from './sharedMediaModel.js'

export const SHARED_MEDIA_CHANGED_EVENT = 'moviehub:shared-media-changed'

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
      const normalized = normaliseMedia({ id: entry.id, ...raw })
      entries.push(normalized)

      // Preserve legacy entries while moving them to the new two-type model.
      // Provider overrides become normal Movie-Hub links; old explicit SMB
      // entries become videos and keep the same document id and URL.
      if (raw.type === 'provider' || raw.type === 'smb' || raw.providerId) {
        migrations.push(setDoc(entry.ref, {
          type: normalized.type,
          providerId: null,
          updatedAt: serverTimestamp(),
        }, { merge: true }))
      }
    } catch {
      // Ignore malformed legacy entries instead of breaking the whole title.
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
    label: normalized.label,
    url: normalized.url,
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
      normaliseMedia({ id: entry.id, ...entry.data() })
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
