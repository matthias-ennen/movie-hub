/**
 * MovieHub #336 / G2f: deny-by-default original XMLTV storage/redistribution.
 *
 * Technical accessibility, private same-run staging and a valid LKG checksum
 * never prove a right to persist, copy, index or distribute 3rd-party EPG.
 * The three source policies are CODE-LOCKED and each require independent
 * affirmative evidence/review before a later, separate policy-changing PR.
 *
 * Read-only numeric report. No original source titles, programme identifiers,
 * raw URLs or GCS objects are exposed, read or written by this module.
 */
import { XMLTV_VERIFIED_SOURCE_FAMILIES } from './xmltvSourceReadiness.js'
import { isSafeXmltvG2dReplayReport } from './xmltvPrivateLkgReplay.js'

export const XMLTV_ORIGINAL_RIGHTS_REVIEW = Object.freeze({
  epgshare01: Object.freeze({
    status: 'no-verified-grant', privateDurableStorage: false,
    downstreamRedistribution: false, approvedRetentionHours: 0,
    evidenceCategory: 'public-faq-no-storage-grant',
  }),
  freeepg: Object.freeze({
    status: 'no-verified-grant', privateDurableStorage: false,
    downstreamRedistribution: false, approvedRetentionHours: 0,
    evidenceCategory: 'integration-docs-not-redistribution-grant',
  }),
  'iptv-epg-org': Object.freeze({
    status: 'no-verified-grant', privateDurableStorage: false,
    downstreamRedistribution: false, approvedRetentionHours: 0,
    evidenceCategory: 'public-feed-list-no-storage-grant',
  }),
})
const IDS = Object.keys(XMLTV_VERIFIED_SOURCE_FAMILIES)
const MAX_LKG_AGE_HOURS = 36
const int = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max
const fields = (object, list) =>
  object !== null && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).sort().join('|') === [...list].sort().join('|')

/**
 * No caller-controlled options, source flags or environment variables can
 * create an original-programme storage grant. This intentionally fails shut
 * until an independently approved, source-specific policy is implemented.
 */
export function assertXmltvOriginalRetentionAllowed(sourceId, options = {}) {
  if (!Object.hasOwn(XMLTV_ORIGINAL_RIGHTS_REVIEW, sourceId) ||
      !fields(options, []) ||
      XMLTV_ORIGINAL_RIGHTS_REVIEW[sourceId].privateDurableStorage !== true ||
      XMLTV_ORIGINAL_RIGHTS_REVIEW[sourceId].approvedRetentionHours < 1) {
    throw new TypeError('Unverified original XMLTV durable storage rights')
  }
  // There is deliberately NO successful branch in G2f.
  throw new TypeError('Original XMLTV retention implementation not reviewed')
}

/**
 * Do not equate number of downloaded feeds with independently licensed
 * content families, nor a two-day preview with failed source acceptance.
 */
