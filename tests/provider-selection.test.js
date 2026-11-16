import { afterEach, describe, expect, it } from 'vitest'
import { providerDirectory, providers } from '../src/data/catalog.js'
import {
  DEFAULT_ENABLED_PROVIDER_IDS,
  KNOWN_PROVIDER_IDS,
  PROVIDER_SELECTION_VERSION,
  normalizeEnabledProviderIds,
  normalizeStoredProviderSelection,
  providerIdForRowTitle,
  visibleStreamingProviderOptions,
  XMLTV_STATION_OPTIONS,
  disabledXmltvStationIds,
} from '../src/settings/providerSelectionModel.js'
import {
  resetProviderSelectionSnapshot,
  updateProviderSelectionSnapshot,
} from '../src/settings/providerSelectionRuntime.js'

import { orderTvStations } from '../src/settings/stationOrder.js'
import { SETTINGS_GROUPS, SETTINGS_PAGES, settingsNeedStations, settingsParent } from '../src/settings/settingsNavigation.js'
import { XMLTV_AIR_ROUTE_CANDIDATES } from '../src/sources/xmltv/xmltvAirRoutes.js'

const xmltvPilot = ['air-ard', 'air-zdf', 'air-rtl', 'air-pro7', 'air-sat1', 'air-vox']
const xmltvExpansion = ['air-arte','air-3sat','air-zdfneo','air-zdfinfo','air-einsfestival','air-kabeleins','air-rtl2','air-superrtl','air-tele5','air-prosieben_maxx','air-sat1gold','air-rtlnitro']
const xmltvDefaults = [...xmltvPilot,...xmltvExpansion]

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

  it('migrates v2 and v3 XMLTV defaults without re-enabling previously disabled providers', () => {
    expect(normalizeStoredProviderSelection(['netflix', 'prime'], 2)).toEqual({
      enabledProviderIds: ['netflix', 'prime', ...xmltvDefaults],
      version: 4,
      needsMigration: true,
    })
    expect(normalizeStoredProviderSelection(['moviehub', 'air-zdf'], 3)).toEqual({
      enabledProviderIds: ['moviehub', 'air-zdf', ...xmltvExpansion],
      version: 4,
      needsMigration: true,
    })
    expect(normalizeStoredProviderSelection([], 3).enabledProviderIds).toEqual(xmltvExpansion)
    expect(normalizeStoredProviderSelection([], 4).enabledProviderIds).toEqual([])
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


describe('separate XMLTV station settings', () => {
  it('adds TV-Sender after Joyn without changing the account scope', () => {
    expect(SETTINGS_GROUPS.find(group => group.id === 'account').pages.map(([id]) => id))
      .toEqual(['providers', 'waipu', 'joyn', 'xmltv'])
    expect(SETTINGS_PAGES.xmltv.title).toBe('TV-Sender')
    expect(settingsParent('xmltv')).toBe('overview')
    expect(settingsNeedStations('xmltv')).toBe(true)
  })

  it('lists approved XMLTV providers separately with clean names and stable IDs, independent of EPG data', () => {
    expect(XMLTV_STATION_OPTIONS.map(station => station.id).sort()).toEqual([...xmltvDefaults].sort())
    for (const row of XMLTV_AIR_ROUTE_CANDIDATES) {
      expect(XMLTV_STATION_OPTIONS).toContainEqual({ id: row.providerId, name: row.label, canonicalId: row.stationId })
      expect(providerDirectory[row.providerId].label).toBe(row.label)
    }
    for (const ids of [null, [], [...KNOWN_PROVIDER_IDS]]) {
      expect(visibleStreamingProviderOptions(ids).some(provider => provider.liveTvSource === 'xmltv')).toBe(false)
      expect(visibleStreamingProviderOptions(ids).map(provider => provider.id)).toEqual(expect.arrayContaining(['moviehub', 'waipu', 'joyn']))
    }
    expect(visibleStreamingProviderOptions(['ard', 'zdf']).map(provider => provider.id)).toEqual(expect.arrayContaining(['ard', 'zdf']))
  })

  it('uses the canonical common channel order, then alphabetic fallback', () => {
    const stations = orderTvStations(XMLTV_STATION_OPTIONS, [{ id: 'zdf' }, { id: 'ard' }])
    expect(stations.slice(0, 4).map(station => station.name)).toEqual(['ZDF', 'Das Erste', '3sat', 'ARTE'])
  })

  it('reflects existing provider choices without a migration or a second setting', () => {
    const enabled = normalizeStoredProviderSelection(['air-ard', 'air-arte', 'netflix'], 4)
    expect(enabled.needsMigration).toBe(false)
    expect(disabledXmltvStationIds(enabled.enabledProviderIds).sort()).toEqual(xmltvDefaults.filter(id => !['air-ard', 'air-arte'].includes(id)).sort())
    expect(disabledXmltvStationIds(DEFAULT_ENABLED_PROVIDER_IDS)).toEqual([])
    expect(disabledXmltvStationIds([])).toHaveLength(xmltvDefaults.length)
  })
})
