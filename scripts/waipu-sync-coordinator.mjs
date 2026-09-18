import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  WaipuEpgCache,
  WaipuPublicApiClient,
  WaipuPublicDataError,
  WAIPU_SLOT_DURATION_MS,
} from './waipu-public-data.mjs'

export const WAIPU_SYNC_SCHEMA_VERSION = 1
export const WAIPU_SYNC_STAGES = Object.freeze([7, 20, 50, 'full'])
export const WAIPU_PILOT_STATIONS = Object.freeze([
  'Das Erste',
  'ZDF',
  'RTL',
  'SAT.1',
  'ProSieben',
  'VOX',
  'Kabel Eins',
])

const DEFAULT_REQUEST_BUDGET = 300
const DEFAULT_PACE_MS = 500
const DEFAULT_JITTER_MS = 150
const DEFAULT_RETRY_BASE_MS = 2_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RATE_LIMIT_PAUSE_MS = 2 * 60 * 60 * 1_000
const DEFAULT_NEAR_FUTURE_HOURS = 24
const DEFAULT_FUTURE_REFRESH_HOURS = 24
const DEFAULT_LOCK_STALE_MS = 4 * 60 * 60 * 1_000

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const activeProcessLocks = new Set()

process.once('exit', () => {
  for (const lockPath of activeProcessLocks) {
    try {
      rmSync(lockPath, { recursive: true, force: true })
    } catch {
      // Der persistente Stale-Lock-Mechanismus bleibt die Absturzreserve.
    }
  }
})

const ERROR_MESSAGES = Object.freeze({
  INVALID_STAGE: 'Die angeforderte Waipu-Ausbaustufe ist ungültig oder noch nicht freigegeben.',
  PILOT_STATIONS_MISSING: 'Die sieben festgelegten Waipu-Pilotsender sind nicht vollständig vorhanden.',
  SINGLE_FLIGHT_ACTIVE: 'Ein anderer Waipu-Import ist bereits aktiv.',
  REQUEST_BUDGET_EXHAUSTED: 'Das Requestbudget dieses Waipu-Laufs ist erreicht.',
  CIRCUIT_OPEN: 'Der automatische Waipu-Import ist durch den Circuit Breaker gesperrt.',
  STATE_CORRUPT: 'Der Waipu-Sync-Zustand ist beschädigt oder inkompatibel.',
  LIVE_CONFIRMATION_REQUIRED: 'Der Live-Import benötigt eine ausdrückliche Laufbestätigung.',
})

export class WaipuSyncError extends Error {
  constructor(code, { cause = null } = {}) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.STATE_CORRUPT, cause ? { cause } : undefined)
    this.name = 'WaipuSyncError'
    this.code = ERROR_MESSAGES[code] ? code : 'STATE_CORRUPT'
  }
}

function integerOption(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function dateValue(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid date.')
  return date
}

function utcDayStart(value) {
  const date = dateValue(value)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

function normalizedName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bhd\b/gi, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
}

function stageKey(stage) {
  return String(stage)
}

function stageIndex(stage) {
  return WAIPU_SYNC_STAGES.findIndex((candidate) => candidate === stage)
}

function previousStage(stage) {
  const index = stageIndex(stage)
  return index > 0 ? WAIPU_SYNC_STAGES[index - 1] : null
}

export function buildRollingSlots(now = new Date(), horizonDays = 14) {
  const days = integerOption(horizonDays, 14, { min: 1, max: 14 })
  const start = utcDayStart(now)
  return Array.from({ length: days * 6 }, (_, index) => (
    new Date(start.getTime() + index * WAIPU_SLOT_DURATION_MS)
  ))
}

export function selectStageStations(stations, stage = 7) {
  if (!WAIPU_SYNC_STAGES.includes(stage) || !Array.isArray(stations)) {
    throw new WaipuSyncError('INVALID_STAGE')
  }
  const candidates = stations
    .filter((station) => station && typeof station.id === 'string' && typeof station.displayName === 'string')
    .map((station) => ({ ...station, normalizedName: normalizedName(station.displayName) }))
  const selected = []
  const selectedIds = new Set()

  for (const pilotName of WAIPU_PILOT_STATIONS) {
    const target = normalizedName(pilotName)
    const match = candidates.find((station) => station.normalizedName === target)
    if (!match) throw new WaipuSyncError('PILOT_STATIONS_MISSING')
    selected.push(match)
    selectedIds.add(match.id)
  }

  const limit = stage === 'full' ? candidates.length : stage
  const remainder = candidates
    .filter(({ id }) => !selectedIds.has(id))
    .sort((left, right) => (
      left.displayName.localeCompare(right.displayName, 'de') || left.id.localeCompare(right.id)
    ))
  return [...selected, ...remainder].slice(0, Math.min(limit, candidates.length))
    .map(({ normalizedName: _normalizedName, ...station }) => station)
}

function emptyState(now) {
  return {
    schemaVersion: WAIPU_SYNC_SCHEMA_VERSION,
    kind: 'waipu-sync-checkpoint',
    updatedAt: new Date(now).toISOString(),
    stableRunsByStage: { 7: 0, 20: 0, 50: 0, full: 0 },
    circuit: {
      automaticRunsDisabled: false,
      reason: null,
      openedAt: null,
      blockedUntil: null,
    },
    slots: {},
  }
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    if (error instanceof SyntaxError) throw new WaipuSyncError('STATE_CORRUPT', { cause: error })
    throw error
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, path)
}

