import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { countPrivateCacheEntries } from
  '../scripts/epg-g1e-stream-private-cache-count.mjs'
import { inspectPrivateG1eSourceState } from
  '../scripts/epg-g1e-private-checkpoint-readiness.mjs'

async function temporaryCache(action) {
  const dir = await mkdtemp(join(tmpdir(), 'moviehub-g1e-stream-private-'))
  try { return await action(join(dir, 'cache.json')) }
  finally { await rm(dir, { recursive: true, force: true }) }
}
const priv = 'Privater Joyn Originaltitel mit Zeichen: { } [] " \\ \\n äöü 🎬'
function joynCache(kind = 'joyn-match-cache', entries = {
  ['a'.repeat(64)]: {
    checkedAt: '2026-11-11T06:00:00.000Z',
    diagnostic: { sourceTitle: priv, decisions: [
      { movie: 12, originalTitle: 'Nicht veröffentlichen' },
      [true, null, false],
    ] },
  },
  ['b'.repeat(64)]: { checkedAt: '2026-11-12T06:00:00.000Z', value: [
    { title: 'Anderer privater Titel', text: 'escaped \\u0064 and newline\\n' },
  ] },
}) {
  return { kind, schemaVersion: 1, matcherVersion: 5, entries }
}

describe('G1e streaming original PRIVATE Joyn JSON cache read-only counts', () => {
  it('counts direct cache properties across arbitrarily small UTF-8 chunks', async () => {
    await temporaryCache(async path => {
      await writeFile(path, JSON.stringify(joynCache()))
      for (const chunkBytes of [1, 2, 3, 5, 8, 17, 127, 4096]) {
        const result = await countPrivateCacheEntries(path, {
          expectedKind: 'joyn-match-cache', chunkBytes,
        })
        expect(result).toEqual({
          kind: 'joyn-match-cache', schemaVersion: 1, entries: 2,
          streamed: true,
        })
        const output = JSON.stringify(result)
        for (const forbidden of [priv, 'Nicht veröffentlichen',
          'Anderer privater Titel', 'a'.repeat(64)]) {
          expect(output).not.toContain(forbidden)
        }
      }
    })
  })

  it('counts the other response-cache format without parsing source decisions', async () => {
    await temporaryCache(async path => {
      await writeFile(path, JSON.stringify(joynCache('joyn-lookup-cache', {
        x: { value: [{ tmdbId: 999, title: priv }] },
        y: { value: [], checkedAt: '2026-11-11T12:00:00.000Z' },
        z: { value: 'not-a-source-receipt' },
      })))
      expect(await countPrivateCacheEntries(path, {
        expectedKind: 'joyn-lookup-cache', chunkBytes: 7,
      })).toMatchObject({ entries: 3, streamed: true })
      await expect(countPrivateCacheEntries(path, {
        expectedKind: 'joyn-match-cache', chunkBytes: 7,
      })).rejects.toThrow(/Invalid or unbounded private cache/)
    })
  })

  it('correctly handles empty caches, arbitrary JSON key order and escaped strings', async () => {
    await temporaryCache(async path => {
      await writeFile(path, '{"entries":{}, "schemaVersion":1,"kind":"joyn-match-cache","matcherVersion":5}')
      expect((await countPrivateCacheEntries(path, {
        expectedKind: 'joyn-match-cache', chunkBytes: 1,
      })).entries).toBe(0)
      const escaped = {
        schemaVersion: 1, kind: 'joyn-match-cache',
        entries: {
          ['encoded"key']: {
            description: 'abc\\} and " {',
            list: [{}, [], [{ a: 1 }]],
          },
        },
      }
      await writeFile(path, JSON.stringify(escaped))
      expect((await countPrivateCacheEntries(path, {
        expectedKind: 'joyn-match-cache', chunkBytes: 2,
      })).entries).toBe(1)
    })
  })

  it('rejects corrupt, truncated, unknown, duplicate or masquerading cache JSON', async () => {
    const invalid = [
      '', '[]',
      '{"kind":"joyn-match-cache","schemaVersion":1,"entries":[]}',
      '{"kind":"joyn-match-cache","schemaVersion":1,"entries":{"x":{}}',
      '{"kind":"joyn-match-cache","schemaVersion":1,"entries":{"x":1,}}',
      '{"kind":"joyn-match-cache","schemaVersion":1,"entries":{"x":garbage}}',
      '{"kind":"joyn-match-cache","schemaVersion":1,"entries":{}}garbage',
      '{"kind":"joyn-match-cache","schemaVersion":2,"entries":{}}',
      '{"kind":"joyn-match-cache","schemaVersion":1,"entries":{},"entries":{}}',
      '{"kind":"joyn-match-cache","schemaVersion":1,"entries":{},"kind":"joyn-match-cache"}',
      String.raw`{"kind":"joyn-match-cache","schemaVersion":1,"entries":{"bad":"\u0x00"}}`,
    ]
    await temporaryCache(async path => {
      for (const content of invalid) {
        await writeFile(path, content)
        await expect(countPrivateCacheEntries(path, {
          expectedKind: 'joyn-match-cache', chunkBytes: 2,
        })).rejects.toThrow()
      }
      await writeFile(path, JSON.stringify(joynCache()))
      await expect(countPrivateCacheEntries(path, {
        expectedKind: 'joyn-match-cache', maxBytes: 10,
      })).rejects.toThrow(/bounded/)
    })
  })

  it('returns no evidence when a cache file is absent and never infers a new matcher approval', async () => {
    await temporaryCache(async path => {
      expect(await countPrivateCacheEntries(path, {
        expectedKind: 'joyn-match-cache',
      })).toBeNull()
      const result = inspectPrivateG1eSourceState({
        waipuCheckpoint: {
          kind: 'waipu-sync-checkpoint', schemaVersion: 1,
          updatedAt: '2026-11-12T06:00:00.000Z',
          slots: { first: {} },
        },
        joynCheckpoint: {
          kind: 'joyn-sync-checkpoint', schemaVersion: 1,
          windows: { first: {} },
        },
        waipuDecisions: { kind: 'waipu-tmdb-match-decisions',
          schemaVersion: 1, decisions: { a: {} } },
        joynMatchStream: { kind: 'joyn-match-cache', schemaVersion: 1,
          entries: 217000, streamed: true },
        joynLookupStream: { kind: 'joyn-lookup-cache', schemaVersion: 1,
          entries: 156000, streamed: true },
        oversizedMatcherCacheFiles: 2,
        waipuStatus: { status: 'complete' },
        joynStatus: { status: 'complete' },
        waipuGridSamples: [{ kind: 'grid', value: [{ id: 'waipu-1', title: priv }] }],
        joynWindowSamples: [{ items: [{ program: { id: 'joyn-1', title: priv } }] }],
        now: Date.parse('2026-11-12T10:00:00Z'),
      })
      expect(result.joyn).toMatchObject({
        originalMatcherCacheEntries: 217000, tmdbResponseCacheEntries: 156000,
      })
      expect(result.auditLimits).toMatchObject({
        streamedJoynMatchCache: true, streamedJoynResponseCache: true,
        oversizedMatcherCacheFiles: 2,
      })
      expect(result.gate).toMatchObject({
        originalCachesPresent: true,
        originalCachesFullyLoadableWithinAuditLimit: false,
        fullMatchApprovalReceiptsAvailable: false,
        canRunUnmodifiedOriginalMatcherAb: false,
        actualAvoidedTmdbRequests: null,
        missing: expect.arrayContaining([
          'matcher_cache_files_above_safe_read_limit',
          'fresh_explicit_original_matcher_approval_receipts',
        ]),
      })
      expect(JSON.stringify(result)).not.toContain(priv)
    })
  })
})
