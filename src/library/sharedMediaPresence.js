import { collection, getDocs, limit, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { firebaseReady } from '../lib/firebase.js'
import { SHARED_MEDIA_CHANGED_EVENT } from './sharedMedia.js'
import { titleMediaKey } from './sharedMediaModel.js'

const presenceCache = new Map()
const pendingReads = new Map()
const listenersByKey = new Map()

function presenceKey(userId, item) {
  return `${userId}:${titleMediaKey(item)}`
}

function publish(key, value) {
  const normalized = Boolean(value)
  presenceCache.set(key, normalized)
  listenersByKey.get(key)?.forEach((listener) => listener(normalized))
}

async function readPresence(userId, item) {
  const key = presenceKey(userId, item)
  if (presenceCache.has(key)) return presenceCache.get(key)
  if (pendingReads.has(key)) return pendingReads.get(key)

  const pending = firebaseReady
    .then(async ({ db }) => {
      const entries = collection(db, 'users', userId, 'sharedMedia', titleMediaKey(item), 'entries')
      const snapshot = await getDocs(query(entries, limit(1)))
      const hasMedia = !snapshot.empty
      publish(key, hasMedia)
      return hasMedia
    })
    .catch((error) => {
      console.warn('Movie-Hub-Badge konnte nicht geprüft werden.', error)
      return false
    })
    .finally(() => pendingReads.delete(key))

  pendingReads.set(key, pending)
  return pending
}

export function setSharedMediaPresence(userId, item, hasMedia) {
  if (!userId || !item) return
  publish(presenceKey(userId, item), hasMedia)
}

export function useSharedMediaPresence(item, enabled = true) {
  const [hasMedia, setHasMedia] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setHasMedia(false)
      return undefined
    }

    let active = true
    let unsubscribe = () => {}

    firebaseReady
      .then(({ auth }) => {
        if (!active) return
        const userId = auth.currentUser?.uid
        if (!userId) {
          setHasMedia(false)
          return
        }

        const titleKey = titleMediaKey(item)
        const key = presenceKey(userId, item)
        const listener = (value) => {
          if (active) setHasMedia(Boolean(value))
        }
        const listeners = listenersByKey.get(key) || new Set()
        listeners.add(listener)
        listenersByKey.set(key, listeners)

        const handleSharedMediaChanged = (event) => {
          const detail = event?.detail
          if (detail?.userId !== userId || detail?.titleKey !== titleKey) return

          if (typeof detail.hasMedia === 'boolean') {
            publish(key, detail.hasMedia)
            return
          }

          // Deleting one entry needs a fresh existence check: another own
          // link/video for the same title may still remain.
          presenceCache.delete(key)
          pendingReads.delete(key)
          readPresence(userId, item).then(listener)
        }
        window.addEventListener(SHARED_MEDIA_CHANGED_EVENT, handleSharedMediaChanged)

        unsubscribe = () => {
          window.removeEventListener(SHARED_MEDIA_CHANGED_EVENT, handleSharedMediaChanged)
          const current = listenersByKey.get(key)
          current?.delete(listener)
          if (current?.size === 0) listenersByKey.delete(key)
        }

        if (presenceCache.has(key)) {
          listener(presenceCache.get(key))
        } else {
          readPresence(userId, item).then(listener)
        }
      })
      .catch((error) => console.warn('Movie-Hub-Badge konnte nicht initialisiert werden.', error))

    return () => {
      active = false
      unsubscribe()
    }
  }, [enabled, item?.id, item?.tmdbId, item?.type])

  return hasMedia
}
