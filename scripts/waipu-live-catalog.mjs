import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WaipuEpgCache, WaipuPublicApiClient } from './waipu-public-data.mjs'
import { withWaipuSingleFlight } from './waipu-sync-coordinator.mjs'
import { WaipuProgramDetailLoader } from './waipu-program-detail-loader.mjs'
import {
  classifyWaipuGridProgram,
  classifyWaipuProgram,
  normalizeWaipuProgram,
  normalizeWaipuText,
} from './waipu-program-classifier.mjs'
import {
  WAIPU_MATCHER_VERSION,
  WaipuMatchDecisionStore,
  WaipuTmdbSearchClient,
  matchWaipuProgram,
  normalizeTmdbMatchCandidate,
} from './waipu-tmdb-matcher.mjs'
import {
  WaipuTmdbMetadataClient,
  enrichWaipuTitleMetadata,
  requireCompleteWaipuTitleMetadata,
} from './waipu-title-metadata.mjs'
import { readTmdbChangeSet, tmdbChangedTitleTimes } from './tmdb-change-queue.mjs'
import { SourceSchemaObserver } from '../src/sources/sourceSchemaObserver.js'
import { WAIPU_PROGRAM_UPSTREAM_FIELD_POLICY } from '../src/sources/policies/waipuUpstreamFieldPolicy.js'
import { writeFieldDiscoveryReport } from '../src/sources/fieldDiscoveryReport.js'
import {
  dedupeWaipuBroadcastEvents,
  mapWaipuAiringToBroadcastEvent,
  projectBroadcastEventToWaipuAiring,
} from '../src/sources/adapters/waipuContractMapper.js'

export const WAIPU_LIVE_CATALOG_VERSION = 1
export const WAIPU_SOURCE_DATA_VERSION = 1
export const WAIPU_DAY_DATA_VERSION = 1

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TV_TIME_ZONE = 'Europe/Berlin'
const TV_DAY_START_HOUR = 6

function iso(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function safeStationId(value) {
  const stationId = String(value || '').trim()
  return stationId && /^[a-zA-Z0-9._-]{1,128}$/.test(stationId) ? stationId : null
}

function broadcastKey(value) {
  return `${value.stationId}|${value.programId}|${value.startTime}`
}

function canonicalTitleKey(type, tmdbId) {
  return `${type}:${tmdbId}`
}

function shiftDateKey(key, days) {
  const [year, month, day] = String(key).split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

function tvDayKey(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hourCycle: 'h23', timeZone: TV_TIME_ZONE,
  }).formatToParts(new Date(value))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]))
  const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
  return parts.hour < TV_DAY_START_HOUR ? shiftDateKey(key, -1) : key
}

function emptyMetrics() {
  return {
    broadcastsRead: 0,
    broadcastsInWindow: 0,
    duplicateBroadcastsRemoved: 0,
    gridCandidates: 0,
    candidatePrograms: 0,
    detailsLoaded: 0,
    detailsUnavailable: 0,
    detailsMissing: 0,
    classifiedPrograms: 0,
    classificationRejected: {},
    matchedPrograms: 0,
    matchRejected: {},
    matchSearchUnavailable: 0,
    publishedTitles: 0,
    publishedBroadcasts: 0,
  }
}

function increment(object, key) {
  object[key] = Number(object[key] || 0) + 1
}

export function collectWaipuBroadcasts(gridRecords, {
  stations = [],
  startTime = null,
  endTimeExclusive = null,
} = {}) {
  const stationNames = new Map((Array.isArray(stations) ? stations : [])
    .map((station) => [safeStationId(station?.id), station?.displayName || station?.name || station?.id])
    .filter(([id]) => id))
  const start = startTime ? Date.parse(startTime) : Number.NEGATIVE_INFINITY
  const end = endTimeExclusive ? Date.parse(endTimeExclusive) : Number.POSITIVE_INFINITY
  const broadcasts = []

  for (const record of Array.isArray(gridRecords) ? gridRecords : []) {
    if (record?.kind !== 'grid' || !Array.isArray(record.value)) continue
    const [rawStationId] = String(record.key || '').split('|')
    const stationId = safeStationId(rawStationId)
    if (!stationId || (stationNames.size && !stationNames.has(stationId))) continue
    for (const program of record.value) {
      const programId = String(program?.id || '').trim()
      const startIso = iso(program?.startTime)
      const stopIso = iso(program?.stopTime)
      if (!programId || !startIso || !stopIso) continue
      const startValue = Date.parse(startIso)
      if (startValue < start || startValue >= end) continue
      broadcasts.push({
        stationId,
        stationName: stationNames.get(stationId) || stationId,
        programId,
        title: String(program?.title || '').trim(),
        episodeTitle: String(program?.episodeTitle || '').trim() || null,
        gridGenre: String(program?.genre || '').trim() || null,
        seriesId: String(program?.seriesId || '').trim() || null,
        startTime: startIso,
        stopTime: stopIso,
        imageUrl: program?.imageUrl || null,
      })
    }
  }

  const unique = new Map()
  for (const broadcast of broadcasts) unique.set(broadcastKey(broadcast), broadcast)
  return [...unique.values()].sort((left, right) => (
    left.startTime.localeCompare(right.startTime)
    || left.stationId.localeCompare(right.stationId)
    || left.programId.localeCompare(right.programId)
  ))
}

