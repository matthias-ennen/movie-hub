import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TMDB_CHANGE_QUEUE_VERSION = 1
export const TMDB_CHANGE_RETENTION_DAYS = 30
export const TMDB_CHANGE_REQUIRED_CONSUMERS = Object.freeze([
  'tmdb-catalog',
  'waipu-catalog',
  'moviehub-metadata',
  'personal-tmdb-metadata',
  'firebase-publication',
])
const MAX_WINDOW_DAYS = 14
const MAX_RETRIES = 4
const DAY_MILLISECONDS = 86_400_000
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultDirectory = resolve(process.env.TMDB_CHANGE_QUEUE_DIRECTORY || resolve(root, 'artifacts/tmdb-data'))

function dateValue(value) {
  const timestamp = Date.parse(`${String(value || '').slice(0, 10)}T00:00:00.000Z`)
  return Number.isFinite(timestamp) ? timestamp : null
}

function dateString(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('A valid date is required for the TMDB change window.')
  return date.toISOString().slice(0, 10)
}

function addDays(value, days) {
  const timestamp = dateValue(value)
  if (timestamp === null) throw new Error(`Invalid date: ${value}`)
  return dateString(timestamp + Number(days) * DAY_MILLISECONDS)
}

function canonicalKey(type, id) {
  const normalizedType = type === 'series' || type === 'tv' ? 'series' : 'movie'
  const normalizedId = Number(id)
  return Number.isInteger(normalizedId) && normalizedId > 0 ? `${normalizedType}:${normalizedId}` : null
}

function normalizePending(values, type) {
  const result = []
  for (const value of Array.isArray(values) ? values : []) {
    const id = Number(value?.id ?? value)
    const lastSeen = String(value?.lastSeen || '')
    if (canonicalKey(type, id) && Number.isFinite(Date.parse(lastSeen))) result.push({ id, lastSeen })
  }
  return result
}

export function normalizeTmdbChangeState(value = {}) {
  return {
    kind: 'tmdb-change-state',
    version: TMDB_CHANGE_QUEUE_VERSION,
    throughDate: dateValue(value?.throughDate) === null ? null : String(value.throughDate).slice(0, 10),
    pending: {
      movie: normalizePending(value?.pending?.movie, 'movie'),
      series: normalizePending(value?.pending?.series, 'series'),
    },
  }
}

export function buildTmdbChangeWindows({
  throughDate = null,
  endDate = new Date(),
  overlapDays = 1,
  bootstrapDays = 2,
  maxWindowDays = MAX_WINDOW_DAYS,
} = {}) {
  const end = dateString(endDate)
  const start = dateValue(throughDate) === null
    ? addDays(end, -Math.max(1, Number(bootstrapDays) || 2))
    : addDays(throughDate, -Math.max(0, Number(overlapDays) || 0))
  if (dateValue(start) > dateValue(end)) return []

  const windows = []
  let cursor = start
  const windowDays = Math.max(1, Math.min(MAX_WINDOW_DAYS, Number(maxWindowDays) || MAX_WINDOW_DAYS))
  while (dateValue(cursor) <= dateValue(end)) {
    const candidateEnd = addDays(cursor, windowDays - 1)
    const windowEnd = dateValue(candidateEnd) > dateValue(end) ? end : candidateEnd
    windows.push({ startDate: cursor, endDate: windowEnd })
    cursor = addDays(windowEnd, 1)
  }
  return windows
}

async function sleep(milliseconds) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

async function requestChanges({
  fetchImpl,
  token,
  tmdbType,
  window,
  page,
  attempt = 0,
  sleepImpl = sleep,
}) {
  const endpoint = new URL(`https://api.themoviedb.org/3/${tmdbType}/changes`)
  endpoint.searchParams.set('start_date', window.startDate)
  endpoint.searchParams.set('end_date', window.endDate)
  endpoint.searchParams.set('page', String(page))
  const response = await fetchImpl(endpoint, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfter = Number(response.headers?.get?.('retry-after'))
    await sleepImpl(Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 500 * (2 ** attempt))
    return requestChanges({ fetchImpl, token, tmdbType, window, page, attempt: attempt + 1, sleepImpl })
  }
  if (!response.ok) throw new Error(`TMDB ${tmdbType} changes failed with HTTP ${response.status}`)
  return response.json()
}

