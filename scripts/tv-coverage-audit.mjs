// #885: count-only, read-only audit of the hosted AIR publication and TV rows.
import { pathToFileURL } from 'node:url'
import { AIR_HOST, fetchXmltvAirPublication } from './xmltv-air-publication.mjs'
import { loadTvRuntimeIndex, loadTvRuntimeDay, buildTvRuntimeSchedule } from '../src/tv/tvRuntimeClient.js'
import { areEquivalentTvAirings } from '../src/sources/mergeTvAirings.js'
import { buildWaipuTvViewModel, tvDayKey, loadWaipuLiveStationCatalog } from '../src/waipu/waipuTvCatalog.js'
import { loadJoynLiveStationCatalog } from '../src/joyn/joynTvCatalog.js'
import { combinedTvStationOrder } from '../src/settings/stationOrder.js'
import { KNOWN_PROVIDER_IDS } from '../src/settings/providerSelectionModel.js'
import { updateProviderSelectionSnapshot } from '../src/settings/providerSelectionRuntime.js'
import { resolvePosterProviderModel } from '../src/providers/posterProviderModel.js'

const HOUR = 3600000
const identity = a => `${a.type}:${a.tmdbId}:${a.canonicalStationId || a.stationId}`
const titleKey = a => `${a.type}:${a.tmdbId}`
const counts = () => ({ airings: 0, movie: 0, series: 0, runtimeMatched: 0,
  runtimeMissing: 0, ambiguousRuntime: 0, providerMissing: 0, xmltvOnly: 0,
  waipuAndXmltv: 0, joynAndXmltv: 0, allThree: 0, dailyPoster: 0,
  dailyPosterNotSelected: 0, xmltvBadgeHidden: 0, liveBadgeHidden: 0,
  liveBadgeHiddenWithMovieHub: 0 })

export function auditTvCoverage({ files, days, stationOrder = [], now = Date.now() }) {
  const today = tvDayKey(now), tomorrow = tvDayKey(now + 24 * HOUR)
  const windows = { onAir: a => Date.parse(a.startTime) <= now,
    next3h: a => Date.parse(a.startTime) > now && Date.parse(a.startTime) < now + 3 * HOUR,
    onAirOrNext3h: a => Date.parse(a.startTime) < now + 3 * HOUR,
    today: a => tvDayKey(Date.parse(a.startTime)) === today,
    tomorrow: a => tvDayKey(Date.parse(a.startTime)) === tomorrow,
    horizon: () => true }
  const blank = () => Object.fromEntries(Object.keys(windows).map(key => [key, { ...counts(), titles: new Set() }]))
  const totals = blank(), stations = {}, byIdentity = new Map(), posters = new Map()
  updateProviderSelectionSnapshot({ enabledProviderIds: KNOWN_PROVIDER_IDS, loading: false })
  for (const day of days) {
    const schedule = buildTvRuntimeSchedule(day, { enabledProviderIds: KNOWN_PROVIDER_IDS })
    for (const airing of schedule.airings) {
      const key = identity(airing)
      if (!byIdentity.has(key)) byIdentity.set(key, [])
      byIdentity.get(key).push(airing)
    }
    if (day.key < today) continue
    const model = buildWaipuTvViewModel({ ...schedule, stationOrder, availableDays: days,
      selectedPeriodId: `day:${day.key}`, now, includeHero: false })
    const dailyRows = model.rows.filter(row => row.id === `tv-${day.key}-movies` || row.id === `tv-${day.key}-series`)
    for (const item of dailyRows.flatMap(row => row.items)) posters.set(item.tvAiring, item)
  }
  for (const file of files) {
    const station = stations[file.providerId] = blank()
    for (const entry of file.titles.entries) {
      for (const raw of entry.airings || []) {
        const airing = { ...raw, type: entry.type, tmdbId: entry.tmdbId }
        if (!['movie', 'series'].includes(airing.type) || !Number.isFinite(Date.parse(airing.startTime)) ||
            !Number.isFinite(Date.parse(airing.stopTime)) || Date.parse(airing.stopTime) <= now) continue
        const matches = (byIdentity.get(identity(airing)) || []).filter(a => areEquivalentTvAirings(a, airing))
        const result = matches.length === 1 ? matches[0] : null
        const ids = result?.providerIds || []
        const item = posters.get(result)
        const expectedLiveIds = ids.filter(id => id.startsWith('air-') || id === 'waipu' || id === 'joyn')
        const visible = item ? resolvePosterProviderModel(item).providerIds : []
        const withMovieHub = item ? resolvePosterProviderModel(item, { hasMovieHub: true }).providerIds : []
        for (const [key, includes] of Object.entries(windows)) {
          if (!includes(airing)) continue
          for (const bucket of [totals[key], station[key]]) {
            bucket.airings++; bucket[airing.type]++; bucket.titles.add(titleKey(airing))
            if (!matches.length) { bucket.runtimeMissing++; continue }
            if (matches.length > 1) { bucket.ambiguousRuntime++; continue }
            bucket.runtimeMatched++
            if (!ids.includes(file.providerId)) { bucket.providerMissing++; continue }
            const waipu = ids.includes('waipu'), joyn = ids.includes('joyn')
            bucket[waipu && joyn ? 'allThree' : waipu ? 'waipuAndXmltv' : joyn ? 'joynAndXmltv' : 'xmltvOnly']++
            if (!item) { bucket.dailyPosterNotSelected++; continue }
            bucket.dailyPoster++
            if (!visible.includes(file.providerId)) bucket.xmltvBadgeHidden++
            if (expectedLiveIds.some(id => !visible.includes(id))) bucket.liveBadgeHidden++
            if (expectedLiveIds.some(id => !withMovieHub.includes(id))) bucket.liveBadgeHiddenWithMovieHub++
          }
        }
      }
    }
  }
  const aggregate = groups => Object.fromEntries(Object.entries(groups).map(([key, bucket]) => [key, { ...bucket, titles: bucket.titles.size }]))
  return { observedAt: new Date(now).toISOString(), totals: aggregate(totals),
    stations: Object.fromEntries(Object.entries(stations).map(([id, groups]) => [id, aggregate(groups)])) }
}

