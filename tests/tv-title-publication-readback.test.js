import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyTvRuntimeTitlePublication } from '../scripts/verify-published-data.mjs'

const generation = '2026-11-06T08:00:00.000Z'
const made = []
afterEach(async () => {
  await Promise.all(made.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'moviehub-title-readback-'))
  made.push(base)
  await mkdir(join(base, 'tv-runtime', 'titles'), { recursive: true })
  const shards = Array.from({ length: 64 }, (_, i) => ({
    kind: 'moviehub-tv-runtime-titles',
    schemaVersion: 1, shard: String(i).padStart(2, '0'),
    generatedAt: generation, count: 0, entries: [],
  }))
  shards[3].entries = [{ type: 'series', tmdbId: 67, airings: [] }]
  shards[3].count = 1
  const index = {
    kind: 'moviehub-tv-runtime-index', generatedAt: generation,
    titleShardCount: 64, titleShardTitleCount: 1,
  }
  await writeFile(join(base, 'tv-runtime', 'index.json'), JSON.stringify(index))
  await Promise.all(shards.map(s => writeFile(join(base, 'tv-runtime', 'titles', s.shard + '.json'), JSON.stringify(s))))
  return { base, index, shards }
}

describe('#708 title shards are actually prepared and published', () => {
  it('verifies all 64 generated shards and their counts without HTTP requests in prepared mode', async () => {
    const { base } = await fixture()
    await expect(verifyTvRuntimeTitlePublication({ directory: base, prepared: true }))
      .resolves.toEqual({ shards: 64, titles: 1 })
  })
  it('reads back representative published JSON shards with exact generation and cache headers', async () => {
    const { base, shards } = await fixture()
    const fetchImpl = vi.fn(async url => {
      const id = String(url.pathname.match(/titles\/(\d{2})\.json/)?.[1])
      return new Response(JSON.stringify(shards[Number(id)]), {
        status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    })
    await expect(verifyTvRuntimeTitlePublication({ directory: base, fetchImpl, origin: 'https://test.example' }))
      .resolves.toEqual({ shards: 64, titles: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(fetchImpl.mock.calls.map(([url]) => url.pathname)).toContain('/tv-runtime/titles/03.json')
  })
  it('rejects missing shards, an altered generation and an incomplete hosted publication', async () => {
    const { base, shards } = await fixture()
    await rm(join(base, 'tv-runtime', 'titles', '04.json'))
    await expect(verifyTvRuntimeTitlePublication({ directory: base, prepared: true }))
      .rejects.toThrow()
    const { base: valid, shards: same } = await fixture()
    const fetchImpl = vi.fn(async url => {
      const id = Number(url.pathname.match(/titles\/(\d{2})\.json/)?.[1])
      return new Response(JSON.stringify(id === 3 ? { ...same[id], generatedAt: '2026-11-07T00:00:00.000Z' } : same[id]), {
        status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    })
    await expect(verifyTvRuntimeTitlePublication({ directory: valid, fetchImpl }))
      .rejects.toThrow('Published generation differs from build')
  })
})
