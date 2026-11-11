/**
 * G1 staging: source-specific XMLTV -> candidates (never inferred TMDB offers).
 * Exact source-station mappings are explicitly approved by the caller.
 */
import { SaxesParser } from 'saxes'
import { parseXmltvTimestamp, xmltvTimestampHasOffset } from './xmltvTime.js'
import { normalizeBroadcastEvent } from '../sourceAdapterContract.js'

const MAX_RECORDS = 250_000
const MAX_FIELD = 12_000
const clean = (v) => String(v ?? '').trim() || null
const bounded = (v, max = MAX_FIELD) => (clean(v) || '').slice(0, max) || null

function mappedStation(sourceId, sourceStationId, mappings) {
  const sourceRows = mappings && Object.hasOwn(mappings, sourceId) ? mappings[sourceId] : null
  const entry = sourceRows && Object.hasOwn(sourceRows, sourceStationId)
    ? sourceRows[sourceStationId] : null
  const stationId = clean(entry?.stationId)
  const stationName = clean(entry?.stationName)
  return stationId && stationName ? { stationId, stationName } : null
}

function bestLanguage(oldField, field) {
  const isGerman = (f) => /^de(?:-|$)/i.test(f?.language || '')
  return !oldField || (isGerman(field) && !isGerman(oldField)) ? field : oldField
}

/** Strict zero-based XMLTV_NS: 0.9. or 0.9/12. becomes S01E10. */
export function parseXmltvEpisodeNumber(raw, system) {
  if (clean(system)?.toLowerCase() !== 'xmltv_ns') return null
  const parts = clean(raw)?.match(/^(\d+)\.(\d+)(?:\/\d+)?\.(?:\d+(?:\/\d+)?)?$/)
  if (!parts) return null
  const seasonNumber = Number(parts[1]) + 1
  const episodeNumber = Number(parts[2]) + 1
  return Number.isSafeInteger(seasonNumber) && Number.isSafeInteger(episodeNumber)
    ? { seasonNumber, episodeNumber } : null
}

/**
 * Parse already-size-bounded XMLTV, without TMDB lookups or publication.
 * Missing timezone is flagged; not silently interpreted in runner locale.
 * Source station IDs never become canonical on a fuzzy name match.
 */
