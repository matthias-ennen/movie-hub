import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WaipuEpgCache } from '../scripts/waipu-public-data.mjs'
import { WaipuProgramDetailLoader } from '../scripts/waipu-program-detail-loader.mjs'
import { restoreLiveWaipuCatalog } from '../scripts/restore-live-waipu-catalog.mjs'
import {
  classifyWaipuGridProgram,
  classifyWaipuProgram,
  normalizeWaipuProgram,
} from '../scripts/waipu-program-classifier.mjs'
import {
  WaipuMatchDecisionStore,
  WaipuTmdbSearchClient,
  chooseWaipuTmdbMatch,
  matchWaipuProgram,
} from '../scripts/waipu-tmdb-matcher.mjs'
import {
  buildWaipuLiveCatalog,
  validateWaipuLiveCatalog,
  writeWaipuLiveCatalog,
} from '../scripts/waipu-live-catalog.mjs'
import {
  mergeWaipuLiveAvailability,
  normalizeWaipuLiveTitles,
} from '../src/waipu/waipuLiveCatalog.js'

const cleanupPaths = []

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function gridProgram(overrides = {}) {
  return {
    id: 'program-1',
    title: 'The Man from Toronto',
    genre: 'Filme',
    startTime: '2026-09-20T18:00:00.000Z',
    stopTime: '2026-09-20T20:00:00.000Z',
    ...overrides,
  }
}

function detail(overrides = {}) {
  return {
    id: 'program-1',
    title: 'The Man from Toronto',
    originalTitle: 'The Man from Toronto',
    productionYear: 2022,
    productionCountries: ['Vereinigte Staaten'],
    mainGenre: 'Filme',
    subGenres: ['Action', 'Komödie'],
    seriesId: null,
    seasonNumber: null,
    episodeNumber: null,
    episodeTitle: null,
    imageUrls: [],
    ...overrides,
  }
}

function movieCandidate(overrides = {}) {
  return {
    tmdbId: 667739,
    type: 'movie',
    title: 'The Man from Toronto',
    originalTitle: 'The Man from Toronto',
    year: 2022,
    ...overrides,
  }
}

function buildFixture(overrides = {}) {
  const programs = overrides.programs || [gridProgram()]
  return {
    gridRecords: [{
      kind: 'grid',
      key: 'zdf|2026-09-20T16:00:00.000Z',
      value: programs,
    }],
    stations: [{ id: 'zdf', displayName: 'ZDF', logoTemplateUrl: null }],
    horizon: {
      start: '2026-09-20T00:00:00.000Z',
      endExclusive: '2026-09-21T00:00:00.000Z',
    },
    loadProgramDetail: vi.fn(async () => detail()),
    candidates: [movieCandidate()],
    now: () => Date.parse('2026-09-20T12:00:00.000Z'),
    ...overrides,
  }
}

describe('Waipu film and series classification', () => {
  it('uses the explicit grid genre and confirms it with program details', () => {
    expect(classifyWaipuGridProgram(gridProgram())).toMatchObject({ status: 'candidate', type: 'movie' })
    expect(classifyWaipuProgram(gridProgram(), detail())).toMatchObject({ status: 'accepted', type: 'movie' })

    const seriesGrid = gridProgram({ genre: 'Serien', seriesId: 'series-1', episodeTitle: 'Das Leck' })
    const seriesDetail = detail({
      mainGenre: 'Serien',
      seriesId: 'series-1',
      seasonNumber: 2,
      episodeNumber: 7,
      episodeTitle: 'Das Leck',
    })
    expect(classifyWaipuProgram(seriesGrid, seriesDetail)).toMatchObject({ status: 'accepted', type: 'series' })
  })

  it('does not turn missing season and episode values into zero', () => {
    const classification = classifyWaipuProgram(gridProgram(), detail())
    const normalized = normalizeWaipuProgram(gridProgram(), detail(), classification)
    expect(normalized).toMatchObject({ seasonNumber: null, episodeNumber: null })
  })

  it('keeps unsupported genres and film/series conflicts out of the catalog', () => {
    expect(classifyWaipuGridProgram(gridProgram({ genre: 'Unterhaltung' })))
      .toMatchObject({ status: 'excluded', reason: 'unsupported_grid_genre' })
    expect(classifyWaipuProgram(gridProgram(), detail({
      mainGenre: 'Serien',
      seriesId: 'series-1',
      seasonNumber: 1,
      episodeNumber: 1,
    }))).toMatchObject({ status: 'excluded', reason: 'movie_series_conflict' })
  })
})

