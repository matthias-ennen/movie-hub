import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyArchive,
  downloadCheckpoint,
  makeArchive,
  uploadCheckpoint,
} from '../scripts/durable-data-checkpoint.mjs'

const directories = []
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'movie-hub-checkpoint-test-'))
  directories.push(root)
  return root
}

async function put(root, path, data) {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(data))
}

function fakeBucket() {
  const objects = new Map()
  return {
    objects,
    async upload(path, { destination }) {
      objects.set(destination, await readFile(path))
    },
    file(name) {
      return {
        async save(value) { objects.set(name, Buffer.from(value)) },
        async download({ destination } = {}) {
          const bytes = objects.get(name)
          if (!bytes) throw Object.assign(new Error('missing'), { code: 404 })
          if (destination) await writeFile(destination, bytes)
          return [bytes]
        },
      }
    },
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('durable checkpoint', () => {
  it('restores a Waipu checkpoint with the matching cache and curated decisions', async () => {
    const root = await workspace()
    const bucket = fakeBucket()
    await put(root, 'artifacts/waipu-sync/checkpoint.json', {
      kind: 'waipu-sync-checkpoint', schemaVersion: 1, slots: { 'station|slot': {} }, circuit: {},
    })
    await put(root, 'artifacts/waipu-sync/cache/grid/example.json', { kind: 'grid' })
    await put(root, 'artifacts/waipu-live/match-decisions.json', { decisions: [1] })
    const pointer = await uploadCheckpoint({ root, group: 'waipu', bucket })
    await rm(join(root, 'artifacts'), { recursive: true })
    await downloadCheckpoint({ root, group: 'waipu', bucket })
    expect(JSON.parse(await readFile(join(root, 'artifacts/waipu-sync/cache/grid/example.json')))).toEqual({ kind: 'grid' })
    expect(JSON.parse(await readFile(join(root, 'artifacts/waipu-live/match-decisions.json')))).toEqual({ decisions: [1] })
    expect(pointer.size).toBeGreaterThan(0)
  })

  it('keeps local state intact if a remote snapshot fails its checksum', async () => {
    const root = await workspace()
    const bucket = fakeBucket()
    const original = { kind: 'tmdb-change-state', version: 1, pending: { movie: [] } }
    await put(root, 'artifacts/tmdb-data/state.json', original)
    const pointer = await uploadCheckpoint({ root, group: 'tmdb', bucket })
    const corrupt = Buffer.from(bucket.objects.get(pointer.object))
    corrupt[0] ^= 0xff
    bucket.objects.set(pointer.object, corrupt)
    await expect(downloadCheckpoint({ root, group: 'tmdb', bucket })).rejects.toThrow('checksum mismatch')
    expect(JSON.parse(await readFile(join(root, 'artifacts/tmdb-data/state.json')))).toEqual(original)
  })

  it('restores only committed TMDB state and removes stale staged cache files', async () => {
    const root = await workspace()
    const bucket = fakeBucket()
    const committed = { kind: 'tmdb-change-state', version: 1, pending: { movie: [42] } }
    await put(root, 'artifacts/tmdb-data/state.json', committed)
    await uploadCheckpoint({ root, group: 'tmdb', bucket })
    await put(root, 'artifacts/tmdb-data/state.next.json', { generatedAt: 'stale' })
    await put(root, 'artifacts/tmdb-data/state.json', { kind: 'tmdb-change-state', version: 1, pending: {} })
    await downloadCheckpoint({ root, group: 'tmdb', bucket })
    expect(JSON.parse(await readFile(join(root, 'artifacts/tmdb-data/state.json')))).toEqual(committed)
    await expect(readFile(join(root, 'artifacts/tmdb-data/state.next.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a Waipu slot checkpoint without its corresponding cache before replacing files', async () => {
    const root = await workspace()
    await put(root, 'artifacts/waipu-sync/checkpoint.json', {
      kind: 'waipu-sync-checkpoint', schemaVersion: 1, slots: { slot: {} }, circuit: {},
    })
    const value = await makeArchive({ root, group: 'waipu' })
    try {
      await expect(applyArchive({ root, group: 'waipu', archive: value.archive, sha256: value.sha256 }))
        .rejects.toThrow('without their cache')
      expect(JSON.parse(await readFile(join(root, 'artifacts/waipu-sync/checkpoint.json')))).toHaveProperty('slots.slot')
    } finally {
      await rm(value.directory, { recursive: true, force: true })
    }
  })

  it('leaves a valid local cache in place before the first remote backup', async () => {
    const root = await workspace()
    const bucket = fakeBucket()
    await put(root, 'artifacts/tmdb-data/state.json', { kind: 'tmdb-change-state', version: 1, pending: {} })
    expect(await downloadCheckpoint({ root, group: 'tmdb', bucket })).toBeNull()
    expect(JSON.parse(await readFile(join(root, 'artifacts/tmdb-data/state.json')))).toHaveProperty('kind', 'tmdb-change-state')
  })

  it('restores the private snapshot before Waipu is started and saves committed TMDB state', async () => {
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')
    const restore = workflow.indexOf('Restore verified private Waipu checkpoint and cache')
    const sync = workflow.indexOf('Refresh curated 228-station Waipu grid')
    const commit = workflow.indexOf('Commit successful TMDB change checkpoint')
    const upload = workflow.indexOf('Save verified private TMDB checkpoint')
    expect(workflow).toContain('DATA_CHECKPOINT_BUCKET: ${{ vars.MOVIE_HUB_CHECKPOINT_BUCKET }}')
    expect(workflow).toContain('DATA_CHECKPOINT_ENABLED: ${{ vars.MOVIE_HUB_DURABLE_CHECKPOINT_ENABLED }}')
    expect(restore).toBeGreaterThan(0)
    expect(restore).toBeLessThan(sync)
    expect(upload).toBeGreaterThan(commit)
    expect(workflow).toContain("env.DATA_CHECKPOINT_BUCKET != ''")
    expect(workflow).toContain("env.DATA_CHECKPOINT_ENABLED == 'true'")
  })
})
