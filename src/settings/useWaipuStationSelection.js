import { useCallback, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import {
  WAIPU_STATION_SELECTION_VERSION,
  normalizeDisabledWaipuStationIds,
  normalizeStoredWaipuStationSelection,
  normalizeWaipuStationOrder,
  orderWaipuStations,
} from './waipuStationSelectionModel.js'
import {
  getWaipuStationSelectionSnapshot,
  resetWaipuStationSelectionSnapshot,
  subscribeWaipuStationSelection,
  updateWaipuStationSelectionSnapshot,
} from './waipuStationSelectionRuntime.js'

let started = false
let dbRef = null
let authUnsubscribe = null
let userUnsubscribe = null
let migrationUid = null

function startWaipuStationSelectionSync() {
  if (started) return
  started = true

  firebaseReady
    .then(({ auth, db }) => {
      dbRef = db
      authUnsubscribe = onAuthStateChanged(auth, (user) => {
        userUnsubscribe?.()
        userUnsubscribe = null

        if (!user) {
          resetWaipuStationSelectionSnapshot({ loading: false })
          return
        }

        updateWaipuStationSelectionSnapshot({
          uid: user.uid,
          disabledStationIds: [],
          stationOrder: [],
          loading: true,
          error: null,
          savingStationId: null,
        })

        const userRef = doc(db, 'users', user.uid)
        userUnsubscribe = onSnapshot(
          userRef,
          (snapshot) => {
            if (getWaipuStationSelectionSnapshot().uid !== user.uid) return
            const stored = snapshot.data()?.waipuStationSettings
            const normalized = normalizeStoredWaipuStationSelection(
              stored?.disabledStationIds,
              stored?.version,
              stored?.stationOrder,
            )
            updateWaipuStationSelectionSnapshot({
              disabledStationIds: normalized.disabledStationIds,
              stationOrder: normalized.stationOrder,
              loading: false,
              error: null,
              savingStationId: null,
            })

            if (normalized.needsMigration && migrationUid !== user.uid) {
              migrationUid = user.uid
              setDoc(userRef, {
                waipuStationSettings: {
                  disabledStationIds: normalized.disabledStationIds,
                  stationOrder: normalized.stationOrder,
                  version: WAIPU_STATION_SELECTION_VERSION,
                  updatedAt: serverTimestamp(),
                },
              }, { merge: true }).catch((error) => {
                migrationUid = null
                console.warn('TV-Sendereinstellungen konnten nicht migriert werden.', error)
              })
            }
          },
          (error) => {
            if (getWaipuStationSelectionSnapshot().uid !== user.uid) return
            updateWaipuStationSelectionSnapshot({ loading: false, error, savingStationId: null })
          },
        )
      })
    })
    .catch((error) => {
      updateWaipuStationSelectionSnapshot({ loading: false, error, savingStationId: null })
    })
}

export async function setWaipuStationEnabled(stationId, enabled) {
  const current = getWaipuStationSelectionSnapshot()
  if (!current.uid || !dbRef) throw new Error('TV-Sendereinstellungen sind noch nicht bereit.')

  const previous = current.disabledStationIds
  const requested = enabled
    ? previous.filter((id) => id !== stationId)
    : [...previous, stationId]
  const next = normalizeDisabledWaipuStationIds(requested)

  updateWaipuStationSelectionSnapshot({ disabledStationIds: next, savingStationId: stationId, error: null })

  try {
    await setDoc(doc(dbRef, 'users', current.uid), {
      waipuStationSettings: {
        disabledStationIds: next,
        stationOrder: current.stationOrder,
        version: WAIPU_STATION_SELECTION_VERSION,
        updatedAt: serverTimestamp(),
      },
    }, { merge: true })
  } catch (error) {
    updateWaipuStationSelectionSnapshot({ disabledStationIds: previous, savingStationId: null, error })
    throw error
  }
}

export async function setWaipuStationOrder(stationOrder, savingStationId = 'order') {
  const current = getWaipuStationSelectionSnapshot()
  if (!current.uid || !dbRef) throw new Error('TV-Sendereinstellungen sind noch nicht bereit.')

  const previous = current.stationOrder
  const next = normalizeWaipuStationOrder(stationOrder)
  updateWaipuStationSelectionSnapshot({ stationOrder: next, savingStationId, error: null })

  try {
    await setDoc(doc(dbRef, 'users', current.uid), {
      waipuStationSettings: {
        disabledStationIds: current.disabledStationIds,
        stationOrder: next,
        version: WAIPU_STATION_SELECTION_VERSION,
        updatedAt: serverTimestamp(),
      },
    }, { merge: true })
  } catch (error) {
    updateWaipuStationSelectionSnapshot({ stationOrder: previous, savingStationId: null, error })
    throw error
  }
}

export function useWaipuStationSelection() {
  const [state, setState] = useState(getWaipuStationSelectionSnapshot)

  useEffect(() => {
    startWaipuStationSelectionSync()
    return subscribeWaipuStationSelection(setState)
  }, [])

  const disabledSet = useMemo(() => new Set(state.disabledStationIds), [state.disabledStationIds])
  const isStationEnabled = useCallback((stationId) => !disabledSet.has(stationId), [disabledSet])
  const orderStations = useCallback(
    (stations) => orderWaipuStations(stations, state.stationOrder),
    [state.stationOrder],
  )

  return {
    ...state,
    isStationEnabled,
    orderStations,
    setStationEnabled: setWaipuStationEnabled,
    setStationOrder: setWaipuStationOrder,
  }
}

export function stopWaipuStationSelectionSyncForTests() {
  userUnsubscribe?.()
  authUnsubscribe?.()
  userUnsubscribe = null
  authUnsubscribe = null
  dbRef = null
  started = false
  migrationUid = null
  resetWaipuStationSelectionSnapshot({ loading: true })
}
