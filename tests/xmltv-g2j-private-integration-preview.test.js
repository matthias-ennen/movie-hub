import { describe, expect, it, vi } from 'vitest'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from '../src/sources/xmltv/xmltvStationMappings.js'
import { buildXmltvPrivateSourceGeneration } from '../src/sources/xmltv/xmltvPrivateStaging.js'
import {
  runXmltvG2jPrivateIntegrationPreview,
} from '../scripts/xmltv-g2j-private-integration-preview.mjs'

const NOW = Date.parse('2026-11-14T09:00:00Z')
const DAY = 24 * 60 * 60_000
const HOUR = 60 * 60_000
const TITLE = 'PRIVATE_SYNTHETIC_XMLTV_TITLE_DO_NOT_PRINT'
const time = value => new Date(value).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
const instant = value => new Date(value).toISOString()
const channel = (sourceId, stationId) =>
  Object.entries(XMLTV_REVIEWED_STATION_MAPPINGS[sourceId])
    .find(([, entry]) => entry.stationId === stationId)[0]

function generation(sourceId, days = 2, stations = ['zdf'], observedAt = NOW, {
  typed = true,
} = {}) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?><tv>']
  for (const stationId of stations) {
    const rawId = channel(sourceId, stationId)
    lines.push('<channel id="' + rawId + '"><display-name>' + stationId + '</display-name></channel>')
    for (let day = 0; day < days; day++) {
      lines.push('<programme channel="' + rawId +
        '" start="' + time(NOW + day * DAY) +
        '" stop="' + time(NOW + (day + 1) * DAY) + '">' +
        '<title>' + TITLE + '</title>' +
        (typed ? '<category>Film</category>' : '') + '</programme>')
    }
  }
  lines.push('</tv>')
  const parsed = parseXmltvCandidates(lines.join(''), {
    sourceId, observedAt: instant(observedAt),
    stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS,
    mappedOnly: true,
  })
  return buildXmltvPrivateSourceGeneration(parsed, { now: observedAt })
}

const entry = (sourceId, current = null, lastKnownGood = null) =>
  ({ sourceId, current, lastKnownGood })
const catalog = vi.fn(async () => [{
  type: 'movie', tmdbId: 99119, title: TITLE,
}])

