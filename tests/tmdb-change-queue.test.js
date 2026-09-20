import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acknowledgeTmdbChangeConsumer,
  buildTmdbChangeWindows,
  collectTmdbChangeQueue,
  commitTmdbChangeQueue,
  fetchTmdbChangedIds,
  isTmdbTitleChangePending,
  mergeTmdbPendingChanges,
  tmdbChangedTitleKeys,
  tmdbChangedTitleTimes,
  verifyTmdbChangeConsumers,
} from '../scripts/tmdb-change-queue.mjs'

const directories = []
async function temporaryDirectory() {
  const directory = await mkdtemp(resolve(tmpdir(), 'movie-hub-tmdb-changes-'))
  directories.push(directory)
  return directory
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('TMDB change queue', () => {
  it('splits missed periods into inclusive windows of at most 14 days', () => {
    expect(buildTmdbChangeWindows({
      throughDate: '2026-08-20',
      endDate: '2026-09-20',
      overlapDays: 1,
    })).toEqual([
      { startDate: '2026-08-19', endDate: '2026-09-01' },
      { startDate: '2026-09-02', endDate: '2026-09-15' },
      { startDate: '2026-09-16', endDate: '2026-09-20' },
    ])
  })

  it('loads every result page and deduplicates ids', async () => {
    const pages = []
    const ids = await fetchTmdbChangedIds({
      token: 'token',
      type: 'movie',
      window: { startDate: '2026-09-19', endDate: '2026-09-20' },
      fetchImpl: async (url) => {
        const page = Number(new URL(url).searchParams.get('page'))
        pages.push(page)
        return new Response(JSON.stringify({
          page,
          total_pages: 2,
          results: page === 1 ? [{ id: 11 }, { id: 12 }] : [{ id: 12 }, { id: 13 }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })
    expect(pages).toEqual([1, 2])
    expect(ids).toEqual([11, 12, 13])
  })

  it('keeps recent pending ids and removes expired ones', () => {
    const pending = mergeTmdbPendingChanges({
      throughDate: '2026-09-19',
      pending: {
        movie: [
          { id: 1, lastSeen: '2026-09-19T00:00:00.000Z' },
          { id: 2, lastSeen: '2026-07-01T00:00:00.000Z' },
        ],
        series: [],
      },
    }, { movie: [3], series: [4] }, { now: new Date('2026-09-20T03:17:00.000Z') })

    expect(pending.movie.map(({ id }) => id)).toEqual([1, 3])
    expect(tmdbChangedTitleKeys({ pending })).toEqual(new Set(['movie:1', 'movie:3', 'series:4']))
  })

  it('treats a persisted change as consumed once metadata is at least as new', () => {
    const changes = tmdbChangedTitleTimes({
      pending: {
        movie: [{ id: 11, lastSeen: '2026-09-20T03:17:00.000Z' }],
        series: [{ id: 22, lastSeen: '2026-09-20T03:18:00.000Z' }],
      },
    })

    expect(changes).toEqual(new Map([
      ['movie:11', '2026-09-20T03:17:00.000Z'],
      ['series:22', '2026-09-20T03:18:00.000Z'],
    ]))
    expect(isTmdbTitleChangePending(changes, 'movie:11', '2026-09-20T03:16:59.999Z')).toBe(true)
    expect(isTmdbTitleChangePending(changes, 'movie:11', '2026-09-20T03:17:00.000Z')).toBe(false)
    expect(isTmdbTitleChangePending(changes, 'movie:11', '2026-09-20T03:20:00.000Z')).toBe(false)
    expect(isTmdbTitleChangePending(changes, 'series:22', null)).toBe(true)
    expect(isTmdbTitleChangePending(new Set(['movie:11']), 'movie:11', '2026-09-21T00:00:00.000Z')).toBe(true)
  })

  it('commits a staged checkpoint only after every required consumer acknowledged it', async () => {
    const directory = await temporaryDirectory()
    await writeFile(resolve(directory, 'state.json'), JSON.stringify({
      kind: 'tmdb-change-state',
      version: 1,
      throughDate: '2026-09-19',
      pending: { movie: [], series: [] },
    }))
    const changeSet = await collectTmdbChangeQueue({
      token: 'token',
      now: new Date('2026-09-20T03:17:00.000Z'),
      directory,
      requiredConsumers: ['catalog', 'publication'],
      fetchImpl: async (url) => {
        const type = new URL(url).pathname.includes('/tv/') ? 'series' : 'movie'
        return new Response(JSON.stringify({
          page: 1,
          total_pages: 1,
          results: [{ id: type === 'movie' ? 21 : 22 }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })

    expect(changeSet.pending.movie[0].id).toBe(21)
    expect(JSON.parse(await readFile(resolve(directory, 'state.json'), 'utf8')).throughDate).toBe('2026-09-19')
    expect(JSON.parse(await readFile(resolve(directory, 'state.next.json'), 'utf8')).throughDate).toBe('2026-09-20')

    await acknowledgeTmdbChangeConsumer({ consumer: 'catalog', directory })
    await expect(verifyTmdbChangeConsumers({ directory, excludedConsumers: ['publication'] }))
      .resolves.toMatchObject({ generationId: '2026-09-20T03:17:00.000Z' })
    await expect(verifyTmdbChangeConsumers({ directory })).rejects.toThrow('publication')
    await expect(commitTmdbChangeQueue({ directory })).rejects.toThrow('publication')
    expect(JSON.parse(await readFile(resolve(directory, 'state.json'), 'utf8')).throughDate).toBe('2026-09-19')

    await acknowledgeTmdbChangeConsumer({ consumer: 'publication', directory })
    await commitTmdbChangeQueue({ directory })
    expect(JSON.parse(await readFile(resolve(directory, 'state.json'), 'utf8')).throughDate).toBe('2026-09-20')
    await expect(readFile(resolve(directory, 'state.next.json'), 'utf8')).rejects.toThrow()
    await expect(readFile(resolve(directory, 'run.json'), 'utf8')).rejects.toThrow()
    expect(JSON.parse(await readFile(resolve(directory, 'last-run.json'), 'utf8'))).toMatchObject({
      status: 'committed',
      acknowledgements: {
        catalog: { acknowledgedAt: expect.any(String) },
        publication: { acknowledgedAt: expect.any(String) },
      },
    })
  })

  it('rejects acknowledgements from consumers outside the staged contract', async () => {
    const directory = await temporaryDirectory()
    await collectTmdbChangeQueue({
      token: 'token',
      now: new Date('2026-09-20T03:17:00.000Z'),
      directory,
      requiredConsumers: ['catalog'],
      fetchImpl: async () => new Response(JSON.stringify({ page: 1, total_pages: 1, results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    })

    await expect(acknowledgeTmdbChangeConsumer({ consumer: 'unknown', directory }))
      .rejects.toThrow('Unknown TMDB change consumer')
  })
})
