import { describe, expect, it } from 'vitest'
import {
  XMLTV_FIVE_DAY_HOURS, XMLTV_VERIFIED_SOURCE_FAMILIES,
  measureXmltvFiveDayCoverage, assessXmltvIndependentCoverage,
} from '../src/sources/xmltv/xmltvSourceReadiness.js'
import { XMLTV_REVIEWED_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const HOUR = 3_600_000
const PRIVATE = 'SYNTHETIC_PRIVATE_PROGRAMME_NEVER_PUBLISH'
const iso = t => new Date(t).toISOString()

function fiveDays(sourceId, { gapStation = null, gaps = false, zone = true } = {}) {
  return XMLTV_REVIEWED_STATIONS.flatMap(station => {
    const missingMiddleHour = gaps && gapStation === station.stationId
    // The production parser rejects individual programmes longer than 36h.
    // Five realistic 24h intervals cover the entire 120h window.
    return [0, 24, 48, 72, 96].map(startHour => {
      const start = missingMiddleHour && startHour === 24 ? 25 : startHour
      const end = startHour + 24
      return {
      sourceId, canonicalStationId: station.stationId,
      title: PRIVATE, timestampsExplicitlyZoned: zone,
      startAt: iso(NOW + start * HOUR), endAt: iso(NOW + end * HOUR),
    }
    })
  })
}

function report(source, options = {}) {
  return {
    source, status: options.status || 'ok',
    observedAt: iso(options.observedAt ?? NOW),
    coverage: measureXmltvFiveDayCoverage(fiveDays(source, options), { sourceId: source, now: NOW }),
  }
}

describe('XMLTV #336: five-day real coverage and independent source families, isolated', () => {
  it('counts the UNION of programme intervals over all six explicitly mapped stations', () => {
    const sourceId = 'iptv-epg-org'
    const full = measureXmltvFiveDayCoverage([
      ...fiveDays(sourceId),
      ...fiveDays(sourceId), // repeated programmes must not double count
    ], { sourceId, now: NOW })
    expect(full.horizonHours).toBe(XMLTV_FIVE_DAY_HOURS)
    expect(full.completeStations).toBe(6)
    expect(full.allReviewedStationsComplete).toBe(true)
    expect(full.stations.zdf).toEqual({
      programmeIntervals: 10,
      coveredMinutes: 7200, missingMinutes: 0,
      longestGapMinutes: 0, complete120h: true,
    })
    expect(JSON.stringify(full)).not.toContain(PRIVATE)
  })

  it('exposes even a one-hour gap rather than treating programme count as five-day coverage', () => {
    const result = measureXmltvFiveDayCoverage(fiveDays('iptv-epg-org', {
      gapStation: 'zdf', gaps: true,
    }), { sourceId: 'iptv-epg-org', now: NOW })
    expect(result.completeStations).toBe(5)
    expect(result.allReviewedStationsComplete).toBe(false)
    expect(result.stations.zdf).toMatchObject({
      coveredMinutes: 7140, missingMinutes: 60,
      longestGapMinutes: 60, complete120h: false,
    })
    expect(result.stations.ard.complete120h).toBe(true)
  })

  it('rejects uncertain clock zones and unreviewed sources/stations without fuzzy IDs', () => {
    const sourceId = 'iptv-epg-org'
    const unzoned = measureXmltvFiveDayCoverage(fiveDays(sourceId, { zone: false }), {
      sourceId, now: NOW,
    })
    expect(unzoned.rejectedUnzoned).toBe(30)
    expect(unzoned.completeStations).toBe(0)
    expect(unzoned.stations.zdf.coveredMinutes).toBe(0)
    const mutated = fiveDays(sourceId)
    mutated.push({
      sourceId: 'freeepg', canonicalStationId: 'zdfneo',
      title: PRIVATE, timestampsExplicitlyZoned: true,
      startAt: iso(NOW), endAt: iso(NOW + HOUR),
    })
    const screened = measureXmltvFiveDayCoverage(mutated, { sourceId, now: NOW })
    expect(screened.ignoredInvalid).toBe(1)
    expect(screened.completeStations).toBe(6)
    expect(() => measureXmltvFiveDayCoverage([], { sourceId: 'unknown-source', now: NOW })).toThrow()
  })

  it('does NOT count two distribution hosts of one programme family as independent backups', () => {
    expect(XMLTV_VERIFIED_SOURCE_FAMILIES.freeepg)
      .toBe(XMLTV_VERIFIED_SOURCE_FAMILIES['iptv-epg-org'])
    const assessed = assessXmltvIndependentCoverage([
      report('freeepg'), report('iptv-epg-org'),
    ], { now: NOW })
    expect(assessed).toMatchObject({
      requiredIndependentFamilies: 2, availableIndependentFamilies: 1,
      completeIndependentFamilies: 1,
      primaryFiveDaySnapshot: true, independentFallbackSnapshot: false,
      sufficientIndependentCoverageSnapshot: false,
    })
    expect(assessed.sourceStatuses.every(s => s.completeFiveDayCoverage)).toBe(true)
    expect(JSON.stringify(assessed)).not.toContain(PRIVATE)
  })

  it('needs TWO content families with full five-day coverage and fresh observations', () => {
    const good = assessXmltvIndependentCoverage([
      report('iptv-epg-org'), report('epgshare01'),
    ], { now: NOW })
    expect(good).toMatchObject({
      availableIndependentFamilies: 2, completeIndependentFamilies: 2,
      primaryFiveDaySnapshot: true, independentFallbackSnapshot: true,
      sufficientIndependentCoverageSnapshot: true,
    })
    // A shorter but independent source is valuable as a backup, yet NOT a
    // complete five-day fallback; do not invent a healthy second family.
    const degraded = assessXmltvIndependentCoverage([
      report('iptv-epg-org'),
      report('epgshare01', { gaps: true, gapStation: 'zdf' }),
    ], { now: NOW })
    expect(degraded).toMatchObject({
      availableIndependentFamilies: 2, completeIndependentFamilies: 1,
      primaryFiveDaySnapshot: true, independentFallbackSnapshot: true,
      sufficientIndependentCoverageSnapshot: false,
    })
    const stale = assessXmltvIndependentCoverage([
      report('iptv-epg-org'), report('epgshare01', {
        observedAt: NOW - 48 * HOUR,
      }),
    ], { now: NOW })
    expect(stale.completeIndependentFamilies).toBe(1)
    expect(stale.availableIndependentFamilies).toBe(1)
    expect(stale.independentFallbackSnapshot).toBe(false)
    const down = assessXmltvIndependentCoverage([
      report('iptv-epg-org'), report('epgshare01', { status: 'error' }),
    ], { now: NOW })
    expect(down.completeIndependentFamilies).toBe(1)
    expect(down.availableIndependentFamilies).toBe(1)
  })

  it('does NOT count two cloned hosts as independent backup on ANY station', () => {
    const data = assessXmltvIndependentCoverage([
      report('freeepg'), report('iptv-epg-org'),
    ], { now: NOW })
    expect(data.stationsWithIndependentFallback).toBe(0)
    expect(data.stationsWithFiveDayCoverageInAnyFamily).toBe(6)
    expect(data.stationsWithTwoCompleteIndependentFamilies).toBe(0)
    expect(data.allStationsHaveIndependentFallback).toBe(false)
    expect(data.stationFallback.zdf).toEqual({
      availableIndependentFamilies: 1,
      completeIndependentFamilies: 1,
      primaryCoverageMinutes: 7200,
      independentFallbackCoverageMinutes: 0,
    })
  })

  it('shows a 119-hour independent backup as a PARTIAL fallback, never a second full feed', () => {
    const data = assessXmltvIndependentCoverage([
      report('freeepg'),
      report('epgshare01', { gapStation: 'zdf', gaps: true }),
    ], { now: NOW })
    expect(data).toMatchObject({
      primaryFiveDaySnapshot: true,
      independentFallbackSnapshot: true,
      sufficientIndependentCoverageSnapshot: false,
      stationsWithIndependentFallback: 6,
      stationsWithFiveDayCoverageInAnyFamily: 6,
      stationsWithTwoCompleteIndependentFamilies: 5,
      allStationsHaveIndependentFallback: true,
      stationFallback: {
        zdf: {
          availableIndependentFamilies: 2, completeIndependentFamilies: 1,
          primaryCoverageMinutes: 7200, independentFallbackCoverageMinutes: 7140,
        },
        ard: {
          availableIndependentFamilies: 2, completeIndependentFamilies: 2,
          primaryCoverageMinutes: 7200, independentFallbackCoverageMinutes: 7200,
        },
      },
    })
    expect(JSON.stringify(data)).not.toContain(PRIVATE)
  })

  it('does not infer per-station redundancy from a source that covers only ZDF', () => {
    const short = report('epgshare01')
    for (const station of XMLTV_REVIEWED_STATIONS) {
      if (station.stationId === 'zdf') continue
      Object.assign(short.coverage.stations[station.stationId], {
        programmeIntervals: 0,
        coveredMinutes: 0, missingMinutes: 7200,
        longestGapMinutes: 7200, complete120h: false,
      })
    }
    short.coverage.completeStations = 1
    short.coverage.allReviewedStationsComplete = false
    const data = assessXmltvIndependentCoverage([
      report('iptv-epg-org'), short,
    ], { now: NOW })
    expect(data).toMatchObject({
      availableIndependentFamilies: 2,
      independentFallbackSnapshot: true,
      stationsWithIndependentFallback: 1,
      allStationsHaveIndependentFallback: false,
      stationFallback: {
        zdf: { independentFallbackCoverageMinutes: 7200 },
        ard: { independentFallbackCoverageMinutes: 0 },
      },
    })
  })

  it('ignores stale or malformed family coverage instead of inventing station backups', () => {
    const stale = report('epgshare01', { observedAt: NOW - 48 * HOUR })
    const fake = report('epgshare01')
    fake.coverage.stations.zdf.coveredMinutes = 8000
    for (const other of [stale, fake]) {
      const data = assessXmltvIndependentCoverage([
        report('freeepg'), other,
      ], { now: NOW })
      expect(data.stationsWithIndependentFallback).toBe(0)
      expect(data.allStationsHaveIndependentFallback).toBe(false)
      expect(data.stationFallback.zdf.availableIndependentFamilies).toBe(1)
    }
  })

  it('rejects duplicate sources, source-family spoofing and invalid input bounds', () => {
    expect(() => assessXmltvIndependentCoverage([
      report('freeepg'), report('freeepg'),
    ], { now: NOW })).toThrow()
    const altered = report('iptv-epg-org')
    altered.coverage.contentFamily = 'invented-independent'
    const result = assessXmltvIndependentCoverage([altered], { now: NOW })
    expect(result.completeIndependentFamilies).toBe(0)
    expect(result.availableIndependentFamilies).toBe(0)
    expect(result.sufficientIndependentCoverageSnapshot).toBe(false)
    expect(() => measureXmltvFiveDayCoverage(new Array(250001).fill(null), {
      sourceId: 'freeepg', now: NOW,
    })).toThrow()
  })
})
