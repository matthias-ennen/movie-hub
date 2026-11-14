import { describe, expect, it } from 'vitest'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from '../src/sources/xmltv/xmltvStationMappings.js'
import { buildXmltvPrivateSourceGeneration } from '../src/sources/xmltv/xmltvPrivateStaging.js'
import {
  replayXmltvPrivateLkg, isSafeXmltvG2dReplayReport,
} from '../src/sources/xmltv/xmltvPrivateLkgReplay.js'

const NOW = Date.parse('2026-11-13T19:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const PRIVATE = 'PRIVATE_ORIGINAL_TITLE_MUST_NEVER_REACH_REPORT'
const utc = x => new Date(x).toISOString()
const xmlTime = x => utc(x).replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
const sourceStationId = (sourceId, stationId) =>
  Object.entries(XMLTV_REVIEWED_STATION_MAPPINGS[sourceId])
    .find(([, station]) => station.stationId === stationId)[0]
function generation(sourceId, days = 2, stations = ['zdf'], observedAt = NOW) {
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv>']
  for (const station of stations) {
    const channel = sourceStationId(sourceId, station)
    xml.push('<channel id="' + channel + '"><display-name>' + station + '</display-name></channel>')
    for (let day = 0; day < days; day++) {
      xml.push('<programme channel="' + channel +
        '" start="' + xmlTime(NOW + day * DAY) +
        '" stop="' + xmlTime(NOW + (day + 1) * DAY) + '">' +
        '<title lang="de">' + PRIVATE + '</title>' +
        '<desc>DO_NOT_PUBLISH_DESCRIPTION</desc></programme>')
    }
  }
  xml.push('</tv>')
  const parsed = parseXmltvCandidates(xml.join(''), {
    sourceId, observedAt: utc(observedAt),
    stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS,
    mappedOnly: true,
  })
  return buildXmltvPrivateSourceGeneration(parsed, { now: observedAt })
}
const entry = (sourceId, current = null, lastKnownGood = null) =>
  ({ sourceId, current, lastKnownGood })

describe('#336 G2d replay of PRIVATE real-format G2c source records', () => {
  it('replays an original short two-day source after a same-source outage without inventing five days', () => {
    const original = generation('epgshare01', 2)
    const result = replayXmltvPrivateLkg([
      entry('epgshare01', null, original),
    ], { now: NOW + HOUR })
    expect(result).toMatchObject({
      restoredStationDecisions: 1,
      availableIndependentFamilies: 1,
      stationsWithIndependentFallback: 0,
      fiveDaysRequiredToKeepSource: false,
      durableCheckpointVerified: false,
      publishApproved: false,
      tmdbIdentityApproved: false,
      playbackRoutesApproved: false,
      reuseRightsApproved: false,
      sources: [{
        currentStations: 0, restoredStations: 1, unavailableStations: 5,
        byStation: {
          zdf: { mode: 'last-known-good',
            coveredMinutes: 2820, completeFiveDaysFromNow: false },
          ard: { mode: 'unavailable', coveredMinutes: 0 },
        },
      }],
    })
    expect(isSafeXmltvG2dReplayReport(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(PRIVATE)
    expect(JSON.stringify(result)).not.toContain('DO_NOT_PUBLISH_DESCRIPTION')
    expect(JSON.stringify(result)).not.toContain('sourceRef')
  })

  it('prefers fresh current data per station but restores missing stations from same-source LKG', () => {
    const previous = generation('freeepg', 5, ['ard', 'zdf'])
    const current = generation('freeepg', 1, ['zdf'])
    const report = replayXmltvPrivateLkg([
      entry('freeepg', current, previous),
    ], { now: NOW })
    expect(report.sources[0]).toMatchObject({
      currentStations: 1, restoredStations: 1, unavailableStations: 4,
      byStation: {
        zdf: { mode: 'current', coveredMinutes: 1440 },
        ard: { mode: 'last-known-good', coveredMinutes: 7200,
          completeFiveDaysFromNow: true },
      },
    })
    expect(report.availableIndependentFamilies).toBe(1)
  })

  it('does not turn two copied XMLTV feed hosts into independent fallback families', () => {
    const report = replayXmltvPrivateLkg([
      entry('freeepg', generation('freeepg', 5)),
      entry('iptv-epg-org', generation('iptv-epg-org', 5)),
    ], { now: NOW })
    expect(report.availableIndependentFamilies).toBe(1)
    expect(report.independentFamiliesByStation.zdf).toBe(1)
    expect(report.stationsWithIndependentFallback).toBe(0)
    const withIndependent = replayXmltvPrivateLkg([
      entry('freeepg', generation('freeepg', 5)),
      entry('iptv-epg-org', generation('iptv-epg-org', 5)),
      entry('epgshare01', null, generation('epgshare01', 2)),
    ], { now: NOW + HOUR })
    expect(withIndependent.availableIndependentFamilies).toBe(2)
    expect(withIndependent.independentFamiliesByStation.zdf).toBe(2)
    expect(withIndependent.stationsWithIndependentFallback).toBe(1)
  })

  it('will not restore a 36h expired private snapshot or a programme that is already over', () => {
    const old = generation('epgshare01', 2)
    const stale = replayXmltvPrivateLkg([
      entry('epgshare01', null, old),
    ], { now: NOW + 37 * HOUR })
    expect(stale.sources[0].restoredStations).toBe(0)
    expect(stale.sources[0].unavailableStations).toBe(6)

    const recent = generation('epgshare01', 1, ['zdf'], NOW + 30 * HOUR)
    const expiredProgramme = replayXmltvPrivateLkg([
      entry('epgshare01', null, recent),
    ], { now: NOW + 31 * HOUR })
    expect(expiredProgramme.sources[0].restoredStations).toBe(0)
  })

  it('rejects modified original sourceRef, mismapped station and injected approvals', () => {
    const forged = generation('epgshare01')
    forged.records[0].sourceRef.externalId = 'FORGED'
    const mismapped = generation('freeepg')
    mismapped.records[0].canonicalStationId = 'ard'
    const approved = generation('iptv-epg-org')
    approved.publishApproved = true
    const report = replayXmltvPrivateLkg([
      entry('epgshare01', null, forged),
      entry('freeepg', mismapped),
      entry('iptv-epg-org', approved),
    ], { now: NOW })
    expect(report.sources.every(s => s.unavailableStations === 6)).toBe(true)
    expect(report.availableIndependentFamilies).toBe(0)
    expect(report.restoredStationDecisions).toBe(0)
  })

  it('forbids duplicate or foreign source IDs and unsafe report contents', () => {
    const source = entry('epgshare01', generation('epgshare01'))
    expect(() => replayXmltvPrivateLkg([source, source], { now: NOW })).toThrow()
    expect(() => replayXmltvPrivateLkg([entry('unknown')], { now: NOW })).toThrow()
    expect(() => replayXmltvPrivateLkg([], { now: NOW })).toThrow()
    const report = replayXmltvPrivateLkg([source], { now: NOW })
    expect(isSafeXmltvG2dReplayReport({ ...report, originalTitle: PRIVATE })).toBe(false)
    expect(isSafeXmltvG2dReplayReport({
      ...report, publishApproved: true,
    })).toBe(false)
    expect(isSafeXmltvG2dReplayReport({
      ...report, availableIndependentFamilies: 3,
    })).toBe(false)
    expect(isSafeXmltvG2dReplayReport({
      ...report, sources: [{ ...report.sources[0], rawProgrammes: [PRIVATE] }],
    })).toBe(false)
  })
})


function delayedGeneration(sourceId, firstDay, days = 2) {
  const channel = sourceStationId(sourceId, 'zdf')
  const lines = ['<?xml version="1.0" encoding="UTF-8"?><tv>',
    '<channel id="' + channel + '"><display-name>ZDF</display-name></channel>']
  for (let day = firstDay; day < firstDay + days; day++) {
    lines.push('<programme channel="' + channel +
      '" start="' + xmlTime(NOW + day * DAY) +
      '" stop="' + xmlTime(NOW + (day + 1) * DAY) +
      '"><title lang="de">' + PRIVATE + '</title></programme>')
  }
  lines.push('</tv>')
  const parsed = parseXmltvCandidates(lines.join(''), {
    sourceId, observedAt: utc(NOW),
    stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS,
    mappedOnly: true,
  })
  return buildXmltvPrivateSourceGeneration(parsed, { now: NOW })
}

describe('#336 G2f+ independent same-minute source overlap QA', () => {
  it('measures real 120h overlapping minutes between two independent content families', () => {
    const report = replayXmltvPrivateLkg([
      entry('freeepg', generation('freeepg', 5)),
      entry('iptv-epg-org', generation('iptv-epg-org', 5)),
      entry('epgshare01', null, generation('epgshare01', 2)),
    ], { now: NOW + HOUR })
    expect(report.independentFamiliesByStation.zdf).toBe(2)
    expect(report.independentOverlapMinutesByStation.zdf).toBe(47 * 60)
    expect(report.stationsWithIndependentOverlap).toBe(1)
    expect(report.independentOverlapMinutesByStation.ard).toBe(0)
    expect(isSafeXmltvG2dReplayReport(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(PRIVATE)
  })

  it('does not count two identical-host-family feeds as backup time', () => {
    const report = replayXmltvPrivateLkg([
      entry('freeepg', generation('freeepg', 5)),
      entry('iptv-epg-org', generation('iptv-epg-org', 5)),
    ], { now: NOW })
    expect(report.independentFamiliesByStation.zdf).toBe(1)
    expect(report.independentOverlapMinutesByStation.zdf).toBe(0)
    expect(report.stationsWithIndependentOverlap).toBe(0)
  })

  it('separates two available families from an actually overlapping backup', () => {
    const report = replayXmltvPrivateLkg([
      entry('freeepg', delayedGeneration('freeepg', 0, 2)),
      entry('epgshare01', delayedGeneration('epgshare01', 2, 2)),
    ], { now: NOW })
    // Two future sources, but exactly zero concurrent backup minutes.
    expect(report.stationsWithIndependentFallback).toBe(1)
    expect(report.independentFamiliesByStation.zdf).toBe(2)
    expect(report.independentOverlapMinutesByStation.zdf).toBe(0)
    expect(report.stationsWithIndependentOverlap).toBe(0)
  })

  it('ignores stale or forged LKG data and rejects inflated backup reports', () => {
    const report = replayXmltvPrivateLkg([
      entry('epgshare01', null, generation('epgshare01', 2)),
      entry('freeepg', delayedGeneration('freeepg', 2, 2)),
    ], { now: NOW + 37 * HOUR })
    expect(report.sources[0].restoredStations).toBe(0)
    expect(report.independentOverlapMinutesByStation.zdf).toBe(0)
    expect(isSafeXmltvG2dReplayReport({
      ...report, independentOverlapMinutesByStation: {
        ...report.independentOverlapMinutesByStation, zdf: 7_201,
      },
    })).toBe(false)
    expect(isSafeXmltvG2dReplayReport({
      ...report, originalProgrammeTitle: PRIVATE,
    })).toBe(false)
  })
})
