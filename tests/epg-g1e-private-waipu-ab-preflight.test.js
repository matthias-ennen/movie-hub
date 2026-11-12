import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { WAIPU_MATCHER_VERSION } from '../scripts/waipu-tmdb-matcher.mjs'
import {
  MAX_WAIPU_AB_CACHE_BYTES, inspectPrivateWaipuAbPreflight,
} from '../scripts/epg-g1e-private-waipu-ab-preflight.mjs'

const NOW = Date.parse('2026-11-12T10:00:00.000Z')
const originals = () => ({
  waipuStatus: {
    schemaVersion: 1, kind: 'waipu-sync-status', status: 'complete',
    generatedAt: '2026-11-12T09:00:00.000Z',
  },
  joynStatus: {
    schemaVersion: 1, kind: 'joyn-sync-status', status: 'complete',
    generatedAt: '2026-11-12T09:20:00.000Z',
  },
  waipuCacheBytes: 800,
  waipuCache: {
    kind: 'waipu-tmdb-match-decisions', schemaVersion: 1,
    matcherVersion: WAIPU_MATCHER_VERSION,
    decisions: {
      'secret:Arrival': { checkedAt: '2026-11-12T09:00:00Z', tmdbId: 329865 },
      'secret:Spiders': { checkedAt: '2026-11-12T09:00:00Z', tmdbId: 654321 },
    },
  },
  now: NOW,
})

