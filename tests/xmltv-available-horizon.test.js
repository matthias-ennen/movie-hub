import { describe, expect, it } from 'vitest'
import { XMLTV_REVIEWED_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'
import {
  XMLTV_MAX_PREVIEW_DAYS, measureXmltvAvailableHorizon,
} from '../src/sources/xmltv/xmltvAvailableHorizon.js'

const NOW = Date.parse('2026-11-13T19:00:00Z')
const HOUR = 3_600_000
const PRIVATE = 'PRIVATE_XMLTV_PROGRAMME_NEVER_IN_REPORT'
const iso = ms => new Date(ms).toISOString()
const item = (sourceId, stationId, startHour, endHour, zoned = true) => ({
  sourceId, canonicalStationId: stationId, title: PRIVATE,
  timestampsExplicitlyZoned: zoned,
  startAt: iso(NOW + startHour * HOUR), endAt: iso(NOW + endHour * HOUR),
})
const programmes = (sourceId, days) => XMLTV_REVIEWED_STATIONS.flatMap(st =>
  Array.from({ length: days }, (_, i) =>
    item(sourceId, st.stationId, i * 24, (i + 1) * 24)))
const evaluate = (rows, sourceId = 'epgshare01', args = {}) =>
  measureXmltvAvailableHorizon(rows, { sourceId, now: NOW, ...args })

describe('#336 G2b: adaptive XMLTV availability, 14d is best and 5d is NOT an eligibility cutoff', () => {
  it('keeps an independent original feed with only two days for ALL six stations', () => {
    const rows = programmes('epgshare01', 2)
    const out = evaluate(rows)
    expect(out).toMatchObject({
      kind: 'xmltv-available-horizon-preview', maxDays: 14,
      reviewedStations: 6, usableStations: 6,
      hasAnyFutureProgramme: true, allStationsHaveFutureProgrammes: true,
      fiveDaysIsQualityTargetNotEligibility: true, publishApproved: false,
      tmdbIdentityApproved: false, playbackRoutesApproved: false,
      stations: {
        ard: {
          programmeIntervals: 2, coveredMinutes: 2880,
          continuousFromNowMinutes: 2880, latestProgrammeEndMinutes: 2880,
          completeFiveDaysFromNow: false, completeFourteenDaysFromNow: false,
        },
      },
    })
    expect(JSON.stringify(out)).not.toContain(PRIVATE)
  })

  it('recognizes five, seven and fourteen days without making any of them mandatory', () => {
    for (const [days, five, fourteen] of [
      [5, true, false], [7, true, false], [14, true, true],
    ]) {
      const out = evaluate(programmes('epgshare01', days))
      expect(out.stations.zdf.coveredMinutes).toBe(days * 1440)
      expect(out.stations.zdf.continuousFromNowMinutes).toBe(days * 1440)
      expect(out.stations.zdf.latestProgrammeEndMinutes).toBe(days * 1440)
      expect(out.stations.zdf.completeFiveDaysFromNow).toBe(five)
      expect(out.stations.zdf.completeFourteenDaysFromNow).toBe(fourteen)
      expect(out.usableStations).toBe(6)
      expect(out.publishApproved).toBe(false)
    }
    expect(XMLTV_MAX_PREVIEW_DAYS).toBe(14)
  })

  it('distinguishes latest broadcast far away from actual continuous coverage', () => {
    const out = evaluate([
      item('epgshare01', 'zdf', 0, 24),
      item('epgshare01', 'zdf', 168, 169),
      item('epgshare01', 'zdf', 0, 24), // duplicated interval must not double count
    ])
    expect(out).toMatchObject({
      usableStations: 1, allStationsHaveFutureProgrammes: false,
      stations: {
        zdf: {
          programmeIntervals: 3, coveredMinutes: 1500,
          continuousFromNowMinutes: 1440, latestProgrammeEndMinutes: 169 * 60,
          completeFiveDaysFromNow: false,
        },
        ard: { coveredMinutes: 0, hasFutureProgramme: false },
      },
    })
  })

  it('keeps four days of partial data if one station has no future events at all', () => {
    const rows = programmes('freeepg', 4)
      .filter(x => x.canonicalStationId !== 'ard')
    const out = evaluate(rows, 'freeepg')
    expect(out.usableStations).toBe(5)
    expect(out.hasAnyFutureProgramme).toBe(true)
    expect(out.allStationsHaveFutureProgrammes).toBe(false)
    expect(out.stations.zdf.coveredMinutes).toBe(5760)
    expect(out.stations.ard.coveredMinutes).toBe(0)
  })

  it('enforces explicit UTC zoning, reviewed source/station, valid event duration', () => {
    const rows = [
      item('epgshare01', 'zdf', 0, 24, false),
      item('other-feed', 'zdf', 0, 24),
      item('epgshare01', 'unknown-station', 0, 24),
      item('epgshare01', 'zdf', 0, 37),
      item('epgshare01', 'zdf', -24, -1),
      item('epgshare01', 'zdf', 0, 24),
    ]
    const out = evaluate(rows)
    expect(out.rejectedUnzoned).toBe(1)
    expect(out.ignoredInvalid).toBe(4)
    expect(out.stations.zdf.coveredMinutes).toBe(1440)
    expect(out.publishApproved).toBe(false)
  })

  it('never treats unknown, oversized or malformed data as safe available coverage', () => {
    expect(() => evaluate([], 'not-allowlisted')).toThrow()
    expect(() => evaluate(new Array(250001).fill(null))).toThrow()
    expect(() => evaluate([], 'epgshare01', { now: Number.NaN })).toThrow()
    expect(() => evaluate([], 'epgshare01', { maxDays: 15 })).toThrow()
    const empty = evaluate([])
    expect(empty.usableStations).toBe(0)
    expect(empty.hasAnyFutureProgramme).toBe(false)
    expect(empty.stations.zdf.latestProgrammeEndMinutes).toBe(0)
    expect(empty.publishApproved).toBe(false)
  })
})
