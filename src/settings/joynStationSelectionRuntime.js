import { sameItems } from '../performance/cooperativeWork.js'
import {
  normalizeDisabledJoynStationIds,
  normalizeJoynStationOrder,
} from './joynStationSelectionModel.js'

let snapshot = {
  uid: null,
  disabledStationIds: [],
  stationOrder: [],
  loading: true,
  error: null,
  savingStationId: null,
}

const listeners = new Set()

function emit() {
  for (const listener of listeners) listener(snapshot)
}

export function getJoynStationSelectionSnapshot() {
  return snapshot
}

export function subscribeJoynStationSelection(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateJoynStationSelectionSnapshot(patch) {
  const next = {
    ...snapshot,
    ...patch,
    disabledStationIds: patch.disabledStationIds === undefined
      ? snapshot.disabledStationIds
      : normalizeDisabledJoynStationIds(patch.disabledStationIds),
    stationOrder: patch.stationOrder === undefined
      ? snapshot.stationOrder
      : normalizeJoynStationOrder(patch.stationOrder),
  }
  if (Array.isArray(next.disabledStationIds) && sameItems(snapshot.disabledStationIds, next.disabledStationIds)) next.disabledStationIds = snapshot.disabledStationIds
  if (Array.isArray(next.stationOrder) && sameItems(snapshot.stationOrder, next.stationOrder)) next.stationOrder = snapshot.stationOrder
  if (Object.keys(next).every((key) => Object.is(snapshot[key], next[key]))) return snapshot
  snapshot = next
  emit()
  return snapshot
}

export function resetJoynStationSelectionSnapshot({ loading = false } = {}) {
  snapshot = {
    uid: null,
    disabledStationIds: [],
    stationOrder: [],
    loading,
    error: null,
    savingStationId: null,
  }
  emit()
  return snapshot
}
