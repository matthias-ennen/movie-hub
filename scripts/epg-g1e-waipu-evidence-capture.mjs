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
  for (const broadcast of sourceBroadcasts) {
    const code = key(broadcast?.programId, broadcast?.stationId,
      broadcast?.startTime, broadcast?.stopTime)
    if (code) sources.set(code, broadcast)
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
    if (!broadcast || !approved) {
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
