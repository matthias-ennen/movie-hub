import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import { normaliseMedia, titleMediaKey } from './sharedMediaModel.js'

export async function loadSharedMedia(userId, item) {
  const { db } = await firebaseReady
  const snapshot = await getDocs(collection(db, 'users', userId, 'sharedMedia', titleMediaKey(item), 'entries'))
  return snapshot.docs
    .map((entry) => {
      try {
        return normaliseMedia({ id: entry.id, ...entry.data() })
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, 'de'))
}

export async function saveSharedMedia(userId, item, entry) {
  const { db } = await firebaseReady
  const normalized = normaliseMedia(entry)
  const entryCollection = collection(db, 'users', userId, 'sharedMedia', titleMediaKey(item), 'entries')
  const targetId = normalized.type === 'provider'
    ? `provider-${normalized.providerId}`
    : normalized.id
  const entryRef = targetId ? doc(entryCollection, targetId) : doc(entryCollection)
  const id = entryRef.id
  await setDoc(entryRef, {
    label: normalized.label,
    url: normalized.url,
    type: normalized.type,
    providerId: normalized.providerId || null,
    titleRef: {
      tmdbId: Number.isFinite(Number(item?.tmdbId)) ? Number(item.tmdbId) : null,
      type: item?.type === 'series' ? 'series' : 'movie',
      title: String(item?.title || '').slice(0, 160),
    },
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return id
}

export async function removeSharedMedia(userId, item, id) {
  const { db } = await firebaseReady
  await deleteDoc(doc(db, 'users', userId, 'sharedMedia', titleMediaKey(item), 'entries', id))
}
