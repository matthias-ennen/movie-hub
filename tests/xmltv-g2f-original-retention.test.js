import { describe, expect, it } from 'vitest'
import { makeSyntheticGeneration } from '../scripts/xmltv-g2e-synthetic-checkpoint.mjs'
import {
  replayXmltvPrivateLkg,
} from '../src/sources/xmltv/xmltvPrivateLkgReplay.js'
import {
  XMLTV_ORIGINAL_RIGHTS_REVIEW, assertXmltvOriginalRetentionAllowed,
  assessXmltvOriginalRetention, isSafeXmltvG2fRightsReport,
} from '../src/sources/xmltv/xmltvOriginalRetentionGate.js'

const NOW = Date.parse('2026-11-13T20:00:00Z')
const HALF_HOUR = 30 * 60_000
const SOURCE_IDS = ['epgshare01', 'freeepg', 'iptv-epg-org']

function replay({ missing = [], now = NOW + HALF_HOUR } = {}) {
  const sources = SOURCE_IDS.map(sourceId => ({
    sourceId,
    current: missing.includes(sourceId) || sourceId === 'epgshare01'
      ? null : makeSyntheticGeneration({ sourceId, now: NOW }),
    lastKnownGood: sourceId === 'epgshare01'
      ? makeSyntheticGeneration({ sourceId, now: NOW }) : null,
  }))
  return replayXmltvPrivateLkg(sources, { now })
}

describe('#336 G2f original rights and retention stop gates', () => {
  it('keeps three real source identities separate and refuses every durable raw checkpoint', () => {
    const report = assessXmltvOriginalRetention(replay())
    expect(isSafeXmltvG2fRightsReport(report)).toBe(true)
    expect(report.totalReviewedSources).toBe(3)
    expect(report.sourcesWithFutureCoverage).toBe(3)
    expect(report.originalSourcesBlockedFromDurableCheckpoint).toBe(3)
    expect(report.originalCloudObjectsCreated).toBe(0)
    expect(report.originalExternalPublisherWrites).toBe(0)
    expect(report.durableOriginalCheckpointVerified).toBe(false)
    expect(report.reuseRightsApproved).toBe(false)
    expect(report.sources.map(source => source.sourceId)).toEqual(SOURCE_IDS)
    expect(report.sources.every(source =>
      source.durableOriginalCheckpointAllowed === false &&
      source.downstreamRedistributionAllowed === false &&
      source.originalRetentionHoursApproved === 0 &&
      source.status === 'no-verified-grant')).toBe(true)
  })

  it('still accepts a short 24-hour programme horizon as a source, without rights bypass', () => {
    const report = assessXmltvOriginalRetention(replay())
    expect(report.sourcesWithFutureCoverage).toBe(3)
    expect(report.fiveDaysRequiredToKeepSource).toBe(false)
    expect(report.sources.every(x => x.previewDaysRequiredToKeepSource === 0)).toBe(true)
    expect(report.maximumPreviewDays).toBe(14)
    expect(report.maximumLastKnownGoodAgeHours).toBe(36)
  })

  it('does not invent permission for an unavailable source or copy its neighbour', () => {
    const report = assessXmltvOriginalRetention(replay({ missing: ['freeepg'] }))
    expect(report.sources.find(x => x.sourceId === 'freeepg')
      .reviewedStationsWithOriginalCoverage).toBe(0)
    expect(report.sourcesWithFutureCoverage).toBe(2)
    expect(report.sources.every(x => !x.durableOriginalCheckpointAllowed)).toBe(true)
  })

  it('ignores unsupported runtime approvals and remains fail-closed', () => {
    for (const sourceId of SOURCE_IDS) {
      expect(() => assertXmltvOriginalRetentionAllowed(sourceId)).toThrow()
      expect(() => assertXmltvOriginalRetentionAllowed(sourceId, {
        publishApproved: true, reuseRightsApproved: true,
      })).toThrow()
    }
    expect(() => assertXmltvOriginalRetentionAllowed('unknown')).toThrow()
    expect(() => assertXmltvOriginalRetentionAllowed('__proto__')).toThrow()
  })

  it('cannot mutate read-only verified source grants through a shared JS object', () => {
    expect(Object.isFrozen(XMLTV_ORIGINAL_RIGHTS_REVIEW)).toBe(true)
    for (const sourceId of SOURCE_IDS) {
      expect(Object.isFrozen(XMLTV_ORIGINAL_RIGHTS_REVIEW[sourceId])).toBe(true)
      expect(XMLTV_ORIGINAL_RIGHTS_REVIEW[sourceId].privateDurableStorage).toBe(false)
      expect(XMLTV_ORIGINAL_RIGHTS_REVIEW[sourceId].downstreamRedistribution).toBe(false)
    }
  })

  it('rejects forged source replay even when it says rights are approved', () => {
    const r = replay()
    r.reuseRightsApproved = true
    expect(() => assessXmltvOriginalRetention(r)).toThrow()
    r.reuseRightsApproved = false
    r.sources[0].currentStations += 1
    expect(() => assessXmltvOriginalRetention(r)).toThrow()
  })

  it('rejects an incomplete list or an attempt to relabel a source as a second family', () => {
    const report = replay()
    report.sources.pop()
    expect(() => assessXmltvOriginalRetention(report)).toThrow()
    const other = replay()
    other.sources[1].contentFamily = 'independent-hacker-family'
    expect(() => assessXmltvOriginalRetention(other)).toThrow()
  })

  it('never permits extra raw titles, URL, object references or grant claims in a published report', () => {
    const report = assessXmltvOriginalRetention(replay())
    for (const [key, value] of Object.entries({
      title: 'UNLICENSED ORIGINAL', url: 'https://original-feed.example',
      rawProgramme: { a: 1 }, object: 'data-checkpoints/v1/joyn',
      licenceApproved: true,
    })) {
      expect(isSafeXmltvG2fRightsReport({ ...report, [key]: value })).toBe(false)
    }
    expect(isSafeXmltvG2fRightsReport({
      ...report, originalCloudObjectsCreated: 1,
    })).toBe(false)
    expect(isSafeXmltvG2fRightsReport({
      ...report, publishApproved: true,
    })).toBe(false)
    expect(JSON.stringify(report)).not.toContain('UNLICENSED ORIGINAL')
  })
})
