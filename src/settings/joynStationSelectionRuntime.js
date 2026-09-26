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
  snapshot = {
    ...snapshot,
    ...patch,
    disabledStationIds: patch.disabledStationIds === undefined
      ? snapshot.disabledStationIds
      : normalizeDisabledJoynStationIds(patch.disabledStationIds),
    stationOrder: patch.stationOrder === undefined
      ? snapshot.stationOrder
      : normalizeJoynStationOrder(patch.stationOrder),
  }
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
