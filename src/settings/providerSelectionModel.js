import {
  DEFAULT_ENABLED_PROVIDER_IDS as REGISTRY_DEFAULTS,
  PROVIDER_REGISTRY,
} from '../providers/providerRegistry.js'

export const PROVIDER_OPTIONS = PROVIDER_REGISTRY.map((provider) => ({
  id: provider.id,
  label: provider.label,
  short: provider.short,
  source: provider.source,
  defaultEnabled: Boolean(provider.defaultEnabled),
  description: provider.description,
}))

export const DEFAULT_ENABLED_PROVIDER_IDS = [...REGISTRY_DEFAULTS]
export const KNOWN_PROVIDER_IDS = PROVIDER_OPTIONS.map((provider) => provider.id)

const providerIdSet = new Set(KNOWN_PROVIDER_IDS)

export function normalizeEnabledProviderIds(value) {
  if (!Array.isArray(value)) return [...DEFAULT_ENABLED_PROVIDER_IDS]
  const requested = new Set(value.filter((providerId) => providerIdSet.has(providerId)))
  return KNOWN_PROVIDER_IDS.filter((providerId) => requested.has(providerId))
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
