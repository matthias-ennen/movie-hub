import { describe, expect, it } from 'vitest'
import { getDateTimeFormatter } from '../src/performance/dateTimeFormat.js'
import { isPrimeTimeStart } from '../src/tv/tvPrimeTime.js'
import { tvDayKey, tvDayRange } from '../src/waipu/waipuTvCatalog.js'
import { formatLiveAiring } from '../src/sources/liveAvailabilityIndex.js'

describe('reused TV date formatting', () => {
  it('reuses equivalent options but keeps locale and time zone distinct', () => {
    const formatter = getDateTimeFormatter('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit' })
    expect(getDateTimeFormatter('de-DE', { hour: '2-digit', timeZone: 'Europe/Berlin' })).toBe(formatter)
    expect(getDateTimeFormatter('en-GB', { hour: '2-digit', timeZone: 'Europe/Berlin' })).not.toBe(formatter)
    expect(getDateTimeFormatter('de-DE', { hour: '2-digit', timeZone: 'UTC' })).not.toBe(formatter)
  })

  it('does not cache a date-specific DST offset or TV-day result', () => {
    for (const [date, before, after] of [
      ['2026-03-29', '2026-03-29T03:59:59Z', '2026-03-29T04:00:00Z'],
      ['2026-10-25', '2026-10-25T04:59:59Z', '2026-10-25T05:00:00Z'],
    ]) {
      expect(tvDayKey(before)).not.toBe(date)
      expect(tvDayKey(after)).toBe(date)
    }
    expect(tvDayRange('2026-03-28').endExclusive - tvDayRange('2026-03-28').start).toBe(23 * 3600000)
    expect(tvDayRange('2026-10-24').endExclusive - tvDayRange('2026-10-24').start).toBe(25 * 3600000)
  })

  it('retains 20:15–23:00 prime-time boundaries across summer and winter', () => {
    for (const [day, offset] of [['2026-07-10', '+02:00'], ['2026-10-31', '+01:00']]) {
      expect(isPrimeTimeStart(`${day}T20:14:59${offset}`)).toBe(false)
      expect(isPrimeTimeStart(`${day}T20:15:00${offset}`)).toBe(true)
      expect(isPrimeTimeStart(`${day}T22:59:59${offset}`)).toBe(true)
      expect(isPrimeTimeStart(`${day}T23:00:00${offset}`)).toBe(false)
    }
  })

  it('keeps the locale-sensitive airing label unchanged for different dates', () => {
    for (const startTime of ['2026-07-10T18:15:00Z', '2026-10-31T19:15:00Z']) {
      const start = new Date(startTime)
      const expectedDate = new Intl.DateTimeFormat('de-DE', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin',
      }).format(start)
      expect(formatLiveAiring({ nextAiring: { startTime, stationName: 'ZDF' } }))
        .toBe(`${expectedDate} · 20:15 Uhr · ZDF`)
    }
  })
})
