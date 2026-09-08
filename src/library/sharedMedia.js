import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import { normaliseMedia, titleMediaKey } from './sharedMediaModel.js'

export async function loadSharedMedia(userId, item) {
  const { db } = await firebaseReady
  const snapshot = await getDocs(collection(db, 'users', userId, 'sharedMedia', titleMediaKey(item), 'entries'))
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
  return entries.sort((a, b) => a.label.localeCompare(b.label, 'de'))
}

export async function saveSharedMedia(userId, item, entry) {
  const { db } = await firebaseReady
  const normalized = normaliseMedia(entry)
  const entryCollection = collection(db, 'users', userId, 'sharedMedia', titleMediaKey(item), 'entries')
  const entryRef = normalized.id ? doc(entryCollection, normalized.id) : doc(entryCollection)
  const id = entryRef.id
  await setDoc(entryRef, {
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
  return id
}

export async function removeSharedMedia(userId, item, id) {
  const { db } = await firebaseReady
  await deleteDoc(doc(db, 'users', userId, 'sharedMedia', titleMediaKey(item), 'entries', id))
}
