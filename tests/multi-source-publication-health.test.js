import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluatePublishedData } from '../scripts/validate-publication-health.mjs'
import { verifyPublishedGeneration } from '../scripts/verify-published-data.mjs'
const at = '2026-10-07T04:30:00.000Z'
const now = new Date('2026-10-07T05:00:00Z')
const scheduledAt = '2026-10-06T22:17:00Z'
function generation() {
  const horizon = { start: '2026-10-07T00:00:00Z', endExclusive: '2026-10-21T00:00:00Z' }
  const refs = ['waipu', 'joyn'].map(providerId => ({ providerId, generatedAt: at, sourceGenerationId: `${providerId}:generation`, titleCount: 1 }))
  return [
    { kind: 'movie-hub-data-status', version: 2, generatedAt: at, catalog: { total: 2, movies: 1, series: 1 }, searchIndex: { total: 2, movies: 1, series: 1 }, completeSearchDetails: { total: 2, pending: 0 } },
    { kind: 'waipu-live-index', schemaVersion: 1, status: 'complete', generatedAt: at, sourceGenerationId: 'waipu:generation', horizon, counts: { stations: 228, titles: 1, broadcasts: 1 }, days: [{ key: '2026-10-07', count: 1 }], metadata: { required: true, complete: 1 } },
    { kind: 'joyn-live-index', schemaVersion: 1, status: 'complete', generatedAt: at, sourceGenerationId: 'joyn:generation', stationCount: 127, airingCount: 1, days: [{ key: '2026-10-07', count: 1 }], metadata: { required: true, total: 1, complete: 1 }, import: { status: 'complete', horizon, metrics: { windowsProcessed: 56 }, coverage: Array.from({ length: 127 }, (_, i) => ({ id: String(i), programs: 1, days: ['2026-10-07'] })) } },
    { kind: 'moviehub-live-availability-index', schemaVersion: 1, generatedAt: at, sources: refs, count: 1, entries: [{ key: 'movie:11', providerIds: ['waipu', 'joyn'] }] },
    { kind: 'moviehub-tv-runtime-index', schemaVersion: 1, generatedAt: at, sources: refs, providers: ['waipu', 'joyn'], dayCount: 1, titleCount: 1, airingCount: 1, days: [{ key: '2026-10-07', count: 1, airingCount: 1 }] },
  ]
}
function check(files) { return evaluatePublishedData(files[0], files[1], { scheduledAt, now, requireMultiSource: true, joynIndex: files[2], availabilityIndex: files[3], tvRuntimeIndex: files[4] }) }
describe('independent sources and their actual app publication', () => {
  it('accepts consistent small rolling inventories without demanding yesterday’s larger stock', () => { expect(check(generation()).status).toBe('fresh') })
  it('detects stale Joyn while Waipu and data-status are fresh', () => {
    const files = generation(); files[2].generatedAt = '2026-10-06T06:00:00Z'
    files[3].sources[1].generatedAt = files[2].generatedAt
    expect(check(files).status).toBe('stale')
    expect(check(files).reasons).toContain('Joyn-Index älter als Tageslauf')
  })
  it('rejects short or different import horizons, incomplete Joyn metadata and missing app provider', () => {
    const short = generation(); short[2].import.horizon = { start: '2026-10-07T00:00:00Z', endExclusive: '2026-10-08T00:00:00Z' }
    expect(check(short).reasons).toContain('Joyn-Import deckt keine vollständig geprüften 14 Tage ab')
    const metadata = generation(); metadata[2].metadata.complete = 0
    expect(check(metadata).status).toBe('invalid')
    const missing = generation(); missing[4].providers = ['waipu']
    expect(check(missing).reasons).toContain('TV-App-Daten inkonsistent oder Quelle fehlt')
  })
  it('detects a mixed source generation even when each endpoint is individually fresh', () => {
    const files = generation(); files[3].sources[0].sourceGenerationId = 'waipu:previous'
    expect(check(files).reasons).toContain('waipu: App-Daten und Quellenstand passen nicht zusammen')
  })
  it('rejects runtime duplicate days and wrong bucket totals', () => {
    const files = generation(); files[4].days.push({ ...files[4].days[0] }); files[4].dayCount = 2; files[4].titleCount = 2; files[4].airingCount = 2
    expect(check(files).status).toBe('invalid')
  })
  it('requires the exact generation built for hosting, not just an HTTP 200', async () => {
    const root = await mkdtemp(join(tmpdir(), 'public-generation-'))
    try {
      const paths = ['data-status.json','waipu-live/index.json','joyn-live/index.json','live-availability-index.json','tv-runtime/index.json']
      const files = generation()
      for (let i = 0; i < paths.length; i++) { const path = join(root, paths[i]); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(files[i])) }
      const actual = structuredClone(files); actual[2].generatedAt = '2026-10-07T04:00:00Z'
      await expect(verifyPublishedGeneration({ directory: root, fetchImpl: async url => ({ ok: true, json: async () => actual[paths.indexOf(url.pathname.slice(1))] }) })).rejects.toThrow('Published generation differs from build: joyn-live/index.json')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
