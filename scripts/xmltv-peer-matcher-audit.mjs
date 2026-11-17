// #885: read-only evidence of potential same-broadcast reuse, not a matcher.
// No TMDB requests, no cache writes, no publication, no raw titles in output.
import { pathToFileURL } from 'node:url'
import { FEEDS, downloadXmltvFeed } from './probe-xmltv-feeds.mjs'
import { inferXmltvMediaType, reviewedXmltvCategoryType } from './xmltv-g1b-match-preview.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS, XMLTV_REVIEWED_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'
import { AIR_HOST } from './xmltv-air-publication.mjs'
import { loadTvRuntimeIndex, loadTvRuntimeDay, buildTvRuntimeSchedule } from '../src/tv/tvRuntimeClient.js'
import { tvDayKey } from '../src/waipu/waipuTvCatalog.js'

const HOUR = 3600000
const PEERS = ['waipu', 'joyn']
const identity = a => `${a.type}:${a.tmdbId}`
const key = (station, title) => JSON.stringify([station, normalizeWaipuText(title)])
const counts = () => ({ mappedRows: 0, movie: 0, series: 0, unclassified: 0,
  categoryTypeConflict: 0, invalidTimezone: 0, outsideRuntimeDays: 0,
  noPeer: 0, ambiguousPeer: 0, incompatiblePeer: 0, verifiedMovie: 0,
  verifiedSeries: 0, verifiedWaipu: 0, verifiedJoyn: 0, verifiedBoth: 0,
  unclassifiedPeerMovie: 0, unclassifiedPeerSeries: 0,
  unclassifiedPeerMovieWithoutAir: 0, unclassifiedPeerSeriesWithoutAir: 0,
  verifiedAlreadyAir: 0 })

function typeConflict(c) {
  const types = new Set((c.categories || []).map(reviewedXmltvCategoryType))
  return types.has('movie') && (types.has('series') || Boolean(c.episode))
}

export function sameBroadcast(c, a) {
  const start = Date.parse(c.startAt), end = Date.parse(c.endAt)
  const peerStart = Date.parse(a.startTime), peerEnd = Date.parse(a.stopTime)
  if (![start, end, peerStart, peerEnd].every(Number.isFinite)) return false
  if (end <= start || peerEnd <= peerStart || Math.abs(start - peerStart) > 5 * 60000) return false
  const overlap = Math.min(end, peerEnd) - Math.max(start, peerStart)
  return overlap >= 0.8 * Math.max(end - start, peerEnd - peerStart)
}

export function auditPeerMatching(candidates, days, now = Date.now()) {
  const totals = counts(), stations = Object.fromEntries(XMLTV_REVIEWED_STATIONS.map(s => [s.stationId, counts()]))
  const byTitleStation = new Map(), dayKeys = new Set(days.map(d => d.key))
  for (const day of days) {
    const schedule = buildTvRuntimeSchedule(day, { enabledProviderIds: [...PEERS, ...XMLTV_REVIEWED_STATIONS.map(s => `air-${s.stationId}`)] })
    const years = new Map(schedule.titles.map(t => [identity(t), t.year]))
    for (const a of schedule.airings) {
      if (!a.providerIds.some(p => PEERS.includes(p))) continue
      const station = a.canonicalStationId || a.stationId
      if (!station || !normalizeWaipuText(a.title)) continue
      const k = key(station, a.title)
      if (!byTitleStation.has(k)) byTitleStation.set(k, [])
      byTitleStation.get(k).push({ ...a, year: years.get(identity(a)) })
    }
  }
  for (const c of candidates) {
    if (!stations[c.canonicalStationId] || Date.parse(c.endAt) <= now || Date.parse(c.startAt) >= now + 120 * HOUR) continue
    const inc = field => { totals[field]++; stations[c.canonicalStationId][field]++ }
    const type = inferXmltvMediaType(c)
    inc('mappedRows'); inc(type || 'unclassified')
    if (typeConflict(c)) { inc('categoryTypeConflict'); continue }
    if (!c.timestampsExplicitlyZoned) { inc('invalidTimezone'); continue }
    if (!dayKeys.has(tvDayKey(Date.parse(c.startAt)))) { inc('outsideRuntimeDays'); continue }
    const matches = (byTitleStation.get(key(c.canonicalStationId, c.title)) || []).filter(a => sameBroadcast(c, a))
    if (!matches.length) { inc('noPeer'); continue }
    if (new Set(matches.map(identity)).size !== 1) { inc('ambiguousPeer'); continue }
    const peer = matches[0]
    if ((type && type !== peer.type) || (peer.type === 'movie' && c.productionYearEvidence && peer.year &&
      Math.abs(c.productionYearEvidence - peer.year) > 1)) { inc('incompatiblePeer'); continue }
    const media = peer.type === 'movie' ? 'Movie' : 'Series'
    const ids = new Set(matches.flatMap(a => a.providerIds))
    const air = ids.has(`air-${c.canonicalStationId}`)
    inc(`verified${media}`)
    if (ids.has('waipu')) inc('verifiedWaipu')
    if (ids.has('joyn')) inc('verifiedJoyn')
    if (ids.has('waipu') && ids.has('joyn')) inc('verifiedBoth')
    if (air) inc('verifiedAlreadyAir')
    if (!type) {
      inc(`unclassifiedPeer${media}`)
      if (!air) inc(`unclassifiedPeer${media}WithoutAir`)
    }
  }
  return { totals, stations }
}

export async function runPeerAudit() {
  const now = Date.now()
  const fetchImpl = (path, options) => fetch(new URL(path, AIR_HOST), { ...options, redirect: 'error' })
  const index = await loadTvRuntimeIndex({ fetchImpl })
  if (!index.generatedAt) throw new Error('No verified TV generation')
  const keys = index.days.map(d => d.key).filter(k => k >= tvDayKey(now - 36 * HOUR) && k <= tvDayKey(now + 120 * HOUR))
  if (!keys.length) throw new Error('No overlapping TV days')
  const days = []
  for (let i = 0; i < keys.length; i += 3) days.push(...await Promise.all(keys.slice(i, i + 3).map(k =>
    loadTvRuntimeDay(k, { fetchImpl, generation: index.generatedAt }))))
  const sources = []
  for (const feed of FEEDS) {
    try {
      const downloaded = await downloadXmltvFeed(feed.url)
      const stage = parseXmltvCandidates(downloaded.xml, { sourceId: feed.id, stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS,
        mappedOnly: true, observedAt: new Date(now).toISOString() })
      sources.push({ source: feed.id, status: 'ok', ...auditPeerMatching(stage.candidates, days, now) })
    } catch { sources.push({ source: feed.id, status: 'unavailable' }) }
  }
  if (!sources.some(s => s.status === 'ok')) throw new Error('No readable approved XMLTV feed')
  if ((await loadTvRuntimeIndex({ fetchImpl })).generatedAt !== index.generatedAt) throw new Error('TV generation changed during audit')
  return { kind: 'xmltv-peer-matcher-audit', schemaVersion: 1, observedAt: new Date(now).toISOString(),
    generation: index.generatedAt, windowHours: 120, loadedDays: keys,
    denominator: 'mapped source rows per feed; overlapping feeds must not be summed', sources }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await runPeerAudit(), null, 2))
}
