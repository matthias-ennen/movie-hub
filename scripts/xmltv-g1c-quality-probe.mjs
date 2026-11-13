/**
 * #336 G1c: real XMLTV metadata quality and limited *local* TMDB match preview.
 *
 * No production writes, no TMDB API, no provider links, no raw show titles in
 * summaries. Uses only bounded approved G0 feeds and existing MovieHub logic.
 *
 * Note: the committed public/waipu-live/titles.json snapshot is only a small
 * historical local comparison corpus – never call its hit rate "TMDB recall".
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEEDS, downloadXmltvFeed } from './probe-xmltv-feeds.mjs'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS, XMLTV_REVIEWED_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'
import { measureXmltvFiveDayCoverage, assessXmltvIndependentCoverage } from '../src/sources/xmltv/xmltvSourceReadiness.js'
import { inferXmltvMediaType, matchXmltvLocalCandidates } from './xmltv-g1b-match-preview.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const HOURS = 120
const WINDOW_MS = HOURS * 3_600_000
const MAX_SAMPLE = 1800
const META_CATEGORIES = 15

function key(value) {
  return normalizeWaipuText(String(value || ''))
}

function count(values) {
  const counts = {}
  for (const value of values) counts[value] = (counts[value] || 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

/** Diagnose only: parse *format*, never infer S/E identity from vague labels. */
export function xmltvEpisodeLabelFormat(raw) {
  const value = String(raw || '').trim()
  if (/^s\d{1,3}\s*e\d{1,4}$/i.test(value)) return 'explicit-season-episode'
  if (/^\d{1,3}\.\d{1,4}\.?$/.test(value)) return 'numeric-dotted'
  if (/^(?:folge|episode|ep\.?)\s*\d{1,4}$/i.test(value)) return 'episode-word-number'
  if (/^\d{1,4}(?:\/\d{1,4})?$/.test(value)) return 'number-or-fraction'
  return value ? 'other' : 'blank'
}

function topCategories(candidates) {
  const values = new Map()
  for (const candidate of candidates) {
    for (const category of candidate.categories || []) {
      const normalized = String(category).toLocaleLowerCase('de').trim().slice(0, 80)
      if (!normalized) continue
      values.set(normalized, (values.get(normalized) || 0) + 1)
    }
  }
  return [...values.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, META_CATEGORIES)
    .map(([category, programmes]) => ({ category, programmes }))
}

export function buildLocalTitleIndex(entries) {
  const rows = Array.isArray(entries) ? entries : []
  const byTypeTitle = new Map()
  const all = []
  for (const entry of rows) {
    const type = entry?.type === 'tv' ? 'series' : entry?.type
    const tmdbId = Number(entry?.tmdbId)
    if (!['movie', 'series'].includes(type) || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) continue
    const title = String(entry.title || '').trim()
    if (!title) continue
    const localCandidate = {
      type, tmdbId, title,
      originalTitle: entry?.originalTitle || null,
      year: Number.isInteger(entry?.year) ? entry.year : null,
    }
    all.push(localCandidate)
    for (const alias of [title, entry?.originalTitle]) {
      const normalized = key(alias)
      if (!normalized) continue
      const indexKey = type + ':' + normalized
      if (!byTypeTitle.has(indexKey)) byTypeTitle.set(indexKey, new Map())
      byTypeTitle.get(indexKey).set(tmdbId, localCandidate)
    }
  }
  return {
    titleCount: all.length,
    lookup: (candidate, type) => [
      ...(byTypeTitle.get(type + ':' + key(candidate?.title))?.values() || []),
    ],
  }
}

export function compareSourceEventHashes(results) {
  const summary = []
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const left = results[i]
      const right = results[j]
      if (!left?.eventHashes || !right?.eventHashes) continue
      const overlap = [...left.eventHashes].filter((hash) => right.eventHashes.has(hash)).length
      const smaller = Math.min(left.eventHashes.size, right.eventHashes.size)
      summary.push({
        left: left.source,
        right: right.source,
        identicalProgrammeIntervals: overlap,
        smallerFeedCandidateCount: smaller,
        overlapPercentOfSmaller: smaller ? Math.round(overlap / smaller * 1000) / 10 : null,
      })
    }
  }
  return summary
}

