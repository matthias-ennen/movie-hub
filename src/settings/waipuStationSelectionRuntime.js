import { sameItems } from '../performance/cooperativeWork.js'
import {
  normalizeDisabledWaipuStationIds,
  normalizeWaipuStationOrder,
} from './waipuStationSelectionModel.js'

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

export function getWaipuStationSelectionSnapshot() {
  return snapshot
}

export function subscribeWaipuStationSelection(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateWaipuStationSelectionSnapshot(patch) {
  const next = {
    ...snapshot,
    ...patch,
    disabledStationIds: patch.disabledStationIds === undefined
      ? snapshot.disabledStationIds
      : normalizeDisabledWaipuStationIds(patch.disabledStationIds),
    stationOrder: patch.stationOrder === undefined
      ? snapshot.stationOrder
      : normalizeWaipuStationOrder(patch.stationOrder),
  }
  if (Array.isArray(next.disabledStationIds) && sameItems(snapshot.disabledStationIds, next.disabledStationIds)) next.disabledStationIds = snapshot.disabledStationIds
  if (Array.isArray(next.stationOrder) && sameItems(snapshot.stationOrder, next.stationOrder)) next.stationOrder = snapshot.stationOrder
  if (Object.keys(next).every((key) => Object.is(snapshot[key], next[key]))) return snapshot
  snapshot = next
  emit()
  return snapshot
}

export function resetWaipuStationSelectionSnapshot({ loading = false } = {}) {
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
