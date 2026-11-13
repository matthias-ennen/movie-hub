import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, truncate, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  G1I_ORIGINAL_LOAD_MAX_BYTES,
  inspectOriginalJoynCacheLoad, isSafeG1iOriginalReaderReport,
} from '../scripts/epg-g1i-private-joyn-original-loader.mjs'

const roots = []
const NOW = Date.parse('2026-11-13T17:00:00Z')
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'moviehub-g1i-reader-test-'))
  roots.push(root)
  await mkdir(join(root, 'artifacts/joyn-live'), { recursive: true })
  return root
}
async function file(root, name, data) {
  await writeFile(join(root, 'artifacts/joyn-live', name), JSON.stringify(data))
}
afterEach(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

describe('G1i: original Joyn cache-read feasibility without source/API calls', () => {
  it('loads the actual original Joyn cache-reader classes, never matcher decisions', async () => {
    const root = await setup()
    await file(root, 'match-cache.json', {
      kind: 'joyn-match-cache', schemaVersion: 1, matcherVersion: 'test',
      entries: { secretProgrammeAndTitle: {
        checkedAt: '2026-11-13T16:00:00.000Z',
        diagnostic: { decision: { status: 'matched', match: { tmdbId: 1234, type: 'movie' } } },
      } },
    })
    await file(root, 'lookup-cache.json', {
      kind: 'joyn-lookup-cache', schemaVersion: 1,
      entries: { secretRawHash: { checkedAt: '2026-11-13T16:00:00.000Z',
        value: { results: [{ title: 'PRIVATE_MOVIE_NEVER_REPORT', id: 1234 }] } } },
    })
    const result = await inspectOriginalJoynCacheLoad({ root, now: NOW })
    expect(result).toMatchObject({
      kind: 'g1i-private-joyn-original-cache-reader', schemaVersion: 1,
      mode: 'private-read-only',
      matcher: { status: 'loaded', count: 1 },
      responses: { status: 'loaded', count: 1 },
      gate: {
        bothOriginalReadersLoadable: true,
        sourceFreshnessSeparatelyRequired: true,
        originalMatcherReceiptsApproved: false,
        liveSourceRequestApproved: false,
        sharedTmdbCacheReadsApproved: false,
        measuredProductionSavings: null,
      },
    })
    expect(isSafeG1iOriginalReaderReport(result)).toBe(true)
    const safe = JSON.stringify(result)
    for (const secret of ['PRIVATE_MOVIE_NEVER_REPORT', 'secretProgrammeAndTitle',
      'secretRawHash', '1234', 'joynProgramId']) expect(safe).not.toContain(secret)
  })

  it('fails closed if original matcher cache is missing or has the wrong schema', async () => {
    const root = await setup()
    await file(root, 'lookup-cache.json', {
      kind: 'joyn-lookup-cache', schemaVersion: 1, entries: {},
    })
    const missing = await inspectOriginalJoynCacheLoad({ root, now: NOW })
    expect(missing.matcher.status).toBe('unavailable')
    expect(missing.responses.status).toBe('loaded')
    expect(missing.gate.bothOriginalReadersLoadable).toBe(false)
    await file(root, 'match-cache.json', { kind: 'malicious', schemaVersion: 1, entries: {} })
    const corrupt = await inspectOriginalJoynCacheLoad({ root, now: NOW })
    expect(corrupt.matcher.status).toBe('unavailable')
    expect(corrupt.gate.bothOriginalReadersLoadable).toBe(false)
  })

  it('rejects an oversized sparse file before original JSON.parse is attempted', async () => {
    const root = await setup()
    const path = join(root, 'artifacts/joyn-live/match-cache.json')
    await writeFile(path, '', 'utf8')
    await truncate(path, G1I_ORIGINAL_LOAD_MAX_BYTES + 1)
    await file(root, 'lookup-cache.json', {
      kind: 'joyn-lookup-cache', schemaVersion: 1, entries: {},
    })
    const result = await inspectOriginalJoynCacheLoad({ root, now: NOW })
    expect(result.matcher.status).toBe('too_large')
    expect(result.matcher.count).toBeNull()
    expect(result.gate.bothOriginalReadersLoadable).toBe(false)
  })

  it('never follows a symlink to an unrelated private file', async () => {
    const root = await setup()
    const secretFile = join(root, 'secret.json')
    await writeFile(secretFile, JSON.stringify({ privateToken: 'UNPUBLISHED_SECRET' }))
    await symlink(secretFile, join(root, 'artifacts/joyn-live/match-cache.json'))
    await file(root, 'lookup-cache.json', {
      kind: 'joyn-lookup-cache', schemaVersion: 1, entries: {},
    })
    const result = await inspectOriginalJoynCacheLoad({ root, now: NOW })
    expect(result.matcher.status).toBe('unavailable')
    expect(JSON.stringify(result)).not.toContain('UNPUBLISHED_SECRET')
  })

  it('rejects missing private workspace and invalid clock, without any API fallback', async () => {
    await expect(inspectOriginalJoynCacheLoad({ root: '', now: NOW })).rejects.toThrow()
    await expect(inspectOriginalJoynCacheLoad({ root: '/tmp', now: NaN })).rejects.toThrow()
    const root = await setup()
    const result = await inspectOriginalJoynCacheLoad({ root, now: NOW })
    expect(result.matcher.status).toBe('unavailable')
    expect(result.responses.status).toBe('unavailable')
    expect(result.gate.measuredProductionSavings).toBeNull()
  })
  it('prevents private title/query fields or fabricated approvals in uploaded aggregates', async () => {
    const root = await setup()
    const report = await inspectOriginalJoynCacheLoad({ root, now: NOW })
    expect(isSafeG1iOriginalReaderReport(report)).toBe(true)
    expect(isSafeG1iOriginalReaderReport({
      ...report, privateTitle: 'NEVER_UPLOAD',
    })).toBe(false)
    expect(isSafeG1iOriginalReaderReport({
      ...report,
      matcher: { ...report.matcher, privateFilename: 'NEVER_UPLOAD' },
    })).toBe(false)
    expect(isSafeG1iOriginalReaderReport({
      ...report,
      gate: { ...report.gate, liveSourceRequestApproved: true },
    })).toBe(false)
  })

})
