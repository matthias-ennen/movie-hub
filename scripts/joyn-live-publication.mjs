import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { attachTvDayTitleMetadata } from '../src/sources/tvDayTitleMetadata.js'

export const JOYN_LIVE_PUBLICATION_VERSION = 1

function text(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

const TV_TIME_ZONE = 'Europe/Berlin'
const TV_DAY_START_HOUR = 6

function shiftDateKey(key, days) {
  const [year, month, day] = String(key).split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

function dayKey(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TV_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]))
  const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
  return parts.hour < TV_DAY_START_HOUR ? shiftDateKey(key, -1) : key
}

function stationCatalog(rawStreams, stationMapping) {
  const mappingById = new Map((stationMapping?.entries || []).map((entry) => [entry.joynId, entry]))
  return (Array.isArray(rawStreams) ? rawStreams : [])
    .map((stream) => {
      const id = text(stream?.id)
      const name = text(stream?.title)
      if (!id || !name) return null
      const mapping = mappingById.get(id)
      return {
        id,
        name,
        canonicalId: mapping?.status === 'matched' ? mapping.canonicalId : null,
        canonicalName: mapping?.status === 'matched' ? mapping.canonicalName : null,
        mappingStatus: mapping?.status || 'unmatched',
        mappingMethod: mapping?.method || null,
        logoUrl: text(stream?.brand?.livestream?.logo?.url) || text(stream?.logo?.url),
        brandId: text(stream?.brand?.id) || text(stream?.brand?.brand_id),
        brandCode: text(stream?.brand?.brandCode),
        quality: text(stream?.quality),
        streamType: text(stream?.type),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name, 'de') || left.id.localeCompare(right.id))
}

function publishedAiring(event) {
  if (event?.kind !== 'broadcast') return null
  const tmdbId = Number(event?.titleRef?.tmdbId)
  const type = event?.titleRef?.mediaType
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !['movie', 'series'].includes(type)) return null
  const startTime = text(event?.startAt)
  const stopTime = text(event?.endAt)
  const stationId = text(event?.extensions?.joyn?.channelId)
  if (!startTime || !stopTime || !stationId) return null

  return {
    id: text(event.eventId),
    tmdbId,
    type,
    stationId,
    canonicalStationId: String(event.channelId || '').startsWith('joyn.') ? null : text(event.channelId),
    stationName: text(event.channelName),
    programId: text(event?.extensions?.joyn?.programId),
    title: text(event?.extensions?.joyn?.rawTitle),
    startTime,
    stopTime,
    playbackRoutes: Array.isArray(event.playbackRoutes) ? event.playbackRoutes : [],
    sourceRefs: Array.isArray(event.sourceRefs) ? event.sourceRefs : [],
    source: 'joyn',
    episode: event.episode || null,
    episodeTitle: text(event.episode?.title),
    seasonNumber: event.episode?.seasonNumber ?? null,
    episodeNumber: event.episode?.episodeNumber ?? null,
    sourceDescription: text(event.extensions?.joyn?.description),
    sourceAgeRating: event.extensions?.joyn?.ageRating ?? null,
  }
}

