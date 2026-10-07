import { mkdir, readFile, rename, writeFile, readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const DAY = 86400000
const HOUR = 3600000
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

export function joynImportHorizon(now = Date.now()) {
  const start = new Date(now).toISOString().slice(0, 10) + 'T00:00:00.000Z'
  return { start, endExclusive: new Date(Date.parse(start) + 14 * DAY).toISOString() }
}

export async function writeJoynJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(value) + '\n', 'utf8')
  await rename(temporary, path)
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}

export function validateJoynWindowItems(items, { from, to, stationIds }) {
  if (!Array.isArray(items)) throw new Error('Joyn EPG window has no items array.')
  for (const item of items) {
    if (item?.livestream?.id && !stationIds.has(item.livestream.id)) continue
    const start = Number(item?.start) * 1000
    const end = Number(item?.end) * 1000
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start
        || start > to || end < from
        || !item?.livestream?.id
        || !item?.program?.id || !item?.program?.title) {
      throw new Error(`Invalid Joyn EPG record: ${JSON.stringify({ start: item?.start, end: item?.end, station: item?.livestream?.id, programId: item?.program?.id, programType: item?.program?.__typename })}`)
    }
  }
  return items
}

export function joynV2Streams(streams, items) {
  const byChannel = new Map(streams.map((stream) => [stream.id, { ...stream, epgEvents: [] }]))
  const seen = new Set()
  for (const item of items) {
    const key = `${item.livestream.id}|${item.program.id}|${item.start}|${item.end}`
    if (seen.has(key)) continue
    seen.add(key)
    byChannel.get(item.livestream.id)?.epgEvents.push({
      startDate: item.start, endDate: item.end,
      program: { ...item.program, startDate: item.start, endDate: item.end },
    })
  }
  return [...byChannel.values()]
}