export function parseXmltvCandidates(xml, {
  sourceId, stationMappings = {}, observedAt = new Date().toISOString(),
  maxRecords = MAX_RECORDS, mappedOnly = false,
} = {}) {
  const source = clean(sourceId)
  if (!source || source.length > 128 || !/^[a-z0-9][a-z0-9-]*$/.test(source)) {
    throw new TypeError('Invalid XMLTV sourceId')
  }
  if (!clean(xml)) throw new TypeError('XMLTV document required')
  const observed = new Date(observedAt)
  if (!Number.isFinite(observed.getTime())) throw new TypeError('Invalid observedAt')
  if (typeof mappedOnly !== 'boolean') throw new TypeError('Invalid mappedOnly option')
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > MAX_RECORDS) {
    throw new RangeError('Invalid maxRecords')
  }
  const channels = new Map()
  const candidates = []
  const dedupe = new Set()
  const stack = []
  const diagnostic = { sourceRecords: 0, skippedInvalid: 0, skippedMissingTitle: 0,
    duplicates: 0, missingTimeZone: 0, mappedCandidates: 0, unmappedCandidates: 0,
    skippedUnmapped: 0 }
  let root = false
  let channel = null
  let programme = null
  let captured = null
  const parser = new SaxesParser({ xmlns: false })
  parser.on('doctype', () => { throw new Error('XMLTV DOCTYPE is forbidden') })
  parser.on('error', (error) => { throw error })
  parser.on('opentag', (tag) => {
    stack.push(tag.name)
    if (stack.length === 1) {
      if (tag.name !== 'tv') throw new Error('Expected XMLTV tv root')
      root = true
      return
    }
    const parent = stack[stack.length - 2]
    if (parent === 'tv' && tag.name === 'channel') {
      channel = { id: bounded(tag.attributes.id, 200), names: [] }
    } else if (parent === 'tv' && tag.name === 'programme') {
      if (++diagnostic.sourceRecords > maxRecords) throw new Error('XMLTV record limit exceeded')
      programme = {
        channel: bounded(tag.attributes.channel, 200),
        start: bounded(tag.attributes.start, 60),
        stop: bounded(tag.attributes.stop, 60),
        title: null, subtitle: null, description: null, categories: [], episodeFields: [],
      }
    }
    if (parent === 'channel' && channel && tag.name === 'display-name') {
      captured = { depth: stack.length, field: tag.name, value: '' }
    }
    if (parent === 'programme' && programme &&
        ['title', 'sub-title', 'desc', 'category', 'episode-num'].includes(tag.name)) {
      captured = { depth: stack.length, field: tag.name, value: '',
        language: clean(tag.attributes.lang), system: clean(tag.attributes.system) }
    }
  })
  const appendText = (chunk) => {
    if (captured && captured.value.length < MAX_FIELD) {
      captured.value += chunk.slice(0, MAX_FIELD - captured.value.length)
    }
  }
  parser.on('text', appendText)
  parser.on('cdata', appendText)
  parser.on('closetag', (tag) => {
    const name = typeof tag === 'string' ? tag : tag.name
    if (captured?.depth === stack.length && captured.field === name) {
      const value = bounded(captured.value)
      if (value && channel && name === 'display-name' &&
          channel.names.length < 10 && !channel.names.includes(value)) channel.names.push(value)
      if (value && programme) {
        const field = { value, language: captured.language }
        if (name === 'title') programme.title = bestLanguage(programme.title, field)
        if (name === 'sub-title') programme.subtitle = bestLanguage(programme.subtitle, field)
        if (name === 'desc') programme.description = bestLanguage(programme.description, field)
        if (name === 'category' && programme.categories.length < 12) programme.categories.push(value)
        if (name === 'episode-num' && programme.episodeFields.length < 5) {
          programme.episodeFields.push({ raw: value, system: captured.system })
        }
      }
      captured = null
    }
    if (name === 'channel' && channel) {
      if (channel.id) {
        const previous = channels.get(channel.id)
        channels.set(channel.id, {
          id: channel.id,
          names: [...new Set([...(previous?.names || []), ...channel.names])].slice(0, 10),
        })
      }
      channel = null
    }
    if (name === 'programme' && programme) {
      const p = programme
      programme = null
      const begin = parseXmltvTimestamp(p.start)
      const end = parseXmltvTimestamp(p.stop)
      if (!p.channel || begin === null || end === null || end <= begin ||
          end - begin > 36 * 3_600_000) diagnostic.skippedInvalid++
      else if (!p.title?.value) diagnostic.skippedMissingTitle++
      else if (mappedOnly && !mappedStation(source, p.channel, stationMappings)) diagnostic.skippedUnmapped++
      else {
        const startAt = new Date(begin).toISOString()
        const endAt = new Date(end).toISOString()
        const key = [p.channel, startAt, endAt, p.title.value].join('|')
        if (dedupe.has(key)) diagnostic.duplicates++
        else {
          dedupe.add(key)
          const station = mappedStation(source, p.channel, stationMappings)
          const episode = p.episodeFields.map((entry) =>
            parseXmltvEpisodeNumber(entry.raw, entry.system)).find(Boolean) || null
          const zoned = xmltvTimestampHasOffset(p.start) && xmltvTimestampHasOffset(p.stop)
          if (!zoned) diagnostic.missingTimeZone++
          if (station) diagnostic.mappedCandidates++
          else diagnostic.unmappedCandidates++
          candidates.push({
            kind: 'xmltv-candidate', sourceId: source,
            sourceStationId: p.channel,
            stationMappingStatus: station ? 'mapped' : 'unmapped',
            canonicalStationId: station?.stationId || null,
            stationName: station?.stationName || null,
            title: p.title.value, titleLanguage: p.title.language,
            subtitle: p.subtitle?.value || null,
            description: p.description?.value || null,
            categories: p.categories, episode, episodeEvidence: p.episodeFields,
            startAt, endAt, timestampsExplicitlyZoned: zoned,
            sourceRef: {
              sourceId: 'xmltv:' + source,
              externalId: [p.channel, startAt, endAt, p.title.value].join('|'),
              observedAt: observed.toISOString(), expiresAt: endAt,
            },
          })
        }
      }
    }
    stack.pop()
  })
  parser.write(xml).close()
  if (!root || stack.length) throw new Error('Invalid XMLTV document')
  return {
    sourceId: source, observedAt: observed.toISOString(),
    channels: [...channels.values()].map((entry) => {
      const mapping = mappedStation(source, entry.id, stationMappings)
      return {
        sourceStationId: entry.id, displayNames: entry.names,
        stationMappingStatus: mapping ? 'mapped' : 'unmapped',
        canonicalStationId: mapping?.stationId || null,
        stationName: mapping?.stationName || null,
      }
    }),
    candidates, diagnostics: { ...diagnostic, candidates: candidates.length },
  }
}

/**
 * The existing TMDB matcher must explicitly accept a match; G1 cannot guess.
 * The candidate's EPG does not establish a LIVE or Mediathek playback link.
 */
export function projectConfirmedXmltvBroadcastEvent(candidate, match) {
  if (candidate?.kind !== 'xmltv-candidate' || candidate.stationMappingStatus !== 'mapped' ||
      !clean(candidate.canonicalStationId) || !clean(candidate.stationName)) return null
  const mediaType = match?.mediaType
  const tmdbId = Number(match?.tmdbId)
  if (match?.accepted !== true || !['movie', 'series'].includes(mediaType) ||
      !Number.isInteger(tmdbId) || tmdbId <= 0) return null
  const startAt = new Date(candidate.startAt)
  const endAt = new Date(candidate.endAt)
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) ||
      endAt <= startAt) return null
  return normalizeBroadcastEvent({
    eventId: ['broadcast', candidate.canonicalStationId, startAt.toISOString(), mediaType, tmdbId].join(':'),
    titleRef: { mediaType, tmdbId },
    channelId: candidate.canonicalStationId,
    channelName: candidate.stationName,
    startAt: startAt.toISOString(), endAt: endAt.toISOString(),
    episode: mediaType === 'series' ? {
      seasonNumber: candidate.episode?.seasonNumber ?? null,
      episodeNumber: candidate.episode?.episodeNumber ?? null,
      title: candidate.subtitle,
    } : null,
    playbackRoutes: [], // Sender's verified channel route is curated later.
    sourceRefs: [candidate.sourceRef],
    matchConfidence: match?.confidence ?? null,
    matchReason: clean(match?.reason) || 'explicitly-accepted-xmltv-match',
    extensions: {
      xmltv: {
        sourceStationId: candidate.sourceStationId,
        rawTitle: candidate.title, subtitle: candidate.subtitle,
        description: candidate.description, categories: candidate.categories,
        episodeEvidence: candidate.episodeEvidence,
        timestampsExplicitlyZoned: candidate.timestampsExplicitlyZoned,
      },
    },
  })
}
