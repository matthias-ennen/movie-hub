/** #885: reuse a confirmed same broadcast, never infer type from a genre. */
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { XMLTV_REVIEWED_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'

const stations = new Set(XMLTV_REVIEWED_STATIONS.map(s => s.stationId))
const key = (station, title) => JSON.stringify([station, normalizeWaipuText(title)])
const year = value => Number.isInteger(Number(value)) && Number(value) >= 1888 ? Number(value) : null
const typeOf = value => value === 'tv' ? 'series' : value

export function sameXmltvPeerBroadcast(candidate, airing) {
  const a = Date.parse(candidate.startAt), b = Date.parse(candidate.endAt)
  const c = Date.parse(airing.startTime), d = Date.parse(airing.stopTime)
  return [a,b,c,d].every(Number.isFinite) && b > a && d > c &&
    Math.abs(a-c) <= 5*60_000 && Math.min(b,d)-Math.max(a,c) >= 0.8*Math.max(b-a,d-c)
}

/** Only already matched runner-local Waipu/Joyn title catalogs are inputs.
 * Keep every matching identity until ambiguity/year checks are complete. No
 * request, no cross-run inference, no episode inference or source mutation. */
export function createXmltvPeerAiringResolver(sources, { now = Date.now() } = {}) {
  if (!Array.isArray(sources) || !Number.isFinite(now)) throw new TypeError('Invalid peer evidence input')
  const index = new Map()
  for (const source of sources) {
    if (!['waipu','joyn'].includes(source?.providerId) || !Array.isArray(source.entries)) throw new TypeError('Invalid peer source')
    for (const entry of source.entries) {
      const type = typeOf(entry?.type ?? entry?.mediaType), tmdbId = Number(entry?.tmdbId)
      if (!['movie','series'].includes(type) || !Number.isSafeInteger(tmdbId) || tmdbId <= 0 || !normalizeWaipuText(entry.title)) continue
      for (const airing of Array.isArray(entry.airings) ? entry.airings : [entry.nextAiring].filter(Boolean)) {
        const station = airing?.canonicalStationId || airing?.stationId
        const startTime = airing?.startTime ?? airing?.startAt, stopTime = airing?.stopTime ?? airing?.endAt
        if (!stations.has(station) || !Number.isFinite(Date.parse(startTime)) || Date.parse(stopTime) <= now ||
            !Number.isFinite(Date.parse(stopTime)) || Date.parse(stopTime) <= Date.parse(startTime)) continue
        const k = key(station, entry.title)
        if (!index.has(k)) index.set(k, [])
        index.get(k).push({type,tmdbId,year:year(entry.year ?? entry.productionYear),startTime,stopTime})
      }
    }
  }
  const counts = { peerLookups:0, peerAcceptedMovie:0, peerAcceptedSeries:0, peerMissing:0, peerAmbiguous:0, peerYearConflict:0 }
  return Object.freeze({
    lookup(candidate) {
      counts.peerLookups++
      const matches = (index.get(key(candidate.canonicalStationId,candidate.title)) || [])
        .filter(a => sameXmltvPeerBroadcast(candidate,a))
      if (!matches.length) { counts.peerMissing++; return null }
      if (new Set(matches.map(a => `${a.type}:${a.tmdbId}`)).size !== 1) { counts.peerAmbiguous++; return null }
      const first = matches[0], expected = year(candidate.productionYearEvidence)
      const years = matches.map(a => a.year).filter(Boolean)
      if (first.type === 'movie' && ((expected && years.some(y => Math.abs(y-expected)>1)) ||
        (years.length > 1 && Math.max(...years)-Math.min(...years)>1))) {
        counts.peerYearConflict++; return null
      }
      counts[first.type === 'movie' ? 'peerAcceptedMovie' : 'peerAcceptedSeries']++
      return { mediaType:first.type,tmdbId:first.tmdbId }
    },
    counts:()=>({...counts}),
  })
}
