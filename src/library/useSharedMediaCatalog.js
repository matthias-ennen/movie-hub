import { useCallback, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import { titleMediaKey } from './sharedMediaModel.js'
import {
  getSharedMediaCatalogSnapshot,
  replaceSharedMediaCatalogDocuments,
  resetSharedMediaCatalogSnapshot,
  subscribeSharedMediaCatalog,
  updateSharedMediaCatalogSnapshot,
} from './sharedMediaCatalogRuntime.js'

let started = false
let authUnsubscribe = null
let catalogUnsubscribe = null

function startSharedMediaCatalogSync() {
  if (started) return
  started = true

  firebaseReady
    .then(({ auth, db }) => {
      authUnsubscribe = onAuthStateChanged(auth, (user) => {
        catalogUnsubscribe?.()
        catalogUnsubscribe = null

        if (!user) {
          resetSharedMediaCatalogSnapshot({ loading: false })
          return
        }

        updateSharedMediaCatalogSnapshot({ uid: user.uid, entries: [], loading: true, error: null })
        catalogUnsubscribe = onSnapshot(
          collection(db, 'users', user.uid, 'sharedMedia'),
          (source) => {
            if (getSharedMediaCatalogSnapshot().uid !== user.uid) return
            replaceSharedMediaCatalogDocuments(user.uid, source.docs.map((entry) => ({
              id: entry.id,
              data: entry.data(),
            })))
          },
          (error) => {
            if (getSharedMediaCatalogSnapshot().uid !== user.uid) return
            updateSharedMediaCatalogSnapshot({ loading: false, error })
          },
        )
      })
    })
    .catch((error) => updateSharedMediaCatalogSnapshot({ loading: false, error }))
}

export function useSharedMediaCatalog() {
  const [state, setState] = useState(getSharedMediaCatalogSnapshot)

  useEffect(() => {
    startSharedMediaCatalogSync()
    return subscribeSharedMediaCatalog(setState)
  }, [])

  const keys = useMemo(() => new Set(state.entries.map((entry) => entry.key)), [state.entries])
  const hasTitle = useCallback((item) => keys.has(titleMediaKey(item)), [keys])

  return { ...state, hasTitle }
}

export function stopSharedMediaCatalogSyncForTests() {
  catalogUnsubscribe?.()
  authUnsubscribe?.()
  catalogUnsubscribe = null
  authUnsubscribe = null
  started = false
  resetSharedMediaCatalogSnapshot({ loading: true })
}
