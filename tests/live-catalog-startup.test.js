import { describe, expect, it } from 'vitest'
import {
  isTvPresentationReady,
  shouldLoadLiveStations,
  shouldLoadLiveTitles,
} from '../src/performance/liveCatalogStartup.js'

describe('live catalog startup policy', () => {
  it('never loads full provider title catalogs into the interactive app', () => {
    expect(shouldLoadLiveTitles()).toBe(false)
    expect(shouldLoadLiveTitles({ homeReady: true })).toBe(false)
    expect(shouldLoadLiveTitles({ tvRequested: true })).toBe(false)
    expect(shouldLoadLiveTitles({ homeReady: true, tvRequested: true })).toBe(false)
  })

  it('defers station catalogs until TV or Settings needs them', () => {
    expect(shouldLoadLiveStations()).toBe(false)
    expect(shouldLoadLiveStations({ tvRequested: true })).toBe(true)
    expect(shouldLoadLiveStations({ settingsOpen: true })).toBe(true)
  })
  it('releases TV rendering from station catalogs and the selected day schedule only', () => {
    expect(isTvPresentationReady({
      waipuStationStatus: 'ready',
      joynStationStatus: 'ready',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
      scheduleStatus: 'ready',
      hasHeroItems: false,
    })).toBe(true)

    expect(isTvPresentationReady({
      waipuStationStatus: 'ready',
      joynStationStatus: 'ready',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
      scheduleStatus: 'loading',
      hasHeroItems: false,
    })).toBe(false)

    expect(isTvPresentationReady({
      waipuStationStatus: 'ready',
      joynStationStatus: 'ready',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
      scheduleStatus: 'loading',
      hasHeroItems: true,
    })).toBe(true)
  })
})
