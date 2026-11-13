import { describe, expect, it } from 'vitest'
import {
  reconcilePrivateG1iPreflight, isSafeReconciledPrivateG1iReport,
} from '../scripts/epg-g1i-reconcile-private-preflight.mjs'

function source() {
  return {
    kind: 'g1e-private-checkpoint-readiness', schemaVersion: 1,
    mode: 'private-read-only',
    waipu: {
      syncComplete: true, checkpointSlots: 19152, statusAgeHours: 11.5,
      programmesWithOriginalTitle: 84, originalMatcherCacheEntries: 27876,
    },
    joyn: {
      syncComplete: true, checkpointWindows: 56, statusAgeHours: 10.5,
      programmesWithOriginalTitle: 14332, originalMatcherCacheEntries: 64990,
      tmdbResponseCacheEntries: 24351,
    },
    auditLimits: {
      oversizedWaipuSampleFiles: 0, oversizedJoynSampleFiles: 0,
      oversizedMatcherCacheFiles: 1, streamedJoynMatchCache: true,
      streamedJoynResponseCache: false, failedCacheStreamCounts: 0,
    },
    gate: {
      g1iPrivateCapturePreflightSuitable: false,
      g1iLiveSourceRequestApproval: false,
      g1iActualSharedCacheSnapshotObserved: false,
      originalCachesFullyLoadableWithinAuditLimit: false,
      recentHealthyOriginalSourceStatuses: true,
      existingPrivateSourceDataAccessible: true,
      originalCachesPresent: true,
      fullMatchApprovalReceiptsAvailable: false,
      canRunUnmodifiedOriginalMatcherAb: false,
      actualAvoidedTmdbRequests: null,
      missing: [
        'matcher_cache_files_above_safe_read_limit',
        'fresh_explicit_original_matcher_approval_receipts',
      ],
    },
    privateOriginalProgramme: 'SHOULD_NOT_PROPAGATE_TO_REPORT',
  }
}
function reader() {
  return {
    kind: 'g1i-private-joyn-original-cache-reader', schemaVersion: 1,
    mode: 'private-read-only',
    matcher: { status: 'loaded', count: 64990, sizeMiB: 213.8 },
    responses: { status: 'loaded', count: 24351, sizeMiB: 81.5 },
    gate: {
      bothOriginalReadersLoadable: true,
      sourceFreshnessSeparatelyRequired: true,
      originalMatcherReceiptsApproved: false,
      liveSourceRequestApproved: false,
      sharedTmdbCacheReadsApproved: false,
      measuredProductionSavings: null,
    },
  }
}
const run = (sourceReport = source(), originalReader = reader()) =>
  reconcilePrivateG1iPreflight({ source: sourceReport, originalReader })

