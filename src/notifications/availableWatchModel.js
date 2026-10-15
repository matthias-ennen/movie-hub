import { normalizeStoredProviderSelection } from '../settings/providerSelectionModel.js'

export function availabilitySettingsFingerprint(account = {}) {
  const enabled = normalizeStoredProviderSelection(
    account?.providerSettings?.enabledProviderIds, account?.providerSettings?.version,
  ).enabledProviderIds
  const disabled = (value) => [...new Set((Array.isArray(value) ? value : []).map(String))].sort()
  return JSON.stringify([
    [...enabled].sort(),
    disabled(account?.waipuStationSettings?.disabledStationIds),
    disabled(account?.joynStationSettings?.disabledStationIds),
  ])
}