describe('G1e read-only PRIVATE bounded Waipu A/B preflight', () => {
  it('identifies a safely loadable original Waipu cache but NEVER allows a real A/B without fresh approved Joyn receipts', () => {
    const report = inspectPrivateWaipuAbPreflight(originals())
    expect(report).toMatchObject({
      kind: 'g1e-private-waipu-ab-preflight',
      mode: 'private-read-only',
      sources: {
        waipuSyncComplete: true, joynSyncComplete: true,
        recentAlignedSourceGenerations: true,
      },
      waipuMatcherCache: {
        exists: true, within24MiBLimit: true,
        validOriginalFormatAndVersion: true,
        originalDecisionEntries: 2, usableForBoundedAb: true,
      },
      gate: {
        readyForPrivateFreshEvidenceCollection: true,
        fullJoynApprovalReceiptsAvailable: false,
        originalWaipuReplayInputsReady: false,
        canRunLiveWaipuAb: false,
        measuredAvoidedTmdbHttpRequests: null,
        missing: [
          'fresh_explicit_joyn_matcher_approval_receipts',
          'verified_original_waipu_replay_inputs',
          'separate_live_tmdb_request_opt_in',
        ],
      },
    })
    const output = JSON.stringify(report)
    for (const privateItem of ['secret:Arrival', 'secret:Spiders',
      '329865', '654321', '2026-11-12T09:00:00Z']) {
      expect(output).not.toContain(privateItem)
    }
  })

  it('reports oversized/missing source cache without loading or claiming readiness', () => {
    const missing = inspectPrivateWaipuAbPreflight({
      ...originals(), waipuCacheBytes: null, waipuCache: null,
    })
    expect(missing.waipuMatcherCache).toMatchObject({
      exists: false, within24MiBLimit: false,
      originalDecisionEntries: null, usableForBoundedAb: false,
    })
    expect(missing.gate.missing).toContain('original_waipu_matcher_cache_file')
    const huge = inspectPrivateWaipuAbPreflight({
      ...originals(), waipuCacheBytes: MAX_WAIPU_AB_CACHE_BYTES + 1,
      waipuCache: null,
    })
    expect(huge.waipuMatcherCache).toMatchObject({
      exists: true, within24MiBLimit: false,
      originalDecisionEntries: null, usableForBoundedAb: false,
    })
    expect(huge.gate.missing)
      .toContain('waipu_cache_exceeds_24_mib_ab_controller_limit')
    expect(huge.gate.readyForPrivateFreshEvidenceCollection).toBe(false)
  })

  it('fails closed for old, future, incomplete or mismatched generations', () => {
    const valid = originals()
    const changed = [
      { waipuStatus: { ...valid.waipuStatus, status: 'failed' } },
      { joynStatus: { ...valid.joynStatus, status: 'running' } },
      { waipuStatus: { ...valid.waipuStatus, generatedAt: '2026-11-10T09:00:00Z' } },
      { joynStatus: { ...valid.joynStatus, generatedAt: '2026-11-12T10:01:00Z' } },
      { joynStatus: { ...valid.joynStatus, generatedAt: '2026-11-11T11:00:00Z' } },
      { waipuStatus: { ...valid.waipuStatus, schemaVersion: 9 } },
      { joynStatus: null },
    ]
    for (const change of changed) {
      const report = inspectPrivateWaipuAbPreflight({ ...valid, ...change })
      expect(report.gate.readyForPrivateFreshEvidenceCollection).toBe(false)
      expect(report.gate.canRunLiveWaipuAb).toBe(false)
      expect(report.gate.measuredAvoidedTmdbHttpRequests).toBeNull()
    }
  })

  it('never accepts incorrect or empty original Waipu matcher caches', () => {
    const valid = originals()
    const invalid = [
      { ...valid.waipuCache, kind: 'other' },
      { ...valid.waipuCache, schemaVersion: 2 },
      { ...valid.waipuCache, matcherVersion: WAIPU_MATCHER_VERSION + 1 },
      { ...valid.waipuCache, decisions: null },
      { ...valid.waipuCache, decisions: [] },
      { ...valid.waipuCache, decisions: {} },
    ]
    for (const waipuCache of invalid) {
      const report = inspectPrivateWaipuAbPreflight({ ...valid, waipuCache })
      expect(report.waipuMatcherCache.usableForBoundedAb).toBe(false)
      expect(report.gate.readyForPrivateFreshEvidenceCollection).toBe(false)
      expect(report.gate.missing).toContain('validated_original_waipu_matcher_cache')
    }
  })

  it('CLI reads only existing private checkpoint files and writes ONLY an aggregate report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moviehub-g1e-private-waipu-ab-'))
    try {
      await mkdir(join(root, 'artifacts/waipu-sync'), { recursive: true })
      await mkdir(join(root, 'artifacts/joyn-sync'), { recursive: true })
      await mkdir(join(root, 'artifacts/waipu-live'), { recursive: true })
      const original = originals()
      const waipuStatus = join(root, 'artifacts/waipu-sync/status.json')
      const joynStatus = join(root, 'artifacts/joyn-sync/status.json')
      const decisions = join(root, 'artifacts/waipu-live/match-decisions.json')
      await writeFile(waipuStatus, JSON.stringify(original.waipuStatus))
      await writeFile(joynStatus, JSON.stringify(original.joynStatus))
      await writeFile(decisions, JSON.stringify(original.waipuCache))
      const previous = await readFile(decisions, 'utf8')
      const output = join(root, 'aggregate/result.json')
      const stdout = execFileSync(process.execPath, [
        resolve('scripts/epg-g1e-private-waipu-ab-preflight.mjs'),
        '--root', root, '--output', output,
      ], { encoding: 'utf8', timeout: 10_000 })
      const report = JSON.parse(await readFile(output, 'utf8'))
      expect(report).toMatchObject({
        kind: 'g1e-private-waipu-ab-preflight',
        waipuMatcherCache: { originalDecisionEntries: 2 },
        gate: { canRunLiveWaipuAb: false },
      })
      expect(stdout).toContain('g1e-private-waipu-ab-preflight')
      expect(stdout).not.toContain('secret:Arrival')
      expect(stdout).not.toContain('329865')
      expect(await readFile(decisions, 'utf8')).toBe(previous)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('will not follow symlinked private cache files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moviehub-g1e-symlink-'))
    try {
      const outside = join(root, 'external-secret.json')
      await writeFile(outside, JSON.stringify(originals().waipuCache))
      await mkdir(join(root, 'artifacts/waipu-sync'), { recursive: true })
      await mkdir(join(root, 'artifacts/joyn-sync'), { recursive: true })
      await mkdir(join(root, 'artifacts/waipu-live'), { recursive: true })
      await writeFile(join(root, 'artifacts/waipu-sync/status.json'),
        JSON.stringify(originals().waipuStatus))
      await writeFile(join(root, 'artifacts/joyn-sync/status.json'),
        JSON.stringify(originals().joynStatus))
      await symlink(outside, join(root, 'artifacts/waipu-live/match-decisions.json'))
      const output = join(root, 'report.json')
      execFileSync(process.execPath, [
        resolve('scripts/epg-g1e-private-waipu-ab-preflight.mjs'),
        '--root', root, '--output', output,
      ], { encoding: 'utf8', timeout: 10_000 })
      const report = JSON.parse(await readFile(output, 'utf8'))
      expect(report.waipuMatcherCache.exists).toBe(false)
      expect(report.gate.canRunLiveWaipuAb).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