async function loadState(path, now) {
  const state = await readJson(path, emptyState(now))
  if (
    state?.schemaVersion !== WAIPU_SYNC_SCHEMA_VERSION
    || state?.kind !== 'waipu-sync-checkpoint'
    || !state.stableRunsByStage
    || !state.circuit
    || !state.slots
  ) {
    throw new WaipuSyncError('STATE_CORRUPT')
  }
  return state
}

export function assertStageAllowed(state, stage, { fullStageApproved = false } = {}) {
  if (!WAIPU_SYNC_STAGES.includes(stage)) throw new WaipuSyncError('INVALID_STAGE')
  const required = previousStage(stage)
  if (required !== null && Number(state.stableRunsByStage?.[stageKey(required)] || 0) < 7) {
    throw new WaipuSyncError('INVALID_STAGE')
  }
  if (stage === 'full' && !fullStageApproved) throw new WaipuSyncError('INVALID_STAGE')
}

async function acquireLock(lockPath, { now, staleAfterMs }) {
  const startedAt = new Date(now()).toISOString()
  await mkdir(dirname(lockPath), { recursive: true })
  try {
    await mkdir(lockPath, { recursive: false })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const owner = await readJson(resolve(lockPath, 'owner.json'), null)
    const ownerStartedAt = Date.parse(owner?.startedAt)
    const stale = Number.isFinite(ownerStartedAt) && now() - ownerStartedAt >= staleAfterMs
    if (!stale) throw new WaipuSyncError('SINGLE_FLIGHT_ACTIVE')
    const stalePath = `${lockPath}.stale.${randomUUID()}`
    try {
      await rename(lockPath, stalePath)
    } catch (renameError) {
      if (renameError?.code === 'ENOENT') return acquireLock(lockPath, { now, staleAfterMs })
      throw new WaipuSyncError('SINGLE_FLIGHT_ACTIVE', { cause: renameError })
    }
    await rm(stalePath, { recursive: true, force: true })
    return acquireLock(lockPath, { now, staleAfterMs })
  }
  try {
    await writeJsonAtomic(resolve(lockPath, 'owner.json'), { pid: process.pid, startedAt })
    activeProcessLocks.add(lockPath)
  } catch (error) {
    await rm(lockPath, { recursive: true, force: true })
    throw error
  }
  return async () => {
    try {
      await rm(lockPath, { recursive: true, force: true })
    } finally {
      activeProcessLocks.delete(lockPath)
    }
  }
}

export async function withWaipuSingleFlight(lockPath, task, options = {}) {
  const now = options.now || Date.now
  const staleAfterMs = integerOption(
    options.staleAfterMs,
    DEFAULT_LOCK_STALE_MS,
    { min: 60_000, max: 24 * 60 * 60 * 1_000 },
  )
  const release = await acquireLock(resolve(lockPath), { now, staleAfterMs })
  try {
    return await task()
  } finally {
    await release()
  }
}

