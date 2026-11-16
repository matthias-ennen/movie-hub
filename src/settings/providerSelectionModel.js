import { XMLTV_AIR_PILOT_ROUTE_CANDIDATES, XMLTV_AIR_EXPANSION_ROUTE_CANDIDATES } from '../sources/xmltv/xmltvAirRoutes.js'
import { ORDERED_PROVIDERS } from '../providers/providerOrder.js'
import {
  DEFAULT_ENABLED_PROVIDER_IDS as REGISTRY_DEFAULTS,
  PROVIDER_REGISTRY,
} from '../providers/providerRegistry.js'

export const PROVIDER_OPTIONS = ORDERED_PROVIDERS.map((provider) => ({
  id: provider.id,
  label: provider.label,
  short: provider.short,
  source: provider.source,
  liveTvSource: provider.liveTvSource,
  defaultEnabled: Boolean(provider.defaultEnabled),
  description: provider.description,
}))

export const DEFAULT_ENABLED_PROVIDER_IDS = [...REGISTRY_DEFAULTS]
export const KNOWN_PROVIDER_IDS = PROVIDER_REGISTRY.map((provider) => provider.id)
export const PROVIDER_SELECTION_VERSION = 4

const providerIdSet = new Set(KNOWN_PROVIDER_IDS)

export function normalizeEnabledProviderIds(value) {
  if (!Array.isArray(value)) return [...DEFAULT_ENABLED_PROVIDER_IDS]
  const requested = new Set(value.filter((providerId) => providerIdSet.has(providerId)))
  return KNOWN_PROVIDER_IDS.filter((providerId) => requested.has(providerId))
}

export function normalizeStoredProviderSelection(value, version = null) {
  const hasStoredSelection = Array.isArray(value)
  const normalized = normalizeEnabledProviderIds(value)
  const storedVersion = Number(version)
  const legacyVersion = Number.isFinite(storedVersion) ? storedVersion : 0
  // Migrations are additive only for the version that introduced the provider.
  // A v2 account may already have deliberately disabled Movie Hub.
  const migratedDefaults = [
    ...(legacyVersion < 2 ? ['moviehub'] : []),
    ...(legacyVersion < 3 ? XMLTV_AIR_PILOT_ROUTE_CANDIDATES.map(row=>row.providerId) : []),
    ...(legacyVersion < 4 ? XMLTV_AIR_EXPANSION_ROUTE_CANDIDATES.map(row=>row.providerId) : []),
  ]
  const enabledProviderIds = hasStoredSelection
    ? normalizeEnabledProviderIds([...normalized, ...migratedDefaults])
    : normalized

  return {
    enabledProviderIds,
    version: PROVIDER_SELECTION_VERSION,
    needsMigration: legacyVersion < PROVIDER_SELECTION_VERSION,
  }
}

export function providerIdForRowTitle(title) {
  const normalized = String(title || '').toLocaleLowerCase('de')
  if (!normalized) return null

  for (const provider of PROVIDER_REGISTRY) {
    const rowTitles = [provider.homeTitle, provider.movieTitle, provider.seriesTitle]
      .filter(Boolean)
      .map((value) => value.toLocaleLowerCase('de'))
    if (rowTitles.includes(normalized)) return provider.id
  }

  return null
}

export function catalogTmdbProviderIds(providerCatalogs) {
  if (!providerCatalogs || typeof providerCatalogs !== 'object') return null
  const validId = (value) => Number.isInteger(Number(value)) && Number(value) > 0
  return Object.values(providerCatalogs).filter((provider) => provider && [
    ...(Array.isArray(provider.movieTmdbProviderIds) ? provider.movieTmdbProviderIds : []),
    ...(Array.isArray(provider.seriesTmdbProviderIds) ? provider.seriesTmdbProviderIds : []),
    provider.movieTmdbProviderId, provider.seriesTmdbProviderId,
  ].some(validId)).map((provider) => provider.id).filter(Boolean)
}

export function visibleProviderOptions(availableTmdbProviderIds) {
  const available = Array.isArray(availableTmdbProviderIds) ? new Set(availableTmdbProviderIds) : null
  return PROVIDER_OPTIONS.filter((provider) => provider.source === 'moviehub'
    || Boolean(provider.liveTvSource) || provider.id === 'waipu'
    || (available ? available.has(provider.id) : provider.defaultEnabled))
}
