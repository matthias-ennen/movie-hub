import { useCallback, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import {
  JOYN_STATION_SELECTION_VERSION,
  normalizeDisabledJoynStationIds,
  normalizeStoredJoynStationSelection,
  normalizeJoynStationOrder,
  orderJoynStations,
} from './joynStationSelectionModel.js'
import {
  getJoynStationSelectionSnapshot,
  resetJoynStationSelectionSnapshot,
  subscribeJoynStationSelection,
  updateJoynStationSelectionSnapshot,
} from './joynStationSelectionRuntime.js'

let started = false
let dbRef = null
let authUnsubscribe = null
let userUnsubscribe = null
let migrationUid = null

function startJoynStationSelectionSync() {
  if (started) return
  started = true

  firebaseReady
    .then(({ auth, db }) => {
      dbRef = db
      authUnsubscribe = onAuthStateChanged(auth, (user) => {
        userUnsubscribe?.()
        userUnsubscribe = null

        if (!user) {
          resetJoynStationSelectionSnapshot({ loading: false })
          return
        }

        updateJoynStationSelectionSnapshot({
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
            if (getJoynStationSelectionSnapshot().uid !== user.uid) return
            const stored = snapshot.data()?.joynStationSettings
            const normalized = normalizeStoredJoynStationSelection(
              stored?.disabledStationIds,
              stored?.version,
              stored?.stationOrder,
            )
            updateJoynStationSelectionSnapshot({
              disabledStationIds: normalized.disabledStationIds,
              stationOrder: normalized.stationOrder,
              loading: false,
              error: null,
              savingStationId: null,
            })

            if (normalized.needsMigration && migrationUid !== user.uid) {
              migrationUid = user.uid
              setDoc(userRef, {
                joynStationSettings: {
                  disabledStationIds: normalized.disabledStationIds,
                  stationOrder: normalized.stationOrder,
                  version: JOYN_STATION_SELECTION_VERSION,
                  updatedAt: serverTimestamp(),
                },
              }, { merge: true }).catch((error) => {
                migrationUid = null
                console.warn('Joyn-Sendereinstellungen konnten nicht migriert werden.', error)
              })
            }
          },
          (error) => {
            if (getJoynStationSelectionSnapshot().uid !== user.uid) return
            updateJoynStationSelectionSnapshot({ loading: false, error, savingStationId: null })
          },
        )
      })
    })
    .catch((error) => {
      updateJoynStationSelectionSnapshot({ loading: false, error, savingStationId: null })
    })
}

export async function setJoynStationEnabled(stationId, enabled) {
  const current = getJoynStationSelectionSnapshot()
  if (!current.uid || !dbRef) throw new Error('Joyn-Sendereinstellungen sind noch nicht bereit.')

  const previous = current.disabledStationIds
  const requested = enabled
    ? previous.filter((id) => id !== stationId)
    : [...previous, stationId]
  const next = normalizeDisabledJoynStationIds(requested)

  updateJoynStationSelectionSnapshot({ disabledStationIds: next, savingStationId: stationId, error: null })

  try {
    await setDoc(doc(dbRef, 'users', current.uid), {
      joynStationSettings: {
        disabledStationIds: next,
        stationOrder: current.stationOrder,
        version: JOYN_STATION_SELECTION_VERSION,
        updatedAt: serverTimestamp(),
      },
    }, { merge: true })
  } catch (error) {
    updateJoynStationSelectionSnapshot({ disabledStationIds: previous, savingStationId: null, error })
    throw error
  }
}

export async function setJoynStationOrder(stationOrder, savingStationId = 'order') {
  const current = getJoynStationSelectionSnapshot()
  if (!current.uid || !dbRef) throw new Error('Joyn-Sendereinstellungen sind noch nicht bereit.')

  const previous = current.stationOrder
  const next = normalizeJoynStationOrder(stationOrder)
  updateJoynStationSelectionSnapshot({ stationOrder: next, savingStationId, error: null })

  try {
    await setDoc(doc(dbRef, 'users', current.uid), {
      joynStationSettings: {
        disabledStationIds: current.disabledStationIds,
        stationOrder: next,
        version: JOYN_STATION_SELECTION_VERSION,
        updatedAt: serverTimestamp(),
      },
    }, { merge: true })
  } catch (error) {
    updateJoynStationSelectionSnapshot({ stationOrder: previous, savingStationId: null, error })
    throw error
  }
}

export function useJoynStationSelection() {
  const [state, setState] = useState(getJoynStationSelectionSnapshot)

  useEffect(() => {
    startJoynStationSelectionSync()
    return subscribeJoynStationSelection(setState)
  }, [])

  const disabledSet = useMemo(() => new Set(state.disabledStationIds), [state.disabledStationIds])
  const isStationEnabled = useCallback((stationId) => !disabledSet.has(stationId), [disabledSet])
  const orderStations = useCallback(
    (stations) => orderJoynStations(stations, state.stationOrder),
    [state.stationOrder],
  )

  return {
    ...state,
    isStationEnabled,
    orderStations,
    setStationEnabled: setJoynStationEnabled,
    setStationOrder: setJoynStationOrder,
  }
}

export function stopJoynStationSelectionSyncForTests() {
  userUnsubscribe?.()
  authUnsubscribe?.()
  userUnsubscribe = null
  authUnsubscribe = null
  dbRef = null
  started = false
  migrationUid = null
  resetJoynStationSelectionSnapshot({ loading: true })
}
