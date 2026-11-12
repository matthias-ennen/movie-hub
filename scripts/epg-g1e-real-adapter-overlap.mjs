/**
 * #336 G1e part 2 – reproduce real Waipu/Joyn EPG schedule overlap from
 * already completed healthy SourceAdapter generations (read-only).
 *
 * IMPORTANT: a same TMDB identity in source envelopes is NOT an explicit
 * matcher approval, original EPG title, or saved TMDB search. Such reuse
 * cannot be enabled here; this is evidence-coverage diagnostics only.
 */
import { readFile, mkdir, writeFile, appendFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TV_AIRING_MATCH_MAX_START_DELTA_MS,
  TV_AIRING_MATCH_MIN_OVERLAP_RATIO,
} from '../src/sources/mergeTvAirings.js'

const MAX_BYTES = 140 * 1024 * 1024
const MAX_EVENTS = 125_000
const MAX_DURATION = 36 * 60 * 60 * 1000
const stationName = (value) => typeof value === 'string' && value.trim().length <= 128
  ? value.trim() : ''

function workRef(value) {
  const type = value?.mediaType === 'tv' ? 'series' : value?.mediaType
  const tmdbId = Number(value?.tmdbId)
  return ['movie', 'series'].includes(type) &&
    Number.isSafeInteger(tmdbId) && tmdbId > 0 ? type + ':' + tmdbId : null
}

function airedAt(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = Date.parse(value)
  return Number.isFinite(date) ? date : null
}

function validBroadcast(record, sourceId) {
  if (record?.kind !== 'broadcast' || !record.titleRef) return null
  const station = stationName(record.channelId)
  const ref = workRef(record.titleRef)
  const start = airedAt(record.startAt)
  const end = airedAt(record.endAt)
  if (!station || !ref || start === null || end === null || end <= start ||
    end - start > MAX_DURATION) return null
  const originalTitle = record?.extensions?.[sourceId]?.rawTitle
  // Waipu does not publish its original EPG program title; the TMDB title
  // found in a different catalog is *not* an acceptable substitute.
  const hasOriginalTitle = typeof originalTitle === 'string' && Boolean(originalTitle.trim())
  return { station, ref, start, end, hasOriginalTitle }
}

function sourceEvents(envelope, expectedSource) {
  if (!envelope || envelope.sourceId !== expectedSource ||
    envelope.sourceStatus !== 'healthy' ||
    !Array.isArray(envelope.records) || envelope.records.length > MAX_EVENTS) {
    throw new TypeError(expectedSource + ' is not a complete healthy bounded source envelope')
  }
  const result = []
  let invalid = 0
  for (const row of envelope.records) {
    const event = validBroadcast(row, expectedSource)
    if (event) result.push(event)
    else invalid++
  }
  return { result, invalid }
}

function lowerBound(rows, start) {
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (rows[mid].start < start) lo = mid + 1
    else hi = mid
  }
  return lo
}

function overlapped(left, right) {
  const sharedMs = Math.max(0,
    Math.min(left.end, right.end) - Math.max(left.start, right.start))
  return Math.abs(left.start - right.start) <= TV_AIRING_MATCH_MAX_START_DELTA_MS &&
    sharedMs / Math.max(left.end - left.start, right.end - right.start) >=
      TV_AIRING_MATCH_MIN_OVERLAP_RATIO
}