// A response at the observed 1,000-item cap is never accepted as a full window.
// Split windows until every response is below the cap; duplicate crossing
// broadcasts are removed only after their original identities are validated.
export async function syncJoynEpg({
  streams, requestWindow, directory, now = Date.now(),
  horizon = joynImportHorizon(now), maxRequests = 500,
  responseLimit = 1000, minimumWindowMs = 60000,
  paceMs = 250, sleepImpl = sleep, onProgress = null,
} = {}) {
  const start = Date.parse(horizon.start)
  const end = Date.parse(horizon.endExclusive)
  if (!Number.isFinite(start) || end - start !== 14 * DAY || !streams?.length) {
    throw new Error('A 14-day horizon and Joyn station inventory are required.')
  }
  const path = resolve(directory, 'checkpoint.json')
  const checkpoint = await readJson(path, { schemaVersion: 1, kind: 'joyn-sync-checkpoint', windows: {} })
  if (checkpoint?.schemaVersion !== 1 || checkpoint?.kind !== 'joyn-sync-checkpoint'
      || !checkpoint.windows || typeof checkpoint.windows !== 'object') throw new Error('Invalid Joyn checkpoint.')
  const stationIds = new Set(streams.map(({ id }) => id))
  const inventory = JSON.stringify([...stationIds].sort())
  const metrics = { requestsStarted: 0, retries: 0, splitWindows: 0, windowsProcessed: 0, cacheHits: 0 }
  const allItems = []
  const activeKeys = new Set()
  async function fetchWindow(from, to) {
    let items
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (metrics.requestsStarted >= maxRequests) {
        const error = new Error('Joyn EPG request budget reached; checkpoint saved for the next run.')
        error.code = 'JOYN_EPG_REQUEST_BUDGET'; throw error
      }
      if (metrics.requestsStarted) await sleepImpl(paceMs)
      metrics.requestsStarted += 1
      try {
        items = await requestWindow(Math.floor(from / 1000), Math.ceil(to / 1000))
        break
      } catch (error) {
        if (error.code?.startsWith('JOYN_SOURCE_')) throw error
        if (attempt === 3 || !(error.status === 429 || error.status >= 500)) throw error
        metrics.retries += 1
        await sleepImpl(error.retryAfter > 0 ? error.retryAfter * 1000 : 500 * (2 ** attempt))
      }
    }
    validateJoynWindowItems(items, { from, to, stationIds })
    if (items.length < responseLimit) return items
    if (to - from <= minimumWindowMs) throw new Error('Joyn response remains capped at the minimum window size.')
    metrics.splitWindows += 1
    const middle = Math.floor((from + to) / 2000) * 1000
    return [...await fetchWindow(from, middle), ...await fetchWindow(middle, to)]
  }
  try {
    for (let from = start; from < end; from += 6 * HOUR) {
      const to = Math.min(end, from + 6 * HOUR)
      const key = `${from}_${to}`
      activeKeys.add(key)
      const file = resolve(directory, 'cache', `${key}.json`)
      const previous = checkpoint.windows[key]
      const maxAge = from < now + 2 * DAY ? 6 * HOUR : 3 * DAY
      let items
      if (previous?.inventory === inventory && now - Date.parse(previous.fetchedAt) >= 0 && now - Date.parse(previous.fetchedAt) < maxAge) {
        const saved = await readJson(file, null)
        if (!saved || saved.from !== from || saved.to !== to) throw new Error('Joyn checkpoint is missing its matching raw cache.')
        if (saved.fetchedAt !== previous.fetchedAt || saved.items?.length !== previous.count) throw new Error('Joyn raw cache and checkpoint disagree.')
        items = validateJoynWindowItems(saved.items, { from, to, stationIds })
        metrics.cacheHits += 1
      } else {
        items = await fetchWindow(from, to)
        const fetchedAt = new Date(now).toISOString()
        await writeJoynJson(file, { from, to, fetchedAt, items })
        checkpoint.windows[key] = { fetchedAt, count: items.length, inventory }
        await writeJoynJson(path, checkpoint)
      }
      allItems.push(...items)
      metrics.windowsProcessed += 1
      onProgress?.({ ...metrics, expectedWindows: 56 })
    }
    if (!allItems.length) throw new Error('Joyn 14-day EPG is empty.')
    metrics.outsideInventory = new Set(allItems.filter((item) => !stationIds.has(item.livestream.id))
      .map((item) => `${item.livestream.id}|${item.program?.id}|${item.start}|${item.end}`)).size
    const converted = joynV2Streams(streams, allItems.filter((item) => stationIds.has(item.livestream.id)
      && item.start * 1000 < end && item.end * 1000 > start))
    const coverage = converted.map((stream) => ({
      id: stream.id, title: stream.title || stream.id, programs: stream.epgEvents.length,
      days: [...new Set(stream.epgEvents.filter((event) => event.startDate * 1000 >= start)
        .map((event) => new Date(event.startDate * 1000).toISOString().slice(0, 10)))].sort(),
    }))
    if (!coverage.some((station) => station.programs > 0)) throw new Error('Joyn linear station EPG is empty.')
    if (coverage.some((station) => station.programs === 0)) throw new Error('Joyn linear station is missing its entire EPG.')
    for (const key of Object.keys(checkpoint.windows)) if (!activeKeys.has(key)) delete checkpoint.windows[key]
    await mkdir(resolve(directory, 'cache'), { recursive: true })
    for (const name of await readdir(resolve(directory, 'cache'))) {
      if (/^\d+_\d+\.json$/.test(name) && !activeKeys.has(name.slice(0, -5))) await rm(resolve(directory, 'cache', name))
    }
    const status = { schemaVersion: 1, kind: 'joyn-sync-status', status: 'complete', generatedAt: new Date(now).toISOString(), horizon, metrics, coverage }
    await writeJoynJson(resolve(directory, 'status.json'), status)
    return { streams: converted, items: allItems, status }
  } catch (error) {
    await writeJoynJson(resolve(directory, 'status.json'), {
      schemaVersion: 1, kind: 'joyn-sync-status', status: 'failed', generatedAt: new Date(now).toISOString(),
      horizon, metrics, failure: { code: error.code || 'JOYN_EPG_FAILED', message: error.message },
    })
    throw error
  } finally { await writeJoynJson(path, checkpoint) }
}
