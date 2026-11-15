/** Anonymous same-run readiness report. Never returns source records or titles. */
import { XMLTV_AIR_DEVICE_APPROVALS, createXmltvAirRouteRegistry } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { buildPrivateXmltvAirRuntimePreview } from './xmltv-g3-private-air-runtime-preview.mjs'
import { buildTvRuntimeSnapshot, tvRuntimeTitleKey } from '../src/tv/tvRuntimePublication.js'
import { prepareXmltvCanonicalTitleDemand } from './xmltv-canonical-title-handoff.mjs'

const FIELDS = ['matchedRows','catalogReadyRows','missingCatalogRows','missingCatalogUniqueTitles',
  'androidReadyRows','fireTvConfirmedRows','runtimeReadyRows','deduplicatedRuntimeAirings']
const OVERLAP_FIELDS = ['existingSourceCount','combinedRuntimeAirings','xmltvOnlyRuntimeAirings',
  'sharedRuntimeAirings','existingOnlyRuntimeAirings']
const DEMAND_FIELDS=['approvedUniqueTitles','missingApprovedUniqueTitles','reusableFromCurrentSources','fetchNeededFromCurrentSources']
function isSafeMetadataDemand(value,report){
  return value && typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).sort().join('|')===[...DEMAND_FIELDS].sort().join('|')&&
    DEMAND_FIELDS.every(k=>Number.isSafeInteger(value[k])&&value[k]>=0&&value[k]<=20000)&&
    value.approvedUniqueTitles<=report.androidReadyRows&&value.missingApprovedUniqueTitles<=Math.min(value.approvedUniqueTitles,report.missingCatalogUniqueTitles)&&
    value.reusableFromCurrentSources+value.fetchNeededFromCurrentSources===value.missingApprovedUniqueTitles
}
function isSafeRuntimeOverlap(value, readyRows) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('|') === [...OVERLAP_FIELDS].sort().join('|') &&
    OVERLAP_FIELDS.every(k => Number.isSafeInteger(value[k]) && value[k] >= 0 && value[k] <= 520000) &&
    value.existingSourceCount <= 2 &&
    value.xmltvOnlyRuntimeAirings + value.sharedRuntimeAirings <= readyRows &&
    value.combinedRuntimeAirings === value.xmltvOnlyRuntimeAirings + value.sharedRuntimeAirings + value.existingOnlyRuntimeAirings &&
    (value.existingSourceCount !== 0 || (value.sharedRuntimeAirings === 0 && value.existingOnlyRuntimeAirings === 0))
}
export function isSafePrivateXmltvRuntimeReadiness(report, matchedRows) {
  const hasOverlap = Boolean(report && Object.hasOwn(report,'runtimeOverlap'))
  const hasDemand = Boolean(report && Object.hasOwn(report,'metadataDemand'))
  return report && typeof report === 'object' && !Array.isArray(report) &&
    Object.keys(report).sort().join('|') === [...FIELDS,...(hasOverlap ? ['runtimeOverlap'] : []),...(hasDemand?['metadataDemand']:[])].sort().join('|') &&
    FIELDS.every(k => Number.isSafeInteger(report[k]) && report[k] >= 0 && report[k] <= 20000) &&
    report.matchedRows === matchedRows &&
    report.catalogReadyRows + report.missingCatalogRows === matchedRows &&
    report.missingCatalogUniqueTitles <= report.missingCatalogRows &&
    report.androidReadyRows <= matchedRows && report.fireTvConfirmedRows <= report.androidReadyRows &&
    report.runtimeReadyRows <= Math.min(report.catalogReadyRows, report.androidReadyRows) &&
    report.deduplicatedRuntimeAirings <= report.runtimeReadyRows &&
    (!hasOverlap || isSafeRuntimeOverlap(report.runtimeOverlap,report.runtimeReadyRows)) &&
    (!hasDemand || (hasOverlap && isSafeMetadataDemand(report.metadataDemand,report)))
}

