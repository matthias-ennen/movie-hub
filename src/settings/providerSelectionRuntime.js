import { sameItems } from '../performance/cooperativeWork.js'
import { DEFAULT_ENABLED_PROVIDER_IDS, normalizeEnabledProviderIds } from './providerSelectionModel.js'

let snapshot = {
  uid: null,
  enabledProviderIds: [...DEFAULT_ENABLED_PROVIDER_IDS],
  loading: true,
  error: null,
  savingProviderId: null,
}

const listeners = new Set()

function emit() {
  for (const listener of listeners) listener(snapshot)
}

export function getProviderSelectionSnapshot() {
  return snapshot
}

export function subscribeProviderSelection(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateProviderSelectionSnapshot(patch) {
  const next = {
    ...snapshot,
    ...patch,
    enabledProviderIds: patch.enabledProviderIds === undefined
      ? snapshot.enabledProviderIds
      : normalizeEnabledProviderIds(patch.enabledProviderIds),
  }
  if (Array.isArray(next.enabledProviderIds) && sameItems(snapshot.enabledProviderIds, next.enabledProviderIds)) next.enabledProviderIds = snapshot.enabledProviderIds
  if (Object.keys(next).every((key) => Object.is(snapshot[key], next[key]))) return snapshot
  snapshot = next
  emit()
  return snapshot
}

export function resetProviderSelectionSnapshot({ loading = false } = {}) {
  snapshot = {
    uid: null,
    enabledProviderIds: [...DEFAULT_ENABLED_PROVIDER_IDS],
    loading,
    error: null,
    savingProviderId: null,
  }
  emit()
  return snapshot
}

export function isProviderEnabledSnapshot(providerId) {
  return snapshot.enabledProviderIds.includes(providerId)
}
