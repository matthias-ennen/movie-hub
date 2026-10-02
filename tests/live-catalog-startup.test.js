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
  it('releases the TV hero without waiting for station catalogs or day schedule', () => {
    expect(isTvPresentationReady({
      catalogStatus: 'ready',
      liveAvailabilityStatus: 'ready',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
    })).toBe(true)

    expect(isTvPresentationReady({
      catalogStatus: 'loading',
      liveAvailabilityStatus: 'ready',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
    })).toBe(false)

    expect(isTvPresentationReady({
      catalogStatus: 'ready',
      liveAvailabilityStatus: 'loading',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
    })).toBe(false)

    expect(isTvPresentationReady({
      catalogStatus: 'ready',
      liveAvailabilityStatus: 'ready',
      stationSelectionLoading: true,
      joynStationSelectionLoading: false,
    })).toBe(false)
  })

  it('does not deadlock the TV hero when the compact live index is unavailable', () => {
    expect(isTvPresentationReady({
      catalogStatus: 'ready',
      liveAvailabilityStatus: 'unavailable',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
    })).toBe(true)
  })
})
