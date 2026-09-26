import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const JOYN_LIVE_PUBLICATION_VERSION = 1

function text(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function dayKey(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return `${byType.year}-${byType.month}-${byType.day}`
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
        brandId: text(stream?.brand?.brandCode) || text(stream?.brand?.brand_id),
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
    episode: event.episode || null,
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