function readMetric(report, field) {
  const value = report?.runtime?.[field]
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

/**
 * Pure analysis: no writes, no requests, no source mutation.
 * Station/time comparisons match mergeTvAirings, but they deliberately do
 * not assert reusable identity unless a future approved matcher receipt exists.
 */
export function analyzeRealEpgOverlap(waipu, joyn, {
  waipuIndex = null,
  joynIndex = null,
} = {}) {
  const w = sourceEvents(waipu, 'waipu')
  const j = sourceEvents(joyn, 'joyn')
  const stations = new Map()
  for (const record of w.result) {
    if (!stations.has(record.station)) stations.set(record.station, [])
    stations.get(record.station).push(record)
  }
  for (const rows of stations.values()) rows.sort((a, b) => a.start - b.start)
  const joynStationIds = new Set(j.result.map(event => event.station))
  const commonStations = [...stations.keys()].filter(name => joynStationIds.has(name))

  const counts = {
    waipuBroadcasts: w.result.length, joynBroadcasts: j.result.length,
    invalidWaipuRecords: w.invalid, invalidJoynRecords: j.invalid,
    waipuStations: stations.size, joynStations: joynStationIds.size,
    commonStations: commonStations.length,
    joynAiringsOnCommonStations: 0, joynAiringsWithSameTimeSlot: 0,
    sameTimeAndSameWork: 0, sameTimeButDifferentWork: 0,
    multipleWaipuMatchesInSlot: 0,
    joynEventsWithOriginalSourceTitle: j.result.filter(x => x.hasOriginalTitle).length,
    waipuEventsWithOriginalSourceTitle: w.result.filter(x => x.hasOriginalTitle).length,
  }
  const group = {
    waipuSource: waipu.sourceId,
    joynSource: joyn.sourceId,
    waipuGenerationId: waipu.sourceGenerationId ?? null,
    joynGenerationId: joyn.sourceGenerationId ?? null,
    waipuGeneratedAt: waipu.generatedAt ?? null,
    joynGeneratedAt: joyn.generatedAt ?? null,
  }

  // Avoid collecting programme names, TMDB IDs or source routes into output.
  for (const candidate of j.result) {
    const matchedStation = stations.get(candidate.station)
    if (!matchedStation) continue
    counts.joynAiringsOnCommonStations++
    const matches = []
    let p = lowerBound(matchedStation,
      candidate.start - TV_AIRING_MATCH_MAX_START_DELTA_MS)
    while (p < matchedStation.length &&
      matchedStation[p].start <= candidate.start + TV_AIRING_MATCH_MAX_START_DELTA_MS) {
      const other = matchedStation[p++]
      if (overlapped(candidate, other)) matches.push(other)
    }
    if (!matches.length) continue
    counts.joynAiringsWithSameTimeSlot++
    if (matches.length > 1) counts.multipleWaipuMatchesInSlot++
    const ids = new Set(matches.map(match => match.ref))
    if (ids.size === 1 && ids.has(candidate.ref)) counts.sameTimeAndSameWork++
    else counts.sameTimeButDifferentWork++
  }
  return {
    kind: 'epg-g1e-real-cross-adapter-overlap',
    schemaVersion: 1, mode: 'read-only',
    sources: group, counts,
    priorMatcherTraffic: {
      waipuTmdbRequests: readMetric(waipuIndex, 'tmdbRequests'),
      joynTmdbSearchRequests: readMetric(joynIndex, 'tmdbSearchRequests'),
      joynOwnMatchCacheHits: readMetric(joynIndex, 'matchCacheHits'),
    },
    validatedMatcherApprovalReceipts: null,
    measuredAvoidedTmdbRequests: null,
    safety: {
      canAutomaticallySeedSharedIndex: false,
      reason: 'Published SourceAdapter events do not contain explicit matcher approval receipts; Waipu lacks original EPG titles.',
      countsAre: 'Source-level broadcast events, not unique TMDB titles or actual API requests.',
    },
  }
}

function markdown(report) {
  const c = report.counts
  return [
    '# MovieHub XMLTV #336 – G1e real adapter overlap (read-only)',
    '',
    '| Measured category | Events |',
    '|---|---:|',
    '| Waipu validated airings | ' + c.waipuBroadcasts + ' |',
    '| Joyn validated airings | ' + c.joynBroadcasts + ' |',
    '| Common canonical stations | ' + c.commonStations + ' |',
    '| Joyn airings with matching station and times | ' + c.joynAiringsWithSameTimeSlot + ' |',
    '| Of these with identical TMDB work | ' + c.sameTimeAndSameWork + ' |',
    '| Of these with conflicting TMDB works | ' + c.sameTimeButDifferentWork + ' |',
    '| Waipu original EPG titles in broadcast envelope | ' + c.waipuEventsWithOriginalSourceTitle + ' |',
    '| Joyn original EPG titles in broadcast envelope | ' + c.joynEventsWithOriginalSourceTitle + ' |',
    '',
    '**Not a claimed TMDB saving:** without Waipu original EPG titles and positive approval receipts, this is evidence quality only. '
      + 'The recorded prior-matcher traffic is a baseline, not a controlled before/after test.',
    '',
  ].join('\n')
}

async function safeRead(path) {
  if (!path) return null
  const file = await stat(path)
  if (!file.isFile() || file.size > MAX_BYTES) throw new RangeError('Invalid or oversized G1e input file')
  return JSON.parse(await readFile(path, 'utf8'))
}

function readArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!/^--(?:waipu|joyn|waipu-index|joyn-index|output)$/.test(argv[i]) ||
      !argv[i+1]) throw new TypeError('Invalid G1e replay arguments')
    args[argv[i].slice(2)] = argv[i+1]
  }
  if (!args.waipu || !args.joyn || !args.output) {
    throw new TypeError('Required arguments: --waipu <path> --joyn <path> --output <path>')
  }
  return args
}

async function main(argv) {
  const args = readArgs(argv)
  const data = await analyzeRealEpgOverlap(
    await safeRead(args.waipu), await safeRead(args.joyn), {
      waipuIndex: await safeRead(args['waipu-index']),
      joynIndex: await safeRead(args['joyn-index']),
    })
  await mkdir(dirname(resolve(args.output)), { recursive: true })
  await writeFile(args.output, JSON.stringify(data, null, 2) + '\n')
  const summary = markdown(data)
  process.stdout.write(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error('Read-only G1e replay failed:', String(error?.message || error))
    process.exitCode = 1
  })
}
