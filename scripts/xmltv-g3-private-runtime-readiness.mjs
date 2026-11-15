/** Anonymous same-run readiness report. Never returns source records or titles. */
import { XMLTV_AIR_DEVICE_APPROVALS, createXmltvAirRouteRegistry } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { buildPrivateXmltvAirRuntimePreview } from './xmltv-g3-private-air-runtime-preview.mjs'
import { tvRuntimeTitleKey } from '../src/tv/tvRuntimePublication.js'

const FIELDS = ['matchedRows','catalogReadyRows','missingCatalogRows','missingCatalogUniqueTitles',
  'androidReadyRows','fireTvConfirmedRows','runtimeReadyRows','deduplicatedRuntimeAirings']
export function isSafePrivateXmltvRuntimeReadiness(report, matchedRows) {
  return report && typeof report === 'object' && !Array.isArray(report) &&
    Object.keys(report).sort().join('|') === [...FIELDS].sort().join('|') &&
    FIELDS.every(k => Number.isSafeInteger(report[k]) && report[k] >= 0 && report[k] <= 20000) &&
    report.matchedRows === matchedRows &&
    report.catalogReadyRows + report.missingCatalogRows === matchedRows &&
    report.missingCatalogUniqueTitles <= report.missingCatalogRows &&
    report.androidReadyRows <= matchedRows && report.fireTvConfirmedRows <= report.androidReadyRows &&
    report.runtimeReadyRows <= Math.min(report.catalogReadyRows, report.androidReadyRows) &&
    report.deduplicatedRuntimeAirings <= report.runtimeReadyRows
}

/** Real device receipts are independent of production publication. No
 * synthetic routes, no remote requests, no persistent writes. */
export function summarizePrivateXmltvRuntimeReadiness(confirmedEvents, catalog, { now = Date.now() } = {}) {
  if (!Array.isArray(confirmedEvents) || confirmedEvents.length > 20000 ||
    !Array.isArray(catalog?.titles) || !Number.isFinite(now)) throw new TypeError('Invalid readiness input')
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
  if (!isSafePrivateXmltvRuntimeReadiness(report, confirmedEvents.length)) throw new TypeError('Unsafe readiness result')
  return report
}