describe('Waipu to TMDB matching', () => {
  const input = {
    type: 'movie',
    title: 'Jurassic World: Das gefallene Königreich',
    originalTitle: 'Jurassic World: Fallen Kingdom',
    aliases: ['Jurassic World: Das gefallene Königreich', 'Jurassic World: Fallen Kingdom'],
    productionYear: 2018,
    productionCountries: ['Vereinigte Staaten'],
  }

  it('accepts a strong original-title and year match', () => {
    const result = chooseWaipuTmdbMatch(input, [{
      tmdbId: 351286,
      type: 'movie',
      title: 'Jurassic World: Fallen Kingdom',
      originalTitle: 'Jurassic World: Fallen Kingdom',
      year: 2018,
    }])
    expect(result.status).toBe('matched')
    expect(result.best.candidate.tmdbId).toBe(351286)
    expect(result.best.score).toBeGreaterThanOrEqual(80)
  })

  it('rejects close duplicate candidates when the minimum margin is not met', () => {
    const result = chooseWaipuTmdbMatch(input, [
      { tmdbId: 351286, type: 'movie', title: input.originalTitle, year: 2018 },
      { tmdbId: 999999, type: 'movie', title: input.originalTitle, year: 2018 },
    ])
    expect(result).toMatchObject({ status: 'unmatched', reason: 'ambiguous_margin', margin: 0 })
  })

  it('re-evaluates a local-only negative decision when TMDB search becomes available', async () => {
    const decisions = new WaipuMatchDecisionStore()
    const first = await matchWaipuProgram(input, { decisions })
    expect(first).toMatchObject({ status: 'unmatched', source: 'local' })
    const searchTmdb = vi.fn(async () => [{
      id: 351286,
      media_type: 'movie',
      title: input.originalTitle,
      release_date: '2018-06-06',
    }])
    const second = await matchWaipuProgram(input, { decisions, searchTmdb })
    expect(second).toMatchObject({ status: 'matched', source: 'local+tmdb-search', cache: 'miss' })
    expect(searchTmdb).toHaveBeenCalledOnce()
  })

  it('paces TMDB searches and stops at the configured request budget', async () => {
    let clock = 1_000
    const sleeps = []
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ results: [] }),
    }))
    const client = new WaipuTmdbSearchClient({
      token: 'test-token',
      fetchImpl,
      maxRequests: 2,
      paceMs: 250,
      now: () => clock,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); clock += milliseconds },
    })
    await client.search(input)
    await client.search(input)
    await expect(client.search(input)).rejects.toMatchObject({ code: 'TMDB_REQUEST_BUDGET' })
    expect(sleeps).toEqual([250])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('Waipu live catalog publication', () => {
  it('deduplicates grid rows, loads each detail once and publishes canonical station shards', async () => {
    const first = gridProgram()
    const series = gridProgram({
      id: 'series-program',
      title: 'Mankells Wallander',
      genre: 'Serien',
      seriesId: 'wallander',
      episodeTitle: 'Das Leck',
      startTime: '2026-09-20T20:00:00.000Z',
      stopTime: '2026-09-20T21:30:00.000Z',
    })
    const loadProgramDetail = vi.fn(async (programId) => programId === 'series-program'
      ? detail({
        id: programId,
        title: 'Mankells Wallander',
        originalTitle: 'Wallander',
        productionYear: 2009,
        mainGenre: 'Serien',
        seriesId: 'wallander',
        seasonNumber: 2,
        episodeNumber: 7,
        episodeTitle: 'Das Leck',
      })
      : detail())
    const onProgress = vi.fn()
    const catalog = await buildWaipuLiveCatalog(buildFixture({
      programs: [first, first, series, gridProgram({ id: 'news', title: 'heute', genre: 'Aktuelles' })],
      loadProgramDetail,
      onProgress,
      candidates: [
        movieCandidate(),
        { tmdbId: 7263, type: 'series', title: 'Wallander', originalTitle: 'Wallander', year: 2005 },
      ],
    }))

    expect(validateWaipuLiveCatalog(catalog)).toBe(true)
    expect(loadProgramDetail).toHaveBeenCalledTimes(2)
    expect(catalog.index.counts).toEqual({ stations: 1, titles: 2, broadcasts: 2 })
    expect(catalog.stations.stations[0]).toMatchObject({
      id: 'zdf',
      logoTemplateUrl: null,
      streamQualities: [],
    })
    expect(catalog.index.metrics).toMatchObject({
      broadcastsRead: 4,
      broadcastsInWindow: 3,
      duplicateBroadcastsRemoved: 1,
      gridCandidates: 2,
      candidatePrograms: 2,
    })
    expect(catalog.shards.zdf.airings.map(({ tmdbId }) => tmdbId)).toEqual([667739, 7263])
    expect(catalog.shards.zdf.airings[1]).toMatchObject({
      source: 'waipu',
      programId: 'series-program',
      seriesId: 'wallander',
      seasonNumber: 2,
      episodeNumber: 7,
      episodeTitle: 'Das Leck',
    })
    expect(catalog.titles.entries.find(({ type }) => type === 'series').nextAiring).toMatchObject({
      source: 'waipu',
      programId: 'series-program',
      seriesId: 'wallander',
      stationId: 'zdf',
      seasonNumber: 2,
      episodeNumber: 7,
      episodeTitle: 'Das Leck',
    })
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'programs', processed: 2, total: 2, detailsLoaded: 2, matchedPrograms: 2,
    }))
  })

  it('fails closed when a candidate program detail is missing', async () => {
    await expect(buildWaipuLiveCatalog(buildFixture({
      loadProgramDetail: async () => null,
    }))).rejects.toMatchObject({ code: 'WAIPU_DETAILS_INCOMPLETE' })
  })

  it('excludes a program whose upstream detail is explicitly unavailable', async () => {
    const catalog = await buildWaipuLiveCatalog(buildFixture({
      loadProgramDetail: async () => ({ unavailable: true, status: 410 }),
    }))

    expect(catalog.index.status).toBe('complete')
    expect(catalog.index.counts).toEqual({ stations: 1, titles: 0, broadcasts: 0 })
    expect(catalog.index.metrics).toMatchObject({
      detailsUnavailable: 1,
      detailsMissing: 0,
      classificationRejected: { detail_unavailable: 1 },
    })
  })

  it('keeps every airing in the compact title index and exposes the earliest one', async () => {
    const catalog = await buildWaipuLiveCatalog(buildFixture({
      programs: [
        gridProgram(),
        gridProgram({
          id: 'program-2',
          startTime: '2026-09-20T21:00:00.000Z',
          stopTime: '2026-09-20T23:00:00.000Z',
        }),
      ],
      loadProgramDetail: vi.fn(async (programId) => detail({ id: programId })),
    }))

    expect(catalog.titles.entries).toHaveLength(1)
    expect(catalog.titles.entries[0]).toMatchObject({
      airingCount: 2,
      nextAiring: { startTime: '2026-09-20T18:00:00.000Z' },
    })
    expect(catalog.titles.entries[0].airings.map(({ startTime }) => startTime)).toEqual([
      '2026-09-20T18:00:00.000Z',
      '2026-09-20T21:00:00.000Z',
    ])
    expect(catalog.titles.entries[0].airings.map(({ programId }) => programId)).toEqual([
      'program-1',
      'program-2',
    ])
    expect(catalog.titles.entries[0].airings.every(({ source }) => source === 'waipu')).toBe(true)
  })

  it('requires source identifiers for every newly generated title and station airing', async () => {
    const catalog = await buildWaipuLiveCatalog(buildFixture())
    delete catalog.titles.entries[0].airings[0].programId
    expect(() => validateWaipuLiveCatalog(catalog)).toThrow('Missing waipu title-airing source data')
  })

  it('requires every indexed TV day in a new day-sharded generation', async () => {
    const catalog = await buildWaipuLiveCatalog(buildFixture())
    delete catalog.days[catalog.index.days[0].key]
    expect(() => validateWaipuLiveCatalog(catalog)).toThrow('Invalid waipu-live day shard')
  })

  it('normalizes legacy title airings through the common BroadcastEvent contract without changing the client shape', () => {
    const entries = normalizeWaipuLiveTitles({
      schemaVersion: 1,
      kind: 'waipu-live-titles',
      entries: [{
        tmdbId: 667739,
        type: 'movie',
        title: 'The Man from Toronto',
        airings: [{
          programId: 'program-1',
          stationId: 'zdf',
          stationName: 'ZDF',
          startTime: '2026-09-20T18:00:00.000Z',
          stopTime: '2026-09-20T20:00:00.000Z',
          imageUrl: 'https://example.test/image.jpg',
          restrictions: { recordingForbidden: true },
          rerun: false,
          trackingContentId: 'waipu-content-1',
        }],
      }],
    }, {
      now: Date.parse('2026-09-20T12:00:00.000Z'),
    })

    expect(entries).toHaveLength(1)
    expect(entries[0].airings).toEqual([{
      source: 'waipu',
      programId: 'program-1',
      seriesId: null,
      stationId: 'zdf',
      stationName: 'ZDF',
      startTime: '2026-09-20T18:00:00.000Z',
      stopTime: '2026-09-20T20:00:00.000Z',
      episodeTitle: null,
      seasonNumber: null,
      episodeNumber: null,
      imageUrl: 'https://example.test/image.jpg',
      restrictions: { recordingForbidden: true },
      rerun: false,
      trackingContentId: 'waipu-content-1',
    }])
    expect(entries[0]).not.toHaveProperty('broadcastEvents')
  })

  it('keeps one program id from generation through the merged app title', async () => {
    const catalog = await buildWaipuLiveCatalog(buildFixture())
    const entries = normalizeWaipuLiveTitles(catalog.titles, {
      now: Date.parse('2026-09-20T12:00:00.000Z'),
    })
    const [title] = mergeWaipuLiveAvailability([
      { tmdbId: 667739, type: 'movie', title: 'The Man from Toronto', providerIds: [] },
    ], entries)

    expect(title.waipuLive.nextAiring.programId).toBe('program-1')
    expect(title.waipuLive.airings[0]).toMatchObject({
      source: 'waipu',
      programId: 'program-1',
      stationId: 'zdf',
    })
  })

  it('requires TMDB search when the local MovieHub index cannot resolve a candidate', async () => {
    await expect(buildWaipuLiveCatalog(buildFixture({
      candidates: [{ tmdbId: 1, type: 'movie', title: 'Unrelated title', year: 2022 }],
    }))).rejects.toMatchObject({ code: 'TMDB_SEARCH_REQUIRED' })
  })

  it('keeps unresolved matches invisible in explicit test mode', async () => {
    const catalog = await buildWaipuLiveCatalog(buildFixture({
      candidates: [{ tmdbId: 1, type: 'movie', title: 'Unrelated title', year: 2022 }],
      allowUnresolvedMatches: true,
      releaseChannel: 'test',
    }))

    expect(catalog.index.releaseChannel).toBe('test')
    expect(catalog.index.counts).toEqual({ stations: 1, titles: 0, broadcasts: 0 })
    expect(catalog.index.metrics.matchSearchUnavailable).toBe(1)
    expect(catalog.unresolved).toMatchObject({
      kind: 'waipu-unresolved-programs',
      count: 1,
      entries: [{
        programId: 'program-1',
        type: 'movie',
        title: 'The Man from Toronto',
        reason: 'no_candidate',
        source: 'local',
      }],
    })
  })

  it('writes a validated generation through an atomic directory swap', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-live-'))
    cleanupPaths.push(root)
    const output = resolve(root, 'nested', 'current')
    const catalog = await buildWaipuLiveCatalog(buildFixture())
    await writeWaipuLiveCatalog(output, catalog)

    const dayKey = catalog.index.days[0].key
    const [index, stations, titles, shard, day] = await Promise.all([
      readFile(resolve(output, 'index.json'), 'utf8').then(JSON.parse),
      readFile(resolve(output, 'stations.json'), 'utf8').then(JSON.parse),
      readFile(resolve(output, 'titles.json'), 'utf8').then(JSON.parse),
      readFile(resolve(output, 'stations', 'zdf.json'), 'utf8').then(JSON.parse),
      readFile(resolve(output, 'days', `${dayKey}.json`), 'utf8').then(JSON.parse),
    ])
    expect(index.status).toBe('complete')
    expect(stations.stations).toHaveLength(1)
    expect(titles.entries[0].tmdbId).toBe(667739)
    expect(shard.airings).toHaveLength(1)
    expect(day).toMatchObject({ kind: 'waipu-live-day', key: dayKey, count: 1 })
  })

  it('restores and validates the last deployed generation before a refresh', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-restore-'))
    cleanupPaths.push(root)
    const source = await buildWaipuLiveCatalog(buildFixture())
    const payloads = new Map([
      ['/waipu-live/index.json', source.index],
      ['/waipu-live/stations.json', source.stations],
      ['/waipu-live/titles.json', source.titles],
      ['/waipu-live/stations/zdf.json', source.shards.zdf],
      ...Object.entries(source.days).map(([key, day]) => [`/waipu-live/days/${key}.json`, day]),
    ])
    const fetchImpl = vi.fn(async (url) => {
      const payload = payloads.get(new URL(url).pathname)
      const bytes = Buffer.from(JSON.stringify(payload))
      return {
        ok: Boolean(payload),
        status: payload ? 200 : 404,
        arrayBuffer: async () => bytes,
      }
    })
    const output = resolve(root, 'restored')

    await expect(restoreLiveWaipuCatalog({
      baseUrl: 'https://movie-hub.example/waipu-live',
      outputPath: output,
      fetchImpl,
    })).resolves.toMatchObject({ status: 'complete' })

    const restoredIndex = JSON.parse(await readFile(resolve(output, 'index.json'), 'utf8'))
    const restoredShard = JSON.parse(await readFile(resolve(output, 'stations', 'zdf.json'), 'utf8'))
    const restoredDay = JSON.parse(await readFile(resolve(output, 'days', `${source.index.days[0].key}.json`), 'utf8'))
    expect(restoredIndex.counts).toEqual({ stations: 1, titles: 1, broadcasts: 1 })
    expect(restoredShard.airings).toHaveLength(1)
    expect(restoredDay.airings).toHaveLength(1)

    payloads.set('/waipu-live/index.json', {
      ...source.index,
      counts: { ...source.index.counts, titles: 99 },
    })
    await expect(restoreLiveWaipuCatalog({
      baseUrl: 'https://movie-hub.example/waipu-live',
      outputPath: output,
      fetchImpl,
    })).rejects.toThrow('counts are inconsistent')
    const preservedIndex = JSON.parse(await readFile(resolve(output, 'index.json'), 'utf8'))
    expect(preservedIndex).toEqual(restoredIndex)
  })

  it('restores a complete title artifact larger than the former four-megabyte limit', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-large-restore-'))
    cleanupPaths.push(root)
    const source = await buildWaipuLiveCatalog(buildFixture())
    source.titles.restoreSizeFixture = 'x'.repeat((4 * 1024 * 1024) + 1)
    const payloads = new Map([
      ['/waipu-live/index.json', source.index],
      ['/waipu-live/stations.json', source.stations],
      ['/waipu-live/titles.json', source.titles],
      ['/waipu-live/stations/zdf.json', source.shards.zdf],
      ...Object.entries(source.days).map(([key, day]) => [`/waipu-live/days/${key}.json`, day]),
    ])
    const fetchImpl = vi.fn(async (url) => {
      const payload = payloads.get(new URL(url).pathname)
      const bytes = Buffer.from(JSON.stringify(payload))
      return {
        ok: Boolean(payload),
        status: payload ? 200 : 404,
        headers: new Headers({ 'content-length': String(bytes.byteLength) }),
        arrayBuffer: async () => bytes,
      }
    })
    const output = resolve(root, 'restored')

    await expect(restoreLiveWaipuCatalog({
      baseUrl: 'https://movie-hub.example/waipu-live',
      outputPath: output,
      fetchImpl,
    })).resolves.toMatchObject({ status: 'complete' })

    const restoredTitles = JSON.parse(await readFile(resolve(output, 'titles.json'), 'utf8'))
    expect(restoredTitles.restoreSizeFixture).toHaveLength((4 * 1024 * 1024) + 1)
  })

  it('carries a valid legacy metadata generation through code deploys without weakening new publications', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-legacy-restore-'))
    cleanupPaths.push(root)
    const source = await buildWaipuLiveCatalog(buildFixture())
    source.index.metadata = { required: true, complete: 1 }
    source.titles.entries[0] = {
      ...source.titles.entries[0],
      title: 'The Man from Toronto',
      metadataVersion: 2,
      metadataComplete: true,
      collectionChecked: true,
    }
    const payloads = new Map([
      ['/waipu-live/index.json', source.index],
      ['/waipu-live/stations.json', source.stations],
      ['/waipu-live/titles.json', source.titles],
      ['/waipu-live/stations/zdf.json', source.shards.zdf],
      ...Object.entries(source.days).map(([key, day]) => [`/waipu-live/days/${key}.json`, day]),
    ])
    const fetchImpl = vi.fn(async (url) => {
      const payload = payloads.get(new URL(url).pathname)
      const bytes = Buffer.from(JSON.stringify(payload))
      return {
        ok: Boolean(payload),
        status: payload ? 200 : 404,
        headers: new Headers(),
        arrayBuffer: async () => bytes,
      }
    })

    expect(() => validateWaipuLiveCatalog(source)).toThrow('metadata is incomplete')
    await expect(restoreLiveWaipuCatalog({
      baseUrl: 'https://movie-hub.example/waipu-live',
      outputPath: resolve(root, 'restored'),
      fetchImpl,
    })).resolves.toMatchObject({ status: 'complete' })
  })
})