describe('#336 G2j: selected private source -> original local matcher -> shared EPG merge', () => {
  it('combines 2-day fresh ZDF, only missing ARD from older same-source LKG and independent source', async () => {
    const sources = [
      entry('freeepg',
        generation('freeepg', 2),
        generation('freeepg', 5, ['zdf', 'ard'], NOW - HOUR)),
      entry('epgshare01', generation('epgshare01', 2)),
      entry('iptv-epg-org', generation('iptv-epg-org', 2)),
    ]
    const existing = [{
      type: 'movie', tmdbId: 99119, stationId: 'zdf', stationName: 'ZDF',
      startTime: instant(NOW), stopTime: instant(NOW + DAY),
      providerIds: ['waipu'],
      sourceRefs: [{ sourceId: 'waipu-epg', externalId: 'synthetic',
        observedAt: instant(NOW) }],
      playbackRoutes: [{ providerId: 'waipu', mode: 'WEB_LINK',
        scope: 'channel', target: 'https://example.invalid/channel' }],
    }]
    const summary = await runXmltvG2jPrivateIntegrationPreview(sources, {
      now: NOW, localCandidatesFor: catalog, waipuAirings: existing,
    })
    expect(summary).toMatchObject({
      mode: 'offline-ephemeral-no-publication',
      selectedOriginalCandidates: 11,
      locallyMatched: 11, locallyUnmatched: 0,
      baselineMergedAirings: 1,
      mergedAiringsWithXmltvPreview: 7,
      independentFamiliesWithFutureCoverage: 2,
      stationsWithIndependentOverlap: 1,
      fiveDaysRequiredToKeepSource: false,
      publishApproved: false,
      playbackRoutesApproved: false,
      durableOriginalCheckpointVerified: false,
    })
    expect(summary.sources.find(s => s.sourceId === 'freeepg')).toMatchObject({
      selectedCurrent: 2, selectedLastKnownGood: 5,
      locallyMatched: 7, currentStations: 1, restoredStations: 1,
    })
    const json = JSON.stringify(summary)
    expect(json).not.toContain(TITLE)
    expect(json).not.toContain('sourceRef')
    expect(json).not.toContain('example.invalid')
    expect(json).not.toContain('externalId')
  })

  it('keeps a valid 2-day current horizon even if LKG used to hold five days', async () => {
    const summary = await runXmltvG2jPrivateIntegrationPreview([
      entry('freeepg',
        generation('freeepg', 2),
        generation('freeepg', 5, ['zdf'], NOW - HOUR)),
    ], { now: NOW, localCandidatesFor: catalog })
    expect(summary.selectedOriginalCandidates).toBe(2)
    expect(summary.sources[0].selectedLastKnownGood).toBe(0)
    expect(summary.mergedAiringsWithXmltvPreview).toBe(2)
  })

  it('takes a valid LKG for a failed station but does not invent absent stations', async () => {
    const summary = await runXmltvG2jPrivateIntegrationPreview([
      entry('epgshare01', null, generation('epgshare01', 2)),
    ], { now: NOW + HOUR, localCandidatesFor: catalog })
    expect(summary.sources[0]).toMatchObject({
      selectedCurrent: 0, selectedLastKnownGood: 2,
      restoredStations: 1, unavailableStations: 5,
    })
    expect(summary.selectedOriginalCandidates).toBe(2)
    expect(summary.publishApproved).toBe(false)
  })

  it('rejects forged provenance and expired LKG instead of passing it into the matcher', async () => {
    const fake = generation('freeepg')
    fake.records[0].sourceRef.externalId = 'FORGED_EXTERNAL_ID'
    const invalid = await runXmltvG2jPrivateIntegrationPreview([
      entry('freeepg', fake),
    ], { now: NOW, localCandidatesFor: catalog })
    expect(invalid.selectedOriginalCandidates).toBe(0)
    expect(invalid.mergedAiringsWithXmltvPreview).toBe(0)
    const expired = await runXmltvG2jPrivateIntegrationPreview([
      entry('freeepg', null, generation('freeepg')),
    ], { now: NOW + 37 * HOUR, localCandidatesFor: catalog })
    expect(expired.selectedOriginalCandidates).toBe(0)
  })

  it('cannot use a duplicate timestamp as a previous source generation', async () => {
    const summary = await runXmltvG2jPrivateIntegrationPreview([
      entry('freeepg',
        generation('freeepg', 1, ['zdf']),
        generation('freeepg', 5, ['ard', 'zdf'])),
    ], { now: NOW, localCandidatesFor: catalog })
    expect(summary.selectedOriginalCandidates).toBe(1)
    expect(summary.sources[0]).toMatchObject({
      currentStations: 1, restoredStations: 0,
      selectedCurrent: 1, selectedLastKnownGood: 0,
    })
  })

  it('does not treat an unclassified original programme as a confirmed TMDB title', async () => {
    const summary = await runXmltvG2jPrivateIntegrationPreview([
      entry('epgshare01', generation('epgshare01', 2, ['zdf'], NOW, {
        typed: false,
      })),
    ], { now: NOW, localCandidatesFor: catalog })
    expect(summary.selectedOriginalCandidates).toBe(2)
    expect(summary.locallyMatched).toBe(0)
    expect(summary.locallyUnmatched).toBe(2)
    expect(summary.mergedAiringsWithXmltvPreview).toBe(0)
  })

  it('rejects an over-budget integration before any merged report is produced', async () => {
    await expect(runXmltvG2jPrivateIntegrationPreview([
      entry('epgshare01', generation('epgshare01', 2)),
    ], { now: NOW, localCandidatesFor: catalog, maxCandidates: 1 }))
      .rejects.toThrow(/budget/)
    await expect(runXmltvG2jPrivateIntegrationPreview([
      entry('epgshare01', generation('epgshare01', 2)),
    ], { now: NOW, maxCandidates: 20001, localCandidatesFor: catalog }))
      .rejects.toThrow(/bounded/)
  })
})
