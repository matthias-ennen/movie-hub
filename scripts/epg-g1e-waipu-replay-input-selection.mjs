/**
 * #336 G1e – private, in-memory candidate bridge for the isolated Waipu A/B.
 *
 * Invoked ONLY from the opt-in callback of a successfully built Waipu catalog.
 * The original grid title, source programme ID, original matcher input and
 * exact local candidate set are retained in memory, not in the return object
 * of the adapter, files, logs, Firebase, or Nightly artifacts.
 *
 * Pre-approved Joyn matcher receipts are supplied by the same private caller.
 * A single Joyn receipt which independently reproduces a nonconflicting
 * full-index hit is kept; the entire large Joyn cache is never needed here.
 */
import {
  SharedEpgIdentityIndex, SHARED_EPG_MAX_ENTRIES,
} from '../src/sources/sharedEpgIdentityIndex.js'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'

const MAX_EVENTS = 50_000
const MAX_REPLAY = 20
const MAX_LOCAL_CANDIDATES = 200

const clean = x => String(x ?? '').trim()
const plain = x => x && typeof x === 'object' && !Array.isArray(x)
const ORIGINAL_FIELDS = [
  'title', 'episodeTitle', 'seriesId', 'seasonNumber', 'episodeNumber',
  'productionYear', 'gridGenre', 'type',
]

function sourceKey(id, station, start, end) {
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (!clean(id) || !clean(station) || !Number.isFinite(a) ||
      !Number.isFinite(b) || b <= a || b - a > 36 * 3_600_000) return null
  return [clean(id), clean(station), a, b].join('\u001f')
}

function sameOriginal(left, right) {
  return ORIGINAL_FIELDS.every(k => clean(left?.[k]) === clean(right?.[k]))
}

function sameWork(a, b) {
  return a?.type === b?.type && Number(a?.tmdbId) === Number(b?.tmdbId)
}

function originalTitleMatches(input, rawTitle) {
  const original = normalizeWaipuText(rawTitle)
  if (!original) return false
  return [input?.title, input?.originalTitle,
    ...(Array.isArray(input?.aliases) ? input.aliases.slice(0, 20) : [])]
    .some(v => normalizeWaipuText(v) === original)
}

function unavailable() {
  return {
    status: 'unavailable',
    waipuInputs: [], joynEvidenceCapture: null,
    counts: { selected: 0, joynReceipts: 0 },
    gate: { readyForIsolatedReplay: false, measuredProductionSavings: null },
  }
}

/**
 * The return value contains original EPG titles and matching inputs, so is
 * PRIVILEGED and MUST NOT be published, persisted or JSON-logged.
 *
 * Arguments:
 *  adapterEnvelope: original healthy Waipu SourceEnvelope
 *  sourceBroadcasts: ORIGINAL raw Waipu broadcast records from that build
 *  matchesByProgram: Map keyed by original programme ID with {input,decision}
 *  localCandidatesFor: SAME lookup closure used during original Waipu matching
 *  joynEvidenceCapture: full in-memory Opt-in Joyn report, not historical cache
 *
 * Only the selected Joyn positive receipts (<=20), not full Joyn caches, are
 * passed along with <=20 original source inputs to #780's isolated controller.
 */
