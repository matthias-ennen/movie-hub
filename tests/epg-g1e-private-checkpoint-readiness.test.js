import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  inspectPrivateG1eSourceState, sampleJsonFiles, readOptionalBoundedJson,
} from '../scripts/epg-g1e-private-checkpoint-readiness.mjs'

const NOW = Date.parse('2026-11-12T11:00:00.000Z')
function input() {
  return {
    waipuCheckpoint: {
      kind: 'waipu-sync-checkpoint', schemaVersion: 1,
      updatedAt: '2026-11-12T06:00:00.000Z',
      slots: { 'zdf_1': { checkedAt: '2026-11-12T06:00:00Z' } },
    },
    joynCheckpoint: {
      kind: 'joyn-sync-checkpoint', schemaVersion: 1,
      windows: { '1762940000_1762950000': { count: 1 } },
    },
    waipuStatus: { status: 'complete' },
    joynStatus: { status: 'complete' },
    waipuDecisions: {
      kind: 'waipu-tmdb-match-decisions',
      schemaVersion: 1,
      decisions: { secretOriginalMatchTitle: { status: 'matched', tmdbId: 777 } },
    },
    joynMatchCache: {
      kind: 'joyn-match-cache', schemaVersion: 1,
      entries: { privateCacheKey: {
        checkedAt: '2026-11-11T06:00:00Z',
        diagnostic: { decision: { status: 'matched' } },
      } },
    },
    joynLookupCache: {
      kind: 'joyn-lookup-cache', schemaVersion: 1,
      entries: { privateTmdbQuery: { value: { title: 'unpublished title' } } },
    },
    waipuGridSamples: [{
      kind: 'grid',
      key: 'hidden-station-ID',
      value: [{ id: 'private-waipu-programme', title: 'Ursprünglicher Waipu-EPG-Titel' }],
    }],
    joynWindowSamples: [{
      items: [{ program: { id: 'private-joyn-programme', title: 'Joyn Quelltitel' },
        livestream: { id: 'hidden-joyn-stream' } }],
    }],
    now: NOW,
  }
}

