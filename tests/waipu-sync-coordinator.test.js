import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WaipuEpgCache, WaipuPublicDataError } from '../scripts/waipu-public-data.mjs'
import { WAIPU_OFFICIAL_FIRST_50_STATIONS } from '../scripts/waipu-station-order.mjs'
import {
  assertStageAllowed,
  buildRollingSlots,
  runWaipuSync,
  selectStageStations,
  WaipuSyncError,
  withWaipuSingleFlight,
} from '../scripts/waipu-sync-coordinator.mjs'

const cleanups = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function temporaryPaths() {
  const root = await mkdtemp(resolve(tmpdir(), 'movie-hub-waipu-sync-'))
  cleanups.push(root)
  return {
    root,
    cacheRoot: resolve(root, 'cache'),
    statePath: resolve(root, 'checkpoint.json'),
    statusPath: resolve(root, 'status.json'),
    lockPath: resolve(root, 'active.lock'),
  }
}

function stations(count = 20) {
  const configured = WAIPU_OFFICIAL_FIRST_50_STATIONS
    .slice(0, Math.min(count, WAIPU_OFFICIAL_FIRST_50_STATIONS.length))
    .map(({ id, websiteName: displayName }) => ({
      id,
      displayName,
      logoTemplateUrl: null,
      streamQualities: ['hd'],
    }))
  return [
    ...configured,
    ...Array.from({ length: Math.max(0, count - configured.length) }, (_, index) => ({
      id: `extra-${index}`,
      displayName: `Zusatz ${String(index).padStart(2, '0')}`,
      logoTemplateUrl: null,
      streamQualities: [],
    })),
  ]
}

function clientFixture(overrides = {}) {
  return {
    getStations: vi.fn(async () => ({ value: stations(), etag: '"stations-v1"' })),
    getGridInfo: vi.fn(async () => ({
      value: { slots: ['00', '04', '08', '12', '16', '20'], slotDurationHours: 4, timezone: 'UTC' },
      etag: '"grid-info-v1"',
    })),
    getGrid: vi.fn(async () => ({ value: [], etag: '"grid-v1"' })),
    getProgram: vi.fn(async () => ({ value: {}, etag: null })),
    ...overrides,
  }
}

function runOptions(paths, client, additions = {}) {
  const { startAt = '2026-09-18T12:30:00.000Z', ...optionAdditions } = additions
  let clock = Date.parse(startAt)
  const sleeps = []
  return {
    options: {
      ...paths,
      client,
      cache: new WaipuEpgCache({ root: paths.cacheRoot, now: () => clock }),
      now: () => clock,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds)
        clock += milliseconds
      },
      random: () => 0,
      horizonDays: 1,
      paceMs: 500,
      jitterMs: 0,
      ...optionAdditions,
    },
    sleeps,
  }
}

describe('Waipu rolling planner', () => {
  it('builds exactly six UTC slots per day', () => {
    const slots = buildRollingSlots('2026-09-18T19:15:00+02:00', 14)
    expect(slots).toHaveLength(84)
    expect(slots[0].toISOString()).toBe('2026-09-18T00:00:00.000Z')
    expect(slots.at(-1).toISOString()).toBe('2026-10-01T20:00:00.000Z')
  })

  it('uses the official website order for every configured stage', () => {
    const input = [...stations(50)].reverse()
    expect(selectStageStations(input, 7).map(({ id }) => id))
      .toEqual(['ard', 'zdf', 'rtl', 'pro7', 'sat1', 'vox', 'rtl2'])
    expect(selectStageStations(input, 20).map(({ id }) => id))
      .toEqual(WAIPU_OFFICIAL_FIRST_50_STATIONS.slice(0, 20).map(({ id }) => id))
    expect(selectStageStations(input, 50).map(({ id }) => id))
      .toEqual(WAIPU_OFFICIAL_FIRST_50_STATIONS.map(({ id }) => id))
  })

  it('requires seven stable runs before a larger stage and explicit full approval', () => {
    const state = { stableRunsByStage: { 7: 6, 20: 7, 50: 7, full: 0 } }
    expect(() => assertStageAllowed(state, 20)).toThrowError(WaipuSyncError)
    expect(() => assertStageAllowed(state, 50, { approvedStage: 50 })).not.toThrow()
    state.stableRunsByStage[7] = 7
    expect(() => assertStageAllowed(state, 20)).not.toThrow()
    expect(() => assertStageAllowed(state, 'full')).toThrowError(WaipuSyncError)
    expect(() => assertStageAllowed(state, 'full', { fullStageApproved: true })).not.toThrow()
  })
})