export async function runHostedTvCoverageAudit() {
  const now = Date.now()
  const fetchImpl = (path, options) => fetch(new URL(path, AIR_HOST), { ...options, redirect: 'error' })
  const index = await loadTvRuntimeIndex({ fetchImpl })
  const [publication, waipu, joyn] = await Promise.all([
    fetchXmltvAirPublication(), loadWaipuLiveStationCatalog({ fetchImpl }), loadJoynLiveStationCatalog({ fetchImpl }),
  ])
  if (waipu.status !== 'ready' || joyn.status !== 'ready') throw new Error('Station-order catalogs unavailable')
  if (!index.generatedAt || !publication.files.length) throw new Error('No verified TV generation')
  const relevantDays = new Set(publication.files.flatMap(file => file.titles.entries.flatMap(entry =>
    (entry.airings || []).filter(a => Date.parse(a.stopTime) > now).map(a => tvDayKey(Date.parse(a.startTime))))))
  const days = []
  const keys = index.days.filter(day => relevantDays.has(day.key)).map(day => day.key)
  for (let i = 0; i < keys.length; i += 3) days.push(...await Promise.all(keys.slice(i, i + 3).map(key =>
    loadTvRuntimeDay(key, { fetchImpl, generation: index.generatedAt }))))
  const [after, afterPublication] = await Promise.all([loadTvRuntimeIndex({ fetchImpl }), fetchXmltvAirPublication()])
  if (after.generatedAt !== index.generatedAt || JSON.stringify(publication.manifest) !== JSON.stringify(afterPublication.manifest)) {
    throw new Error('Publication changed during read-only audit')
  }
  return { kind: 'moviehub-tv-coverage-audit', schemaVersion: 1,
    generation: index.generatedAt, providerSelection: 'all-enabled-no-personal-data',
    publishedStations: publication.files.length, loadedDays: days.length,
    ...auditTvCoverage({ files: publication.files, days, now,
      stationOrder: combinedTvStationOrder(waipu.stations, joyn.stations, waipu.stations) }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await runHostedTvCoverageAudit(), null, 2))
}
