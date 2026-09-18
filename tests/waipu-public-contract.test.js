import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  alignToFourHourUtcWindow,
  buildPublicProbeWindows,
  buildRequestMatrix,
  classifyGridProgram,
  runWaipuPublicContractProbe,
  selectRepresentativeStations,
  validatePublicProbeUrl,
} from '../scripts/waipu-public-contract-probe.mjs'

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/waipu-public')
let stationConfig
let gridInfo
let grid
let filmDetail
let seriesDetail

beforeAll(async () => {
  [stationConfig, gridInfo, grid, filmDetail, seriesDetail] = await Promise.all([
    'station-config.json',
    'grid-info.json',
    'grid.json',
    'program-film.json',
    'program-series.json',
  ].map(async (name) => JSON.parse(await readFile(resolve(fixtureRoot, name), 'utf8'))))
})

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(status === 304 ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
  })
}

describe('Waipu public contract probe', () => {
  it('allows only the four exact read-only endpoint shapes over HTTPS', () => {
    expect(validatePublicProbeUrl('https://web-proxy.waipu.tv/station-config')).toBeInstanceOf(URL)
    expect(validatePublicProbeUrl('https://epg-cache.waipu.tv/api/grid/info')).toBeInstanceOf(URL)
    expect(validatePublicProbeUrl('https://epg-cache.waipu.tv/api/grid/ard/2026-09-18T08%3A00%3A00.000Z'))
      .toBeInstanceOf(URL)
    expect(validatePublicProbeUrl('https://epg-cache.waipu.tv/api/programs/example'))
      .toBeInstanceOf(URL)
    expect(() => validatePublicProbeUrl('http://epg-cache.waipu.tv/api/grid/info'))
      .toThrow(/unverschlüsselte/i)
    expect(() => validatePublicProbeUrl('https://epg-cache.waipu.tv/api/grid/info?all=true'))
      .toThrow(/nicht freigegebener/i)
    expect(() => validatePublicProbeUrl('https://example.org/api/grid/info'))
      .toThrow(/nicht freigegebener/i)
  })

  it('uses exactly the UTC windows for day 0, 7 and 14', () => {
    expect(alignToFourHourUtcWindow('2026-03-29T03:45:12.000Z').toISOString())
      .toBe('2026-03-29T00:00:00.000Z')
    expect(buildPublicProbeWindows('2026-09-18T10:25:00.000Z').map((entry) => ({
      days: entry.days,
      start: entry.start.toISOString(),
    }))).toEqual([
      { days: 0, start: '2026-09-18T08:00:00.000Z' },
      { days: 7, start: '2026-09-25T08:00:00.000Z' },
      { days: 14, start: '2026-10-02T08:00:00.000Z' },
    ])
  })

  it('selects public, commercial and culture/information representatives', () => {
    expect(selectRepresentativeStations(stationConfig)).toEqual([
      {
        stationId: 'station-public',
        displayName: 'Das Erste HD',
        stationClass: 'public-service',
      },
      {
        stationId: 'station-commercial',
        displayName: 'RTL HD',
        stationClass: 'commercial',
      },
      {
        stationId: 'station-culture',
        displayName: 'arte HD',
        stationClass: 'culture-information',
      },
    ])
    expect(classifyGridProgram(grid[0])).toBe('film')
    expect(classifyGridProgram(grid[1])).toBe('series')
  })

  it('calculates pilot and full request costs without sending requests', () => {
    expect(buildRequestMatrix(398)).toEqual([
      expect.objectContaining({ stations: 5, initialGridRequestsFor14Days: 420 }),
      expect.objectContaining({ stations: 7, initialGridRequestsFor14Days: 588 }),
      expect.objectContaining({ stations: 20, initialGridRequestsFor14Days: 1_680 }),
      expect.objectContaining({ stations: 50, initialGridRequestsFor14Days: 4_200 }),
      expect.objectContaining({ stations: 398, initialGridRequestsFor14Days: 33_432 }),
    ])
  })

  it('runs a serial 15-request sample with pacing, ETags and no credentials', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-public-'))
    const reportPath = resolve(directory, 'report.json')
    const pauses = []
    const requestHeaders = []
    let activeRequests = 0
    let maximumActiveRequests = 0
    const fetchImpl = vi.fn(async (url, init = {}) => {
      activeRequests += 1
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
      try {
        const parsedUrl = url instanceof URL ? url : new URL(url)
        const headers = new Headers(init.headers)
        requestHeaders.push(headers)
        expect(init.method).toBe('GET')
        expect(headers.has('Authorization')).toBe(false)
        expect(headers.has('Cookie')).toBe(false)

        if (parsedUrl.hostname === 'web-proxy.waipu.tv') {
          if (headers.get('If-None-Match') === '"stations-v1"') {
            return jsonResponse(null, 304, { ETag: '"stations-v1"' })
          }
          return jsonResponse(stationConfig, 200, {
            ETag: '"stations-v1"',
            'Cache-Control': 'max-age=300',
            'Last-Modified': 'Fri, 18 Sep 2026 08:00:00 GMT',
          })
        }
        if (parsedUrl.pathname === '/api/grid/info') {
          return jsonResponse(gridInfo, 200, { 'Cache-Control': 'max-age=600' })
        }
        if (parsedUrl.pathname.includes('/api/grid/')) {
          if (headers.get('If-None-Match') === '"grid-v1"') {
            return jsonResponse(null, 304, { ETag: '"grid-v1"' })
          }
          return jsonResponse(grid, 200, {
            ETag: '"grid-v1"',
            'Cache-Control': 'max-age=600, stale-while-revalidate=600',
          })
        }
        if (parsedUrl.pathname.endsWith('/fixture-film-id')) return jsonResponse(filmDetail)
        if (parsedUrl.pathname.endsWith('/fixture-series-id')) return jsonResponse(seriesDetail)
        throw new Error(`Unexpected test URL: ${parsedUrl}`)
      } finally {
        activeRequests -= 1
      }
    })

    try {
      const report = await runWaipuPublicContractProbe({
        generatedAt: '2026-09-18T10:25:00.000Z',
        outputPath: reportPath,
        fetchImpl,
        sleep: async (milliseconds) => { pauses.push(milliseconds) },
        random: () => 0,
      })

      expect(report.quality).toEqual({ status: 'pass', feasible: true, reasons: [] })
      expect(report.scope).toMatchObject({
        readOnly: true,
        authenticated: false,
        authorizationHeadersSent: false,
        stressTest: false,
      })
      expect(report.requests).toMatchObject({ total: 15, maxRequests: 20, concurrency: 1 })
      expect(report.requests.byStatus).toEqual({ '200': 13, '304': 2 })
      expect(report.grid).toMatchObject({
        windowsAttempted: 9,
        windowsSucceeded: 9,
        windowsWithPrograms: 9,
        programmeCount: 18,
      })
      expect(report.programDetails).toMatchObject({
        attempted: 2,
        succeeded: 2,
        types: { film: true, series: true, unknown: false },
      })
      expect(report.conditionalRequests).toEqual({ stationConfig304: true, grid304: true })
      expect(fetchImpl).toHaveBeenCalledTimes(15)
      expect(maximumActiveRequests).toBe(1)
      expect(pauses).toHaveLength(14)
      expect(pauses.every((milliseconds) => milliseconds >= 750)).toBe(true)
      expect(requestHeaders.some((headers) => headers.has('Authorization'))).toBe(false)

      const persisted = await readFile(reportPath, 'utf8')
      for (const rawProgrammeValue of [
        'fixture-film-id',
        'fixture-series-id',
        'Fixture Film',
        'Fixture Serie',
        'Fixture Folge',
      ]) {
        expect(persisted).not.toContain(rawProgrammeValue)
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    [403, 'FORBIDDEN_STOP'],
    [429, 'RATE_LIMIT_STOP'],
    [503, 'UPSTREAM_STOP'],
  ])('stops immediately on HTTP %s without retries', async (status, code) => {
    const directory = await mkdtemp(resolve(tmpdir(), `movie-hub-waipu-public-${status}-`))
    const reportPath = resolve(directory, 'report.json')
    const fetchImpl = vi.fn(async () => jsonResponse(null, status, {
      ...(status === 429 ? { 'Retry-After': '120' } : {}),
    }))
    try {
      await expect(runWaipuPublicContractProbe({
        outputPath: reportPath,
        fetchImpl,
        sleep: async () => {},
      })).rejects.toMatchObject({ code })
      expect(fetchImpl).toHaveBeenCalledOnce()
      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      expect(report.requests.total).toBe(1)
      expect(report.failure).toMatchObject({ code, httpStatus: status })
      if (status === 429) expect(report.failure.retryAfterSeconds).toBe(120)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('enforces the hard request budget before a second network call', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-budget-'))
    const reportPath = resolve(directory, 'report.json')
    const fetchImpl = vi.fn(async () => jsonResponse(stationConfig, 200, { ETag: '"stations-v1"' }))
    try {
      await expect(runWaipuPublicContractProbe({
        outputPath: reportPath,
        maxRequests: 1,
        fetchImpl,
        sleep: async () => {},
      })).rejects.toMatchObject({ code: 'REQUEST_BUDGET_EXCEEDED' })
      expect(fetchImpl).toHaveBeenCalledOnce()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