function createRequestGate({ requestBudget, paceMs, jitterMs, random, sleep, now, metrics }) {
  let previousStartedAt = null
  return async function gatedRequest(operation) {
    if (metrics.requestsStarted >= requestBudget) {
      throw new WaipuSyncError('REQUEST_BUDGET_EXHAUSTED')
    }
    if (previousStartedAt !== null) {
      const targetGap = paceMs + Math.floor(random() * (jitterMs + 1))
      const remaining = Math.max(0, previousStartedAt + targetGap - now())
      if (remaining > 0) await sleep(remaining)
    }
    previousStartedAt = now()
    metrics.requestsStarted += 1
    return operation()
  }
}

function isRetryable(error) {
  return error?.code === 'UPSTREAM_ERROR' || error?.code === 'NETWORK_ERROR'
}

function taskKey(stationId, slot) {
  return `${stationId}|${slot.toISOString()}`
}

function shouldProcessSlot(checkpoint, slot, now, nearFutureMs, refreshIntervalMs) {
  if (!checkpoint) return true
  const slotEnd = slot.getTime() + WAIPU_SLOT_DURATION_MS
  if (slotEnd <= now) return !checkpoint.immutable
  if (slot.getTime() - now > nearFutureMs) return false
  const lastChecked = Date.parse(checkpoint.lastCheckedAt)
  return !Number.isFinite(lastChecked) || now - lastChecked >= refreshIntervalMs
}

function circuitBlocksRun(state, now) {
  if (state.circuit.automaticRunsDisabled) return true
  const blockedUntil = Date.parse(state.circuit.blockedUntil)
  return Number.isFinite(blockedUntil) && blockedUntil > now
}

function pruneCheckpoints(state, minimumSlotStart) {
  for (const [key, checkpoint] of Object.entries(state.slots)) {
    const start = Date.parse(checkpoint.slotStart)
    if (Number.isFinite(start) && start < minimumSlotStart) delete state.slots[key]
  }
}

function baseStatus({ generatedAt, stage, selectedStations, slots, requestBudget, paceMs, jitterMs }) {
  return {
    schemaVersion: WAIPU_SYNC_SCHEMA_VERSION,
    kind: 'waipu-sync-status',
    generatedAt,
    status: 'running',
    stage,
    stations: selectedStations.map(({ id, displayName }) => ({ id, displayName })),
    horizon: {
      start: slots[0]?.toISOString() || null,
      endExclusive: slots.length
        ? new Date(slots.at(-1).getTime() + WAIPU_SLOT_DURATION_MS).toISOString()
        : null,
    },
    pacing: { concurrency: 1, minimumMs: paceMs, jitterMs },
    requestBudget,
    metrics: {
      requestsStarted: 0,
      retries: 0,
      retryReasons: {},
      slotsConsidered: selectedStations.length * slots.length,
      slotsPlanned: 0,
      slotsProcessed: 0,
      slotsSkippedByCheckpoint: 0,
    },
    circuit: null,
    promotion: null,
    failure: null,
  }
}

function sanitizedFailure(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR',
    status: Number.isInteger(error?.status) ? error.status : null,
    retryAfterSeconds: Number.isInteger(error?.retryAfterSeconds) ? error.retryAfterSeconds : null,
  }
}

