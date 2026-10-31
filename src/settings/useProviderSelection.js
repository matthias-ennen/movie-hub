import { useCallback, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import {
  DEFAULT_ENABLED_PROVIDER_IDS,
  PROVIDER_SELECTION_VERSION,
  normalizeEnabledProviderIds,
  normalizeStoredProviderSelection,
} from './providerSelectionModel.js'
import {
  getProviderSelectionSnapshot,
  resetProviderSelectionSnapshot,
  subscribeProviderSelection,
  updateProviderSelectionSnapshot,
} from './providerSelectionRuntime.js'

let started = false
let dbRef = null
let authUnsubscribe = null
let userUnsubscribe = null
let migrationUid = null
let settingsTimeout = null

function startProviderSelectionSync() {
  if (started) return
  started = true

  firebaseReady
    .then(({ auth, db }) => {
      dbRef = db
      authUnsubscribe = onAuthStateChanged(auth, (user) => {
        userUnsubscribe?.()
        clearTimeout(settingsTimeout)
        userUnsubscribe = null

        if (!user) {
          resetProviderSelectionSnapshot({ loading: false })
          return
        }

        updateProviderSelectionSnapshot({
          uid: user.uid,
          enabledProviderIds: DEFAULT_ENABLED_PROVIDER_IDS,
          loading: true,
          error: null,
          savingProviderId: null,
        })

        settingsTimeout = setTimeout(() => {
          const current = getProviderSelectionSnapshot()
          if (current.uid === user.uid && current.loading) updateProviderSelectionSnapshot({
            loading: false, error: new Error('Anbietereinstellungen konnten nicht rechtzeitig geladen werden.'),
          })
        }, 8000)
        const userRef = doc(db, 'users', user.uid)
        userUnsubscribe = onSnapshot(
          userRef,
          (snapshot) => {
            if (getProviderSelectionSnapshot().uid !== user.uid) return
            clearTimeout(settingsTimeout)
            const storedSettings = snapshot.data()?.providerSettings
            const normalized = normalizeStoredProviderSelection(
              storedSettings?.enabledProviderIds,
              storedSettings?.version,
            )
            updateProviderSelectionSnapshot({
              enabledProviderIds: normalized.enabledProviderIds,
              loading: false,
              error: null,
              savingProviderId: null,
            })

            if (normalized.needsMigration && migrationUid !== user.uid) {
              migrationUid = user.uid
              setDoc(userRef, {
                providerSettings: {
                  enabledProviderIds: normalized.enabledProviderIds,
                  version: PROVIDER_SELECTION_VERSION,
                  updatedAt: serverTimestamp(),
                },
              }, { merge: true }).catch((error) => {
                migrationUid = null
                console.warn('Streaminganbieter-Einstellungen konnten nicht migriert werden.', error)
              })
            }
          },
          (error) => {
            if (getProviderSelectionSnapshot().uid !== user.uid) return
            clearTimeout(settingsTimeout)
            updateProviderSelectionSnapshot({ loading: false, error, savingProviderId: null })
          },
        )
      })
    })
    .catch((error) => {
      updateProviderSelectionSnapshot({ loading: false, error, savingProviderId: null })
    })
}

export async function setProviderEnabled(providerId, enabled) {
  const current = getProviderSelectionSnapshot()
  if (!current.uid || !dbRef) throw new Error('Provider-Einstellungen sind noch nicht bereit.')

  const previous = current.enabledProviderIds
  const requested = enabled
    ? [...previous, providerId]
    : previous.filter((id) => id !== providerId)
  const next = normalizeEnabledProviderIds(requested)

  updateProviderSelectionSnapshot({ enabledProviderIds: next, savingProviderId: providerId, error: null })

  try {
    await setDoc(doc(dbRef, 'users', current.uid), {
      providerSettings: {
        enabledProviderIds: next,
        version: PROVIDER_SELECTION_VERSION,
        updatedAt: serverTimestamp(),
      },
    }, { merge: true })
  } catch (error) {
    updateProviderSelectionSnapshot({ enabledProviderIds: previous, savingProviderId: null, error })
    throw error
  }
}

export function useProviderSelection() {
  const [state, setState] = useState(getProviderSelectionSnapshot)

  useEffect(() => {
    startProviderSelectionSync()
    return subscribeProviderSelection(setState)
  }, [])

  const enabledSet = useMemo(() => new Set(state.enabledProviderIds), [state.enabledProviderIds])
  const isProviderEnabled = useCallback((providerId) => enabledSet.has(providerId), [enabledSet])

  return {
    ...state,
    isProviderEnabled,
    setProviderEnabled,
  }
}

export function stopProviderSelectionSyncForTests() {
  clearTimeout(settingsTimeout)
  userUnsubscribe?.()
  authUnsubscribe?.()
  userUnsubscribe = null
  authUnsubscribe = null
  dbRef = null
  started = false
  migrationUid = null
  resetProviderSelectionSnapshot({ loading: true })
}
