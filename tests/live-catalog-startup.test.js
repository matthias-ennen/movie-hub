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
  it('releases the TV hero from the dedicated snapshot without catalog or day dependencies', () => {
    expect(isTvPresentationReady({
      heroStatus: 'ready',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
    })).toBe(true)

    expect(isTvPresentationReady({
      heroStatus: 'loading',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
    })).toBe(false)

    expect(isTvPresentationReady({
      heroStatus: 'ready',
      stationSelectionLoading: true,
      joynStationSelectionLoading: false,
    })).toBe(false)
  })

  it('does not deadlock TV when the dedicated hero snapshot is unavailable', () => {
    expect(isTvPresentationReady({
      heroStatus: 'unavailable',
      stationSelectionLoading: false,
      joynStationSelectionLoading: false,
    })).toBe(true)
  })
})