/** Real device receipts are independent of production publication. No
 * synthetic routes, no remote requests, no persistent writes. */
export function summarizePrivateXmltvRuntimeReadiness(confirmedEvents, catalog, { now = Date.now(), existingSources = null } = {}) {
  if (!Array.isArray(confirmedEvents) || confirmedEvents.length > 20000 ||
    !Array.isArray(catalog?.titles) || !Number.isFinite(now) ||
    (existingSources !== null && (!Array.isArray(existingSources) || existingSources.length > 2 ||
      existingSources.some(s => !['waipu','joyn'].includes(s?.providerId) || !Array.isArray(s.entries)) ||
      new Set(existingSources.map(s=>s.providerId)).size !== existingSources.length))) throw new TypeError('Invalid readiness input')
  const available = new Set(catalog.titles.filter(item => item?.source === 'tmdb' && typeof item.title === 'string' && item.title.trim())
    .map(tvRuntimeTitleKey).filter(Boolean))
  // Deliberately independent of the still-closed publish flag, so verified
  // device receipts can be rehearsed privately before release approval.
  const registry = createXmltvAirRouteRegistry({ deviceReceipts: XMLTV_AIR_DEVICE_APPROVALS, now })
  const missing = new Set()
  let catalogReadyRows = 0, androidReadyRows = 0, fireTvConfirmedRows = 0
  for (const event of confirmedEvents) {
    const key = tvRuntimeTitleKey(event.titleRef)
    if (!key) throw new TypeError('Invalid confirmed identity')
    if (available.has(key)) catalogReadyRows++
    else missing.add(key)
    if (registry.fieldsForEvent(event).providerIds.length === 1) {
      androidReadyRows++
      if (registry.verifiedDevices(event.channelId).includes('fire-tv')) fireTvConfirmedRows++
    }
  }
  // Skip the heavier index build until a device-approved route exists.
  const preview = androidReadyRows > 0 ?
    buildPrivateXmltvAirRuntimePreview({ confirmedEvents, catalog, now, fieldsForEvent: registry.fieldsForEvent }) : null
  const report = {
    matchedRows: confirmedEvents.length, catalogReadyRows,
    missingCatalogRows: confirmedEvents.length - catalogReadyRows, missingCatalogUniqueTitles: missing.size,
    androidReadyRows, fireTvConfirmedRows, runtimeReadyRows: preview?.counts.projected ?? 0,
    deduplicatedRuntimeAirings: preview?.tvRuntime.index.airingCount ?? 0,
  }
  if (existingSources !== null) {
    // Use the production runtime merger, not a count subtraction: a broadcast
    // may belong to multiple providers and must retain its independent routes.
    const combined = buildTvRuntimeSnapshot({sourceCatalogs:[...existingSources,...(preview?.sourceCatalogs ?? [])],catalog,now})
    const overlap = {existingSourceCount:existingSources.length,combinedRuntimeAirings:combined.index.airingCount,
      xmltvOnlyRuntimeAirings:0,sharedRuntimeAirings:0,existingOnlyRuntimeAirings:0}
    for(const day of combined.days) for(const title of day.entries) for(const airing of title.airings) {
      const air = airing.providerIds.some(id=>id.startsWith('air-'))
      const existing = airing.providerIds.some(id=>id==='waipu'||id==='joyn')
      if (air && existing) overlap.sharedRuntimeAirings++
      else if (air) overlap.xmltvOnlyRuntimeAirings++
      else if (existing) overlap.existingOnlyRuntimeAirings++
      else throw new TypeError('Unexpected runtime provider')
    }
    report.runtimeOverlap=overlap
    report.metadataDemand=prepareXmltvCanonicalTitleDemand(confirmedEvents,catalog,{now,existingSources})
  }
  if (!isSafePrivateXmltvRuntimeReadiness(report, confirmedEvents.length)) throw new TypeError('Unsafe readiness result')
  return report
}