describe('#336 G1l – reconcile independent real private reader and source audits', () => {
  it('resolves EXACTLY the proven original Joyn file-size-only gate, not a live go', () => {
    const report = run()
    expect(report).toMatchObject({
      kind: 'g1i-private-reconciled-preflight', mode: 'private-read-only',
      counts: {
        waipuMatcherEntries: 27876, joynMatcherEntries: 64990,
        joynSearchResponseEntries: 24351,
      },
      gate: {
        recentHealthySourceCheckpoints: true,
        originalJoynCacheReadersLoadable: true,
        originalCacheEntryCountsAgree: true,
        historicalAuditSizeLimitOnly: true,
        readyForIsolatedStagingDesignReview: true,
        liveSourceRequestsApproved: false,
        sourceMatcherApprovalsPresent: false,
        sharedTmdbResponseReadsApproved: false,
        xmltvPublicationApproved: false,
        measuredProductionSavings: null,
      },
      reasons: [],
    })
    expect(isSafeReconciledPrivateG1iReport(report)).toBe(true)
    for (const secret of [
      'SHOULD_NOT_PROPAGATE_TO_REPORT', 'programme-id', 'tmdbId',
      'PRIVATE_TOKEN', 'sourceGenerationId',
    ]) expect(JSON.stringify(report)).not.toContain(secret)
  })

  it('fails closed on a stale source despite independently loadable caches', () => {
    const stale = source()
    stale.waipu.statusAgeHours = 49
    stale.gate.recentHealthyOriginalSourceStatuses = false
    stale.gate.existingPrivateSourceDataAccessible = true
    stale.gate.missing = [
      'matcher_cache_files_above_safe_read_limit',
      'fresh_explicit_original_matcher_approval_receipts',
      'recent_waipu_and_joyn_source_statuses',
    ]
    const result = run(stale)
    expect(result.gate.readyForIsolatedStagingDesignReview).toBe(false)
    expect(result.gate.recentHealthySourceCheckpoints).toBe(false)
    expect(result.gate.liveSourceRequestsApproved).toBe(false)
    expect(isSafeReconciledPrivateG1iReport(result)).toBe(true)
  })

  it('refuses a changed or incomplete original cache across the independent reads', () => {
    const original = reader()
    original.matcher.count -= 1
    const result = run(source(), original)
    expect(result.gate.originalCacheEntryCountsAgree).toBe(false)
    expect(result.gate.readyForIsolatedStagingDesignReview).toBe(false)
    expect(result.reasons).toContain('original_cache_entry_counts_disagree')
  })

  it('rejects unknown/unloadable cache statuses even if source audit claims ready', () => {
    const original = reader()
    original.responses = { status: 'too_large', count: null, sizeMiB: null }
    original.gate.bothOriginalReadersLoadable = false
    const result = run(source(), original)
    expect(result.gate.originalJoynCacheReadersLoadable).toBe(false)
    expect(result.gate.readyForIsolatedStagingDesignReview).toBe(false)
  })

  it('never lets a forged original-reader approval through its strict validator', () => {
    const original = reader()
    original.gate.liveSourceRequestApproved = true
    expect(run(source(), original).gate.readyForIsolatedStagingDesignReview).toBe(false)
    original.gate.liveSourceRequestApproved = false
    original.rawProgramTitle = 'LEAK'
    expect(run(source(), original).gate.readyForIsolatedStagingDesignReview).toBe(false)
  })

  it('rejects other oversized files, missing caches or failed reader scans', () => {
    const a = source()
    a.auditLimits.oversizedMatcherCacheFiles = 2 // other, unproven oversize file
    expect(run(a).gate.readyForIsolatedStagingDesignReview).toBe(false)
    const b = source()
    b.auditLimits.failedCacheStreamCounts = 1
    expect(run(b).gate.readyForIsolatedStagingDesignReview).toBe(false)
    const c = source()
    c.gate.missing.push('all_original_matcher_and_response_caches')
    expect(run(c).gate.readyForIsolatedStagingDesignReview).toBe(false)
    const d = source()
    d.auditLimits.oversizedJoynSampleFiles = 1
    expect(run(d).gate.readyForIsolatedStagingDesignReview).toBe(false)
  })

  it('also accepts fully bounded original caches with identical reader counts', () => {
    const s = source()
    s.auditLimits.oversizedMatcherCacheFiles = 0
    s.auditLimits.streamedJoynMatchCache = false
    s.gate.g1iPrivateCapturePreflightSuitable = true
    s.gate.originalCachesFullyLoadableWithinAuditLimit = true
    s.gate.missing = ['fresh_explicit_original_matcher_approval_receipts']
    expect(run(s).gate.readyForIsolatedStagingDesignReview).toBe(true)
  })

  it('enforces complete safe allowlist, fixed no-live-approval and consistency', () => {
    const r = run()
    expect(isSafeReconciledPrivateG1iReport({ ...r, privateTitle: 'X' })).toBe(false)
    expect(isSafeReconciledPrivateG1iReport({
      ...r, gate: { ...r.gate, sharedTmdbResponseReadsApproved: true },
    })).toBe(false)
    expect(isSafeReconciledPrivateG1iReport({
      ...r, gate: { ...r.gate, readyForIsolatedStagingDesignReview: false },
    })).toBe(false)
    expect(isSafeReconciledPrivateG1iReport({
      ...r, counts: { ...r.counts, waipuMatcherEntries: 'SECRET_RAW_PROGRAMME' },
    })).toBe(false)
    expect(isSafeReconciledPrivateG1iReport({
      ...r, reasons: ['unapproved_text_in_output'],
    })).toBe(false)
  })
})
