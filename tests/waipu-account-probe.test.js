import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  alignToFourHourUtcWindow,
  buildProbeWindows,
  runWaipuAccountProbe,
  summarizeStations,
  validateProbeUrl,
} from '../scripts/waipu-account-probe.mjs'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Waipu account feasibility probe', () => {
  it('allows only the four read-only HTTPS API hosts', () => {
    expect(validateProbeUrl('https://epg-cache.waipu.tv/api/grid/example')).toBeInstanceOf(URL)
    expect(() => validateProbeUrl('http://epg-cache.waipu.tv/api/grid/example')).toThrow(/unverschlüsselte/i)
    expect(() => validateProbeUrl('https://example.org/api')).toThrow(/nicht freigegebener/i)
  })

  it('aligns probe windows to deterministic four-hour UTC boundaries', () => {
    expect(alignToFourHourUtcWindow('2026-03-29T03:45:12.000Z').toISOString())
      .toBe('2026-03-29T00:00:00.000Z')
    expect(buildProbeWindows('2026-09-18T10:25:00.000Z').map((entry) => ({
      days: entry.days,
      start: entry.start.toISOString(),
    }))).toEqual([
      { days: 0, start: '2026-09-18T08:00:00.000Z' },
      { days: 1, start: '2026-09-19T08:00:00.000Z' },
      { days: 3, start: '2026-09-21T08:00:00.000Z' },
      { days: 7, start: '2026-09-25T08:00:00.000Z' },
      { days: 14, start: '2026-10-02T08:00:00.000Z' },
    ])
  })

  it('separates visible live stations from locked, omitted and VoD stations', () => {
    const result = summarizeStations([
      { stationId: 'one', locked: false, favorite: true },
      { stationId: 'two', locked: true },
      { stationId: 'three', omitted: true },
      { stationId: 'four' },
      { stationId: 'missing' },
    ], {
      stations: [
        { id: 'one', feeds: ['live'] },
        { id: 'two', feeds: ['live'] },
        { id: 'three', feeds: ['live'] },
        { id: 'four', feeds: ['google_vod'] },
      ],
    }, 3)

    expect(result.summary).toEqual({
      total: 5,
      locked: 1,
      omitted: 1,
      missingConfiguration: 1,
      vodOrNewTv: 1,
      visibleLive: 1,
      favorite: 1,
      representativeCount: 1,
    })
    expect(result.selected).toEqual([{ stationId: 'one' }])
  })

  it('runs device OAuth, refresh, stations, horizon probes and details without persisting secrets', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-probe-'))
    const reportPath = resolve(directory, 'report.json')
    let devicePolls = 0
    const seenAuthorizationHeaders = []
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const parsedUrl = url instanceof URL ? url : new URL(url)
      const authorization = new Headers(init.headers).get('Authorization')
      if (authorization) seenAuthorizationHeaders.push(authorization)

      if (parsedUrl.pathname === '/oauth/device_authorization') {
        return jsonResponse({
          verification_uri: 'https://waipu.example/activate',
          verification_uri_complete: 'https://waipu.example/activate?code=ABCD',
          user_code: 'ABCD',
          device_code: 'device-code-secret',
          interval: 1,
          expires_in: 600,
        })
      }
      if (parsedUrl.pathname === '/oauth/token') {
        const form = new URLSearchParams(init.body)
        if (form.get('grant_type') === 'refresh_token') {
          return jsonResponse({
            access_token: 'access-token-refreshed',
            refresh_token: 'refresh-token-rotated',
          })
        }
        devicePolls += 1
        if (devicePolls === 1) return jsonResponse({ error: 'authorization_pending' }, 400)
        return jsonResponse({
          access_token: 'access-token-initial',
          refresh_token: 'refresh-token-initial',
        })
      }
      if (parsedUrl.hostname === 'web-proxy.waipu.tv') {
        return jsonResponse({
          stations: [
            { id: 'station-one', feeds: ['live'] },
            { id: 'station-vod', feeds: ['google_vod'] },
          ],
        })
      }
      if (parsedUrl.hostname === 'user-stations.waipu.tv') {
        return jsonResponse([
          { stationId: 'station-one', favorite: true },
          { stationId: 'station-locked', locked: true },
          { stationId: 'station-vod' },
        ])
      }
      if (parsedUrl.pathname.includes('/api/grid/')) {
        const decodedPath = decodeURIComponent(parsedUrl.pathname)
        if (decodedPath.includes('2026-09-25') || decodedPath.includes('2026-10-02')) {
          return jsonResponse([])
        }
        return jsonResponse([{
          id: 'programme-id-secret',
          title: 'Titel darf nicht in den Bericht',
          startTime: '2026-09-18T10:00:00.000Z',
          stopTime: '2026-09-18T12:00:00.000Z',
        }])
      }
      if (parsedUrl.pathname.includes('/api/programs/')) {
        return jsonResponse({
          id: 'programme-id-secret',
          title: 'Titel darf nicht in den Bericht',
          genre: 'Film',
          year: 2026,
        })
      }
      throw new Error(`Unexpected test URL: ${parsedUrl}`)
    })

    try {
      const authorizationCallback = vi.fn()
      const report = await runWaipuAccountProbe({
        clientAuth: 'cHJvYmUtY2xpZW50LXNlY3JldA==',
        deviceId: 'device-id-secret',
        generatedAt: '2026-09-18T10:25:00.000Z',
        outputPath: reportPath,
        fetchImpl,
        sleep: async () => {},
        now: () => new Date('2026-09-18T10:25:00.000Z').getTime(),
        onAuthorization: authorizationCallback,
      })

      expect(report.quality).toEqual({ status: 'pass', feasible: true, reasons: [] })
      expect(report.oauth).toEqual({
        deviceAuthorizationStarted: true,
        deviceAuthorizationCompleted: true,
        refreshAttempted: true,
        refreshSucceeded: true,
        refreshTokenRotated: true,
      })
      expect(report.stations).toMatchObject({
        total: 3,
        visibleLive: 1,
        locked: 1,
        vodOrNewTv: 1,
      })
      expect(report.epg).toMatchObject({
        representativeStations: 1,
        windowsAttempted: 5,
        windowsSucceeded: 5,
        windowsWithPrograms: 3,
        programmeCount: 3,
        reachableHorizonDays: 3,
      })
      expect(report.programDetails).toMatchObject({ attempted: 1, succeeded: 1 })
      expect(report.requests.total).toBe(12)
      expect(authorizationCallback).toHaveBeenCalledOnce()
      expect(seenAuthorizationHeaders).toContain('Basic cHJvYmUtY2xpZW50LXNlY3JldA==')
      expect(seenAuthorizationHeaders).toContain('Bearer access-token-refreshed')

      const persisted = await readFile(reportPath, 'utf8')
      for (const secret of [
        'cHJvYmUtY2xpZW50LXNlY3JldA==',
        'device-id-secret',
        'device-code-secret',
        'access-token-initial',
        'access-token-refreshed',
        'refresh-token-initial',
        'refresh-token-rotated',
        'programme-id-secret',
        'Titel darf nicht in den Bericht',
        'ABCD',
      ]) {
        expect(persisted).not.toContain(secret)
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('stops a denied device flow without retry loops or secret leakage', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-denied-'))
    const reportPath = resolve(directory, 'report.json')
    const fetchImpl = vi.fn(async (url) => {
      const parsedUrl = url instanceof URL ? url : new URL(url)
      if (parsedUrl.pathname === '/oauth/device_authorization') {
        return jsonResponse({
          verification_uri: 'https://waipu.example/activate',
          user_code: 'USER-CODE-9876',
          device_code: 'denied-device-code',
          interval: 1,
          expires_in: 60,
        })
      }
      return jsonResponse({ error: 'access_denied', detail: 'secret server detail' }, 400)
    })

    try {
      await expect(runWaipuAccountProbe({
        clientAuth: 'ZGVuaWVkLXNlY3JldA==',
        outputPath: reportPath,
        fetchImpl,
        sleep: async () => {},
        now: () => 0,
      })).rejects.toMatchObject({ code: 'DEVICE_AUTH_DENIED' })
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      const persisted = await readFile(reportPath, 'utf8')
      expect(persisted).toContain('DEVICE_AUTH_DENIED')
      expect(persisted).not.toContain('secret server detail')
      expect(persisted).not.toContain('ZGVuaWVkLXNlY3JldA==')
      expect(persisted).not.toContain('denied-device-code')
      expect(persisted).not.toContain('USER-CODE-9876')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([401, 429, 503])('stops token polling after HTTP %s without a request loop', async (status) => {
    const directory = await mkdtemp(resolve(tmpdir(), `movie-hub-waipu-http-${status}-`))
    const reportPath = resolve(directory, 'report.json')
    const fetchImpl = vi.fn(async (url) => {
      const parsedUrl = url instanceof URL ? url : new URL(url)
      if (parsedUrl.pathname === '/oauth/device_authorization') {
        return jsonResponse({
          verification_uri: 'https://waipu.example/activate',
          user_code: 'TEMP-CODE',
          device_code: 'temporary-device-code',
          interval: 1,
          expires_in: 60,
        })
      }
      return jsonResponse({ error: 'server_error' }, status)
    })

    try {
      await expect(runWaipuAccountProbe({
        clientAuth: 'dGVtcG9yYXJ5LXRlc3QtYXV0aA==',
        outputPath: reportPath,
        fetchImpl,
        sleep: async () => {},
        now: () => 0,
      })).rejects.toMatchObject({ code: 'TOKEN_FAILED' })
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      expect(report.requests.byStatus[String(status)]).toBe(1)
      expect(report.failure).toMatchObject({
        stage: 'token-poll',
        code: 'TOKEN_FAILED',
        httpStatus: status,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
