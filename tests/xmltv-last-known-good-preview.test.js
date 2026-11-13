import { describe, expect, it } from 'vitest'
import { XMLTV_REVIEWED_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'
import {
  XMLTV_LKG_MAX_AGE_MS,
  previewXmltvLastKnownGood, previewXmltvMultiSourceLastKnownGood,
} from '../src/sources/xmltv/xmltvLastKnownGoodPreview.js'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const HOUR = 3_600_000
const PRIVATE = 'PRIVATE_XMLTV_TITLE_NEVER_IN_DIAGNOSTICS'
const iso = date => new Date(date).toISOString()

function candidates(sourceId, startsAt, { zoned = true } = {}) {
  return XMLTV_REVIEWED_STATIONS.flatMap(station =>
    [0, 24, 48, 72, 96].map(hour => ({
      sourceId, canonicalStationId: station.stationId, title: PRIVATE,
      timestampsExplicitlyZoned: zoned,
      startAt: iso(startsAt + hour * HOUR),
      endAt: iso(startsAt + (hour + 24) * HOUR),
    })))
}

function healthy(sourceId, at = NOW, options = {}) {
  return {
    sourceId, status: 'ok', observedAt: iso(at),
    candidates: candidates(sourceId, at, options),
  }
}

describe('XMLTV #336 last-known-good selection is diagnostic and fail-closed', () => {
  it('prefers a current valid source and never hands programme data to consumers', () => {
    const result = previewXmltvLastKnownGood('iptv-epg-org', {
      current: healthy('iptv-epg-org'),
      lastKnownGood: healthy('iptv-epg-org', NOW - 24 * HOUR),
      now: NOW,
    })
    expect(result).toMatchObject({
      selected: 'current', ageMinutes: 0, hasFutureCoverageOnAllStations: true,
      fiveDayCompleteNow: true, completeStationsNow: 6,
      publishApproved: false, tmdbReuseApproved: false,
    })
    expect(JSON.stringify(result)).not.toContain(PRIVATE)
    expect(result).not.toHaveProperty('candidates')
  })

  it('rechecks the remaining horizon of a good but older fallback', () => {
    const result = previewXmltvLastKnownGood('epgshare01', {
      current: { sourceId: 'epgshare01', status: 'failed' },
      lastKnownGood: healthy('epgshare01', NOW - 24 * HOUR),
      now: NOW,
    })
    expect(result).toMatchObject({
      selected: 'last-known-good', ageMinutes: 1440,
      hasFutureCoverageOnAllStations: true, fiveDayCompleteNow: false,
      completeStationsNow: 0,
    })
    expect(result.publishApproved).toBe(false)
  })

  it('rejects stale, future-dated, wrong-source and unzoned cached data', () => {
    const badCases = [
      healthy('epgshare01', NOW - XMLTV_LKG_MAX_AGE_MS - 1),
      healthy('epgshare01', NOW + HOUR),
      healthy('freeepg'),
      healthy('epgshare01', NOW, { zoned: false }),
      { sourceId: 'epgshare01', status: 'ok', observedAt: '2026-11-13', candidates: [] },
      { sourceId: 'epgshare01', status: 'ok', observedAt: iso(NOW), candidates: [] },
    ]
    for (const lastKnownGood of badCases) {
      expect(previewXmltvLastKnownGood('epgshare01', {
        lastKnownGood, now: NOW,
      })).toMatchObject({
        selected: 'unavailable', hasFutureCoverageOnAllStations: false,
        fiveDayCompleteNow: false, publishApproved: false,
      })
    }
  })

  it('refuses a cached source that no longer has any future coverage on one station', () => {
    const partial = healthy('freeepg', NOW - 24 * HOUR)
    partial.candidates = partial.candidates.filter(c => c.canonicalStationId !== 'zdf')
    const report = previewXmltvLastKnownGood('freeepg', {
      lastKnownGood: partial, now: NOW,
    })
    expect(report.selected).toBe('unavailable')
  })

  it('counts correlated hosts once and a separate fallback family only once', () => {
    const result = previewXmltvMultiSourceLastKnownGood([
      { sourceId: 'freeepg', current: healthy('freeepg') },
      { sourceId: 'iptv-epg-org', current: healthy('iptv-epg-org') },
      { sourceId: 'epgshare01', lastKnownGood: healthy('epgshare01', NOW - 24 * HOUR) },
    ], { now: NOW })
    expect(result).toMatchObject({
      availableIndependentFamilies: 2,
      completeIndependentFamilies: 1,
      hasFiveDayPrimaryPreview: true,
      hasIndependentFallbackPreview: true,
      publishApproved: false, tmdbReuseApproved: false,
    })
    expect(result.sourceStatuses[2].fiveDayCompleteNow).toBe(false)
    expect(JSON.stringify(result)).not.toContain(PRIVATE)
  })

  it('rejects duplicate or unknown source identities and unbounded input', () => {
    expect(() => previewXmltvLastKnownGood('unapproved', { now: NOW })).toThrow()
    expect(() => previewXmltvMultiSourceLastKnownGood([
      { sourceId: 'freeepg' }, { sourceId: 'freeepg' },
    ], { now: NOW })).toThrow()
    expect(() => previewXmltvMultiSourceLastKnownGood([
      { sourceId: 'xmltv:unapproved' },
    ], { now: NOW })).toThrow()
    expect(() => previewXmltvMultiSourceLastKnownGood(new Array(4).fill({}), {
      now: NOW,
    })).toThrow()
  })
})