export function buildJoynLivePublication({
  rawStreams = [],
  stationMapping = null,
  envelope = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const stations = stationCatalog(rawStreams, stationMapping)
  const stationIds = new Set(stations.map(({ id }) => id))
  const airings = (Array.isArray(envelope?.records) ? envelope.records : [])
    .map(publishedAiring)
    .filter((airing) => airing && stationIds.has(airing.stationId))
    .sort((left, right) => left.startTime.localeCompare(right.startTime) || left.stationName.localeCompare(right.stationName, 'de'))

  const dayGroups = new Map()
  for (const airing of airings) {
    const key = dayKey(airing.startTime)
    if (!key) continue
    if (!dayGroups.has(key)) dayGroups.set(key, [])
    dayGroups.get(key).push(airing)
  }

  const days = [...dayGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => ({ key, count: values.length }))

  const starts = airings.map(({ startTime }) => Date.parse(startTime)).filter(Number.isFinite)
  const stops = airings.map(({ stopTime }) => Date.parse(stopTime)).filter(Number.isFinite)


  const titleGroups = new Map()
  for (const airing of airings) {
    const key = `${airing.type}:${airing.tmdbId}`
    if (!titleGroups.has(key)) {
      titleGroups.set(key, {
        key,
        tmdbId: airing.tmdbId,
        type: airing.type,
        providerIds: ['joyn'],
        airings: [],
      })
    }
    titleGroups.get(key).airings.push(airing)
  }
  const titleEntries = [...titleGroups.values()]
    .map((entry) => ({
      ...entry,
      airings: entry.airings.sort((left, right) => left.startTime.localeCompare(right.startTime)),
      nextAiring: entry.airings[0] || null,
      airingCount: entry.airings.length,
    }))
    .sort((left, right) => left.key.localeCompare(right.key))

  return {
    index: {
      schemaVersion: JOYN_LIVE_PUBLICATION_VERSION,
      kind: 'joyn-live-index',
      status: 'complete',
      generatedAt,
      sourceGenerationId: envelope?.sourceGenerationId || null,
      stationCount: stations.length,
      airingCount: airings.length,
      horizon: starts.length && stops.length ? {
        from: new Date(Math.min(...starts)).toISOString(),
        to: new Date(Math.max(...stops)).toISOString(),
      } : null,
      days,
    },
    stations: {
      schemaVersion: JOYN_LIVE_PUBLICATION_VERSION,
      kind: 'joyn-live-stations',
      generatedAt,
      stations,
    },
    titles: {
      schemaVersion: JOYN_LIVE_PUBLICATION_VERSION,
      kind: 'joyn-live-titles',
      generatedAt,
      entries: titleEntries,
    },
    days: Object.fromEntries([...dayGroups.entries()].map(([key, values]) => [key, {
      schemaVersion: JOYN_LIVE_PUBLICATION_VERSION,
      kind: 'joyn-live-day',
      key,
      generatedAt,
      airings: values,
    }])),
  }
}

async function writeJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

export async function writeJoynLivePublication(publication, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true })
  await writeJson(resolve(outputDirectory, 'index.json'), publication.index)
  await writeJson(resolve(outputDirectory, 'stations.json'), publication.stations)
  await writeJson(resolve(outputDirectory, 'titles.json'), publication.titles)
  for (const [key, shard] of Object.entries(publication.days || {})) {
    await writeJson(resolve(outputDirectory, 'days', `${key}.json`), shard)
  }
}


export function validateJoynLivePublication(publication) {
  const errors = []
  const index = publication?.index
  const stations = publication?.stations?.stations
  const titles = publication?.titles?.entries
  const days = publication?.days

  if (index?.kind !== 'joyn-live-index' || index?.status !== 'complete') errors.push('Joyn index is not complete.')
  if (!index?.sourceGenerationId) errors.push('Joyn source generation id is missing.')
  if (!Array.isArray(stations) || stations.length === 0 || index?.stationCount !== stations.length) {
    errors.push('Joyn station count is inconsistent.')
  }
  if (!Array.isArray(titles) || titles.length === 0 || publication?.titles?.count !== titles.length) {
    errors.push('Joyn title count is inconsistent.')
  }
  if (!Number.isSafeInteger(index?.airingCount) || index.airingCount <= 0) errors.push('Joyn airings are missing.')
  const dayEntries = days && typeof days === 'object' ? Object.entries(days) : []
  const dayAirings = dayEntries.reduce((total, [, shard]) => total + (Array.isArray(shard?.airings) ? shard.airings.length : 0), 0)
  if (!dayEntries.length || dayAirings !== index?.airingCount) errors.push('Joyn day shards are inconsistent.')
  if (index?.metadata?.required === true && index.metadata.complete !== titles?.length) {
    errors.push('Joyn title metadata is incomplete.')
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: {
      stations: Array.isArray(stations) ? stations.length : 0,
      titles: Array.isArray(titles) ? titles.length : 0,
      airings: Number(index?.airingCount || 0),
      dayAirings,
    },
  }
}

export async function writeJoynLivePublicationAtomic(publication, outputDirectory) {
  const validation = validateJoynLivePublication(publication)
  if (!validation.valid) {
    const error = new Error(`Joyn publication rejected: ${validation.errors.join(' ')}`)
    error.code = 'JOYN_PUBLICATION_INVALID'
    error.validation = validation
    throw error
  }

  const target = resolve(outputDirectory)
  const staging = `${target}.staging.${process.pid}.${randomUUID()}`
  const backup = `${target}.backup.${process.pid}.${randomUUID()}`
  let hasBackup = false

  try {
    await writeJoynLivePublication(publication, staging)
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
    return validation
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export function enrichJoynDayTitleMetadata(publication) {
  return {
    ...publication,
    days: attachTvDayTitleMetadata(publication?.days || {}, publication?.titles?.entries || []),
  }
}
