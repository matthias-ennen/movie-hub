import { afterEach, describe, expect, it } from 'vitest'
import { providerDirectory, providers } from '../src/data/catalog.js'
import {
  DEFAULT_ENABLED_PROVIDER_IDS,
  KNOWN_PROVIDER_IDS,
  PROVIDER_SELECTION_VERSION,
  normalizeEnabledProviderIds,
  normalizeStoredProviderSelection,
  providerIdForRowTitle,
} from '../src/settings/providerSelectionModel.js'
import {
  resetProviderSelectionSnapshot,
  updateProviderSelectionSnapshot,
} from '../src/settings/providerSelectionRuntime.js'

const xmltvDefaults = ['air-ard', 'air-zdf', 'air-rtl', 'air-pro7', 'air-sat1', 'air-vox']

afterEach(() => {
  resetProviderSelectionSnapshot({ loading: false })
})

describe('kontoweite Streaminganbieter-Auswahl', () => {
  it('adds Movie Hub first while preserving the accepted external defaults', () => {
    expect(DEFAULT_ENABLED_PROVIDER_IDS).toEqual(['moviehub', 'netflix', 'prime', 'disney', 'youtube', 'joyn', 'waipu', ...xmltvDefaults])
    expect(KNOWN_PROVIDER_IDS[0]).toBe('moviehub')
    expect(KNOWN_PROVIDER_IDS).toContain('joyn')
    expect(KNOWN_PROVIDER_IDS).toContain('ard')
    expect(DEFAULT_ENABLED_PROVIDER_IDS).not.toContain('ard')
  })

  it('enables Movie Hub once for legacy accounts without overriding later opt-out', () => {
    expect(normalizeStoredProviderSelection(['netflix', 'prime'], null)).toMatchObject({
      enabledProviderIds: ['moviehub', 'netflix', 'prime', ...xmltvDefaults],
      needsMigration: true,
    })
    expect(normalizeStoredProviderSelection(['netflix', 'prime'], PROVIDER_SELECTION_VERSION)).toMatchObject({
      enabledProviderIds: ['netflix', 'prime'],
      needsMigration: false,
    })
  })

  it('enables six XMLTV stations once for v2 accounts while preserving existing choices', () => {
    expect(normalizeStoredProviderSelection(['netflix', 'prime'], 2)).toEqual({
      enabledProviderIds: ['netflix', 'prime', ...xmltvDefaults],
      version: 3,
      needsMigration: true,
    })
    expect(normalizeStoredProviderSelection(['moviehub', 'air-zdf'], 3)).toEqual({
      enabledProviderIds: ['moviehub', 'air-zdf'],
      version: 3,
      needsMigration: false,
    })
    expect(normalizeStoredProviderSelection([], 3).enabledProviderIds).toEqual([])
    expect(normalizeStoredProviderSelection(undefined, null).enabledProviderIds)
      .toEqual(DEFAULT_ENABLED_PROVIDER_IDS)
  })

  it('normalizes persisted selections and accepts known new provider ids', () => {
    expect(normalizeEnabledProviderIds(['youtube', 'unknown', 'netflix', 'youtube']))
      .toEqual(['netflix', 'youtube'])
    expect(normalizeEnabledProviderIds(['ard', 'joyn', 'netflix']))
      .toEqual(['netflix', 'joyn', 'ard'])
    expect(normalizeEnabledProviderIds([])).toEqual([])
  })

  it('recognizes provider-specific Home and browse row titles from the registry', () => {
    expect(providerIdForRowTitle('Beliebt auf Netflix')).toBe('netflix')
    expect(providerIdForRowTitle('Filme bei Prime Video')).toBe('prime')
    expect(providerIdForRowTitle('Serien auf Disney+')).toBe('disney')
    expect(providerIdForRowTitle('Gefragt auf YouTube')).toBe('youtube')
    expect(providerIdForRowTitle('Aus der waiputhek')).toBeNull()
    expect(providerIdForRowTitle('Aus der ARD Mediathek')).toBe('ard')
    expect(providerIdForRowTitle('Serien auf Joyn')).toBe('joyn')
    expect(providerIdForRowTitle('Jetzt beliebt')).toBeNull()
    expect(providerIdForRowTitle('Filme bei Movie Hub')).toBe('moviehub')
  })

  it('keeps full provider metadata but hides disabled providers from runtime consumers', () => {
    expect(providerDirectory.netflix?.label).toBe('Netflix')
    expect(providerDirectory.moviehub?.label).toBe('Movie Hub')
    expect(providerDirectory.joyn?.label).toBe('Joyn')
    expect(providers.netflix?.label).toBe('Netflix')
    expect(providers.joyn?.label).toBe('Joyn')

    updateProviderSelectionSnapshot({ enabledProviderIds: ['moviehub', 'prime', 'joyn'] })

    expect(providerDirectory.netflix?.label).toBe('Netflix')
    expect(providers.netflix).toBeUndefined()
    expect(providers.prime?.label).toBe('Prime Video')
    expect(providers.joyn?.label).toBe('Joyn')
    expect(providers.moviehub?.label).toBe('Movie Hub')
  })
})
