import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { runIsolatedG1eCapturePilot } from
  '../scripts/epg-g1e-isolated-pilot-core.mjs'
import { networkBoundary } from
  '../scripts/epg-g1e-private-original-source-pilot.mjs'

const NOW = Date.parse('2026-11-12T14:30:00.000Z')
const JOYN_GEN = 'joyn-catalog:2026-11-12T14:00:00.000Z'
const WAIPU_GEN = 'waipu:2026-11-12T14:05:00.000Z'
const secretTitle = 'PRIVATE Original EPG: The Man from Toronto'
const joynCapture = {
  status: 'complete', sourceGenerationId: JOYN_GEN,
  counts: { examined: 2, accepted: 1, rejected: 1 },
  approvedEvidence: [{
    sourceId: 'joyn-epg', approved: true, matchStatus: 'matched',
    title: secretTitle, tmdbId: 667739,
    startTime: '2026-11-14T08:00:00.000Z',
    endTime: '2026-11-14T10:00:00.000Z',
  }],
}
const selected = {
  status: 'ready',
  counts: { selected: 1, joynReceipts: 1 },
  gate: { readyForIsolatedReplay: true, measuredProductionSavings: null },
  waipuInputs: [{
    sourceId: 'waipu-epg', sourceGenerationId: WAIPU_GEN,
    candidate: { title: secretTitle, type: 'movie', stationId: 'zdf' },
    matcherInput: { title: secretTitle, type: 'movie' },
  }],
  joynEvidenceCapture: joynCapture,
}
function fixture(overrides = {}) {
  const runJoyn = vi.fn(async options => {
    options.onCompletedEvidence(joynCapture)
    return {
      envelope: { sourceStatus: 'healthy', sourceGenerationId: JOYN_GEN },
      sourceEvidenceCapture: { status: 'complete', counts: joynCapture.counts },
    }
  })
  const runWaipu = vi.fn(async options => {
    options.onCompletedEvidence(
      { status: 'complete' },
      { selectBoundedWaipuReplayInputs: vi.fn(() => selected) },
    )
    return {
      adapterEnvelope: {
        sourceStatus: 'healthy', sourceGenerationId: WAIPU_GEN,
      },
      sourceEvidenceCapture: { status: 'complete' },
    }
  })
  const compareWaipu = vi.fn(async () => ({
    kind: 'g1e-shared-epg-isolated-ab', mode: 'explicit-test-only',
    counts: {
      programs: 1, baselineTmdbHttpRequests: 1,
      indexedTmdbHttpRequests: 0, indexReuses: 1,
      identityMismatches: 0,
    },
    gate: {
      originalMatcherIdentityPreserved: true,
      measuredProductionSavings: null, safeToConsiderFurtherPilot: true,
    },
  }))
  return {
    generateJoyn: runJoyn, generateWaipu: runWaipu,
    compareWaipu, mode: 'capture', now: NOW, ...overrides,
  }
}