export async function runWaipuSync(options = {}) {
  const now = options.now || Date.now
  const runStartedAt = now()
  const generatedAt = new Date(runStartedAt).toISOString()
  const stage = options.stage ?? 7
  const requestBudget = integerOption(options.requestBudget, DEFAULT_REQUEST_BUDGET, { min: 1, max: 10_000 })
  const paceMs = integerOption(options.paceMs, DEFAULT_PACE_MS, { min: 350, max: 10_000 })
  const jitterMs = integerOption(options.jitterMs, DEFAULT_JITTER_MS, { min: 0, max: 2_000 })
  const maxRetries = integerOption(options.maxRetries, DEFAULT_MAX_RETRIES, { min: 0, max: 3 })
  const retryBaseMs = integerOption(options.retryBaseMs, DEFAULT_RETRY_BASE_MS, { min: 100, max: 60_000 })
  const rateLimitPauseMs = integerOption(
    options.rateLimitPauseMs,
    DEFAULT_RATE_LIMIT_PAUSE_MS,
    { min: 60_000, max: 24 * 60 * 60 * 1_000 },
  )
  const nearFutureMs = integerOption(options.nearFutureHours, DEFAULT_NEAR_FUTURE_HOURS, { min: 0, max: 72 }) * 60 * 60 * 1_000
  const refreshIntervalMs = integerOption(options.futureRefreshHours, DEFAULT_FUTURE_REFRESH_HOURS, { min: 1, max: 72 }) * 60 * 60 * 1_000
  const random = options.random || Math.random
  const sleep = options.sleep || ((milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)))
  const statePath = resolve(options.statePath || resolve(root, 'artifacts/waipu-sync/checkpoint.json'))
  const statusPath = resolve(options.statusPath || resolve(root, 'artifacts/waipu-sync/status.json'))
  const lockPath = resolve(options.lockPath || resolve(root, 'artifacts/waipu-sync/active.lock'))
  const cache = options.cache || new WaipuEpgCache({
    root: options.cacheRoot || resolve(root, 'artifacts/waipu-sync/cache'),
    now,
  })
  const client = options.client || new WaipuPublicApiClient({ now })

  return withWaipuSingleFlight(lockPath, async () => {
    const state = await loadState(statePath, runStartedAt)
    if (options.resetCircuit === true) {
      state.circuit = emptyState(runStartedAt).circuit
      await writeJsonAtomic(statePath, state)
    }
    if (circuitBlocksRun(state, runStartedAt)) throw new WaipuSyncError('CIRCUIT_OPEN')
    assertStageAllowed(state, stage, { fullStageApproved: options.fullStageApproved === true })

    const slots = buildRollingSlots(runStartedAt, options.horizonDays || 14)
    const metrics = {
      requestsStarted: 0,
      retries: 0,
      retryReasons: {},
      slotsConsidered: 0,
      slotsPlanned: 0,
      slotsProcessed: 0,
      slotsSkippedByCheckpoint: 0,
    }
    const gate = createRequestGate({ requestBudget, paceMs, jitterMs, random, sleep, now, metrics })
    const requestWithRetry = async (operation) => {
      let retries = 0
      while (true) {
        try {
          return await gate(operation)
        } catch (error) {
          if (!isRetryable(error) || retries >= maxRetries) throw error
          const backoff = retryBaseMs * (2 ** retries) + Math.floor(random() * (jitterMs + 1))
          retries += 1
          metrics.retries += 1
          const reason = typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR'
          metrics.retryReasons[reason] = Number(metrics.retryReasons[reason] || 0) + 1
          await sleep(backoff)
        }
      }
    }
    const controlledClient = {
      getStations: (validators) => requestWithRetry(() => client.getStations(validators)),
      getGridInfo: (validators) => requestWithRetry(() => client.getGridInfo(validators)),
      getGrid: (stationId, slot, validators) => requestWithRetry(() => client.getGrid(stationId, slot, validators)),
      getProgram: (programId, validators) => requestWithRetry(() => client.getProgram(programId, validators)),
    }

    let selectedStations = []
    let status = baseStatus({ generatedAt, stage, selectedStations, slots, requestBudget, paceMs, jitterMs })
    try {
      const stationResult = await cache.getStations(controlledClient)
      await cache.getGridInfo(controlledClient)
      selectedStations = selectStageStations(stationResult.value, stage)
      status = baseStatus({ generatedAt, stage, selectedStations, slots, requestBudget, paceMs, jitterMs })
      Object.assign(status.metrics, metrics)

      const tasks = []
      for (const slot of slots) {
        for (const station of selectedStations) {
          const key = taskKey(station.id, slot)
          metrics.slotsConsidered += 1
          if (shouldProcessSlot(state.slots[key], slot, runStartedAt, nearFutureMs, refreshIntervalMs)) {
            tasks.push({ key, station, slot })
          } else {
            metrics.slotsSkippedByCheckpoint += 1
          }
        }
      }
      metrics.slotsPlanned = tasks.length

      for (const task of tasks) {
        try {
          const result = await cache.getGrid(controlledClient, task.station.id, task.slot)
          state.slots[task.key] = {
            stationId: task.station.id,
            slotStart: task.slot.toISOString(),
            lastCheckedAt: new Date(now()).toISOString(),
            immutable: task.slot.getTime() + WAIPU_SLOT_DURATION_MS <= runStartedAt,
            programCount: Array.isArray(result.value) ? result.value.length : 0,
            cache: result.cache,
          }
          metrics.slotsProcessed += 1
          state.updatedAt = new Date(now()).toISOString()
          await writeJsonAtomic(statePath, state)
        } catch (error) {
          if (error?.code === 'REQUEST_BUDGET_EXHAUSTED') {
            status.status = 'paused_request_budget'
            break
          }
          throw error
        }
      }

      if (status.status === 'running') {
        status.status = 'complete'
        const key = stageKey(stage)
        state.stableRunsByStage[key] = Number(state.stableRunsByStage[key] || 0) + 1
      }
      pruneCheckpoints(state, slots[0].getTime())
      state.updatedAt = new Date(now()).toISOString()
      status.metrics = { ...status.metrics, ...metrics }
      const stableRuns = Number(state.stableRunsByStage[stageKey(stage)] || 0)
      status.promotion = {
        stableRuns,
        eligibleForNextStage: status.status === 'complete' && stableRuns >= 7 && stage !== 'full',
        eligibleForConcurrencyTwo: status.status === 'complete' && stableRuns >= 7,
        automaticPromotion: false,
      }
      status.circuit = state.circuit
      await writeJsonAtomic(statePath, state)
      await writeJsonAtomic(statusPath, status)
      return status
    } catch (error) {
      if (error?.code === 'FORBIDDEN_STOP') {
        state.circuit = {
          automaticRunsDisabled: true,
          reason: 'FORBIDDEN_STOP',
          openedAt: new Date(now()).toISOString(),
          blockedUntil: null,
        }
        status.status = 'blocked_forbidden'
      } else if (error?.code === 'RATE_LIMIT_STOP') {
        const delay = Number.isInteger(error.retryAfterSeconds)
          ? error.retryAfterSeconds * 1_000
          : rateLimitPauseMs
        state.circuit = {
          automaticRunsDisabled: false,
          reason: 'RATE_LIMIT_STOP',
          openedAt: new Date(now()).toISOString(),
          blockedUntil: new Date(now() + delay).toISOString(),
        }
        status.status = 'paused_rate_limit'
      } else if (error?.code === 'REQUEST_BUDGET_EXHAUSTED') {
        status.status = 'paused_request_budget'
      } else {
        status.status = isRetryable(error) ? 'failed_retry_exhausted' : 'failed_closed'
      }
      state.updatedAt = new Date(now()).toISOString()
      status.metrics = { ...status.metrics, ...metrics }
      status.circuit = state.circuit
      status.failure = error?.code === 'REQUEST_BUDGET_EXHAUSTED'
        ? null
        : sanitizedFailure(error)
      await writeJsonAtomic(statePath, state)
      await writeJsonAtomic(statusPath, status)
      return status
    }
  }, { now, staleAfterMs: options.lockStaleMs })
}

function cliOptions(argv) {
  const live = argv.includes('--live')
  const resetCircuit = argv.includes('--reset-circuit')
  const stageArgument = argv.find((value) => value.startsWith('--stage='))?.split('=')[1]
  const stage = stageArgument === 'full' ? 'full' : Number(stageArgument || 7)
  return { live, resetCircuit, stage }
}

async function main() {
  const options = cliOptions(process.argv.slice(2))
  if (!options.live || process.env.WAIPU_SYNC_LIVE !== '1') {
    throw new WaipuSyncError('LIVE_CONFIRMATION_REQUIRED')
  }
  const status = await runWaipuSync({
    stage: options.stage,
    resetCircuit: options.resetCircuit,
    fullStageApproved: process.env.WAIPU_SYNC_FULL_APPROVED === '1',
    requestBudget: process.env.WAIPU_SYNC_REQUEST_BUDGET,
  })
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`)
  if (!['complete', 'paused_request_budget', 'paused_rate_limit'].includes(status.status)) {
    process.exitCode = 1
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  main().catch((error) => {
    const failure = sanitizedFailure(error)
    process.stderr.write(`${JSON.stringify(failure)}\n`)
    process.exitCode = 1
  })
}