export function assessXmltvOriginalRetention(g2dReport) {
  if (!isSafeXmltvG2dReplayReport(g2dReport) ||
      g2dReport.sources.length !== IDS.length ||
      IDS.some(id => !g2dReport.sources.some(source => source.sourceId === id))) {
    throw new TypeError('Unverified private XMLTV source report')
  }
  const sources = g2dReport.sources.map(source => {
    const review = XMLTV_ORIGINAL_RIGHTS_REVIEW[source.sourceId]
    const stagedStations = source.currentStations + source.restoredStations
    return {
      sourceId: source.sourceId,
      contentFamily: XMLTV_VERIFIED_SOURCE_FAMILIES[source.sourceId],
      reviewedStationsWithOriginalCoverage: stagedStations,
      status: review.status,
      durableOriginalCheckpointAllowed: false,
      downstreamRedistributionAllowed: false,
      originalRetentionHoursApproved: 0,
      // A source with two to three days is NOT dropped on that basis.
      previewDaysRequiredToKeepSource: 0,
    }
  })
  const report = {
    kind: 'xmltv-g2f-original-rights-preflight-aggregate',
    schemaVersion: 1,
    mode: 'private-original-same-run-no-persist-no-publication',
    sources,
    totalReviewedSources: sources.length,
    sourcesWithFutureCoverage: sources.filter(s =>
      s.reviewedStationsWithOriginalCoverage > 0).length,
    originalSourcesBlockedFromDurableCheckpoint: sources.length,
    maximumLastKnownGoodAgeHours: MAX_LKG_AGE_HOURS,
    maximumPreviewDays: 14,
    fiveDaysRequiredToKeepSource: false,
    originalCloudObjectsCreated: 0,
    originalExternalPublisherWrites: 0,
    durableOriginalCheckpointVerified: false,
    publishApproved: false,
    tmdbIdentityApproved: false,
    playbackRoutesApproved: false,
    reuseRightsApproved: false,
  }
  if (!isSafeXmltvG2fRightsReport(report)) {
    throw new TypeError('Unsafe XMLTV retention preflight report')
  }
  return report
}

export function isSafeXmltvG2fRightsReport(report) {
  if (!fields(report, [
    'kind','schemaVersion','mode','sources','totalReviewedSources',
    'sourcesWithFutureCoverage','originalSourcesBlockedFromDurableCheckpoint',
    'maximumLastKnownGoodAgeHours','maximumPreviewDays',
    'fiveDaysRequiredToKeepSource','originalCloudObjectsCreated',
    'originalExternalPublisherWrites','durableOriginalCheckpointVerified',
    'publishApproved','tmdbIdentityApproved','playbackRoutesApproved',
    'reuseRightsApproved',
  ]) || report.kind !== 'xmltv-g2f-original-rights-preflight-aggregate' ||
      report.schemaVersion !== 1 ||
      report.mode !== 'private-original-same-run-no-persist-no-publication' ||
      report.totalReviewedSources !== IDS.length ||
      report.originalSourcesBlockedFromDurableCheckpoint !== IDS.length ||
      report.maximumLastKnownGoodAgeHours !== MAX_LKG_AGE_HOURS ||
      report.maximumPreviewDays !== 14 ||
      report.fiveDaysRequiredToKeepSource !== false ||
      report.originalCloudObjectsCreated !== 0 ||
      report.originalExternalPublisherWrites !== 0 ||
      report.durableOriginalCheckpointVerified !== false ||
      report.publishApproved !== false ||
      report.tmdbIdentityApproved !== false ||
      report.playbackRoutesApproved !== false ||
      report.reuseRightsApproved !== false ||
      !Array.isArray(report.sources) || report.sources.length !== IDS.length) {
    return false
  }
  const seen = new Set()
  for (const source of report.sources) {
    if (!fields(source, [
      'sourceId','contentFamily','reviewedStationsWithOriginalCoverage',
      'status','durableOriginalCheckpointAllowed',
      'downstreamRedistributionAllowed','originalRetentionHoursApproved',
      'previewDaysRequiredToKeepSource',
    ]) || !IDS.includes(source.sourceId) || seen.has(source.sourceId) ||
        source.contentFamily !== XMLTV_VERIFIED_SOURCE_FAMILIES[source.sourceId] ||
        source.status !== 'no-verified-grant' ||
        !int(source.reviewedStationsWithOriginalCoverage, 6) ||
        source.durableOriginalCheckpointAllowed !== false ||
        source.downstreamRedistributionAllowed !== false ||
        source.originalRetentionHoursApproved !== 0 ||
        source.previewDaysRequiredToKeepSource !== 0) return false
    seen.add(source.sourceId)
  }
  return report.sourcesWithFutureCoverage ===
    report.sources.filter(x => x.reviewedStationsWithOriginalCoverage > 0).length &&
    JSON.stringify(report).length < 1800
}