describe('G1e secured in-memory original-source pilot orchestration', () => {
  it('capture-only invokes the real-source pipeline interfaces and NEVER the extra A/B TMDB transport', async () => {
    const args = fixture()
    const result = await runIsolatedG1eCapturePilot(args)
    expect(args.generateJoyn).toHaveBeenCalledWith({
      sourceGenerationPrefix: 'joyn-catalog', fullHorizon: true,
      onCompletedEvidence: expect.any(Function),
    })
    expect(args.generateWaipu).toHaveBeenCalledWith({
      onCompletedEvidence: expect.any(Function),
    })
    expect(args.compareWaipu).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      kind: 'g1e-isolated-private-original-source-capture',
      mode: 'capture',
      source: {
        joynOriginalGenerationHealthy: true,
        waipuOriginalGenerationHealthy: true,
        approvedJoynReceipts: 1,
      },
      replay: {
        selectedOriginalWaipuPrograms: 1,
        minimizedJoynReceipts: 1,
        matchedOriginalCrossSourceCandidates: true,
      },
      gate: {
        sourceReceiptsCapturedPrivately: true,
        readyForBoundedWaipuAb: true,
        measuredProductionSavings: null,
      },
    })
    expect(result).not.toHaveProperty('ab')
    const text = JSON.stringify(result)
    expect(text).not.toContain(secretTitle)
    expect(text).not.toContain('667739')
    expect(text).not.toContain('joyn-catalog:')
    expect(text).not.toContain('waipu:')
  })

  it('real A/B mode explicitly calls original matcher comparison once, preserving null production savings', async () => {
    const args = fixture({ mode: 'ab' })
    const report = await runIsolatedG1eCapturePilot(args)
    expect(args.compareWaipu).toHaveBeenCalledOnce()
    expect(args.compareWaipu).toHaveBeenCalledWith(selected)
    expect(report.ab).toMatchObject({
      mode: 'explicit-test-only',
      counts: {
        programs: 1, baselineTmdbHttpRequests: 1,
        indexedTmdbHttpRequests: 0,
      },
      gate: { measuredProductionSavings: null },
    })
    expect(JSON.stringify(report)).not.toContain(secretTitle)
  })

  it('never runs the A/B request without selected original Waipu+Joyn overlap', async () => {
    const args = fixture({ mode: 'ab' })
    const noOverlap = {
      ...selected, status: 'no-cross-source-candidates',
      counts: { selected: 0, joynReceipts: 0 },
      gate: { readyForIsolatedReplay: false },
      waipuInputs: [],
      joynEvidenceCapture: {
        status: 'complete',
        sourceGenerationId: JOYN_GEN,
        counts: { examined: 0, accepted: 0, rejected: 0 },
        approvedEvidence: [],
      },
    }
    args.generateWaipu = vi.fn(async options => {
      options.onCompletedEvidence(
        { status: 'complete' },
        { selectBoundedWaipuReplayInputs: () => noOverlap },
      )
      return {
        adapterEnvelope: {
          sourceStatus: 'healthy', sourceGenerationId: WAIPU_GEN,
        },
        sourceEvidenceCapture: { status: 'complete' },
      }
    })
    const result = await runIsolatedG1eCapturePilot(args)
    expect(result.replay).toMatchObject({
      selectedOriginalWaipuPrograms: 0,
      matchedOriginalCrossSourceCandidates: false,
    })
    expect(args.compareWaipu).not.toHaveBeenCalled()
  })

  it('fails closed if the Joyn callback never runs, double-calls or source generation is stale', async () => {
    const scenarios = [
      async () => ({ envelope: {
        sourceStatus: 'healthy', sourceGenerationId: JOYN_GEN,
      }, sourceEvidenceCapture: { status: 'complete' } }),
      async callback => {
        callback(joynCapture)
        callback(joynCapture)
        return { envelope: {
          sourceStatus: 'healthy', sourceGenerationId: JOYN_GEN,
        }, sourceEvidenceCapture: { status: 'complete' } }
      },
      async callback => {
        callback(joynCapture)
        return { envelope: {
          sourceStatus: 'failed', sourceGenerationId: JOYN_GEN,
        }, sourceEvidenceCapture: { status: 'complete' } }
      },
      async callback => {
        callback(joynCapture)
        return { envelope: {
          sourceStatus: 'healthy',
          sourceGenerationId: 'joyn-catalog:2026-11-10T10:00:00Z',
        }, sourceEvidenceCapture: { status: 'complete' } }
      },
    ]
    for (const scenario of scenarios) {
      const args = fixture()
      args.generateJoyn = vi.fn(options =>
        scenario(options.onCompletedEvidence))
      await expect(runIsolatedG1eCapturePilot(args))
        .rejects.toThrow('G1E_JOYN_ORIGINAL_EVIDENCE_NOT_APPROVED')
      expect(args.generateWaipu).not.toHaveBeenCalled()
      expect(args.compareWaipu).not.toHaveBeenCalled()
    }
  })

  it('fails closed on unapproved Joyn capture, mismatched source generation or fabricated aggregate counts', async () => {
    const invalid = [
      { ...joynCapture, status: 'unavailable' },
      { ...joynCapture, sourceGenerationId: 'joyn-diagnostic:2026-11-12T14:00:00Z' },
      { ...joynCapture, counts: { examined: 2, accepted: 2, rejected: 0 } },
      { ...joynCapture, counts: { examined: 2, accepted: 1, rejected: 0 } },
      { ...joynCapture, approvedEvidence: [{ ...joynCapture.approvedEvidence[0],
        sourceId: 'waipu-epg' }] },
      { ...joynCapture, approvedEvidence: [{ ...joynCapture.approvedEvidence[0],
        approved: false }] },
      { ...joynCapture, approvedEvidence: [] },
    ]
    for (const value of invalid) {
      const args = fixture()
      args.generateJoyn = vi.fn(async opts => {
        opts.onCompletedEvidence(value)
        return { envelope: {
          sourceStatus: 'healthy', sourceGenerationId: JOYN_GEN,
        }, sourceEvidenceCapture: { status: 'complete' } }
      })
      await expect(runIsolatedG1eCapturePilot(args))
        .rejects.toThrow('G1E_JOYN_ORIGINAL_EVIDENCE_NOT_APPROVED')
      expect(args.generateWaipu).not.toHaveBeenCalled()
    }
  })

  it('rejects fabricated Waipu selection and duplicate source callbacks before running live A/B', async () => {
    const changes = [
      { ...selected, status: 'ready', counts: { selected: 2, joynReceipts: 1 } },
      { ...selected, counts: { selected: 1, joynReceipts: 21 } },
      { ...selected, waipuInputs: [{ ...selected.waipuInputs[0],
        sourceGenerationId: 'waipu:2026-11-10T11:00:00Z' }] },
    ]
    for (const change of changes) {
      const args = fixture({ mode: 'ab' })
      args.generateWaipu = vi.fn(async options => {
        options.onCompletedEvidence({ status: 'complete' }, {
          selectBoundedWaipuReplayInputs: () => change,
        })
        return {
          adapterEnvelope: {
            sourceStatus: 'healthy', sourceGenerationId: WAIPU_GEN,
          },
          sourceEvidenceCapture: { status: 'complete' },
        }
      })
      await expect(runIsolatedG1eCapturePilot(args))
        .rejects.toThrow('G1E_WAIPU_ORIGINAL_REPLAY_NOT_APPROVED')
      expect(args.compareWaipu).not.toHaveBeenCalled()
    }
  })

  it('rejects unverified A/B aggregate output and configuration', async () => {
    const bad = fixture({ mode: 'ab' })
    bad.compareWaipu = vi.fn(async () => ({
      kind: 'g1e-shared-epg-isolated-ab', mode: 'explicit-test-only',
      counts: { programs: 2 },
      gate: { measuredProductionSavings: null },
    }))
    await expect(runIsolatedG1eCapturePilot(bad))
      .rejects.toThrow('G1E_ISOLATED_AB_RESULT_NOT_VERIFIED')
    await expect(runIsolatedG1eCapturePilot(fixture({ mode: 'invalid' })))
      .rejects.toThrow(/Invalid isolated/)
  })

  it('blocks non-TMDB and non-Joyn domains, HTTP and a total request cap', async () => {
    const real = vi.fn(async () => ({ ok: true }))
    const bound = networkBoundary(real)
    await bound.fetchImpl('https://api.themoviedb.org/3/search/movie')
    await bound.fetchImpl('https://auth.joyn.de/auth/anonymous')
    expect(bound.count()).toBe(2)
    expect(real).toHaveBeenCalledTimes(2)
    for (const url of ['http://api.joyn.de/graphql',
      'https://evil.invalid/collect', 'file:///etc/passwd',
      'https://api.themoviedb.org.evil.invalid/3/search/movie']) {
      await expect(bound.fetchImpl(url)).rejects.toThrow(
        'G1E_NETWORK_DESTINATION_BLOCKED')
    }
    expect(bound.count()).toBe(2)
  })

  it('CLI does not start ANY source or TMDB request without the exact private opt-in', () => {
    const command = spawnSync(process.execPath, [
      'scripts/epg-g1e-private-original-source-pilot.mjs',
      '--mode', 'capture',
    ], { encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, G1E_PRIVATE_PILOT_CONFIRM: '',
        G1E_PRIVATE_PILOT_ISOLATED: '' } })
    expect(command.status).toBe(1)
    expect(command.stdout).toBe('')
    expect(command.stderr).toMatch(/failed closed/i)
    expect(command.stderr).not.toContain(secretTitle)
  })
})
