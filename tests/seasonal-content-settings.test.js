import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  easterSunday, seasonalCalendarPeriod, normalizeSeasonalContent,
  resolveSeasonalContent, withSeasonalContentEnabled,
  withManualSeasonalContent, withSeasonalAutoSwitch, isSeasonalRowVisible,
} from '../src/catalog/seasonalContent.js'
import { normalizeContentDisplaySettings } from '../src/catalog/contentDisplaySettings.js'

const at = date => new Date(date)
describe('#728 seasonal content calendar, profile setting and manual override', () => {
  it('correctly calculates moveable Easter and Pentecost in Europe/Berlin', () => {
    expect(new Date(easterSunday(2026) * 86400000).toISOString().slice(0,10)).toBe('2026-04-05')
    expect(new Date(easterSunday(2027) * 86400000).toISOString().slice(0,10)).toBe('2027-03-28')
    expect(seasonalCalendarPeriod(at('2026-03-22T12:00:00Z')).seasonId).toBe('easter')
    expect(seasonalCalendarPeriod(at('2026-04-13T12:00:00Z')).seasonId).toBe('classic')
    expect(seasonalCalendarPeriod(at('2026-05-17T12:00:00Z')).seasonId).toBe('pentecost')
    expect(seasonalCalendarPeriod(at('2026-05-27T12:00:00Z')).seasonId).toBe('classic')
  })
  it('uses Europe/Berlin for Halloween and the Christmas cross-year period', () => {
    expect(seasonalCalendarPeriod(at('2026-10-14T21:59:59Z')).seasonId).toBe('classic')
    expect(seasonalCalendarPeriod(at('2026-10-14T22:00:00Z')).seasonId).toBe('halloween')
    expect(seasonalCalendarPeriod(at('2026-10-31T23:00:00Z')).seasonId).toBe('classic')
    expect(seasonalCalendarPeriod(at('2026-11-30T22:59:59Z')).seasonId).toBe('classic')
    expect(seasonalCalendarPeriod(at('2026-11-30T23:00:00Z')).seasonId).toBe('christmas')
    expect(seasonalCalendarPeriod(at('2027-01-06T22:59:59Z')).seasonId).toBe('christmas')
    expect(seasonalCalendarPeriod(at('2027-01-06T23:00:00Z')).seasonId).toBe('classic')
  })
  it('starts disabled and preserves existing content display settings', () => {
    const settings = normalizeContentDisplaySettings({ sortMode: 'top-rated', watchedMode: 'hide' })
    expect(settings.seasonalContent.enabled).toBe(false)
    expect(resolveSeasonalContent(settings.seasonalContent, at('2026-12-24T12:00Z'))).toBe('classic')
    expect(settings.sortMode).toBe('top-rated')
    expect(settings.watchedMode).toBe('hide')
  })
  it('allows Christmas in June until the next automatic season boundary', () => {
    const june = at('2026-06-16T10:00Z')
    const original = normalizeSeasonalContent({ enabled: true, autoSwitch: { enabled: true } })
    expect(resolveSeasonalContent(original, june)).toBe('classic')
    const manual = withManualSeasonalContent(original, 'christmas', june)
    expect(resolveSeasonalContent(manual, at('2026-07-01T10:00Z'))).toBe('christmas')
    expect(resolveSeasonalContent(manual, at('2026-10-14T21:59:00Z'))).toBe('christmas')
    expect(resolveSeasonalContent(manual, at('2026-10-14T22:00:00Z'))).toBe('halloween')
    expect(resolveSeasonalContent(manual, at('2026-11-10T10:00:00Z'))).toBe('classic')
    expect(resolveSeasonalContent(manual, at('2026-12-05T10:00:00Z'))).toBe('christmas')
  })
  it('manual selection remains indefinitely if the season automation is disabled', () => {
    const settings = withSeasonalAutoSwitch({ enabled:true, seasonId:'classic' }, false)
    const manual = withManualSeasonalContent(settings, 'halloween', at('2026-06-01'))
    expect(resolveSeasonalContent(manual, at('2026-12-24'))).toBe('halloween')
    expect(resolveSeasonalContent(withSeasonalContentEnabled(manual, false), at('2026-12-24'))).toBe('classic')
    expect(resolveSeasonalContent(withSeasonalAutoSwitch(manual, true), at('2026-12-24'))).toBe('christmas')
  })
  it('normalizes malformed profile data and preserves curated seasonal rows only when selected', () => {
    expect(normalizeSeasonalContent({ enabled:true, seasonId:'invalid', autoSwitch: { periodKey: 'script-tag' } }))
      .toMatchObject({ seasonId:'classic', autoSwitch: { enabled:true, periodKey:null } })
    expect(isSeasonalRowVisible({ id:'provider-netflix-home' }, 'classic')).toBe(true)
    expect(isSeasonalRowVisible({ seasonId:'halloween' }, 'classic')).toBe(false)
    expect(isSeasonalRowVisible({ seasonId:'halloween' }, 'christmas')).toBe(false)
    expect(isSeasonalRowVisible({ seasonId:'halloween' }, 'halloween')).toBe(true)
  })
  it('reuses the existing settings screen and profile persistence', () => {
    const settingsUi = readFileSync(new URL('../src/components/ContentDisplaySettings.jsx', import.meta.url), 'utf8')
    const profile = readFileSync(new URL('../src/profiles/ProfileProvider.jsx', import.meta.url), 'utf8')
    expect(settingsUi).toContain('Saisonale Abwechslung')
    expect(settingsUi).toContain('Aktiv: {seasonal.enabled ? effectiveSeason.label')
    expect(settingsUi).toContain('withManualSeasonalContent')
    expect(settingsUi).toContain('withSeasonalAutoSwitch')
    expect(profile).toContain('normalizeContentDisplaySettings')
    expect(profile).toContain('updateActiveProfileContentDisplaySettings')
  })
})
