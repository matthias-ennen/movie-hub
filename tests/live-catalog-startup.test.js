import { describe, expect, it } from 'vitest'
import {
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
})