describe('WaipuSyncCoordinator', () => {
  it('stops exactly at the request budget and persists a resumable checkpoint', async () => {
    const paths = await temporaryPaths()
    const client = clientFixture()
    const { options, sleeps } = runOptions(paths, client, { requestBudget: 4 })
    const result = await runWaipuSync(options)

    expect(result.status).toBe('paused_request_budget')
    expect(result.metrics.requestsStarted).toBe(4)
    expect(result.metrics.slotsProcessed).toBe(2)
    expect(result.failure).toBeNull()
    expect(client.getGrid).toHaveBeenCalledTimes(2)
    expect(sleeps.filter((delay) => delay === 500)).toHaveLength(3)
    const checkpoint = JSON.parse(await readFile(paths.statePath, 'utf8'))
    expect(Object.keys(checkpoint.slots)).toHaveLength(2)
  })

  it('resumes from immutable cached slots instead of requesting them again', async () => {
    const paths = await temporaryPaths()
    const firstClient = clientFixture()
    const first = runOptions(paths, firstClient, { requestBudget: 4 })
    await runWaipuSync(first.options)

    const secondClient = clientFixture()
    const second = runOptions(paths, secondClient, { requestBudget: 50 })
    const result = await runWaipuSync(second.options)
    expect(result.status).toBe('complete')
    expect(result.metrics.slotsSkippedByCheckpoint).toBeGreaterThanOrEqual(2)
    expect(secondClient.getGrid).toHaveBeenCalledTimes(40)
  })

  it('retries transient failures with exponential backoff and the global request gate', async () => {
    const paths = await temporaryPaths()
    let attempts = 0
    const client = clientFixture({
      getGrid: vi.fn(async () => {
        attempts += 1
        if (attempts < 3) throw new WaipuPublicDataError('UPSTREAM_ERROR', { status: 503 })
        return { value: [], etag: '"grid-v1"' }
      }),
    })
    const { options, sleeps } = runOptions(paths, client, { requestBudget: 5, retryBaseMs: 1_000 })
    const result = await runWaipuSync(options)
    expect(result.status).toBe('paused_request_budget')
    expect(result.metrics.retries).toBe(2)
    expect(result.metrics.retryReasons).toEqual({ UPSTREAM_ERROR: 2 })
    expect(client.getGrid).toHaveBeenCalledTimes(3)
    expect(sleeps).toContain(1_000)
    expect(sleeps).toContain(2_000)
  })

  it('opens a persistent manual circuit on 403 and blocks the next run before networking', async () => {
    const paths = await temporaryPaths()
    const firstClient = clientFixture({
      getGrid: vi.fn(async () => { throw new WaipuPublicDataError('FORBIDDEN_STOP', { status: 403 }) }),
    })
    const first = runOptions(paths, firstClient, { requestBudget: 10 })
    const blocked = await runWaipuSync(first.options)
    expect(blocked.status).toBe('blocked_forbidden')
    expect(blocked.circuit.automaticRunsDisabled).toBe(true)

    const secondClient = clientFixture()
    const second = runOptions(paths, secondClient, { requestBudget: 10 })
    await expect(runWaipuSync(second.options)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' })
    expect(secondClient.getStations).not.toHaveBeenCalled()
  })

  it('persists Retry-After on 429 without disabling future manual recovery', async () => {
    const paths = await temporaryPaths()
    const client = clientFixture({
      getGrid: vi.fn(async () => {
        throw new WaipuPublicDataError('RATE_LIMIT_STOP', { status: 429, retryAfterSeconds: 90 })
      }),
    })
    const { options } = runOptions(paths, client, { requestBudget: 10 })
    const result = await runWaipuSync(options)
    expect(result.status).toBe('paused_rate_limit')
    expect(result.circuit).toMatchObject({
      automaticRunsDisabled: false,
      reason: 'RATE_LIMIT_STOP',
      blockedUntil: '2026-09-18T12:31:31.000Z',
    })
  })

  it('does not count a budget-paused run as a stable promotion run', async () => {
    const paths = await temporaryPaths()
    const { options } = runOptions(paths, clientFixture(), { requestBudget: 3 })
    const result = await runWaipuSync(options)
    expect(result.status).toBe('paused_request_budget')
    expect(result.promotion.stableRuns).toBe(0)
    expect(result.promotion.automaticPromotion).toBe(false)
  })

  it('counts at most one complete stability run per UTC day', async () => {
    const paths = await temporaryPaths()
    const first = runOptions(paths, clientFixture(), { requestBudget: 50 })
    const firstResult = await runWaipuSync(first.options)
    expect(firstResult).toMatchObject({
      status: 'complete',
      stability: {
        runDate: '2026-09-18',
        recorded: true,
        reason: null,
      },
      promotion: { stableRuns: 1 },
    })

    const duplicate = runOptions(paths, clientFixture(), { requestBudget: 50 })
    const duplicateResult = await runWaipuSync(duplicate.options)
    expect(duplicateResult).toMatchObject({
      status: 'complete',
      stability: {
        runDate: '2026-09-18',
        recorded: false,
        reason: 'already_recorded_for_utc_day',
      },
      promotion: { stableRuns: 1 },
    })

    const nextDay = runOptions(paths, clientFixture(), {
      requestBudget: 50,
      startAt: '2026-09-19T12:30:00.000Z',
    })
    const nextDayResult = await runWaipuSync(nextDay.options)
    expect(nextDayResult).toMatchObject({
      status: 'complete',
      stability: {
        runDate: '2026-09-19',
        recorded: true,
        recordedDates: ['2026-09-18', '2026-09-19'],
      },
      promotion: { stableRuns: 2 },
    })
    const checkpoint = JSON.parse(await readFile(paths.statePath, 'utf8'))
    expect(checkpoint.stableRunDatesByStage[7]).toEqual(['2026-09-18', '2026-09-19'])
  })

  it('migrates the existing counter without counting its last UTC day again', async () => {
    const paths = await temporaryPaths()
    await writeFile(paths.statePath, JSON.stringify({
      schemaVersion: 1,
      kind: 'waipu-sync-checkpoint',
      updatedAt: '2026-09-19T10:30:21.570Z',
      stableRunsByStage: { 7: 2, 20: 0, 50: 0, full: 0 },
      circuit: {
        automaticRunsDisabled: false,
        reason: null,
        openedAt: null,
        blockedUntil: null,
      },
      slots: {},
    }))
    const run = runOptions(paths, clientFixture(), {
      requestBudget: 50,
      startAt: '2026-09-19T18:00:00.000Z',
    })
    const result = await runWaipuSync(run.options)
    expect(result).toMatchObject({
      status: 'complete',
      stability: {
        runDate: '2026-09-19',
        recorded: false,
        recordedDates: ['2026-09-19'],
      },
      promotion: { stableRuns: 2 },
    })
  })
})

describe('Waipu single-flight lock', () => {
  it('creates a missing parent directory on the first run', async () => {
    const paths = await temporaryPaths()
    const nestedLock = resolve(paths.root, 'missing', 'waipu', 'active.lock')
    await expect(withWaipuSingleFlight(nestedLock, async () => 'created')).resolves.toBe('created')
  })

  it('rejects an overlapping run and releases the lock afterwards', async () => {
    const paths = await temporaryPaths()
    let releaseFirst
    const gate = new Promise((resolveGate) => { releaseFirst = resolveGate })
    const first = withWaipuSingleFlight(paths.lockPath, async () => gate)
    await new Promise((resolveTurn) => setTimeout(resolveTurn, 0))
    await expect(withWaipuSingleFlight(paths.lockPath, async () => 'second'))
      .rejects.toMatchObject({ code: 'SINGLE_FLIGHT_ACTIVE' })
    releaseFirst('first')
    await expect(first).resolves.toBe('first')
    await expect(stat(paths.lockPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(withWaipuSingleFlight(paths.lockPath, async () => 'third')).resolves.toBe('third')
    await expect(stat(paths.lockPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('recovers an abandoned empty lock after its stale interval', async () => {
    const paths = await temporaryPaths()
    await mkdir(paths.lockPath)
    const old = new Date('2026-09-18T10:00:00.000Z')
    await utimes(paths.lockPath, old, old)
    await expect(withWaipuSingleFlight(
      paths.lockPath,
      async () => 'recovered',
      {
        now: () => Date.parse('2026-09-18T10:02:00.000Z'),
        staleAfterMs: 60_000,
      },
    )).resolves.toBe('recovered')
    await expect(stat(paths.lockPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