/** Evaluate only reviewed stations in the next rolling 120 hours. */
export async function measureXmltvG1c(xml, {
  sourceId, now = Date.now(), localIndex = buildLocalTitleIndex([]),
  maxSample = MAX_SAMPLE, matchFunction = matchXmltvLocalCandidates,
} = {}) {
  if (!Number.isInteger(maxSample) || maxSample < 1 || maxSample > MAX_SAMPLE) {
    throw new RangeError('Invalid G1c sample budget')
  }
  const stage = parseXmltvCandidates(xml, {
    sourceId, stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS,
    observedAt: new Date(now).toISOString(), mappedOnly: true,
  })
  const future = stage.candidates.filter((c) => Date.parse(c.endAt) > now &&
    Date.parse(c.startAt) < now + WINDOW_MS)
    .sort((a, b) => a.startAt.localeCompare(b.startAt) ||
      a.canonicalStationId.localeCompare(b.canonicalStationId) ||
      a.title.localeCompare(b.title))
  const sample = future.slice(0, maxSample)
  const classified = count(sample.map((item) => inferXmltvMediaType(item) || 'unclassified'))
  const stationMetrics = Object.fromEntries(XMLTV_REVIEWED_STATIONS.map((station) => {
    const stationEntries = future.filter((c) => c.canonicalStationId === station.stationId)
    const typed = stationEntries.filter((entry) => inferXmltvMediaType(entry))
    return [station.stationId, {
      name: station.stationName,
      programmesIn120h: stationEntries.length,
      typedPercent: stationEntries.length
        ? Math.round(typed.length / stationEntries.length * 1000) / 10 : 0,
      withDescription: stationEntries.filter((entry) => entry.description).length,
      withSubtitle: stationEntries.filter((entry) => entry.subtitle).length,
      withParsedEpisode: stationEntries.filter((entry) => entry.episode).length,
      withAnyEpisodeField: stationEntries.filter((entry) => entry.episodeEvidence?.length).length,
      withProductionYearEvidence: stationEntries.filter((entry) => entry.productionYearEvidence).length,
    }]
  }))
  const match = await matchFunction(sample, {
    localCandidatesFor: async (candidate, type) => localIndex.lookup(candidate, type),
  })
  const eventHashes = new Set(future.map((candidate) =>
    createHash('sha256').update([
      candidate.canonicalStationId, candidate.startAt,
      candidate.endAt, key(candidate.title),
    ].join('|')).digest('hex')))
  return {
    source: sourceId,
    eventHashes, // internal only; never written to the public report.
    report: {
      source: sourceId, observedAt: stage.observedAt,
      coverage: measureXmltvFiveDayCoverage(stage.candidates, { sourceId, now }),
      scannedProgrammes: stage.diagnostics.sourceRecords,
      mappedProgrammes: stage.diagnostics.mappedCandidates,
      skippedOtherStations: stage.diagnostics.skippedUnmapped,
      reviewedStations: stage.channels.filter((c) => c.stationMappingStatus === 'mapped').length,
      programmesInNext120h: future.length,
      sampleSize: sample.length, truncatedSample: future.length > sample.length,
      typed: classified,
      descriptions: sample.filter((c) => c.description).length,
      subtitles: sample.filter((c) => c.subtitle).length,
      parsedEpisodes: sample.filter((c) => c.episode).length,
      anyEpisodeFields: sample.filter((c) => c.episodeEvidence?.length).length,
      episodeSystems: count(sample.flatMap((c) => (c.episodeEvidence || [])
        .map((entry) => entry.system || 'missing-system'))),
      episodeLabelFormats: count(sample.flatMap((c) => (c.episodeEvidence || [])
        .map((entry) => xmltvEpisodeLabelFormat(entry.raw)))),
      productionYearEvidence: sample.filter((c) => c.productionYearEvidence).length,
      explicitZone: sample.filter((c) => c.timestampsExplicitlyZoned).length,
      categoryTop: topCategories(sample),
      stations: stationMetrics,
      localReferenceTitles: localIndex.titleCount,
      localReferenceMatches: match.counts.accepted,
      localReferenceDecisionCounts: match.counts.reasons,
      dataLimitations: 'Only six reviewed stations, a one-time 120h snapshot, a small historical local TMDB corpus; no full-TMDB recall.',
    },
  }
}

