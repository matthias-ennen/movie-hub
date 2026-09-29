import { describe, expect, it } from 'vitest'
import {
  shouldLoadLiveStations,
  shouldLoadLiveTitles,
} from '../src/performance/liveCatalogStartup.js'

describe('live catalog startup policy', () => {
  it('keeps heavy live title catalogs out of Home even after startup is ready', () => {
    expect(shouldLoadLiveTitles({ homeReady: false, tvRequested: false })).toBe(false)
    expect(shouldLoadLiveTitles({ homeReady: true, tvRequested: false })).toBe(false)
  })

  it('loads live titles only when TV is actually requested', () => {
    expect(shouldLoadLiveTitles({ homeReady: false, tvRequested: true })).toBe(true)
    expect(shouldLoadLiveTitles({ homeReady: true, tvRequested: true })).toBe(true)
  })

  it('defers station catalogs until TV or Settings needs them', () => {
    expect(shouldLoadLiveStations()).toBe(false)
    expect(shouldLoadLiveStations({ tvRequested: true })).toBe(true)
    expect(shouldLoadLiveStations({ settingsOpen: true })).toBe(true)
  })
})