function countEligibleBroadcastRows(gridRecords, stationIds, start, endExclusive) {
  const startValue = Date.parse(start)
  const endValue = Date.parse(endExclusive)
  let count = 0
  for (const record of Array.isArray(gridRecords) ? gridRecords : []) {
    if (record?.kind !== 'grid' || !Array.isArray(record.value)) continue
    const [rawStationId] = String(record.key || '').split('|')
    const stationId = safeStationId(rawStationId)
    if (!stationId || (stationIds.size && !stationIds.has(stationId))) continue
    for (const program of record.value) {
      const programId = String(program?.id || '').trim()
      const startsAt = Date.parse(program?.startTime)
      const stopsAt = Date.parse(program?.stopTime)
      if (programId && Number.isFinite(startsAt) && Number.isFinite(stopsAt)
          && startsAt >= startValue && startsAt < endValue) count += 1
    }
  }
  return count
}

export function localTmdbCandidates({ catalog = null, searchIndex = null } = {}) {
  const values = [
    ...(Array.isArray(catalog?.titles) ? catalog.titles : []),
    ...(Array.isArray(searchIndex?.entries) ? searchIndex.entries : []),
  ]
  const unique = new Map()
  for (const value of values) {
    const normalized = normalizeTmdbMatchCandidate(value, 'movie-hub-index')
    if (normalized) unique.set(canonicalTitleKey(normalized.type, normalized.tmdbId), normalized)
  }
  return [...unique.values()]
}

function createCandidateLookup(candidates) {
  const lookup = new Map()
  for (const candidate of candidates) {
    const values = [candidate.title, candidate.originalTitle, ...(Array.isArray(candidate.aliases) ? candidate.aliases : [])]
    for (const value of values) {
      const normalized = normalizeWaipuText(value)
      if (!normalized) continue
      const key = `${candidate.type}|${normalized}`
      if (!lookup.has(key)) lookup.set(key, new Map())
      lookup.get(key).set(canonicalTitleKey(candidate.type, candidate.tmdbId), candidate)
    }
  }
  return (input) => {
    const found = new Map()
    for (const value of input.aliases || []) {
      const matches = lookup.get(`${input.type}|${normalizeWaipuText(value)}`)
      for (const [key, candidate] of matches || []) found.set(key, candidate)
    }
    return [...found.values()]
  }
}

function stationArtifact(stations) {
  return {
    schemaVersion: WAIPU_LIVE_CATALOG_VERSION,
    kind: 'waipu-live-stations',
    stations: stations.map((station) => ({
      id: station.id,
      name: station.displayName || station.name || station.id,
      logoTemplateUrl: station.logoTemplateUrl || station.logoUrl || null,
      streamQualities: Array.isArray(station.streamQualities) ? station.streamQualities : [],
    })),
  }
}

function titleArtifact(titles) {
  return {
    schemaVersion: WAIPU_LIVE_CATALOG_VERSION,
    kind: 'waipu-live-titles',
    count: titles.length,
    entries: titles,
  }
}

function shardArtifact(station, airings) {
  return {
    schemaVersion: WAIPU_LIVE_CATALOG_VERSION,
    kind: 'waipu-live-station',
    station: { id: station.id, name: station.displayName || station.name || station.id },
    count: airings.length,
    airings,
  }
}

function dayArtifact(key, airings) {
  return {
    schemaVersion: WAIPU_LIVE_CATALOG_VERSION,
    kind: 'waipu-live-day',
    key,
    count: airings.length,
    airings,
  }
}

