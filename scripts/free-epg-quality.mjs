import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  appendFile,
  mkdir,
  mkdtemp,
  open,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'
import { createGunzip } from 'node:zlib'
import { SaxesParser } from 'saxes'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const DEFAULT_FREE_EPG_URL = 'https://free-epg.de/api/epg/de.xml.gz'
export const DEFAULT_MINIMUM_FUTURE_HOURS = 24
export const DEFAULT_TARGET_COVERAGE_DAYS = 14
export const DEFAULT_MAX_COMPRESSED_BYTES = 200 * 1024 * 1024
export const DEFAULT_MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024

const MOVIE_CATEGORY_MARKERS = [
  'film',
  'movie',
  'spielfilm',
  'fernsehfilm',
  'kinofilm',
  'cinema',
]
const SERIES_CATEGORY_MARKERS = [
  'serie',
  'series',
  'episode',
  'soap',
  'sitcom',
  'telenovela',
]
const CAPTURED_PROGRAMME_FIELDS = new Set(['title', 'sub-title', 'desc', 'category', 'date'])
const MAX_CAPTURED_FIELD_LENGTH = 50_000

function asFiniteNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

function tagName(tag) {
  return String(tag?.local || tag?.name || '')
}

function attributeValue(tag, name) {
  const attribute = tag?.attributes?.[name]
  if (attribute && typeof attribute === 'object' && 'value' in attribute) return String(attribute.value)
  if (attribute !== undefined && attribute !== null) return String(attribute)
  return null
}

function appendLimited(target, value) {
  if (!value || target.length >= MAX_CAPTURED_FIELD_LENGTH) return target
  return (target + value).slice(0, MAX_CAPTURED_FIELD_LENGTH)
}

function toIsoOrNull(value) {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null
}

function rounded(value, digits = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function sortedCounts(counts, limit = 30) {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'de'))
    .slice(0, limit)
}

function classifyProgramme(categories) {
  const normalizedCategories = categories.map(normalizedText).filter(Boolean)
  const hasMarker = (markers) => normalizedCategories.some((category) => (
    markers.some((marker) => category.includes(marker))
  ))

  if (hasMarker(MOVIE_CATEGORY_MARKERS)) return 'movie'
  if (hasMarker(SERIES_CATEGORY_MARKERS)) return 'series'
  return null
}

