/**
 * #838 A3: 18-station private rehearsal using the EXISTING parser, provenance
 * staging, verified local TMDB resolver and shared matcher/airing merge.
 * Never publishes or exports raw programmes, never makes new TMDB requests.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FEEDS, downloadXmltvFeed } from './probe-xmltv-feeds.mjs'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { xmltvStationRegistry, XMLTV_REVIEWED_EXPANSION_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'
import { buildXmltvPrivateSourceGeneration } from '../src/sources/xmltv/xmltvPrivateStaging.js'
import { XMLTV_VERIFIED_SOURCE_FAMILIES } from '../src/sources/xmltv/xmltvSourceReadiness.js'
import { fetchExistingMovieHubTmdbCatalog, createXmltvG2mVerifiedLocalResolver } from './xmltv-g2m-live-catalog-match-preview.mjs'
import { matchXmltvLocalCandidates, mergeConfirmedXmltvAirings } from './xmltv-g1b-match-preview.mjs'

const registry = xmltvStationRegistry('expansion-preview')
const ids = registry.stations.map(s => s.stationId)
const expansionIds = new Set(XMLTV_REVIEWED_EXPANSION_STATIONS.map(s => s.stationId))
const MAX_CANDIDATES = 20_000
const BATCH_SIZE = 2_000
const keys = (obj, wanted) => obj && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).sort().join('|') === [...wanted].sort().join('|')
const int = (v, max = MAX_CANDIDATES) => Number.isSafeInteger(v) && v >= 0 && v <= max
const sum = values => values.reduce((a, b) => a + b, 0)

export async function runXmltvA3StationExpansionPreview({
  now = Date.now(), downloader = downloadXmltvFeed, localCandidatesFor,
} = {}) {
  if (!Number.isFinite(now) || typeof downloader !== 'function' ||
      typeof localCandidatesFor !== 'function') throw new TypeError('Invalid A3 preview inputs')
  const sources = []
  const confirmed = []
  let total = 0
  for (const feed of FEEDS) {
    let parsed = null
    try {
      const data = await downloader(feed.url)
      parsed = parseXmltvCandidates(data.xml, {
        sourceId: feed.id, stationMappings: registry.mappings,
        observedAt: new Date(now).toISOString(), mappedOnly: true,
      })
    } catch {
      // An individual feed failure must not block other feeds.
    }
    const staged = parsed ? buildXmltvPrivateSourceGeneration(parsed, {
      now, stationSet: 'expansion-preview',
    }) : null
    const records = staged?.records ?? []
    total += records.length
    if (total > MAX_CANDIDATES) throw new RangeError('A3 private candidate budget exceeded')
    const stations = Object.fromEntries(ids.map(id => [id, {
      candidates: staged?.stationCounts[id] ?? 0,
      matched: 0,
      continuousMinutes: staged?.coverage.stations[id].continuousFromNowMinutes ?? 0,
    }]))
    for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
      const batch = await matchXmltvLocalCandidates(records.slice(offset, offset + BATCH_SIZE), {
        localCandidatesFor, maxCandidates: BATCH_SIZE,
      })
      for (const event of batch.confirmedEvents) {
        stations[event.channelId].matched++
        confirmed.push(event)
      }
    }
    sources.push({
      sourceId: feed.id, contentFamily: XMLTV_VERIFIED_SOURCE_FAMILIES[feed.id],
      status: !staged ? 'unavailable' : records.length ? 'staged' : 'empty',
      rejectedOrOutsideWindow: staged?.rejectedOrOutsideWindow ?? 0,
      stations,
    })
  }
  const merged = mergeConfirmedXmltvAirings([], [], confirmed)
  const report = {
    kind: 'xmltv-a3-private-station-expansion', schemaVersion: 1,
    sources, totalCandidates: total, totalMatched: confirmed.length,
    uniqueAirings: merged.length,
    existingUniqueAirings: merged.filter(row => !expansionIds.has(row.stationId)).length,
    expansionUniqueAirings: merged.filter(row => expansionIds.has(row.stationId)).length,
    expansionWithAnyFutureData: [...expansionIds].filter(id =>
      sources.some(source => source.stations[id].candidates > 0)).length,
    expansionWithFiveDayCoverage: [...expansionIds].filter(id =>
      sources.some(source => source.stations[id].continuousMinutes >= 7200)).length,
    expansionWithMatches: [...expansionIds].filter(id =>
      merged.some(row => row.stationId === id)).length,
    realTmdbApiRequestsMade: 0, productiveWrites: 0, publishApproved: false,
  }
  if (!isSafeXmltvA3StationExpansionReport(report)) throw new TypeError('Unsafe A3 report')
  return report
}

export function isSafeXmltvA3StationExpansionReport(report) {
  if (!keys(report, ['kind','schemaVersion','sources','totalCandidates','totalMatched',
    'uniqueAirings','existingUniqueAirings','expansionUniqueAirings','expansionWithAnyFutureData',
    'expansionWithFiveDayCoverage','expansionWithMatches','realTmdbApiRequestsMade',
    'productiveWrites','publishApproved']) ||
    report.kind !== 'xmltv-a3-private-station-expansion' || report.schemaVersion !== 1 ||
    !Array.isArray(report.sources) || report.sources.length !== FEEDS.length ||
    report.realTmdbApiRequestsMade !== 0 || report.productiveWrites !== 0 ||
    report.publishApproved !== false) return false
  for (const [i, source] of report.sources.entries()) {
    if (!keys(source, ['sourceId','contentFamily','status','rejectedOrOutsideWindow','stations']) ||
      source.sourceId !== FEEDS[i].id || source.contentFamily !== XMLTV_VERIFIED_SOURCE_FAMILIES[source.sourceId] ||
      !['unavailable','staged','empty'].includes(source.status) ||
      !int(source.rejectedOrOutsideWindow, 250_000) || !keys(source.stations, ids)) return false
    for (const row of Object.values(source.stations)) {
      if (!keys(row,['candidates','matched','continuousMinutes']) ||
        !int(row.candidates) || !int(row.matched, row.candidates) ||
        !int(row.continuousMinutes, 14*24*60) ||
        (source.status !== 'staged' && (row.candidates || row.matched || row.continuousMinutes))) return false
    }
    if ((source.status === 'staged') !== Object.values(source.stations).some(row => row.candidates > 0)) return false
  }
  const all = report.sources.flatMap(source => Object.values(source.stations))
  return int(report.totalCandidates) && report.totalCandidates === sum(all.map(row=>row.candidates)) &&
    int(report.totalMatched, report.totalCandidates) && report.totalMatched === sum(all.map(row=>row.matched)) &&
    int(report.uniqueAirings, report.totalMatched) &&
    int(report.existingUniqueAirings, report.uniqueAirings) &&
    int(report.expansionUniqueAirings, report.uniqueAirings) &&
    report.uniqueAirings === report.existingUniqueAirings + report.expansionUniqueAirings &&
    report.expansionWithAnyFutureData === [...expansionIds].filter(id =>
      report.sources.some(source => source.stations[id].candidates > 0)).length &&
    report.expansionWithFiveDayCoverage === [...expansionIds].filter(id =>
      report.sources.some(source => source.stations[id].continuousMinutes >= 7200)).length &&
    report.expansionWithMatches === [...expansionIds].filter(id =>
      report.sources.some(source => source.stations[id].matched > 0)).length
}

async function main() {
  if (process.argv.length !== 2 ||
      process.env.MOVIEHUB_XMLTV_A3_PRIVATE_QA !== 'enabled' ||
      process.env.GITHUB_EVENT_NAME !== 'pull_request' ||
      process.env.GITHUB_HEAD_REF !== 'work/838-xmltv-18-station-private-preview') throw new TypeError('A3 preview not opted in')
  const now = Date.now()
  const catalog = await fetchExistingMovieHubTmdbCatalog({ now })
  const resolver = createXmltvG2mVerifiedLocalResolver(catalog, { now })
  const report = await runXmltvA3StationExpansionPreview({ now, localCandidatesFor: resolver.localCandidatesFor })
  await mkdir('artifacts/xmltv-a3', { recursive: true, mode: 0o700 })
  await writeFile('artifacts/xmltv-a3/report.json', JSON.stringify(report, null, 2)+'\n', { flag:'wx', mode:0o600 })
  console.log(JSON.stringify(report))
  if (report.expansionWithAnyFutureData !== expansionIds.size || !report.expansionUniqueAirings) process.exitCode = 1
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error('XMLTV A3 isolated preview failed; no data published')
    process.exitCode = 1
  })
}