describe('Waipu program detail loading', () => {
  it('reuses immutable cache entries and paces only real network requests', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-details-'))
    cleanupPaths.push(root)
    let clock = 1_000
    const sleeps = []
    const client = {
      getProgram: vi.fn(async (id) => ({ value: detail({ id, title: `Title ${id}` }) })),
    }
    const loader = new WaipuProgramDetailLoader({
      cache: new WaipuEpgCache({ root, now: () => clock }),
      client,
      requestBudget: 2,
      paceMs: 350,
      jitterMs: 0,
      now: () => clock,
      random: () => 0,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); clock += milliseconds },
    })

    await loader.load('a')
    await loader.load('a')
    await loader.load('b')
    await expect(loader.load('c')).rejects.toMatchObject({ code: 'REQUEST_BUDGET_EXHAUSTED' })
    expect(client.getProgram).toHaveBeenCalledTimes(2)
    expect(sleeps).toEqual([350])
    expect(loader.metrics).toMatchObject({ requestsStarted: 2, cacheHits: 1, detailsLoaded: 2 })
  })

  it('caches an explicitly removed program detail and does not request it again', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-unavailable-'))
    cleanupPaths.push(root)
    const client = {
      getProgram: vi.fn(async () => {
        throw Object.assign(new Error('gone'), { code: 'HTTP_ERROR', status: 410 })
      }),
    }
    const loader = new WaipuProgramDetailLoader({
      cache: new WaipuEpgCache({ root }),
      client,
      paceMs: 350,
      jitterMs: 0,
    })

    await expect(loader.load('gone-program')).resolves.toEqual({ unavailable: true, status: 410 })
    await expect(loader.load('gone-program')).resolves.toEqual({ unavailable: true, status: 410 })
    expect(client.getProgram).toHaveBeenCalledOnce()
    expect(loader.metrics).toMatchObject({
      requestsStarted: 1,
      cacheHits: 1,
      detailsUnavailable: 1,
    })
  })
})
