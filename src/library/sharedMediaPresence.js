import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { firebaseReady } from '../lib/firebase.js'
import { buildSharedMediaTitleRef } from './sharedMediaCatalogModel.js'
import { setSharedMediaCatalogPresence } from './sharedMediaCatalogRuntime.js'
import { titleMediaKey } from './sharedMediaModel.js'
import { useSharedMediaCatalog } from './useSharedMediaCatalog.js'

const checkedLegacyPresence = new Set()

export function useSharedMediaPresence(item, enabled = true) {
  const { uid, loading, hasTitle } = useSharedMediaCatalog()
  const catalogPresence = hasTitle(item)
  const [legacyPresence, setLegacyPresence] = useState(false)

  useEffect(() => {
    setLegacyPresence(false)
    if (!enabled || loading || !uid || catalogPresence) return undefined

    const key = `${uid}:${titleMediaKey(item)}`
    if (checkedLegacyPresence.has(key)) return undefined
    checkedLegacyPresence.add(key)
    let active = true

    firebaseReady
      .then(async ({ db }) => {
        const parentRef = doc(db, 'users', uid, 'sharedMedia', titleMediaKey(item))
        const snapshot = await getDocs(query(collection(parentRef, 'entries'), limit(1)))
        if (snapshot.empty) return
        await setDoc(parentRef, {
          hasMedia: true,
          titleRef: buildSharedMediaTitleRef(item),
          updatedAt: serverTimestamp(),
        }, { merge: true })
        setSharedMediaCatalogPresence(uid, item, true)
        if (active) setLegacyPresence(true)
      })
      .catch((error) => {
        checkedLegacyPresence.delete(key)
        console.warn('Älterer Movie-Hub-Katalogeintrag konnte nicht geprüft werden.', error)
      })

    return () => { active = false }
  }, [enabled, loading, uid, catalogPresence, item?.id, item?.tmdbId, item?.type])

  return Boolean(enabled && (catalogPresence || legacyPresence))
}
