/**
 * #336 G1e-2c – an explicit, in-memory, nonpublishing Waipu match receipt
 * collection after a complete healthy adapter generation.
 *
 * Never consume a public TMDB title as the original EPG programme title.
 * Never call a remote API, store a snapshot, change the adapter or publish
 * links. The caller may opt in to inspect receipts in a private dry run.
 */
import { buildWaipuApprovedEpgReceipt } from './epg-g1e-waipu-match-receipt.mjs'

const MAX_CAPTURE_EVENTS = 50_000
// A repeated broadcast row may be harmless; a changed original title,
// episode or source classification at the SAME source+station+slot is not.
// Never choose the first/last winner for reusable cross-adapter evidence.
const ORIGINAL_ROW_FIELDS = [
  'title', 'episodeTitle', 'seriesId', 'seasonNumber', 'episodeNumber',
  'productionYear', 'gridGenre', 'type',
]
const sameOriginalRow = (left, right) => ORIGINAL_ROW_FIELDS.every(field =>
  String(left?.[field] ?? '') === String(right?.[field] ?? ''))

function key(programId, stationId, startAt, endAt) {
  const start = Date.parse(startAt)
  const end = Date.parse(endAt)
  if (!String(programId ?? '').trim() || !String(stationId ?? '').trim() ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return [String(programId).trim(), String(stationId).trim(), start, end].join('\u001f')
}

/**
 * @param {object} input
 * @returns {{status:string, counts:object, approvedEvidence:object[], rejectedReasons:object}}
 *
 * Safe to call on a completed local builder, not as a production pipeline.
 * Entries may contain original EPG titles; never attach them to the published
 * catalog or GitHub Actions artefacts. Only aggregate counts are publishable.
 */
export function collectApprovedWaipuEvidence({
  adapterEnvelope,
  sourceBroadcasts,
  matchesByProgram,
} = {}) {
  if (adapterEnvelope?.sourceStatus !== 'healthy' ||
      !Array.isArray(adapterEnvelope?.records) ||
      !Array.isArray(sourceBroadcasts) ||
      !(matchesByProgram instanceof Map) ||
      adapterEnvelope.records.length > MAX_CAPTURE_EVENTS ||
      sourceBroadcasts.length > MAX_CAPTURE_EVENTS) {
    return {
      status: 'unavailable',
      counts: { examined: 0, accepted: 0, rejected: 0 },
      approvedEvidence: [],
      rejectedReasons: {},
    }
  }
  const sources = new Map()
  const ambiguousSourceKeys = new Set()
  for (const broadcast of sourceBroadcasts) {
    const code = key(broadcast?.programId, broadcast?.stationId,
      broadcast?.startTime, broadcast?.stopTime)
    if (!code || ambiguousSourceKeys.has(code)) continue
    if (sources.has(code)) {
      if (!sameOriginalRow(sources.get(code), broadcast)) {
        // Do not silently overwrite conflicting source metadata, even if a
        // later duplicate happens to equal the first one again.
        ambiguousSourceKeys.add(code)
        sources.delete(code)
      }
      continue
    }
    sources.set(code, broadcast)
  }
  const approvedEvidence = []
  const reasons = Object.create(null)
  const counts = { examined: 0, accepted: 0, rejected: 0 }
  for (const event of adapterEnvelope.records) {
    counts.examined++
    const ref = (Array.isArray(event?.sourceRefs) ? event.sourceRefs : [])
      .find(source => source.sourceId === 'waipu-epg')
    const code = key(ref?.externalId, event?.channelId, event?.startAt, event?.endAt)
    const broadcast = code === null ? null : sources.get(code)
    const approved = broadcast && matchesByProgram.get(broadcast.programId)
    let result
    if (code !== null && ambiguousSourceKeys.has(code)) {
      result = { accepted: false, reason: 'ambiguous_original_grid_duplicate' }
    } else if (!broadcast || !approved) {
      result = { accepted: false, reason: 'missing_original_grid_and_match' }
    } else {
      result = buildWaipuApprovedEpgReceipt({
        sourceBroadcast: broadcast,
        normalizedInput: approved.input,
        matcherDecision: approved.decision,
        broadcastEvent: event,
        sourceStatus: adapterEnvelope.sourceStatus,
      })
    }
    if (result.accepted) {
      counts.accepted++
      approvedEvidence.push(result.evidence)
    } else {
      counts.rejected++
      const reason = result.reason || 'unknown_rejection'
      reasons[reason] = (reasons[reason] || 0) + 1
    }
  }
  return {
    status: 'complete',
    sourceGenerationId: adapterEnvelope.sourceGenerationId,
    counts,
    rejectedReasons: { ...reasons },
    approvedEvidence,
    limitations: 'Optional in-memory matched source receipts only; no actual TMDB network savings measured.',
  }
}
