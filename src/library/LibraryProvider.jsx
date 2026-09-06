import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import {
  EMPTY_TITLE_STATE,
  applyTitleStatePatch,
  getTitleStateKey,
  hasPersonalTitleState,
  normalizeTitleState,
} from './libraryState.js'

const LibraryContext = createContext(null)

export function LibraryProvider({ user, activeProfile, children }) {
  const [statesByKey, setStatesByKey] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadStates() {
      if (!activeProfile?.id) {
        setStatesByKey({})
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const { db } = await firebaseReady
        const snapshot = await getDocs(collection(
          db,
          'users', user.uid,
          'profiles', activeProfile.id,
          'titles',
        ))

        if (cancelled) return

        const nextStates = {}
        snapshot.forEach((stateDocument) => {
          nextStates[stateDocument.id] = normalizeTitleState(stateDocument.data())
        })
        setStatesByKey(nextStates)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError)
          setStatesByKey({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadStates()
    return () => { cancelled = true }
  }, [activeProfile?.id, user.uid])

  const getTitleState = useCallback((item) => {
    const key = getTitleStateKey(item)
    return key && statesByKey[key] ? statesByKey[key] : EMPTY_TITLE_STATE
  }, [statesByKey])

  const updateTitleState = useCallback(async (item, patch) => {
    if (!activeProfile?.id) throw new Error('Kein aktives Movie-Hub-Profil.')

    const key = getTitleStateKey(item)
    if (!key) throw new Error('Titel hat keine stabile Referenz.')

    const previous = statesByKey[key] ?? EMPTY_TITLE_STATE
    const next = applyTitleStatePatch(previous, patch)

    setStatesByKey((current) => ({ ...current, [key]: next }))

    try {
      const { db } = await firebaseReady
      const stateRef = doc(
        db,
        'users', user.uid,
        'profiles', activeProfile.id,
        'titles', key,
      )

      const payload = {
        ...next,
        titleRef: {
          catalogId: String(item.id ?? ''),
          tmdbId: item.tmdbId ?? null,
          type: item.type === 'series' ? 'series' : 'movie',
        },
        updatedAt: serverTimestamp(),
      }

      if (!statesByKey[key]) payload.createdAt = serverTimestamp()

      await setDoc(stateRef, payload, { merge: true })
      return next
    } catch (writeError) {
      setStatesByKey((current) => ({ ...current, [key]: previous }))
      throw writeError
    }
  }, [activeProfile?.id, statesByKey, user.uid])

  const value = useMemo(() => ({
    loading,
    error,
    statesByKey,
    getTitleState,
    updateTitleState,
    hasPersonalState: (item) => hasPersonalTitleState(getTitleState(item)),
  }), [loading, error, statesByKey, getTitleState, updateTitleState])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary muss innerhalb des LibraryProvider verwendet werden.')
  return context
}