export async function buildWaipuLiveCatalog({
  gridRecords,
  stations,
  horizon,
  loadProgramDetail,
  candidates = [],
  searchTmdb = null,
  decisions = new WaipuMatchDecisionStore(),
  allowIncompleteDetails = false,
  allowUnresolvedMatches = false,
  releaseChannel = 'production',
  now = Date.now,
  onProgress = null,
} = {}) {
  if (typeof loadProgramDetail !== 'function') throw new TypeError('loadProgramDetail must be a function.')
  const generatedAt = new Date(now()).toISOString()
  const start = iso(horizon?.start)
  const endExclusive = iso(horizon?.endExclusive)
  if (!start || !endExclusive || endExclusive <= start) throw new TypeError('A valid horizon is required.')

  const metrics = emptyMetrics()
  metrics.broadcastsRead = (Array.isArray(gridRecords) ? gridRecords : [])
    .reduce((sum, record) => sum + (Array.isArray(record?.value) ? record.value.length : 0), 0)
  const broadcasts = collectWaipuBroadcasts(gridRecords, { stations, startTime: start, endTimeExclusive: endExclusive })
  metrics.broadcastsInWindow = broadcasts.length
  const stationIds = new Set((Array.isArray(stations) ? stations : []).map(({ id }) => safeStationId(id)).filter(Boolean))
  metrics.duplicateBroadcastsRemoved = Math.max(
    0,
    countEligibleBroadcastRows(gridRecords, stationIds, start, endExclusive) - broadcasts.length,
  )

  const candidateBroadcasts = broadcasts.filter((broadcast) => {
    const classification = classifyWaipuGridProgram({
      id: broadcast.programId,
      title: broadcast.title,
      episodeTitle: broadcast.episodeTitle,
      genre: broadcast.gridGenre,
      seriesId: broadcast.seriesId,
    })
    return classification.status === 'candidate'
  })
  metrics.gridCandidates = candidateBroadcasts.length

  const byProgram = new Map()
  for (const broadcast of candidateBroadcasts) {
    if (!byProgram.has(broadcast.programId)) byProgram.set(broadcast.programId, [])
    byProgram.get(broadcast.programId).push(broadcast)
  }
  metrics.candidatePrograms = byProgram.size

  if (byProgram.size > 0 && !candidates.length && typeof searchTmdb !== 'function') {
    const error = new Error('No MovieHub/TMDB candidate source is available for Waipu matching.')
    error.code = 'TMDB_CANDIDATES_MISSING'
    throw error
  }

  const matchesByProgram = new Map()
  const unresolvedPrograms = []
  const candidatesFor = createCandidateLookup(candidates)
  let programIndex = 0
  for (const [programId, programBroadcasts] of byProgram) {
    programIndex += 1
    if (typeof onProgress === 'function' && (programIndex === 1 || programIndex % 250 === 0)) {
      onProgress({
        phase: 'programs',
        processed: programIndex - 1,
        total: byProgram.size,
        detailsLoaded: metrics.detailsLoaded,
        matchedPrograms: metrics.matchedPrograms,
      })
    }
    const first = programBroadcasts[0]
    const gridProgram = {
      id: programId,
      title: first.title,
      episodeTitle: first.episodeTitle,
      genre: first.gridGenre,
      seriesId: first.seriesId,
    }
    const detail = await loadProgramDetail(programId)
    if (detail?.unavailable === true && [404, 410].includes(detail.status)) {
      metrics.detailsUnavailable += 1
      increment(metrics.classificationRejected, 'detail_unavailable')
      continue
    }
    if (!detail) {
      metrics.detailsMissing += 1
      increment(metrics.classificationRejected, 'detail_missing')
      continue
    }
    metrics.detailsLoaded += 1
    const classification = classifyWaipuProgram(gridProgram, detail)
    if (classification.status !== 'accepted') {
      increment(metrics.classificationRejected, classification.reason || 'unclassified')
      continue
    }
    const normalized = normalizeWaipuProgram(gridProgram, detail, classification)
    if (!normalized) {
      increment(metrics.classificationRejected, 'normalization_failed')
      continue
    }
    metrics.classifiedPrograms += 1
    const decision = await matchWaipuProgram(normalized, {
      localCandidates: candidatesFor(normalized),
      searchTmdb,
      decisions,
      now,
    })
    if (decision.status !== 'matched') {
      increment(metrics.matchRejected, decision.reason || 'unmatched')
      unresolvedPrograms.push({
        programId,
        type: normalized.type,
        title: normalized.title,
        originalTitle: normalized.originalTitle || null,
        productionYear: normalized.productionYear || null,
        reason: decision.reason || 'unmatched',
        source: decision.source || null,
      })
      if (typeof searchTmdb !== 'function' && decision.source === 'local') {
        metrics.matchSearchUnavailable += 1
      }
      continue
    }
    metrics.matchedPrograms += 1
    matchesByProgram.set(programId, { input: normalized, decision })
  }
  if (typeof onProgress === 'function') {
    onProgress({
      phase: 'programs',
      processed: byProgram.size,
      total: byProgram.size,
      detailsLoaded: metrics.detailsLoaded,
      matchedPrograms: metrics.matchedPrograms,
    })
  }

  if (metrics.detailsMissing > 0 && !allowIncompleteDetails) {
    const error = new Error(`Waipu catalog is incomplete: ${metrics.detailsMissing} program details are missing.`)
    error.code = 'WAIPU_DETAILS_INCOMPLETE'
    error.metrics = metrics
    throw error
  }
  if (metrics.matchSearchUnavailable > 0 && !allowUnresolvedMatches) {
    const error = new Error(`TMDB search is required for ${metrics.matchSearchUnavailable} unresolved Waipu programs.`)
    error.code = 'TMDB_SEARCH_REQUIRED'
    error.metrics = metrics
    throw error
  }

  const activeBroadcasts = candidateBroadcasts.filter((broadcast) => (
    matchesByProgram.has(broadcast.programId) && Date.parse(broadcast.stopTime) > Date.parse(generatedAt)
  ))
  const titleMetadata = new Map()
  const canonicalEvents = dedupeWaipuBroadcastEvents(activeBroadcasts.map((broadcast) => {
    const resolved = matchesByProgram.get(broadcast.programId)
    const match = resolved.decision.match
    const key = canonicalTitleKey(match.type, match.tmdbId)
    if (!titleMetadata.has(key)) {
      titleMetadata.set(key, {
        tmdbId: match.tmdbId,
        type: match.type,
        title: match.title,
        originalTitle: match.originalTitle,
        year: match.year,
        posterUrl: match.posterUrl,
      })
    }
    return mapWaipuAiringToBroadcastEvent({
      tmdbId: match.tmdbId,
      type: match.type,
    }, {
      programId: broadcast.programId,
      seriesId: resolved.input.seriesId || null,
      stationId: broadcast.stationId,
      stationName: broadcast.stationName,
      startTime: broadcast.startTime,
      stopTime: broadcast.stopTime,
      episodeTitle: resolved.input.episodeTitle,
      seasonNumber: resolved.input.seasonNumber,
      episodeNumber: resolved.input.episodeNumber,
      imageUrl: broadcast.imageUrl || resolved.input.imageUrls[0] || null,
    }, {
      observedAt: generatedAt,
    })
  }).filter(Boolean))

  const titleMap = new Map()
  const stationAirings = new Map()
  for (const event of canonicalEvents) {
    const key = canonicalTitleKey(event.titleRef.mediaType, event.titleRef.tmdbId)
    const metadata = titleMetadata.get(key)
    if (!metadata) continue
    const projected = projectBroadcastEventToWaipuAiring(event)
    if (!projected) continue
    const airing = {
      id: broadcastKey(projected),
      ...projected,
      tmdbId: event.titleRef.tmdbId,
      type: event.titleRef.mediaType,
      title: metadata.title,
    }
    if (!stationAirings.has(projected.stationId)) stationAirings.set(projected.stationId, [])
    stationAirings.get(projected.stationId).push(airing)

    let current = titleMap.get(key)
    if (!current) {
      current = {
        ...metadata,
        airings: [],
      }
      titleMap.set(key, current)
    }
    current.airings.push(projected)
  }

  for (const title of titleMap.values()) {
    title.airings.sort((left, right) => (
      left.startTime.localeCompare(right.startTime)
      || left.stationId.localeCompare(right.stationId)
    ))
    title.airingCount = title.airings.length
    title.nextAiring = title.airings[0] || null
  }

  const selectedStations = (Array.isArray(stations) ? stations : [])
    .filter((station) => safeStationId(station?.id))
    .map((station) => ({ ...station, id: safeStationId(station.id) }))
  const titles = [...titleMap.values()].sort((left, right) => (
    left.nextAiring.startTime.localeCompare(right.nextAiring.startTime)
    || left.title.localeCompare(right.title, 'de')
  ))
  const shards = Object.fromEntries(selectedStations.map((station) => {
    const airings = (stationAirings.get(station.id) || [])
      .sort((left, right) => left.startTime.localeCompare(right.startTime) || left.title.localeCompare(right.title, 'de'))
    return [station.id, shardArtifact(station, airings)]
  }))
  const dayAirings = new Map([[tvDayKey(generatedAt), []]])
  for (const station of selectedStations) {
    for (const airing of shards[station.id].airings) {
      const key = tvDayKey(airing.startTime)
      if (!dayAirings.has(key)) dayAirings.set(key, [])
      dayAirings.get(key).push({
        ...airing,
        stationId: station.id,
        stationName: station.displayName || station.name || station.id,
      })
    }
  }
  const days = Object.fromEntries([...dayAirings.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, airings]) => [key, dayArtifact(key, airings.sort((left, right) => (
      left.startTime.localeCompare(right.startTime)
      || left.stationId.localeCompare(right.stationId)
      || left.title.localeCompare(right.title, 'de')
    )))]))
  metrics.publishedTitles = titles.length
  metrics.publishedBroadcasts = canonicalEvents.length

  return {
    index: {
      schemaVersion: WAIPU_LIVE_CATALOG_VERSION,
      kind: 'waipu-live-index',
      status: 'complete',
      generatedAt,
      releaseChannel,
      horizon: { start, endExclusive },
      matcherVersion: WAIPU_MATCHER_VERSION,
      sourceDataVersion: WAIPU_SOURCE_DATA_VERSION,
      dayDataVersion: WAIPU_DAY_DATA_VERSION,
      counts: {
        stations: selectedStations.length,
        titles: titles.length,
        broadcasts: canonicalEvents.length,
      },
      days: Object.values(days).map(({ key, count }) => ({ key, count })),
      metrics,
    },
    stations: stationArtifact(selectedStations),
    titles: titleArtifact(titles),
    shards,
    days,
    unresolved: {
      schemaVersion: 1,
      kind: 'waipu-unresolved-programs',
      generatedAt,
      count: unresolvedPrograms.length,
      entries: unresolvedPrograms.sort((left, right) => left.programId.localeCompare(right.programId)),
    },
    decisions,
  }
}