describe('G1e private SOURCE checkpoint audit without public data leakage', () => {
  it('detects original source titles plus decision/response caches but never claims approved matches', () => {
    const r = inspectPrivateG1eSourceState(input())
    expect(r).toMatchObject({
      kind: 'g1e-private-checkpoint-readiness',
      mode: 'private-read-only',
      waipu: {
        syncComplete: true, checkpointSlots: 1, checkpointAgeDays: 0.2,
        cacheGridRecordsInspected: 1, programmesWithId: 1,
        programmesWithOriginalTitle: 1, originalMatcherCacheEntries: 1,
      },
      joyn: {
        syncComplete: true, checkpointWindows: 1,
        rawWindowsInspected: 1, programmesWithId: 1,
        programmesWithOriginalTitle: 1, originalMatcherCacheEntries: 1,
        tmdbResponseCacheEntries: 1,
      },
      gate: {
        existingPrivateSourceDataAccessible: true,
        originalCachesPresent: true,
        fullMatchApprovalReceiptsAvailable: false,
        canRunUnmodifiedOriginalMatcherAb: false,
        actualAvoidedTmdbRequests: null,
        missing: ['fresh_explicit_original_matcher_approval_receipts'],
      },
    })
    const publicReport = JSON.stringify(r)
    for (const forbidden of [
      'Ursprünglicher Waipu-EPG-Titel', 'Joyn Quelltitel',
      'private-waipu-programme', 'private-joyn-programme',
      'secretOriginalMatchTitle', 'privateTmdbQuery', 'unpublished title',
      'hidden-station-ID', '777', 'privateCacheKey',
    ]) expect(publicReport).not.toContain(forbidden)
  })

  it('does not claim source readiness when syncs and original caches are incomplete', () => {
    const values = input()
    values.joynStatus = { status: 'failed' }
    values.waipuDecisions = null
    values.joynMatchCache = null
    values.joynLookupCache = null
    values.joynWindowSamples = []
    const r = inspectPrivateG1eSourceState(values)
    expect(r.gate).toMatchObject({
      existingPrivateSourceDataAccessible: false,
      originalCachesPresent: false,
      canRunUnmodifiedOriginalMatcherAb: false,
      actualAvoidedTmdbRequests: null,
      missing: expect.arrayContaining([
        'complete_waipu_and_joyn_sync_status',
        'original_raw_epg_title_sample',
        'all_original_matcher_and_response_caches',
        'fresh_explicit_original_matcher_approval_receipts',
      ]),
    })
  })

  it('never fabricates an original EPG title from a TMDB title or match decision', () => {
    const values = input()
    values.waipuGridSamples = [{ kind: 'grid', value: [{
      id: 'source-1', title: '', tmdbTitle: 'The real TMDB title',
    }] }]
    const r = inspectPrivateG1eSourceState(values)
    expect(r.waipu.programmesWithId).toBe(1)
    expect(r.waipu.programmesWithOriginalTitle).toBe(0)
    expect(r.gate.existingPrivateSourceDataAccessible).toBe(false)
    expect(JSON.stringify(r)).not.toContain('The real TMDB title')
  })

  it('rejects corrupt checkpoint schema and excessive source snapshot sizes', () => {
    const missing = input()
    missing.waipuCheckpoint = { ...missing.waipuCheckpoint, slots: null }
    expect(() => inspectPrivateG1eSourceState(missing)).toThrow(/validated private sync checkpoint/)
    const long = input()
    long.waipuGridSamples = new Array(13).fill({})
    expect(() => inspectPrivateG1eSourceState(long)).toThrow(/bounded/)
    const huge = input()
    huge.waipuDecisions.decisions = Object.fromEntries(
      Array.from({ length: 400_001 }, (_, i) => ['k' + i, null]),
    )
    expect(() => inspectPrivateG1eSourceState(huge)).toThrow(/exceeds bounded audit limits/)
  })

  it('reports oversized source sample files without parsing or leaking their content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'g1e-private-safe-sampling-'))
    try {
      await mkdir(join(directory, 'grid'))
      await writeFile(join(directory, 'grid', 'a.json'),
        JSON.stringify({ kind: 'grid', value: [{ id: 'source-id', title: 'Original' }] }))
      await writeFile(join(directory, 'grid', 'b.json'),
        JSON.stringify({ confidentialRawOriginalTitle: 'not in QA report', payload: 'x'.repeat(500) }))
      const sampled = await sampleJsonFiles(join(directory, 'grid'), { maxBytes: 120 })
      expect(sampled).toMatchObject({ oversizedFiles: 1 })
      expect(sampled.records).toHaveLength(1)
      expect(sampled.records[0]).toMatchObject({ kind: 'grid' })
      expect(await readOptionalBoundedJson(join(directory, 'grid', 'b.json'),
        { maxBytes: 120 })).toBeNull()
      expect(await readOptionalBoundedJson(join(directory, 'grid', 'missing.json'),
        { maxBytes: 120 })).toBeNull()
      const state = inspectPrivateG1eSourceState({
        ...input(), waipuGridSamples: sampled.records, oversizedWaipuSampleFiles: 1,
        oversizedMatcherCacheFiles: 1,
      })
      expect(state.auditLimits).toMatchObject({
        oversizedWaipuSampleFiles: 1, oversizedMatcherCacheFiles: 1,
      })
      expect(state.gate.missing).toEqual(expect.arrayContaining([
        'sampled_raw_source_files_above_safe_read_limit',
        'matcher_cache_files_above_safe_read_limit',
      ]))
      expect(JSON.stringify(state)).not.toContain('not in QA report')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not treat downstream matchConfidence as original approval evidence', () => {
    const values = input()
    values.waipuGridSamples[0].value[0].matchConfidence = 1
    values.joynWindowSamples[0].items[0].program.tmdbId = 111
    const r = inspectPrivateG1eSourceState(values)
    expect(r.gate.fullMatchApprovalReceiptsAvailable).toBe(false)
    expect(r.gate.actualAvoidedTmdbRequests).toBeNull()
  })

  it('cannot infer a usable original cache snapshot from incorrect cache kind/version', () => {
    const values = input()
    values.waipuDecisions.schemaVersion = 2
    values.joynMatchCache.kind = 'fake'
    const r = inspectPrivateG1eSourceState(values)
    expect(r.gate.originalCachesPresent).toBe(false)
    expect(r.waipu.originalMatcherCacheEntries).toBeNull()
    expect(r.joyn.originalMatcherCacheEntries).toBeNull()
  })
})
