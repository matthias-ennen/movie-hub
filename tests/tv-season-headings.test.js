import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { seasonalPageHeading, SEASONAL_PAGE_HEADINGS } from '../src/theme/seasonalPresentation.js'

// The nine copy choices agreed for the TV Hero. TV must use the *visual*
// season, not the independent seasonal poster-discovery preference.
const CASES = [
  ['classic', 'TV-Programm'],
  ['halloween', 'Gruselzeit im TV'],
  ['christmas', 'Festliches im TV'],
  ['newyear', 'Highlights zum Jahreswechsel'],
  ['easter', 'TV für die Feiertage'],
  ['pentecost', 'TV fürs lange Wochenende'],
  ['filmfestival', 'Filmhighlights im TV'],
  ['hollywood', 'Hollywood im TV'],
  ['summer-cinema', 'TV für laue Sommerabende'],
]

describe('TV seasonal Hero heading', () => {
  it.each(CASES)('selects TV copy for the visual season %s', (season, expected) => {
    expect(seasonalPageHeading(season, 'tv')).toBe(expected)
    expect(SEASONAL_PAGE_HEADINGS[season].tv).toBe(expected)
  })

  it('retains classical fallback for an unknown visual season', () => {
    expect(seasonalPageHeading('unrecognised-season', 'tv')).toBe('TV-Programm')
  })

  it('wires TV through the visual-theme resolver without forcing a context in the presentational view', () => {
    const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
    const feature = readFileSync(new URL('../src/tv/TvFeature.jsx', import.meta.url), 'utf8')
    const view = readFileSync(new URL('../src/components/TvView.jsx', import.meta.url), 'utf8')
    expect(app).toContain("heroHeading={seasonalPageHeading(activeVisualSeason, 'tv')}")
    expect(feature).toContain('heroHeading={heroHeading}')
    expect(view).toContain('heroEyebrow={heroHeading}')
    expect(view).not.toContain('heroEyebrow="TV"')
    expect(view).not.toContain('useTheme()')
  })
})
