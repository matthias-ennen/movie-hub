import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  restoreLiveTmdbData,
  validateLiveCatalog,
  validateLiveSearchIndex,
} from '../scripts/restore-live-tmdb-data.mjs'

const temporaryDirectories = []

async function temporaryDirectory() {
  const directory = await mkdtemp(resolve(tmpdir(), 'movie-hub-tmdb-restore-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function payloads() {
  return {
    '/catalog.json': {
      source: 'tmdb',
      generatedAt: '2026-09-20T03:17:00.000Z',
      titles: [{ id: 'movie-1', tmdbId: 1, type: 'movie' }],
      rowDefinitions: [{ id: 'popular', ids: ['movie-1'] }],
    },
    '/search-index.json': {
      kind: 'search-index',
      generatedAt: '2026-09-20T03:18:00.000Z',
      entries: [{ id: 'movie-1', tmdbId: 1, type: 'movie' }],
    },
  }
}

function fetchFrom(values) {
  return async (url) => {
    const value = values[new URL(url).pathname]
    if (!value) return new Response('missing', { status: 404 })
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
}

describe('live TMDB data restore', () => {
  it('restores catalog and search index only after both passed validation', async () => {
    const outputDirectory = await temporaryDirectory()
    const result = await restoreLiveTmdbData({
      fetchImpl: fetchFrom(payloads()),
      baseUrl: 'https://movie-hub.example',
      outputDirectory,
    })

    expect(result).toMatchObject({ catalogTitles: 1, searchEntries: 1 })
    expect(JSON.parse(await readFile(resolve(outputDirectory, 'catalog.json'), 'utf8')).source).toBe('tmdb')
    expect(JSON.parse(await readFile(resolve(outputDirectory, 'search-index.json'), 'utf8')).kind).toBe('search-index')
  })

  it('keeps existing local files when either remote artifact is invalid', async () => {
    const outputDirectory = await temporaryDirectory()
    await writeFile(resolve(outputDirectory, 'catalog.json'), '{"sentinel":"catalog"}\n', 'utf8')
    await writeFile(resolve(outputDirectory, 'search-index.json'), '{"sentinel":"search"}\n', 'utf8')
    const values = payloads()
    values['/search-index.json'] = { kind: 'search-index', generatedAt: 'invalid', entries: [] }

    await expect(restoreLiveTmdbData({
      fetchImpl: fetchFrom(values),
      baseUrl: 'https://movie-hub.example',
      outputDirectory,
    })).rejects.toThrow('Live search index is not a valid non-empty search index.')

    expect(await readFile(resolve(outputDirectory, 'catalog.json'), 'utf8')).toContain('sentinel')
    expect(await readFile(resolve(outputDirectory, 'search-index.json'), 'utf8')).toContain('sentinel')
  })

  it('rejects placeholders and incomplete live artifacts', () => {
    expect(() => validateLiveCatalog({ source: 'tmdb', titles: [], rowDefinitions: [] })).toThrow()
    expect(() => validateLiveSearchIndex({ kind: 'search-index', entries: [] })).toThrow()
  })
})
