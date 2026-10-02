import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const lazySource = readFileSync(new URL('../src/performance/lazyViews.jsx', import.meta.url), 'utf8')
const featureSource = readFileSync(new URL('../src/tv/TvFeature.jsx', import.meta.url), 'utf8')

describe('TV-Feature wird aus dem Kaltstart ausgelagert', () => {
  it('zieht die schweren TV-Module nicht mehr statisch in App.jsx', () => {
    expect(appSource).not.toContain("import TvView from './components/TvView.jsx'")
    expect(appSource).not.toContain("from './waipu/waipuTvCatalog.js'")
    expect(appSource).not.toContain("from './joyn/joynTvCatalog.js'")
    expect(appSource).not.toContain("from './tv/tvRuntimeClient.js'")
    expect(appSource).not.toContain("from './tv/tv14DaySummary.js'")
    expect(appSource).toContain("from './waipu/waipuAiringStatus.js'")
  })

  it('lädt TV bei View-Intent als eigenes Feature vor', () => {
    expect(lazySource).toContain("import('../tv/TvFeature.jsx')")
    expect(lazySource).toContain('tv: loadTvFeatureModule')
    expect(appSource).toContain('<LazyTvFeature')
  })

  it('lädt die Senderkataloge im Kern nur dynamisch bei tatsächlichem Bedarf', () => {
    expect(appSource).toContain("import('./waipu/waipuTvCatalog.js')")
    expect(appSource).toContain("import('./joyn/joynTvCatalog.js')")
    expect(appSource).toContain('tvRequested: tvStationCatalogsRequested')
  })

  it('behält Hero-first: Posterphase und Senderkataloge starten erst nach Hero-Bereitschaft', () => {
    expect(featureSource).toMatch(/handleTvHeroReady[\s\S]*recordPerformanceEvent\('tv:poster-phase:start'\)[\s\S]*setTvScheduleRequested\(true\)[\s\S]*onStationCatalogsRequested\?\.\(true\)/)
    expect(featureSource).toContain("loadTvRuntimeHero({ signal: controller.signal })")
  })

  it('hält den globalen Live-Availability-Pfad außerhalb des TV-Features', () => {
    expect(appSource).toContain('loadLiveAvailabilityIndex()')
    expect(appSource).toContain('mergeLiveAvailability(')
    expect(featureSource).not.toContain('loadLiveAvailabilityIndex')
  })
})
