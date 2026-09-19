import { normalizeDisabledWaipuStationIds } from './waipuStationSelectionModel.js'

let snapshot = {
  uid: null,
  disabledStationIds: [],
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
  snapshot = {
    ...snapshot,
    ...patch,
    disabledStationIds: patch.disabledStationIds === undefined
      ? snapshot.disabledStationIds
      : normalizeDisabledWaipuStationIds(patch.disabledStationIds),
  }
  emit()
  return snapshot
}

export function resetWaipuStationSelectionSnapshot({ loading = false } = {}) {
  snapshot = {
    uid: null,
    disabledStationIds: [],
    loading,
    error: null,
    savingStationId: null,
  }
  emit()
  return snapshot
}