export function parseXmltvTimestamp(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-]\d{4}|Z))?$/)
  if (!match) return { date: null, hasTimezone: false }

  const [, year, month, day, hour, minute, seconds = '00', rawOffset] = match
  const hasTimezone = Boolean(rawOffset)
  let offset = 'Z'
  if (rawOffset && rawOffset !== 'Z') {
    offset = `${rawOffset.slice(0, 3)}:${rawOffset.slice(3)}`
  }

  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${seconds}${offset}`)
  return {
    date: Number.isFinite(date.getTime()) ? date : null,
    hasTimezone,
  }
}

export async function parseXmltvStream(readable, { now = new Date() } = {}) {
  const evaluatedAt = now instanceof Date ? now : new Date(now)
  if (!Number.isFinite(evaluatedAt.getTime())) throw new Error('Invalid evaluation time.')

  const channelIds = new Set()
  const channelNames = new Map()
  const programmeFingerprints = new Set()
  const movieFingerprints = new Set()
  const seriesFingerprints = new Set()
  const referencedChannelIds = new Set()
  const categoryCounts = new Map()

  let generatorInfoName = null
  let generatorInfoUrl = null
  let channelElementCount = 0
  let programmeElementCount = 0
  let duplicateProgrammeCount = 0
  let programmesWithDescription = 0
  let programmesWithoutTitle = 0
  let invalidTimeCount = 0
  let missingTimezoneCount = 0
  let activeNowCount = 0
  let futureStartCount = 0
  let relevantProgrammeCount = 0
  let pastProgrammeCount = 0
  let movieCandidateCount = 0
  let seriesCandidateCount = 0
  let earliestStart = null
  let latestStop = null
  let currentChannel = null
  let currentProgramme = null
  let currentField = null
  let currentFieldText = ''

  function recordChannel() {
    channelElementCount += 1
    const id = String(currentChannel?.id || '').trim()
    if (id) channelIds.add(id)
    for (const displayName of currentChannel?.displayNames || []) {
      const normalized = normalizedText(displayName)
      if (!normalized) continue
      const ids = channelNames.get(normalized) || new Set()
      if (id) ids.add(id)
      channelNames.set(normalized, ids)
    }
    currentChannel = null
  }

  function recordProgramme() {
    programmeElementCount += 1
    const title = String(currentProgramme?.title || '').trim()
    const channel = String(currentProgramme?.channel || '').trim()
    const categories = (currentProgramme?.categories || []).map((value) => String(value).trim()).filter(Boolean)
    const startResult = parseXmltvTimestamp(currentProgramme?.start)
    const stopResult = parseXmltvTimestamp(currentProgramme?.stop)
    const start = startResult.date
    const stop = stopResult.date

    if (channel) referencedChannelIds.add(channel)
    if (!title) programmesWithoutTitle += 1
    if (String(currentProgramme?.desc || '').trim()) programmesWithDescription += 1

    if (!startResult.hasTimezone || !stopResult.hasTimezone) missingTimezoneCount += 1
    if (!start || !stop || stop <= start) {
      invalidTimeCount += 1
    } else {
      if (!earliestStart || start < earliestStart) earliestStart = start
      if (!latestStop || stop > latestStop) latestStop = stop
      if (stop <= evaluatedAt) pastProgrammeCount += 1
      else {
        relevantProgrammeCount += 1
        if (start <= evaluatedAt) activeNowCount += 1
        else futureStartCount += 1
      }
    }

    for (const category of categories) {
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1)
    }

    const fingerprint = [
      channel,
      String(currentProgramme?.start || '').trim(),
      String(currentProgramme?.stop || '').trim(),
      normalizedText(title),
      normalizedText(currentProgramme?.subTitle),
    ].join('|')
    if (programmeFingerprints.has(fingerprint)) duplicateProgrammeCount += 1
    else programmeFingerprints.add(fingerprint)

    const candidateType = classifyProgramme(categories)
    if (candidateType === 'movie') {
      movieCandidateCount += 1
      movieFingerprints.add(fingerprint)
    } else if (candidateType === 'series') {
      seriesCandidateCount += 1
      seriesFingerprints.add(fingerprint)
    }

    currentProgramme = null
  }

  const parser = new SaxesParser({ xmlns: true })
  parser.on('error', (error) => {
    throw error
  })
  parser.on('opentag', (tag) => {
    const name = tagName(tag)
    if (name === 'tv') {
      generatorInfoName = attributeValue(tag, 'generator-info-name')
      generatorInfoUrl = attributeValue(tag, 'generator-info-url')
      return
    }
    if (name === 'channel') {
      currentChannel = { id: attributeValue(tag, 'id'), displayNames: [] }
      return
    }
    if (name === 'programme') {
      currentProgramme = {
        start: attributeValue(tag, 'start'),
        stop: attributeValue(tag, 'stop'),
        channel: attributeValue(tag, 'channel'),
        title: '',
        subTitle: '',
        desc: '',
        date: '',
        categories: [],
      }
      return
    }
    if ((currentChannel && name === 'display-name') || (currentProgramme && CAPTURED_PROGRAMME_FIELDS.has(name))) {
      currentField = name
      currentFieldText = ''
    }
  })
  parser.on('text', (value) => {
    if (currentField) currentFieldText = appendLimited(currentFieldText, value)
  })
  parser.on('cdata', (value) => {
    if (currentField) currentFieldText = appendLimited(currentFieldText, value)
  })
  parser.on('closetag', (tag) => {
    const name = tagName(tag)
    if (currentField && name === currentField) {
      const value = currentFieldText.trim()
      if (currentChannel && name === 'display-name' && value) currentChannel.displayNames.push(value)
      if (currentProgramme) {
        if (name === 'category' && value) currentProgramme.categories.push(value)
        else if (name === 'sub-title') currentProgramme.subTitle = value
        else if (name in currentProgramme) currentProgramme[name] = value
      }
      currentField = null
      currentFieldText = ''
    }
    if (name === 'channel' && currentChannel) recordChannel()
    if (name === 'programme' && currentProgramme) recordProgramme()
  })

  const decoder = new StringDecoder('utf8')
  for await (const chunk of readable) {
    parser.write(decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
  }
  const remainder = decoder.end()
  if (remainder) parser.write(remainder)
  parser.close()

  const duplicateChannelNames = [...channelNames.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([name, ids]) => ({ name, channelIds: [...ids].sort() }))
    .sort((left, right) => right.channelIds.length - left.channelIds.length || left.name.localeCompare(right.name, 'de'))

  return {
    generator: {
      name: generatorInfoName,
      url: generatorInfoUrl,
    },
    channels: {
      elements: channelElementCount,
      uniqueIds: channelIds.size,
      normalizedNames: channelNames.size,
      duplicateNormalizedNames: duplicateChannelNames.length,
      duplicateIdAssignments: duplicateChannelNames.reduce((total, entry) => total + entry.channelIds.length - 1, 0),
      duplicateNameExamples: duplicateChannelNames.slice(0, 50),
      referencedIds: referencedChannelIds.size,
      unknownReferencedIds: [...referencedChannelIds].filter((id) => !channelIds.has(id)).length,
    },
    programmes: {
      elements: programmeElementCount,
      unique: programmeFingerprints.size,
      duplicates: duplicateProgrammeCount,
      withDescription: programmesWithDescription,
      withoutDescription: Math.max(0, programmeElementCount - programmesWithDescription),
      withoutTitle: programmesWithoutTitle,
      invalidTimes: invalidTimeCount,
      missingTimezone: missingTimezoneCount,
      past: pastProgrammeCount,
      activeNow: activeNowCount,
      futureStarts: futureStartCount,
      currentOrFuture: relevantProgrammeCount,
      topCategories: sortedCounts(categoryCounts),
    },
    candidates: {
      movies: movieCandidateCount,
      uniqueMovies: movieFingerprints.size,
      series: seriesCandidateCount,
      uniqueSeries: seriesFingerprints.size,
      classification: 'explicit-category-markers-v1',
    },
    range: {
      earliestStart: toIsoOrNull(earliestStart),
      latestStop: toIsoOrNull(latestStop),
    },
  }
}

export function buildQualityReport({
  stats,
  source,
  evaluatedAt = new Date(),
  generatedAt = new Date(),
  minimumFutureHours = DEFAULT_MINIMUM_FUTURE_HOURS,
  targetCoverageDays = DEFAULT_TARGET_COVERAGE_DAYS,
}) {
  const now = evaluatedAt instanceof Date ? evaluatedAt : new Date(evaluatedAt)
  const created = generatedAt instanceof Date ? generatedAt : new Date(generatedAt)
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(created.getTime())) {
    throw new Error('Invalid report timestamp.')
  }

  const latestStop = stats?.range?.latestStop ? new Date(stats.range.latestStop) : null
  const coverageAheadHours = latestStop && Number.isFinite(latestStop.getTime())
    ? (latestStop.getTime() - now.getTime()) / 3_600_000
    : null
  const reasons = []

  if (!stats?.channels?.uniqueIds) reasons.push('No channels found in XMLTV input.')
  if (!stats?.programmes?.elements) reasons.push('No programme entries found in XMLTV input.')
  if (!stats?.programmes?.currentOrFuture) reasons.push('No current or future programme entries found.')
  if (!Number.isFinite(coverageAheadHours) || coverageAheadHours < minimumFutureHours) {
    reasons.push(`Programme data does not cover the required next ${minimumFutureHours} hours.`)
  }

  const status = reasons.length === 0 ? 'pass' : 'fail'
  return {
    kind: 'free-epg-quality-report',
    version: 1,
    generatedAt: created.toISOString(),
    evaluatedAt: now.toISOString(),
    source,
    xmltv: stats,
    quality: {
      status,
      validForPrototype: status === 'pass',
      minimumFutureHours,
      targetCoverageDays,
      coverageAheadHours: rounded(coverageAheadHours),
      coverageAheadDays: rounded(Number.isFinite(coverageAheadHours) ? coverageAheadHours / 24 : null),
      targetCoverageMet: Number.isFinite(coverageAheadHours)
        && coverageAheadHours >= targetCoverageDays * 24,
      reasons,
    },
  }
}

function byteLimitTransform(limit, label, onChunk = null) {
  let bytes = 0
  return new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length
      if (bytes > limit) {
        callback(new Error(`${label} exceeds the configured ${limit}-byte limit.`))
        return
      }
      onChunk?.(chunk, bytes)
      callback(null, chunk)
    },
  })
}

async function isGzipFile(path) {
  const handle = await open(path, 'r')
  try {
    const signature = Buffer.alloc(2)
    const { bytesRead } = await handle.read(signature, 0, 2, 0)
    return bytesRead === 2 && signature[0] === 0x1f && signature[1] === 0x8b
  } finally {
    await handle.close()
  }
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

async function downloadToFile(url, destination, {
  fetchImpl = fetch,
  maxBytes = DEFAULT_MAX_COMPRESSED_BYTES,
  attempts = 3,
} = {}) {
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/gzip, application/xml, text/xml;q=0.9, */*;q=0.1',
          'User-Agent': 'MovieHub-FreeEPG-Quality/1.0',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
      })
      if (!response.ok || !response.body) {
        throw new Error(`FreeEPG request failed with HTTP ${response.status}.`)
      }
      const declaredLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new Error(`FreeEPG response declares ${declaredLength} bytes; limit is ${maxBytes}.`)
      }

      const hash = createHash('sha256')
      let bytes = 0
      const limiter = byteLimitTransform(maxBytes, 'Compressed FreeEPG download', (chunk, total) => {
        hash.update(chunk)
        bytes = total
      })
      await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(destination))
      return {
        requestedUrl: url,
        resolvedUrl: response.url || url,
        httpStatus: response.status,
        contentType: response.headers.get('content-type'),
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        bytes,
        sha256: hash.digest('hex'),
      }
    } catch (error) {
      lastError = error
      if (attempt + 1 < attempts) await sleep(500 * (2 ** attempt))
    }
  }
  throw lastError || new Error('FreeEPG download failed.')
}

async function sha256File(path, maxBytes = DEFAULT_MAX_COMPRESSED_BYTES) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length
    if (bytes > maxBytes) throw new Error(`Input file exceeds the configured ${maxBytes}-byte limit.`)
    hash.update(chunk)
  }
  return { bytes, sha256: hash.digest('hex') }
}

function parseArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (argument === '--input') options.inputPath = value
    else if (argument === '--url') options.url = value
    else if (argument === '--output') options.outputPath = value
    else if (argument === '--now') options.now = value
    else if (argument === '--minimum-future-hours') options.minimumFutureHours = value
    else if (argument === '--target-coverage-days') options.targetCoverageDays = value
    else continue
    index += 1
  }
  return options
}

function reportMarkdown(report) {
  const { xmltv, quality, source } = report
  return [
    '## FreeEPG quality report',
    '',
    `**Status:** ${quality.status === 'pass' ? 'PASS' : 'FAIL'}`,
    '',
    `- Quelle: ${source.resolvedUrl || source.path || source.requestedUrl}`,
    `- SHA-256: ${source.sha256 || 'unbekannt'}`,
    `- Sender: ${xmltv.channels.elements} Elemente / ${xmltv.channels.uniqueIds} IDs`,
    `- Programme: ${xmltv.programmes.elements} Elemente / ${xmltv.programmes.unique} eindeutig / ${xmltv.programmes.duplicates} Dubletten`,
    `- Aktuell oder zukünftig: ${xmltv.programmes.currentOrFuture}`,
    `- Filmkandidaten: ${xmltv.candidates.movies} (${xmltv.candidates.uniqueMovies} eindeutig)`,
    `- Serienkandidaten: ${xmltv.candidates.series} (${xmltv.candidates.uniqueSeries} eindeutig)`,
    `- Programmzeitraum: ${xmltv.range.earliestStart || 'unbekannt'} bis ${xmltv.range.latestStop || 'unbekannt'}`,
    `- Vorschau ab Prüfzeitpunkt: ${quality.coverageAheadDays ?? 'unbekannt'} Tage`,
    `- 14-Tage-Ziel erreicht: ${quality.targetCoverageMet ? 'ja' : 'nein'}`,
    ...(quality.reasons.length ? ['', ...quality.reasons.map((reason) => `- Fehler: ${reason}`)] : []),
    '',
  ].join('\n')
}

export async function runFreeEpgQuality(options = {}) {
  const evaluatedAt = options.now ? new Date(options.now) : new Date()
  if (!Number.isFinite(evaluatedAt.getTime())) throw new Error('Invalid --now value.')

  const outputPath = resolve(root, options.outputPath || 'artifacts/free-epg-quality/quality-report.json')
  const minimumFutureHours = Math.max(0, asFiniteNumber(
    options.minimumFutureHours,
    DEFAULT_MINIMUM_FUTURE_HOURS,
  ))
  const targetCoverageDays = Math.max(0, asFiniteNumber(
    options.targetCoverageDays,
    DEFAULT_TARGET_COVERAGE_DAYS,
  ))
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'movie-hub-free-epg-'))
  let inputPath = options.inputPath ? resolve(process.cwd(), options.inputPath) : null
  let source = null
  let stage = 'source'

  try {
    if (inputPath) {
      const fingerprint = await sha256File(inputPath)
      source = {
        kind: 'file',
        path: inputPath,
        fileName: basename(inputPath),
        ...fingerprint,
      }
    } else {
      inputPath = resolve(temporaryDirectory, 'de.xml.gz')
      source = {
        kind: 'http',
        ...(await downloadToFile(options.url || DEFAULT_FREE_EPG_URL, inputPath)),
      }
    }

    const gzip = await isGzipFile(inputPath)
    source.gzip = gzip
    stage = 'xmltv-parse'
    const input = createReadStream(inputPath)
    const xmlStream = gzip ? input.pipe(createGunzip()) : input
    const limitedXmlStream = xmlStream.pipe(byteLimitTransform(
      options.maxUncompressedBytes || DEFAULT_MAX_UNCOMPRESSED_BYTES,
      'Uncompressed XMLTV input',
    ))
    const stats = await parseXmltvStream(limitedXmlStream, { now: evaluatedAt })
    stage = 'quality-evaluation'
    const report = buildQualityReport({
      stats,
      source,
      evaluatedAt,
      generatedAt: new Date(),
      minimumFutureHours,
      targetCoverageDays,
    })

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    const markdown = reportMarkdown(report)
    console.log(markdown)
    console.log(`FreeEPG quality report written to ${outputPath}`)
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8')
    }

    if (report.quality.status !== 'pass') {
      const error = new Error(`FreeEPG quality gate failed: ${report.quality.reasons.join(' ')}`)
      error.report = report
      throw error
    }
    return report
  } catch (error) {
    if (!error?.report) {
      const message = error instanceof Error ? error.message : String(error)
      const failureReport = {
        kind: 'free-epg-quality-report',
        version: 1,
        generatedAt: new Date().toISOString(),
        evaluatedAt: evaluatedAt.toISOString(),
        source,
        xmltv: null,
        quality: {
          status: 'fail',
          validForPrototype: false,
          minimumFutureHours,
          targetCoverageDays,
          coverageAheadHours: null,
          coverageAheadDays: null,
          targetCoverageMet: false,
          reasons: [message],
        },
        failure: {
          stage,
          name: error instanceof Error ? error.name : 'Error',
          message,
        },
      }
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, `${JSON.stringify(failureReport, null, 2)}\n`, 'utf8')
      const markdown = [
        '## FreeEPG quality report',
        '',
        '**Status:** FAIL',
        '',
        `- Fehlerstufe: ${stage}`,
        `- Fehler: ${message}`,
        '',
      ].join('\n')
      console.log(markdown)
      console.log(`FreeEPG failure report written to ${outputPath}`)
      if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8')
      }
    }
    throw error
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cliOptions = parseArguments(process.argv.slice(2))
  try {
    await runFreeEpgQuality({
      ...cliOptions,
      inputPath: cliOptions.inputPath || process.env.FREE_EPG_INPUT_PATH,
      url: cliOptions.url || process.env.FREE_EPG_URL || DEFAULT_FREE_EPG_URL,
      outputPath: cliOptions.outputPath || process.env.FREE_EPG_REPORT_PATH,
      minimumFutureHours: cliOptions.minimumFutureHours || process.env.FREE_EPG_MINIMUM_FUTURE_HOURS,
      targetCoverageDays: cliOptions.targetCoverageDays || process.env.FREE_EPG_TARGET_COVERAGE_DAYS,
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  }
}
