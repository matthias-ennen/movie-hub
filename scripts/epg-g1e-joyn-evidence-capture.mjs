/**
 * #336 G1e-2c Joyn: bounded, optional in-memory approval collection from an
 * already COMPLETED and healthy SourceAdapter generation.
 *
 * Nothing here calls TMDB, writes files, publishes URLs, or enables the
 * shared index. Original EPG titles never enter the public source catalog.
 */
import { buildJoynApprovedEpgReceipt } from './epg-g1e-joyn-match-receipt.mjs'

const MAX_EVENTS = 125_000
const text = value => String(value ?? '').trim()

function time(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const n = Date.parse(value)
  return Number.isFinite(n) ? n : null
}

function eventKey(programId, stationId, startTime, endTime) {
  const start = time(startTime)
  const end = time(endTime)
  if (!text(programId) || !text(stationId) || start === null || end === null ||
      end <= start || end - start > 36 * 3600_000) return null
  return [text(programId), text(stationId), start, end].join('\u001f')
}

function emptyResult() {
  return {
    status: 'unavailable',
    counts: { examined: 0, accepted: 0, rejected: 0 },
    rejectedReasons: {}, approvedEvidence: [],
  }
}

/**
 * Source entries are the original {candidate,channelId} records used by Joyn,
 * not projections of TMDB metadata. Decisions must be the actual results of
 * the original Joyn matcher, with separate per-program time provenance.
 *
 * @returns {{status:string,counts:object,rejectedReasons:object,approvedEvidence:object[]}}
 */
export function collectApprovedJoynEvidence({
  adapterEnvelope,
  sourceEntries,
  matcherDecisions,
  provenanceByProgram,
} = {}) {
  if (adapterEnvelope?.sourceStatus !== 'healthy' ||
      !text(adapterEnvelope.sourceGenerationId) ||
      !Array.isArray(adapterEnvelope.records) ||
      !Array.isArray(sourceEntries) ||
      !(matcherDecisions instanceof Map) ||
      !(provenanceByProgram instanceof Map) ||
      adapterEnvelope.records.length > MAX_EVENTS ||
      sourceEntries.length > MAX_EVENTS ||
      matcherDecisions.size > MAX_EVENTS ||
      provenanceByProgram.size > MAX_EVENTS) return emptyResult()

  const candidates = new Map()
  for (const entry of sourceEntries) {
    const sourceCandidate = entry?.candidate
    const code = eventKey(sourceCandidate?.joynProgramId,
      entry?.channelId, sourceCandidate?.startTime, sourceCandidate?.endTime)
    if (!code) continue
    // Refuse to choose a random candidate if multiple source rows disagree.
    if (candidates.has(code)) {
      if (text(candidates.get(code)?.title) !== text(sourceCandidate?.title)) {
        candidates.set(code, null)
      }
      continue
    }
    candidates.set(code, sourceCandidate)
  }

  const approvedEvidence = []
  const reasons = Object.create(null)
  const counts = { examined: 0, accepted: 0, rejected: 0 }
  for (const event of adapterEnvelope.records) {
    counts.examined++
    const sourceRef = (Array.isArray(event?.sourceRefs) ? event.sourceRefs : [])
      .find(ref => ref?.sourceId === 'joyn-epg')
    const code = eventKey(sourceRef?.externalId,
      event?.channelId, event?.startAt, event?.endAt)
    const candidate = code ? candidates.get(code) : null
    const programId = text(sourceRef?.externalId)
    const decision = programId && matcherDecisions.get(programId)
    const provenance = programId && provenanceByProgram.get(programId)
    let result
    if (!candidate || !decision || !provenance) {
      result = { accepted: false, reason: 'missing_original_source_match_or_time' }
    } else {
      result = buildJoynApprovedEpgReceipt({
        sourceCandidate: candidate,
        matcherDecision: decision,
        broadcastEvent: event,
        matchCheckedAt: provenance.origin === 'fresh' ? provenance.checkedAt : null,
        cachedMatch: provenance.origin === 'cache' ? provenance.cachedMatch : null,
        sourceStatus: adapterEnvelope.sourceStatus,
      })
    }
    if (result.accepted) {
      counts.accepted++
      approvedEvidence.push(result.evidence)
    } else {
      counts.rejected++
      const reason = result.reason || 'unknown'
      reasons[reason] = (reasons[reason] || 0) + 1
    }
  }
  return {
    status: 'complete',
    sourceGenerationId: adapterEnvelope.sourceGenerationId,
    counts, rejectedReasons: { ...reasons }, approvedEvidence,
    limitations: 'Positive candidate receipts only; not measured TMDB HTTP savings.',
  }
}

/**
 * Optional post-publication dry-run callback. It receives source EPG titles
 * IN MEMORY only; the function result includes aggregate metadata ONLY.
 * Any collector/sink failure leaves Joyn's normal result unaffected.
 */
export async function runOptionalJoynEvidenceCapture(onCompletedEvidence, input) {
  if (typeof onCompletedEvidence !== 'function') return null
  try {
    const report = collectApprovedJoynEvidence(input)
    if (report.status === 'complete') await onCompletedEvidence(report)
    return {
      status: report.status,
      counts: report.counts,
      rejectedReasons: report.rejectedReasons,
    }
  } catch {
    return { status: 'unavailable', counts: null, rejectedReasons: {} }
  }
}
