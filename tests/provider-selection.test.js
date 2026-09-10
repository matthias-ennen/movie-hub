import { afterEach, describe, expect, it } from 'vitest'
import { providerDirectory, providers } from '../src/data/catalog.js'
import {
  DEFAULT_ENABLED_PROVIDER_IDS,
  normalizeEnabledProviderIds,
  providerIdForRowTitle,
} from '../src/settings/providerSelectionModel.js'
import {
  resetProviderSelectionSnapshot,
  updateProviderSelectionSnapshot,
} from '../src/settings/providerSelectionRuntime.js'

afterEach(() => {
  resetProviderSelectionSnapshot({ loading: false })
})

describe('kontoweite Streaminganbieter-Auswahl', () => {
  it('starts with the currently supported providers enabled', () => {
    expect(DEFAULT_ENABLED_PROVIDER_IDS).toEqual(['netflix', 'prime', 'disney', 'youtube', 'waipu'])
  })

  it('normalizes persisted selections and ignores unknown provider ids', () => {
    expect(normalizeEnabledProviderIds(['youtube', 'unknown', 'netflix', 'youtube']))
      .toEqual(['netflix', 'youtube'])
    expect(normalizeEnabledProviderIds([])).toEqual([])
  })

  it('recognizes provider-specific Home and browse row titles', () => {
    expect(providerIdForRowTitle('Beliebt auf Netflix')).toBe('netflix')
    expect(providerIdForRowTitle('Filme bei Prime Video')).toBe('prime')
    expect(providerIdForRowTitle('Serien auf Disney+')).toBe('disney')
    expect(providerIdForRowTitle('Gefragt auf YouTube')).toBe('youtube')
    expect(providerIdForRowTitle('Aus der waiputhek')).toBe('waipu')
    expect(providerIdForRowTitle('Jetzt beliebt')).toBeNull()
  })

  it('keeps full provider metadata but hides disabled providers from runtime consumers', () => {
    expect(providerDirectory.netflix?.label).toBe('Netflix')
    expect(providers.netflix?.label).toBe('Netflix')

    updateProviderSelectionSnapshot({ enabledProviderIds: ['prime', 'disney'] })

    expect(providerDirectory.netflix?.label).toBe('Netflix')
    expect(providers.netflix).toBeUndefined()
    expect(providers.prime?.label).toBe('Prime Video')
  })
})