function markdownSummary(report) {
  const lines = [
    '## XMLTV #336 G1c – real-feed read-only metadata and limited local matcher sample',
    '',
    '| Source | 120h programmes (six stations) | Category typed (sample) | S/E parsed (sample) | Local-reference hits (sample) |',
    '|---|---:|---:|---:|---:|',
  ]
  for (const r of report.sources) {
    const n = r.sampleSize ?? 0
    const typed = n - (r.typed?.unclassified ?? n)
    lines.push('| ' + r.source + ' | ' + (r.programmesInNext120h ?? 'error') +
      ' | ' + (n ? typed + '/' + n : '—') +
      ' | ' + (r.parsedEpisodes ?? '—') +
      ' | ' + (r.localReferenceMatches ?? '—') + ' |')
  }
  // Do not equate a partially available independent feed with a complete
  // 120h fallback on every station. No raw programme names or provider URLs.
  const fallback = report.readiness
  lines.push('', '**Per-station independent fallback:** ' +
    fallback.stationsWithIndependentFallback + '/6 reviewed stations have a second CONTENT family; ' +
    fallback.stationsWithTwoCompleteIndependentFamilies +
    '/6 have TWO families each covering 120h. These counts are NOT a rights or publication approval.',
    '', '| Canonical station | Primary coverage (minutes / 7200) | Independent second-family coverage (minutes / 7200) |',
    '|---|---:|---:|')
  for (const station of XMLTV_REVIEWED_STATIONS) {
    const coverage = fallback.stationFallback[station.stationId]
    lines.push('| ' + station.stationId + ' | ' +
      coverage.primaryCoverageMinutes + ' | ' +
      coverage.independentFallbackCoverageMinutes + ' |')
  }
  lines.push('', '**Five-day EPG snapshot:** Primary: ' +
    (report.readiness.primaryFiveDaySnapshot ? 'full 120h across six stations' : 'not proven') +
    '; independent available source families: ' + report.readiness.availableIndependentFamilies +
    '; independent fallback observed: ' +
    (report.readiness.independentFallbackSnapshot ? 'yes' : 'no') +
    '; full 120h in two independent families: ' +
    (report.readiness.sufficientIndependentCoverageSnapshot ? 'yes' : 'no') + '.',
    '', '**Interpretation:** local-reference hits are NOT overall TMDB match coverage.',
    'Only reviewed six stations, titles are not printed, no MovieHub data is published.')
  return lines.join('\n') + '\n'
}

export async function runG1cProbe({
  now = Date.now(),
  feedList = FEEDS, downloader = downloadXmltvFeed, catalogEntries = null,
} = {}) {
  const rows = catalogEntries ?? JSON.parse(
    await readFile(resolve(ROOT, 'public/waipu-live/titles.json'), 'utf8')).entries
  const localIndex = buildLocalTitleIndex(rows)
  const sources = []
  const internals = []
  for (const feed of feedList) {
    try {
      const result = await downloader(feed.url)
      const measured = await measureXmltvG1c(result.xml, {
        sourceId: feed.id, now, localIndex,
      })
      internals.push(measured)
      sources.push({
        ...measured.report, status: 'ok',
        compressedBytes: result.compressedBytes ?? null,
        expandedBytes: result.xmlBytes ?? null,
      })
    } catch (error) {
      sources.push({ source: feed.id, status: 'error',
        error: String(error?.message || error).slice(0, 200) })
    }
  }
  return {
    kind: 'xmltv-g1c-readonly-quality-probe',
    measuredAt: new Date(now).toISOString(), mode: 'read-only',
    sixStationsOnly: true,
    localReferenceTitleCount: localIndex.titleCount,
    comparison: compareSourceEventHashes(internals),
    readiness: assessXmltvIndependentCoverage(sources, { now }),
    sources,
  }
}

async function main() {
  const report = await runG1cProbe()
  const output = resolve(ROOT, 'artifacts/xmltv-g1c-quality/report.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  const summary = markdownSummary(report)
  process.stdout.write(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
  }
  if (!report.sources.some((source) => source.status === 'ok')) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('G1c read-only diagnostic failed:', String(error?.message || error))
    process.exitCode = 1
  })
}
