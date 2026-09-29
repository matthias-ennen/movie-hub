import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  validateJoynLivePublication,
  writeJoynLivePublicationAtomic,
} from '../scripts/joyn-live-publication.mjs'

const created = []

async function tempDirectory() {
  const directory = await mkdtemp(resolve(tmpdir(), 'movie-hub-joyn-'))
  created.push(directory)
  return directory
}

function publication() {
  const generatedAt = '2026-09-29T10:00:00.000Z'
  const airing = {
    id: 'joyn-program-1',
    tmdbId: 123,
    type: 'movie',
    stationId: 'prosieben-de',
    stationName: 'ProSieben',
    programId: 'program-1',
    title: 'Testfilm',
    startTime: '2026-09-29T18:00:00.000Z',
    stopTime: '2026-09-29T20:00:00.000Z',
    playbackRoutes: [],
    sourceRefs: [],
    episode: null,
  }
  return {
    index: {
      schemaVersion: 1,
      kind: 'joyn-live-index',
      status: 'complete',
      generatedAt,
      sourceGenerationId: 'joyn-live:test-generation',
      stationCount: 1,
      airingCount: 1,
      days: [{ key: '2026-09-29', count: 1 }],
      metadata: { required: true, complete: 1 },
    },
    stations: {
      schemaVersion: 1,
      kind: 'joyn-live-stations',
      generatedAt,
      stations: [{ id: 'prosieben-de', name: 'ProSieben' }],
    },
    titles: {
      schemaVersion: 1,
      kind: 'joyn-live-titles',
      generatedAt,
      count: 1,
      entries: [{ key: 'movie:123', tmdbId: 123, type: 'movie', airings: [airing] }],
    },
    days: {
      '2026-09-29': {
        schemaVersion: 1,
        kind: 'joyn-live-day',
        key: '2026-09-29',
        generatedAt,
        airings: [airing],
      },
    },
  }
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Joyn production publication', () => {
  it('validates and atomically replaces the previous live directory', async () => {
    const root = await tempDirectory()
    const target = resolve(root, 'public', 'joyn-live')
    await mkdir(target, { recursive: true })
    await writeFile(resolve(target, 'old-generation.txt'), 'old\n', 'utf8')

    const value = publication()
    expect(validateJoynLivePublication(value)).toMatchObject({ valid: true })

    const result = await writeJoynLivePublicationAtomic(value, target)
    expect(result.valid).toBe(true)
    expect(JSON.parse(await readFile(resolve(target, 'index.json'), 'utf8'))).toMatchObject({
      status: 'complete',
      sourceGenerationId: 'joyn-live:test-generation',
    })
    await expect(readFile(resolve(target, 'old-generation.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects an incomplete generation and preserves the previous live directory', async () => {
    const root = await tempDirectory()
    const target = resolve(root, 'public', 'joyn-live')
    await mkdir(target, { recursive: true })
    await writeFile(resolve(target, 'old-generation.txt'), 'keep-me\n', 'utf8')

    const invalid = publication()
    invalid.titles.entries = []
    invalid.titles.count = 0
    invalid.index.metadata.complete = 0

    await expect(writeJoynLivePublicationAtomic(invalid, target)).rejects.toMatchObject({
      code: 'JOYN_PUBLICATION_INVALID',
    })
    expect(await readFile(resolve(target, 'old-generation.txt'), 'utf8')).toBe('keep-me\n')
  })
})