export function validateWaipuLiveCatalog(catalog, { allowLegacyMetadata = false } = {}) {
  if (catalog?.index?.schemaVersion !== WAIPU_LIVE_CATALOG_VERSION || catalog?.index?.status !== 'complete') {
    throw new Error('Invalid waipu-live index.')
  }
  const stations = Array.isArray(catalog?.stations?.stations) ? catalog.stations.stations : []
  const titles = Array.isArray(catalog?.titles?.entries) ? catalog.titles.entries : []
  const requiresSourceData = Number(catalog?.index?.sourceDataVersion) >= WAIPU_SOURCE_DATA_VERSION
  const stationIds = new Set(stations.map(({ id }) => id))
  if (stationIds.size !== stations.length || [...stationIds].some((id) => !safeStationId(id))) {
    throw new Error('Invalid or duplicate waipu-live station.')
  }
  const titleKeys = new Set()
  for (const title of titles) {
    const key = canonicalTitleKey(title?.type, title?.tmdbId)
    if (!title?.tmdbId || !['movie', 'series'].includes(title?.type) || titleKeys.has(key)) {
      throw new Error('Invalid or duplicate waipu-live title.')
    }
    if (!stationIds.has(title?.nextAiring?.stationId)) throw new Error('Unknown next-airing station.')
    if (!Array.isArray(title.airings) || title.airingCount !== title.airings.length || title.airings.length === 0) {
      throw new Error('Invalid waipu-live title airings.')
    }
    for (const airing of title.airings) {
      if (!stationIds.has(airing?.stationId)) throw new Error('Unknown title-airing station.')
      if (requiresSourceData && (airing?.source !== 'waipu' || !String(airing?.programId || '').trim())) {
        throw new Error('Missing waipu title-airing source data.')
      }
    }
    titleKeys.add(key)
  }
  let airingCount = 0
  for (const stationId of stationIds) {
    const shard = catalog?.shards?.[stationId]
    if (shard?.station?.id !== stationId || !Array.isArray(shard?.airings)) throw new Error('Missing station shard.')
    for (const airing of shard.airings) {
      if (!titleKeys.has(canonicalTitleKey(airing?.type, airing?.tmdbId))) throw new Error('Station airing references an unknown title.')
      if (requiresSourceData && (airing?.source !== 'waipu' || !String(airing?.programId || '').trim())) {
        throw new Error('Missing waipu station-airing source data.')
      }
      airingCount += 1
    }
  }
  const dayDescriptors = Array.isArray(catalog.index.days) ? catalog.index.days : []
  if (Number(catalog.index.dayDataVersion) >= WAIPU_DAY_DATA_VERSION && !dayDescriptors.length) {
    throw new Error('Missing waipu-live day index.')
  }
  if (dayDescriptors.length) {
    const dayKeys = new Set()
    let dayAiringCount = 0
    for (const descriptor of dayDescriptors) {
      const key = String(descriptor?.key || '')
      const day = catalog?.days?.[key]
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || dayKeys.has(key)
          || day?.kind !== 'waipu-live-day' || day?.key !== key || !Array.isArray(day.airings)
          || day.count !== day.airings.length || descriptor.count !== day.count) {
        throw new Error('Invalid waipu-live day shard.')
      }
      for (const airing of day.airings) {
        if (!stationIds.has(airing?.stationId)) throw new Error('Day airing references an unknown station.')
        if (!titleKeys.has(canonicalTitleKey(airing?.type, airing?.tmdbId))) {
          throw new Error('Day airing references an unknown title.')
        }
      }
      dayKeys.add(key)
      dayAiringCount += day.airings.length
    }
    if (dayAiringCount !== airingCount || Object.keys(catalog.days || {}).length !== dayKeys.size) {
      throw new Error('waipu-live day counts are inconsistent.')
    }
  }
  if (catalog.index.counts.stations !== stations.length
      || catalog.index.counts.titles !== titles.length
      || catalog.index.counts.broadcasts !== airingCount) {
    throw new Error('waipu-live counts are inconsistent.')
  }
  if (catalog.index.metadata?.required === true) {
    requireCompleteWaipuTitleMetadata(titles, { allowLegacyContract: allowLegacyMetadata })
    if (catalog.index.metadata.complete !== titles.length) {
      throw new Error('waipu-live metadata counts are inconsistent.')
    }
  }
  return true
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeJsonAtomic(path, value) {
  const target = resolve(path)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, target)
}