export async function fetchTmdbChangedIds({
  fetchImpl = fetch,
  token,
  type,
  window,
  sleepImpl = sleep,
} = {}) {
  if (!token) throw new Error('TMDB_API_READ_TOKEN is missing for the change list.')
  const tmdbType = type === 'series' || type === 'tv' ? 'tv' : 'movie'
  const ids = new Set()
  let page = 1
  let totalPages = 1
  do {
    const payload = await requestChanges({ fetchImpl, token, tmdbType, window, page, sleepImpl })
    for (const result of Array.isArray(payload?.results) ? payload.results : []) {
      const id = Number(result?.id)
      if (Number.isInteger(id) && id > 0) ids.add(id)
    }
    totalPages = Math.max(1, Number(payload?.total_pages) || 1)
    page += 1
  } while (page <= totalPages)
  return [...ids]
}

export function mergeTmdbPendingChanges(state, changed, {
  now = new Date(),
  retentionDays = TMDB_CHANGE_RETENTION_DAYS,
} = {}) {
  const normalized = normalizeTmdbChangeState(state)
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString()
  const cutoff = Date.parse(nowIso) - Math.max(1, Number(retentionDays) || TMDB_CHANGE_RETENTION_DAYS) * DAY_MILLISECONDS
  const mergeType = (type) => {
    const pending = new Map(normalized.pending[type]
      .filter((entry) => Date.parse(entry.lastSeen) >= cutoff)
      .map((entry) => [entry.id, entry]))
    for (const id of Array.isArray(changed?.[type]) ? changed[type] : []) {
      if (canonicalKey(type, id)) pending.set(Number(id), { id: Number(id), lastSeen: nowIso })
    }
    return [...pending.values()].sort((left, right) => left.id - right.id)
  }
  return { movie: mergeType('movie'), series: mergeType('series') }
}

export function tmdbChangedTitleKeys(changeSet) {
  return new Set(tmdbChangedTitleTimes(changeSet).keys())
}

export function tmdbChangedTitleTimes(changeSet) {
  const result = new Map()
  for (const [type, values] of Object.entries({
    movie: changeSet?.pending?.movie,
    series: changeSet?.pending?.series,
  })) {
    for (const entry of Array.isArray(values) ? values : []) {
      const key = canonicalKey(type, entry?.id ?? entry)
      if (!key) continue
      const lastSeen = Date.parse(entry?.lastSeen || '')
      const previous = Date.parse(result.get(key) || '')
      if (Number.isFinite(lastSeen) && (!Number.isFinite(previous) || lastSeen > previous)) {
        result.set(key, new Date(lastSeen).toISOString())
      } else if (!result.has(key)) {
        // Keep compatibility with explicitly supplied id-only change sets. A
        // missing timestamp cannot prove that a consumer already processed it.
        result.set(key, null)
      }
    }
  }
  return result
}

