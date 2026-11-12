/**
 * #336 G1e: PRIVILEGED in-process bridge from real original Joyn receipts
 * to original Waipu inputs and the bounded, optional A/B transport harness.
 *
 * Dependency-injected for *offline* CI tests. The driver (separate file)
 * owns real private-source access, strict network budgets and isolation.
 *
 * No raw source rows, receipt payloads, cache keys, titles or TMDB identities
 * may leave this function. In particular never JSON.stringify the inputs!
 */
const MAX_WAIPU_REPLAY = 20
const MAX_PRIVATE_JOYN_RECEIPTS = 50_000

function validSourceGeneration(value, prefix, now) {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return false
  const timestamp = Date.parse(value.slice(prefix.length))
  return Number.isFinite(timestamp) && timestamp <= now &&
    now - timestamp <= 60 * 60_000
}

function validateJoynCapture(value, now) {
  return value?.status === 'complete' &&
    validSourceGeneration(value.sourceGenerationId, 'joyn-catalog:', now) &&
    Number.isSafeInteger(value.counts?.examined) &&
    Number.isSafeInteger(value.counts?.accepted) &&
    Number.isSafeInteger(value.counts?.rejected) &&
    value.counts.accepted > 0 &&
    value.counts.accepted <= MAX_PRIVATE_JOYN_RECEIPTS &&
    value.counts.rejected >= 0 &&
    value.counts.examined === value.counts.accepted + value.counts.rejected &&
    Array.isArray(value.approvedEvidence) &&
    value.approvedEvidence.length === value.counts.accepted &&
    value.approvedEvidence.every(row =>
      row?.sourceId === 'joyn-epg' && row.approved === true &&
      row.matchStatus === 'matched')
}

function selectedCounts(value) {
  if (!value || typeof value !== 'object') return null
  if (!['ready', 'no-cross-source-candidates'].includes(value.status) ||
      !Array.isArray(value.waipuInputs) ||
      value.waipuInputs.length > MAX_WAIPU_REPLAY ||
      !Number.isSafeInteger(value.counts?.selected) ||
      !Number.isSafeInteger(value.counts?.joynReceipts) ||
      value.counts.selected !== value.waipuInputs.length ||
      value.counts.joynReceipts < 0 ||
      value.counts.joynReceipts > MAX_WAIPU_REPLAY ||
      value.gate?.readyForIsolatedReplay !==
        (value.waipuInputs.length > 0)) return null
  if (value.waipuInputs.length &&
      (value.status !== 'ready' ||
      value.waipuInputs.some(x => x?.sourceId !== 'waipu-epg'))) return null
  if (!value.waipuInputs.length && value.status !== 'no-cross-source-candidates')
    return null
  return {
    selected: value.counts.selected,
    joynReceipts: value.counts.joynReceipts,
  }
}

/**
 * The caller supplies only functions with fresh in-memory original generation
 * access; these callbacks MUST NOT log or publish their private parameters.
 *
 * 'capture' never starts the extra Waipu A/B TMDB transport. 'ab' can call
 * the explicitly provided bounded #780 compare after every original-source
 * gate passes. Both modes still perform the original Joyn matcher generation.
 */
export async function runIsolatedG1eCapturePilot({
  generateJoyn, generateWaipu, compareWaipu,
  now = Date.now(), mode = 'capture',
} = {}) {
  const clock = typeof now === 'function' ? now : () => now
  if (!Number.isFinite(clock()) || !['capture', 'ab'].includes(mode) ||
      typeof generateJoyn !== 'function' ||
      typeof generateWaipu !== 'function' ||
      (mode === 'ab' && typeof compareWaipu !== 'function')) {
    throw new TypeError('Invalid isolated G1e private pilot configuration')
  }

  let privateJoyn = null
  let joynCallbackCount = 0
  const joyn = await generateJoyn({
    sourceGenerationPrefix: 'joyn-catalog',
    fullHorizon: true,
    onCompletedEvidence: capture => {
      joynCallbackCount++
      privateJoyn = capture
    },
  })
  if (joynCallbackCount !== 1 ||
      joyn?.envelope?.sourceStatus !== 'healthy' ||
      joyn?.sourceEvidenceCapture?.status !== 'complete' ||
      !validSourceGeneration(joyn.envelope.sourceGenerationId,
        'joyn-catalog:', clock()) ||
      !validateJoynCapture(privateJoyn, clock()) ||
      privateJoyn.sourceGenerationId !==
        joyn.envelope.sourceGenerationId) {
    throw new Error('G1E_JOYN_ORIGINAL_EVIDENCE_NOT_APPROVED')
  }

  let selection = null
  let waipuCallbackCount = 0
  const waipu = await generateWaipu({
    onCompletedEvidence: (waipuCapture, capabilities) => {
      waipuCallbackCount++
      if (waipuCapture?.status !== 'complete' ||
          typeof capabilities?.selectBoundedWaipuReplayInputs !== 'function') {
        return
      }
      // The actual Joyn matcher may have checked new decisions AFTER the
      // run began; an initial timestamp would falsely mark them 'future'.
      selection = capabilities.selectBoundedWaipuReplayInputs(privateJoyn, {
        now: clock(),
      })
    },
  })
  const counts = selectedCounts(selection)
  if (waipuCallbackCount !== 1 ||
      waipu?.adapterEnvelope?.sourceStatus !== 'healthy' ||
      waipu?.sourceEvidenceCapture?.status !== 'complete' ||
      !validSourceGeneration(waipu.adapterEnvelope.sourceGenerationId,
        'waipu:', clock()) ||
      !counts || selection.waipuInputs.some(input =>
        input.sourceGenerationId !== waipu.adapterEnvelope.sourceGenerationId)) {
    throw new Error('G1E_WAIPU_ORIGINAL_REPLAY_NOT_APPROVED')
  }

  const report = {
    kind: 'g1e-isolated-private-original-source-capture',
    schemaVersion: 1,
    mode,
    source: {
      joynOriginalGenerationHealthy: true,
      waipuOriginalGenerationHealthy: true,
      approvedJoynReceipts: privateJoyn.counts.accepted,
    },
    replay: {
      selectedOriginalWaipuPrograms: counts.selected,
      minimizedJoynReceipts: counts.joynReceipts,
      matchedOriginalCrossSourceCandidates: counts.selected > 0,
    },
    gate: {
      sourceReceiptsCapturedPrivately: true,
      readyForBoundedWaipuAb: counts.selected > 0,
      measuredProductionSavings: null,
    },
  }
  if (mode === 'ab' && counts.selected > 0) {
    // No private original content returned to the caller or printed.
    const ab = await compareWaipu(selection)
    if (ab?.kind !== 'g1e-shared-epg-isolated-ab' ||
        ab.mode !== 'explicit-test-only' ||
        ab.counts?.programs !== counts.selected ||
        ab.gate?.measuredProductionSavings !== null) {
      throw new Error('G1E_ISOLATED_AB_RESULT_NOT_VERIFIED')
    }
    report.ab = {
      counts: { ...ab.counts },
      gate: { ...ab.gate },
      mode: ab.mode,
    }
  }
  return report
}
