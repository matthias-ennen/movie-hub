import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteField, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import {
  protectPersonalValue,
  readPersonalValue,
} from '../lib/personalDataCrypto.js'
import {
  EMPTY_TITLE_STATE,
  applyTitleStateUpdate,
  getTitleStateKey,
  hasPersonalTitleState,
} from './libraryState.js'
import { hydratePersonalTitleState } from './personalTitleMetadata.js'

const LibraryContext = createContext(null)
const EMPTY_STATES = Object.freeze({})
const NOTE_PURPOSE = 'profile.note'

function readStoredNote(raw) {
  if (raw?.noteEncrypted === undefined && !Object.prototype.hasOwnProperty.call(raw ?? {}, 'note')) return ''
  return readPersonalValue(NOTE_PURPOSE, raw?.noteEncrypted).value
}

function encryptedNoteFields(note) {
  return {
    noteEncrypted: protectPersonalValue(NOTE_PURPOSE, note),
    cryptoVersion: 1,
  }
}

export function LibraryProvider({ user, activeProfile, children }) {
  const [storedStates, setStatesByKey] = useState({})
  const [loadedScope, setLoadedScope] = useState(null)
  const scope = `${user.uid}:${activeProfile?.id || ''}`
  const currentScopeRef = useRef(scope)
  currentScopeRef.current = scope
  const statesByKey = loadedScope === scope ? storedStates : EMPTY_STATES
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

        const entries = await Promise.all(snapshot.docs.map(async (stateDocument) => {
          const raw = stateDocument.data()
          try {
            const note = readStoredNote(raw)
            const state = await hydratePersonalTitleState({ ...raw, note })
            return [stateDocument.id, state]
          } catch (cryptoError) {
            console.warn(`Persönliche Notiz ${stateDocument.id} konnte nicht entschlüsselt werden.`, cryptoError)
            const state = await hydratePersonalTitleState({ ...raw, note: '' })
            return [stateDocument.id, state]
          }
        }))
        const nextStates = Object.fromEntries(entries)
        if (!cancelled) { setStatesByKey(nextStates); setLoadedScope(scope) }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError)
          setStatesByKey({})
          setLoadedScope(scope)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadStates()
    return () => { cancelled = true }
  }, [activeProfile?.id, user.uid, scope])

  const getTitleState = useCallback((item) => {
    const key = getTitleStateKey(item)
    return key && statesByKey[key] ? statesByKey[key] : EMPTY_TITLE_STATE
  }, [statesByKey])

  const updateTitleState = useCallback(async (item, patch) => {
    if (!activeProfile?.id || loadedScope !== scope) throw new Error('Das gewählte Profil wird noch geladen.')

    const key = getTitleStateKey(item)
    if (!key) throw new Error('Titel hat keine stabile Referenz.')

    const previous = statesByKey[key] ?? EMPTY_TITLE_STATE
    const next = applyTitleStateUpdate(item, previous, patch)

    setStatesByKey((current) => ({ ...current, [key]: next }))

    try {
      const { db } = await firebaseReady
      const stateRef = doc(
        db,
        'users', user.uid,
        'profiles', activeProfile.id,
        'titles', key,
      )

      const {
        note,
        titleRef: _titleRef,
        titleSnapshot,
        canonicalReady,
        ...publicState
      } = next
      const payload = {
        ...publicState,
        ...encryptedNoteFields(note),
        titleRef: {
          catalogId: String(item.id ?? ''),
          tmdbId: item.tmdbId ?? null,
          type: item.type === 'series' ? 'series' : 'movie',
        },
        catalogRelevant: hasPersonalTitleState(next),
        canonicalReady,
        bootstrapSnapshot: canonicalReady ? deleteField() : titleSnapshot,
        titleSnapshot: deleteField(),
        updatedAt: serverTimestamp(),
      }

      if (!statesByKey[key]) payload.createdAt = serverTimestamp()

      await setDoc(stateRef, payload, { merge: true })
      return next
    } catch (writeError) {
      if (currentScopeRef.current === scope) setStatesByKey((current) => ({ ...current, [key]: previous }))
      throw writeError
    }
  }, [activeProfile?.id, loadedScope, scope, statesByKey, user.uid])

  const value = useMemo(() => ({
    loading: loading || loadedScope !== scope,
    error,
    statesByKey,
    getTitleState,
    updateTitleState,
    hasPersonalState: (item) => hasPersonalTitleState(getTitleState(item)),
  }), [loading, loadedScope, scope, error, statesByKey, getTitleState, updateTitleState])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary muss innerhalb des LibraryProvider verwendet werden.')
  return context
}