function timestampMilliseconds(value) {
  if (!value) return null
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function isTmdbTitleChangePending(changes, key, metadataUpdatedAt = null) {
  if (!key || !changes?.has?.(key)) return false
  // Existing Set-based callers deliberately mean "force this identity" and
  // therefore retain their previous behaviour.
  if (!(changes instanceof Map)) return true
  const changedAt = timestampMilliseconds(changes.get(key))
  const updatedAt = timestampMilliseconds(metadataUpdatedAt)
  if (changedAt === null || updatedAt === null) return true
  return updatedAt < changedAt
}

export async function readTmdbChangeSet(path = resolve(defaultDirectory, 'change-set.json')) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'))
    if (value?.kind !== 'tmdb-change-set' || Number(value?.version) !== TMDB_CHANGE_QUEUE_VERSION) return null
    return value
  } catch {
    return null
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

export async function collectTmdbChangeQueue({
  fetchImpl = fetch,
  token = process.env.TMDB_API_READ_TOKEN,
  now = new Date(),
  directory = defaultDirectory,
  sleepImpl = sleep,
  requiredConsumers = TMDB_CHANGE_REQUIRED_CONSUMERS,
} = {}) {
  let state = normalizeTmdbChangeState()
  try {
    state = normalizeTmdbChangeState(JSON.parse(await readFile(resolve(directory, 'state.json'), 'utf8')))
  } catch {
    // The first successful run bootstraps a short overlap window.
  }
  const endDate = dateString(now)
  const windows = buildTmdbChangeWindows({ throughDate: state.throughDate, endDate })
  const changed = { movie: new Set(), series: new Set() }
  for (const window of windows) {
    const [movies, series] = await Promise.all([
      fetchTmdbChangedIds({ fetchImpl, token, type: 'movie', window, sleepImpl }),
      fetchTmdbChangedIds({ fetchImpl, token, type: 'series', window, sleepImpl }),
    ])
    movies.forEach((id) => changed.movie.add(id))
    series.forEach((id) => changed.series.add(id))
  }
  const pending = mergeTmdbPendingChanges(state, {
    movie: [...changed.movie],
    series: [...changed.series],
  }, { now })
  const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString()
  const changeSet = {
    kind: 'tmdb-change-set',
    version: TMDB_CHANGE_QUEUE_VERSION,
    generatedAt,
    startDate: windows[0]?.startDate || endDate,
    endDate,
    windows,
    fetched: { movie: changed.movie.size, series: changed.series.size },
    pending,
  }
  const nextState = {
    kind: 'tmdb-change-state',
    version: TMDB_CHANGE_QUEUE_VERSION,
    generatedAt,
    throughDate: endDate,
    pending,
  }
  await writeJsonAtomic(resolve(directory, 'change-set.json'), changeSet)
  await writeJsonAtomic(resolve(directory, 'state.next.json'), nextState)
  await writeJsonAtomic(resolve(directory, 'run.json'), {
    kind: 'tmdb-change-run',
    version: TMDB_CHANGE_QUEUE_VERSION,
    generationId: generatedAt,
    generatedAt,
    requiredConsumers: [...new Set(requiredConsumers.map((value) => String(value).trim()).filter(Boolean))],
    acknowledgements: {},
  })
  return changeSet
}

export async function acknowledgeTmdbChangeConsumer({
  consumer,
  directory = defaultDirectory,
  now = new Date(),
} = {}) {
  const normalizedConsumer = String(consumer || '').trim()
  if (!normalizedConsumer) throw new Error('A TMDB change consumer is required.')
  const runPath = resolve(directory, 'run.json')
  const run = JSON.parse(await readFile(runPath, 'utf8'))
  if (run?.kind !== 'tmdb-change-run' || Number(run?.version) !== TMDB_CHANGE_QUEUE_VERSION) {
    throw new Error('The staged TMDB change run is invalid.')
  }
  const stagedState = JSON.parse(await readFile(resolve(directory, 'state.next.json'), 'utf8'))
  if (!run.generationId || run.generationId !== stagedState.generatedAt) {
    throw new Error('The staged TMDB change run does not match its checkpoint.')
  }
  if (!Array.isArray(run.requiredConsumers) || !run.requiredConsumers.includes(normalizedConsumer)) {
    throw new Error(`Unknown TMDB change consumer: ${normalizedConsumer}`)
  }
  const acknowledgedAt = (now instanceof Date ? now : new Date(now)).toISOString()
  const nextRun = {
    ...run,
    acknowledgements: {
      ...(run.acknowledgements && typeof run.acknowledgements === 'object' ? run.acknowledgements : {}),
      [normalizedConsumer]: { acknowledgedAt },
    },
  }
  await writeJsonAtomic(runPath, nextRun)
  return nextRun
}

export async function verifyTmdbChangeConsumers({
  directory = defaultDirectory,
  excludedConsumers = [],
} = {}) {
  const stagedState = JSON.parse(await readFile(resolve(directory, 'state.next.json'), 'utf8'))
  const run = JSON.parse(await readFile(resolve(directory, 'run.json'), 'utf8'))
  if (run?.kind !== 'tmdb-change-run' || Number(run?.version) !== TMDB_CHANGE_QUEUE_VERSION) {
    throw new Error('The staged TMDB change run is invalid.')
  }
  if (!run.generationId || run.generationId !== stagedState.generatedAt) {
    throw new Error('The staged TMDB change run does not match its checkpoint.')
  }
  const excluded = new Set((Array.isArray(excludedConsumers) ? excludedConsumers : [])
    .map((value) => String(value).trim()).filter(Boolean))
  const missingConsumers = (Array.isArray(run.requiredConsumers) ? run.requiredConsumers : [])
    .filter((consumer) => !excluded.has(consumer))
    .filter((consumer) => !run.acknowledgements?.[consumer]?.acknowledgedAt)
  if (missingConsumers.length > 0) {
    throw new Error(`TMDB change checkpoint is missing acknowledgements: ${missingConsumers.join(', ')}`)
  }
  return run
}

export async function commitTmdbChangeQueue({ directory = defaultDirectory } = {}) {
  const nextPath = resolve(directory, 'state.next.json')
  const stagedState = JSON.parse(await readFile(nextPath, 'utf8'))
  const nextState = normalizeTmdbChangeState(stagedState)
  const runPath = resolve(directory, 'run.json')
  const run = JSON.parse(await readFile(runPath, 'utf8'))
  if (run?.kind !== 'tmdb-change-run' || Number(run?.version) !== TMDB_CHANGE_QUEUE_VERSION) {
    throw new Error('The staged TMDB change run is invalid.')
  }
  if (!run.generationId || run.generationId !== stagedState.generatedAt) {
    throw new Error('The staged TMDB change run does not match its checkpoint.')
  }
  await verifyTmdbChangeConsumers({ directory })
  const committedAt = new Date().toISOString()
  await writeJsonAtomic(resolve(directory, 'state.json'), {
    ...nextState,
    generationId: run.generationId,
    committedAt,
  })
  await writeJsonAtomic(resolve(directory, 'last-run.json'), {
    ...run,
    status: 'committed',
    committedAt,
  })
  await rm(nextPath, { force: true })
  await rm(runPath, { force: true })
  return nextState
}

async function main() {
  const acknowledgementIndex = process.argv.indexOf('--ack')
  if (acknowledgementIndex >= 0) {
    const consumer = process.argv[acknowledgementIndex + 1]
    await acknowledgeTmdbChangeConsumer({ consumer })
    console.log(`TMDB change consumer acknowledged: ${consumer}.`)
    return
  }
  if (process.argv.includes('--commit')) {
    const state = await commitTmdbChangeQueue()
    console.log(`TMDB change checkpoint committed through ${state.throughDate}.`)
    return
  }
  if (process.argv.includes('--verify')) {
    const excludedConsumers = process.argv.flatMap((argument, index, values) => (
      argument === '--exclude' && values[index + 1] ? [values[index + 1]] : []
    ))
    const run = await verifyTmdbChangeConsumers({ excludedConsumers })
    console.log(`TMDB change consumers verified for generation ${run.generationId}.`)
    return
  }
  const changeSet = await collectTmdbChangeQueue()
  console.log(
    `TMDB changes: ${changeSet.fetched.movie} movies and ${changeSet.fetched.series} series fetched; `
    + `${changeSet.pending.movie.length + changeSet.pending.series.length} pending.`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