export async function writeWaipuLiveCatalog(outputPath, catalog, { allowLegacyMetadata = false } = {}) {
  validateWaipuLiveCatalog(catalog, { allowLegacyMetadata })
  const target = resolve(outputPath)
  const staging = `${target}.staging.${process.pid}.${randomUUID()}`
  const backup = `${target}.backup.${process.pid}.${randomUUID()}`
  await mkdir(dirname(target), { recursive: true })
  await mkdir(staging, { recursive: false })
  let hasBackup = false
  try {
    await Promise.all([
      writeJson(resolve(staging, 'index.json'), catalog.index),
      writeJson(resolve(staging, 'stations.json'), catalog.stations),
      writeJson(resolve(staging, 'titles.json'), catalog.titles),
      ...Object.entries(catalog.days || {}).map(([key, day]) => (
        writeJson(resolve(staging, 'days', `${key}.json`), day)
      )),
      ...Object.entries(catalog.shards).map(([stationId, shard]) => (
        writeJson(resolve(staging, 'stations', `${stationId}.json`), shard)
      )),
    ])
    try {
      await rename(target, backup)
      hasBackup = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    try {
      await rename(staging, target)
    } catch (error) {
      if (hasBackup) await rename(backup, target)
      throw error
    }
    if (hasBackup) await rm(backup, { recursive: true, force: true })
    return target
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function readWaipuCacheRecords(cacheRoot, kind) {
  const directory = resolve(cacheRoot, kind)
  let names
  try {
    names = await readdir(directory)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const records = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
    const payload = JSON.parse(await readFile(resolve(directory, name), 'utf8'))
    return payload?.kind === kind ? payload : null
  }))
  return records.filter(Boolean)
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function main() {
  const live = process.argv.slice(2).includes('--live')
  const resetCircuit = process.argv.slice(2).includes('--reset-circuit')
  const testMode = process.env.WAIPU_TEST_MODE === '1'
  if (live && process.env.WAIPU_CATALOG_LIVE !== '1') {
    const error = new Error('Live program-detail loading requires WAIPU_CATALOG_LIVE=1 and --live.')
    error.code = 'LIVE_CONFIRMATION_REQUIRED'
    throw error
  }
  const cacheRoot = resolve(process.env.WAIPU_CACHE_ROOT || resolve(projectRoot, 'artifacts/waipu-sync/cache'))
  const output = resolve(process.env.WAIPU_LIVE_OUTPUT || resolve(projectRoot, 'artifacts/waipu-live/current'))
  const syncStatus = await readJson(resolve(process.env.WAIPU_SYNC_STATUS || resolve(projectRoot, 'artifacts/waipu-sync/status.json')))
  if (syncStatus?.status !== 'complete') throw new Error('A complete Waipu sync status is required.')
  const movieHubCatalogPath = resolve(process.env.MOVIE_HUB_CATALOG_PATH || resolve(projectRoot, 'public/catalog.json'))
  const movieHubSearchIndexPath = resolve(process.env.MOVIE_HUB_SEARCH_INDEX_PATH || resolve(projectRoot, 'public/search-index.json'))
  const [gridRecords, stationRecords, programRecords, catalog, searchIndex, previousWaipuTitles] = await Promise.all([
    readWaipuCacheRecords(cacheRoot, 'grid'),
    readWaipuCacheRecords(cacheRoot, 'stations'),
    readWaipuCacheRecords(cacheRoot, 'program'),
    readJson(movieHubCatalogPath, { titles: [] }),
    readJson(movieHubSearchIndexPath, { entries: [] }),
    readJson(resolve(output, 'titles.json'), { entries: [] }),
  ])
  const programs = new Map(programRecords.map((record) => [record.key, record.value]))
  const stationDirectory = stationRecords[0]?.value || []
  const selected = new Set((syncStatus.stations || []).map(({ id }) => id))
  const stations = stationDirectory.filter(({ id }) => selected.has(id))
  const decisionsPath = resolve(process.env.WAIPU_MATCH_CACHE || resolve(projectRoot, 'artifacts/waipu-live/match-decisions.json'))
  const tmdbSearchClient = process.env.TMDB_API_READ_TOKEN
    ? new WaipuTmdbSearchClient({
      token: process.env.TMDB_API_READ_TOKEN,
      language: process.env.TMDB_LANGUAGE || 'de-DE',
      maxRequests: Number(process.env.WAIPU_TMDB_REQUEST_BUDGET || 100),
      paceMs: Number(process.env.WAIPU_TMDB_PACE_MS || 250),
    })
    : null
  const tmdbMetadataClient = process.env.TMDB_API_READ_TOKEN
    ? new WaipuTmdbMetadataClient({
      token: process.env.TMDB_API_READ_TOKEN,
      language: process.env.TMDB_LANGUAGE || 'de-DE',
      country: process.env.TMDB_COUNTRY || 'DE',
      maxRequests: Number(process.env.WAIPU_TMDB_METADATA_REQUEST_BUDGET || 4000),
    })
    : null
  const programSchemaObserver = new SourceSchemaObserver({
    sourceId: 'waipu-program-upstream',
    policy: WAIPU_PROGRAM_UPSTREAM_FIELD_POLICY,
  })
  const detailLoader = live
    ? new WaipuProgramDetailLoader({
      cache: new WaipuEpgCache({ root: cacheRoot }),
      client: new WaipuPublicApiClient({
        observeRawSchema: (body, context) => programSchemaObserver.observe(body, context),
      }),
      requestBudget: process.env.WAIPU_DETAIL_REQUEST_BUDGET,
      paceMs: process.env.WAIPU_DETAIL_PACE_MS,
      jitterMs: process.env.WAIPU_DETAIL_JITTER_MS,
    })
    : null
  const lockPath = resolve(process.env.WAIPU_SYNC_LOCK || resolve(projectRoot, 'artifacts/waipu-sync/active.lock'))
  const detailStatusPath = resolve(process.env.WAIPU_DETAIL_STATUS || resolve(projectRoot, 'artifacts/waipu-live/detail-status.json'))
  const unresolvedPath = resolve(process.env.WAIPU_UNRESOLVED_REPORT || resolve(projectRoot, 'artifacts/waipu-live/unresolved.json'))
  await withWaipuSingleFlight(lockPath, async () => {
    const decisions = await WaipuMatchDecisionStore.load(decisionsPath)
    if (live && !resetCircuit) {
      const previousStatus = await readJson(detailStatusPath)
      const blockedUntil = Date.parse(previousStatus?.circuit?.blockedUntil)
      if (previousStatus?.circuit?.automaticRunsDisabled
          || (Number.isFinite(blockedUntil) && blockedUntil > Date.now())) {
        const error = new Error('The Waipu program-detail circuit is open.')
        error.code = 'CIRCUIT_OPEN'
        throw error
      }
    }
    try {
      const liveCatalog = await buildWaipuLiveCatalog({
        gridRecords,
        stations,
        horizon: syncStatus.horizon,
        loadProgramDetail: detailLoader
          ? (programId) => detailLoader.load(programId)
          : async (programId) => programs.get(programId) || null,
        candidates: localTmdbCandidates({ catalog, searchIndex }),
        searchTmdb: tmdbSearchClient ? (input) => tmdbSearchClient.search(input) : null,
        decisions,
        allowUnresolvedMatches: testMode,
        releaseChannel: testMode ? 'test' : 'production',
        onProgress: ({ processed, total, detailsLoaded, matchedPrograms }) => {
          process.stdout.write(
            `Waipu-Details: ${processed}/${total} · ${detailsLoaded} geladen · ${matchedPrograms} TMDB-zugeordnet`
            + ` · ${detailLoader?.metrics?.requestsStarted || 0} Waipu-Requests`
            + ` · ${tmdbSearchClient?.requestsStarted || 0} TMDB-Suchen\n`,
          )
        },
      })
      const changedTitleKeys = tmdbChangedTitleTimes(await readTmdbChangeSet())
      const metadata = await enrichWaipuTitleMetadata(liveCatalog.titles.entries, {
        catalogTitles: catalog.titles,
        cachedTitles: previousWaipuTitles.entries,
        loadTitleMetadata: tmdbMetadataClient
          ? (entry, updatedAt) => tmdbMetadataClient.loadTitle(entry, updatedAt)
          : null,
        concurrency: Number(process.env.WAIPU_TMDB_METADATA_CONCURRENCY || 3),
        cacheMaxAgeDays: Number(process.env.WAIPU_TMDB_METADATA_MAX_AGE_DAYS || 30),
        changedTitleKeys,
        onProgress: ({ processed, total, fromCatalog, fromCache, fetched }) => {
          process.stdout.write(
            `Waipu-TMDB-Metadaten: ${processed}/${total} vollständig`
            + ` · ${fromCatalog} aus Katalog · ${fromCache} aus Cache · ${fetched} neu geladen\n`,
          )
        },
      })
      liveCatalog.titles = titleArtifact(metadata.entries)
      liveCatalog.index.metadata = {
        required: true,
        generatedAt: metadata.generatedAt,
        ...metadata.metrics,
      }
      liveCatalog.index.runtime = {
        detailRequests: detailLoader?.metrics || null,
        tmdbRequests: tmdbSearchClient?.requestsStarted || 0,
        tmdbMetadataRequests: tmdbMetadataClient?.requestsStarted || 0,
      }
      await writeWaipuLiveCatalog(output, liveCatalog)
      await writeJsonAtomic(unresolvedPath, liveCatalog.unresolved)
      if (live) {
        await writeJsonAtomic(detailStatusPath, {
          schemaVersion: 1,
          kind: 'waipu-program-detail-status',
          generatedAt: new Date().toISOString(),
          status: 'complete',
          metrics: detailLoader.metrics,
          circuit: { automaticRunsDisabled: false, reason: null, blockedUntil: null },
        })
      }
      const programSchemaReport = programSchemaObserver.report({ phase: 'catalog-complete' })
      if (programSchemaReport.context.sampleCount > 0) {
        await writeFieldDiscoveryReport(programSchemaReport, {
          jsonPath: resolve(projectRoot, 'artifacts/source-schema/waipu-program-upstream.json'),
          markdownPath: resolve(projectRoot, 'artifacts/source-schema/waipu-program-upstream.md'),
        })
      }
      process.stdout.write(`${JSON.stringify({
        ...liveCatalog.index,
        detailRequests: detailLoader?.metrics || null,
        tmdbRequests: tmdbSearchClient?.requestsStarted || 0,
        tmdbMetadataRequests: tmdbMetadataClient?.requestsStarted || 0,
      }, null, 2)}\n`)
    } catch (error) {
      if (live) {
        const rateLimitDelay = Number.isInteger(error?.retryAfterSeconds)
          ? error.retryAfterSeconds * 1_000
          : 2 * 60 * 60 * 1_000
        const forbidden = error?.code === 'FORBIDDEN_STOP'
        const rateLimited = error?.code === 'RATE_LIMIT_STOP'
        await writeJsonAtomic(detailStatusPath, {
          schemaVersion: 1,
          kind: 'waipu-program-detail-status',
          generatedAt: new Date().toISOString(),
          status: forbidden
            ? 'blocked_forbidden'
            : rateLimited
              ? 'paused_rate_limit'
              : error?.code === 'REQUEST_BUDGET_EXHAUSTED'
                ? 'paused_request_budget'
                : 'failed_closed',
          metrics: detailLoader.metrics,
          failure: {
            code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR',
            status: Number.isInteger(error?.status) ? error.status : null,
          },
          circuit: {
            automaticRunsDisabled: forbidden,
            reason: forbidden || rateLimited ? error.code : null,
            blockedUntil: rateLimited ? new Date(Date.now() + rateLimitDelay).toISOString() : null,
          },
        })
      }
      const programSchemaReport = programSchemaObserver.report({ phase: 'catalog-failure' })
      if (programSchemaReport.context.sampleCount > 0) {
        await writeFieldDiscoveryReport(programSchemaReport, {
          jsonPath: resolve(projectRoot, 'artifacts/source-schema/waipu-program-upstream.json'),
          markdownPath: resolve(projectRoot, 'artifacts/source-schema/waipu-program-upstream.md'),
        })
      }
      throw error
    } finally {
      await decisions.save(decisionsPath)
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