export function selectBoundedWaipuReplayInputs({
  adapterEnvelope, sourceBroadcasts, matchesByProgram, localCandidatesFor,
  joynEvidenceCapture, now = Date.now(), maxPrograms = MAX_REPLAY,
} = {}) {
  if (adapterEnvelope?.sourceStatus !== 'healthy' ||
      !clean(adapterEnvelope?.sourceGenerationId).startsWith('waipu:') ||
      !Array.isArray(adapterEnvelope?.records) ||
      !Array.isArray(sourceBroadcasts) ||
      adapterEnvelope.records.length > MAX_EVENTS ||
      sourceBroadcasts.length > MAX_EVENTS ||
      !(matchesByProgram instanceof Map) ||
      typeof localCandidatesFor !== 'function' ||
      !plain(joynEvidenceCapture) ||
      joynEvidenceCapture.status !== 'complete' ||
      !clean(joynEvidenceCapture.sourceGenerationId).startsWith('joyn-catalog:') ||
      !Array.isArray(joynEvidenceCapture.approvedEvidence) ||
      !joynEvidenceCapture.approvedEvidence.length ||
      joynEvidenceCapture.approvedEvidence.length > SHARED_EPG_MAX_ENTRIES ||
      !Number.isFinite(now) ||
      !Number.isSafeInteger(maxPrograms) || maxPrograms < 1 ||
      maxPrograms > MAX_REPLAY ||
      !Number.isSafeInteger(joynEvidenceCapture.counts?.accepted) ||
      joynEvidenceCapture.counts.accepted !==
        joynEvidenceCapture.approvedEvidence.length ||
      joynEvidenceCapture.approvedEvidence.some(item =>
        item?.sourceId !== 'joyn-epg' ||
        item?.approved !== true || item?.matchStatus !== 'matched')) {
    return unavailable()
  }
  const index = new SharedEpgIdentityIndex({
    now, records: joynEvidenceCapture.approvedEvidence,
  })
  if (!index.records.length) return unavailable()
  const originalByKey = new Map()
  const ambiguous = new Set()
  for (const raw of sourceBroadcasts) {
    const key = sourceKey(raw?.programId, raw?.stationId,
      raw?.startTime, raw?.stopTime)
    if (!key || ambiguous.has(key)) continue
    if (originalByKey.has(key)) {
      if (!sameOriginal(originalByKey.get(key), raw)) {
        originalByKey.delete(key)
        ambiguous.add(key)
      }
    } else {
      originalByKey.set(key, raw)
    }
  }

  const waipuInputs = []
  const proofByKey = new Map()
  const seen = new Set()
  for (const event of adapterEnvelope.records) {
    if (waipuInputs.length >= maxPrograms) break
    const ref = (Array.isArray(event?.sourceRefs) ? event.sourceRefs : [])
      .find(x => x?.sourceId === 'waipu-epg')
    const key = sourceKey(ref?.externalId, event?.channelId,
      event?.startAt, event?.endAt)
    if (!key || ambiguous.has(key) || seen.has(key)) continue
    seen.add(key)
    const raw = originalByKey.get(key)
    const originalMatch = matchesByProgram.get(clean(ref?.externalId))
    const input = originalMatch?.input
    if (!raw || !plain(input) || !originalTitleMatches(input, raw.title) ||
        !['movie', 'series'].includes(input.type) ||
        event?.titleRef?.mediaType !== input.type ||
        event?.titleRef?.tmdbId !== originalMatch?.decision?.match?.tmdbId ||
        input?.type !== originalMatch?.decision?.match?.type) continue

    const localCandidates = localCandidatesFor(input)
    if (!Array.isArray(localCandidates) ||
        localCandidates.length > MAX_LOCAL_CANDIDATES) continue
    const candidate = {
      stationId: clean(raw.stationId),
      title: clean(raw.title), type: input.type,
      startTime: raw.startTime, endTime: raw.stopTime,
      productionYear: input.productionYear ?? null,
      episode: input.type === 'series' &&
        Number.isSafeInteger(Number(input.seasonNumber)) &&
        Number.isSafeInteger(Number(input.episodeNumber)) &&
        Number(input.seasonNumber) > 0 && Number(input.episodeNumber) > 0
        ? { seasonNumber: Number(input.seasonNumber),
          episodeNumber: Number(input.episodeNumber) } : null,
    }
    const full = index.lookup(candidate)
    if (full.status !== 'hit' || !full.sourceIds?.includes('joyn-epg')) continue

    // Choose the MINIMAL positive Joyn evidence that produces the identical
    // identity and valid scope by itself. This never turns missing/ambiguous
    // source data into inferred cross-adapter matches.
    const proof = joynEvidenceCapture.approvedEvidence.find(item => {
      if (item?.type !== candidate.type ||
          normalizeWaipuText(item?.title) !==
            normalizeWaipuText(candidate.title)) return false
      const single = new SharedEpgIdentityIndex({ now, records: [item] })
        .lookup(candidate)
      return single.status === 'hit' && sameWork(single.identity, full.identity)
    })
    if (!proof) continue
    waipuInputs.push({
      sourceId: 'waipu-epg',
      sourceGenerationId: adapterEnvelope.sourceGenerationId,
      candidate,
      matcherInput: input,
      localCandidates,
    })
    const uniqueProof = [proof.sourceId, proof.stationId, proof.type,
      proof.tmdbId, proof.title, proof.startTime, proof.endTime,
      proof.checkedAt].join('\u001f')
    proofByKey.set(uniqueProof, proof)
  }
  const selectedProofs = [...proofByKey.values()]
  return {
    status: waipuInputs.length ? 'ready' : 'no-cross-source-candidates',
    waipuInputs,
    joynEvidenceCapture: {
      status: 'complete',
      sourceGenerationId: joynEvidenceCapture.sourceGenerationId,
      counts: {
        examined: selectedProofs.length,
        accepted: selectedProofs.length,
        rejected: 0,
      },
      approvedEvidence: selectedProofs,
    },
    counts: {
      selected: waipuInputs.length, joynReceipts: selectedProofs.length,
    },
    gate: {
      readyForIsolatedReplay: waipuInputs.length > 0,
      measuredProductionSavings: null,
    },
  }
}
