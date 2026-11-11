/**
 * #336 – read-only XMLTV source probe. No TMDB calls, Firebase writes, app deploys
 * or nightly integration. The feed list is a fixed allowlist, not user-supplied URLs.
 * Intended for a manually started GitHub Actions workflow.
 */
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { SaxesParser } from 'saxes'

export const FEEDS = Object.freeze([
  { id: 'epgshare01', url: 'https://epgshare01.online/epgshare01/epg_ripper_DE1.xml.gz' },
  { id: 'freeepg', url: 'https://free-epg.de/api/epg/de.xml.gz' },
  { id: 'iptv-epg-org', url: 'https://iptv-epg.org/files/epg-de.xml.gz' },
])

const MAX_DOWNLOAD_BYTES = 60 * 1024 * 1024
const MAX_XML_BYTES = 300 * 1024 * 1024
const FETCH_TIMEOUT_MS = 40_000
const DAY_MS = 24 * 60 * 60 * 1000
const BERLIN_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
})

const CHECK_CHANNELS = Object.freeze({
  'Das Erste': ['daserste', 'daserstehd', 'arddaserste', 'arddaserstehd', 'dedaserste', 'dedaserstehd'],
  ZDF: ['zdf', 'zdfhd', 'zdfde', 'dezdf', 'dezdfhd'],
  RTL: ['rtl', 'rtlhd', 'rtltelevision', 'rtlde', 'dertl', 'dertlhd'],
  ProSieben: ['prosieben', 'prosiebenhd', 'prosiebende', 'deprosieben', 'deprosiebenhd'],
  'Sat.1': ['sat1', 'sat1hd', 'sat1de', 'desat1', 'desat1hd'],
  VOX: ['vox', 'voxhd', 'voxde', 'devox', 'devoxhd'],
})

function clean(value) {
  return String(value ?? '').trim()
}

function normalizedChannel(value) {
  return clean(value).toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss').replace(/[^a-z0-9]/g, '')
}

function berlinDayKey(timestamp) {
  const parts = Object.fromEntries(BERLIN_DAY.formatToParts(new Date(timestamp))
    .filter((part) => ['day', 'month', 'year'].includes(part.type))
    .map((part) => [part.type, part.value]))
  return parts.year + '-' + parts.month + '-' + parts.day
}

function offsetDayKey(dateKey, offset) {
  return new Date(Date.parse(dateKey + 'T00:00:00Z') + offset * DAY_MS)
    .toISOString().slice(0, 10)
}

function contiguousDays(days, firstDay, maxDays = 16) {
  let count = 0
  for (let day = 0; day < maxDays; day += 1) {
    if (!days.has(offsetDayKey(firstDay, day))) break
    count += 1
  }
  return count
}

import { parseXmltvTimestamp } from '../src/sources/xmltv/xmltvTime.js'
export { parseXmltvTimestamp }


/**
 * Extract only aggregated, safe diagnostics. No XML DOM, full programme titles,
 * descriptions, private links or programme IDs are included in the report.
 */
export function analyzeXmltvDocument(xml, { now = Date.now() } = {}) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('Empty XMLTV document')
  const channels = new Map()
  let root = false
  let channel = null
  let programme = null
  let activeField = null
  let valueText = ''
  let programmes = 0
  let invalidTime = 0
  let futureProgrammes = 0
  let withDescription = 0
  let withEpisodeNum = 0
  let withSubtitle = 0
  let withoutUtcOffset = 0

  function ensureChannel(id) {
    const key = clean(id)
    if (!key) return null
    if (!channels.has(key)) {
      channels.set(key, {
        id: key, names: [], total: 0, future: 0,
        days: new Set(), latest: null, signatureHashes: [], intervals: [],
      })
    }
    return channels.get(key)
  }

  const parser = new SaxesParser({ xmlns: false })
  parser.on('doctype', () => { throw new Error('XMLTV DOCTYPE is not allowed') })
  parser.on('error', (error) => { throw error })
  parser.on('opentag', (tag) => {
    const name = tag.name
    if (name === 'tv') root = true
    if (name === 'channel' && !programme) {
      channel = ensureChannel(tag.attributes.id)
    } else if (name === 'programme') {
      programme = {
        station: clean(tag.attributes.channel),
        start: clean(tag.attributes.start),
        stop: clean(tag.attributes.stop),
        desc: false, episode: false, subtitle: false, title: '',
      }
    }
    if ((channel && name === 'display-name') ||
        (programme && ['title', 'desc', 'sub-title', 'episode-num'].includes(name))) {
      activeField = name
      valueText = ''
    }
  })
  parser.on('text', (part) => {
    if (activeField && valueText.length < 512) valueText += part.slice(0, 512)
  })
  parser.on('cdata', (part) => {
    if (activeField && valueText.length < 512) valueText += part.slice(0, 512)
  })
  parser.on('closetag', (tag) => {
    const name = typeof tag === 'string' ? tag : tag.name
    if (activeField === name) {
      const value = clean(valueText)
      if (name === 'display-name' && value && channel && channel.names.length < 12 &&
          !channel.names.includes(value)) channel.names.push(value)
      if (programme && value) {
        if (name === 'title') programme.title = value
        if (name === 'desc') programme.desc = true
        if (name === 'sub-title') programme.subtitle = true
        if (name === 'episode-num') programme.episode = true
      }
      activeField = null
      valueText = ''
    }
    if (name === 'channel') channel = null
    if (name !== 'programme' || !programme) return
    programmes += 1
    const station = ensureChannel(programme.station)
    const begin = parseXmltvTimestamp(programme.start)
    const end = parseXmltvTimestamp(programme.stop)
    if (!station || begin === null || end === null || end <= begin ||
        end - begin > 36 * 60 * 60 * 1000) {
      invalidTime += 1
      programme = null
      return
    }
    if (!/[+-]\d{4}|Z$/.test(programme.start)) withoutUtcOffset += 1
    station.total += 1
    station.intervals.push([begin, end])
    // A sorted station-specific fingerprint enables cross-feed overlap analysis
    // without publishing raw show titles or individual programme entries.
    station.signatureHashes.push(createHash('sha256')
      .update(begin + '|' + end + '|' + programme.title.toLowerCase().trim())
      .digest('hex'))
    if (programme.desc) withDescription += 1
    if (programme.episode) withEpisodeNum += 1
    if (programme.subtitle) withSubtitle += 1
    if (station.latest === null || end > station.latest) station.latest = end
    if (end > now) {
      station.future += 1
      station.days.add(berlinDayKey(Math.max(begin, now)))
      futureProgrammes += 1
    }
    programme = null
  })
  parser.write(xml).close()
  if (!root) throw new Error('Not an XMLTV <tv> root document')

  function stationFingerprint(c) {
    return createHash('sha256').update(c.signatureHashes.sort().join('\n')).digest('hex')
  }
  function coverage120h(c) {
    const endWindow = now + 120 * 3_600_000
    const intervals = c.intervals
      .filter(([start, end]) => end > now && start < endWindow)
      .map(([start, end]) => [Math.max(start, now), Math.min(end, endWindow)])
      .sort((a, b) => a[0] - b[0])
    let covered = 0
    let longestGap = 0
    let cursor = now
    for (const [start, end] of intervals) {
      if (end <= cursor) continue
      if (start > cursor) longestGap = Math.max(longestGap, start - cursor)
      const coveredStart = Math.max(start, cursor)
      if (end > coveredStart) covered += end - coveredStart
      cursor = Math.max(cursor, end)
    }
    longestGap = Math.max(longestGap, endWindow - cursor)
    return {
      coveragePercent: Math.round((covered / (120 * 3_600_000)) * 1000) / 10,
      coveredHours: Math.round(covered / 360_000) / 10,
      longestGapHours: Math.round(longestGap / 360_000) / 10,
    }
  }
  const hoursAhead = (latest) => latest && latest > now
    ? Math.round((latest - now) / 360_000) / 10 : 0
  const today = berlinDayKey(now)
  const checkChannels = {}
  for (const [name, aliases] of Object.entries(CHECK_CHANNELS)) {
    const candidates = [...channels.values()].filter((c) => (
      c.names.some((n) => aliases.includes(normalizedChannel(n))) ||
      aliases.includes(normalizedChannel(c.id))
    ))
    const days = new Set(candidates.flatMap((c) => [...c.days]))
    // Diagnostic only: show possible naming variants without treating them
    // as safe, canonical station mappings or adding them to the count.
    const possibleMatches = [...channels.values()]
      .filter((c) => !candidates.includes(c))
      .filter((c) => [...c.names, c.id].some((entry) => {
        const normalized = normalizedChannel(entry)
        return aliases.some((alias) => normalized.includes(alias))
      }))
      .slice(0, 8)
      .map((c) => ({
        id: c.id.slice(0, 100),
        names: c.names.slice(0, 3),
        futureProgrammes: c.future,
        horizonHours: hoursAhead(c.latest),
        next120h: coverage120h(c),
        fingerprint: stationFingerprint(c),
      }))
    checkChannels[name] = {
      possibleMatches,
      matchedVariants: candidates.map((c) => ({
        id: c.id.slice(0, 100),
        names: c.names.slice(0, 3),
        futureProgrammes: c.future,
        horizonHours: hoursAhead(c.latest),
        next120h: coverage120h(c),
        fingerprint: stationFingerprint(c),
      })),
      channelEntries: candidates.length,
      futureProgrammes: candidates.reduce((total, c) => total + c.future, 0),
      horizonHours: Math.max(0, ...candidates.map((c) => hoursAhead(c.latest))),
      best120hCoveragePercent: Math.max(0, ...candidates.map((c) => coverage120h(c).coveragePercent)),
      daysFromToday: contiguousDays(days, today),
      daysFromTomorrow: contiguousDays(days, offsetDayKey(today, 1)),
      lastProgrammeEnd: candidates.reduce((last, c) =>
        Math.max(last, c.latest || 0), 0) || null,
    }
    if (checkChannels[name].lastProgrammeEnd !== null) {
      checkChannels[name].lastProgrammeEnd =
        new Date(checkChannels[name].lastProgrammeEnd).toISOString()
    }
  }
  return {
    capturedAt: new Date(now).toISOString(),
    channelsTotal: channels.size,
    channelsWithProgrammes: [...channels.values()].filter((c) => c.total > 0).length,
    programmesTotal: programmes,
    futureProgrammes,
    invalidProgrammes: invalidTime,
    programmesWithDescription: withDescription,
    programmesWithEpisodeNumber: withEpisodeNum,
    programmesWithSubtitle: withSubtitle,
    programmesWithoutExplicitTimeZone: withoutUtcOffset,
    keyChannels: checkChannels,
  }
}

export async function downloadXmltvFeed(url, {
  fetcher = fetch, timeoutMs = FETCH_TIMEOUT_MS,
  maxDownloadBytes = MAX_DOWNLOAD_BYTES, maxXmlBytes = MAX_XML_BYTES,
} = {}) {
  if (!FEEDS.some((feed) => feed.url === url)) throw new Error('URL not in approved feed allowlist')
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'accept': 'application/xml, application/gzip, application/octet-stream, */*' },
  })
  if (!response.ok || !response.body) throw new Error('HTTP status ' + response.status)
  if (Number(response.headers.get('content-length')) > maxDownloadBytes) {
    await response.body.cancel()
    throw new Error('Download exceeds compressed-size limit')
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxDownloadBytes) throw new Error('Download exceeds compressed-size limit')
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = Buffer.concat(chunks, size)
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
  const xmlBytes = gzipped ? gunzipSync(bytes, { maxOutputLength: maxXmlBytes }) : bytes
  if (xmlBytes.byteLength > maxXmlBytes) throw new Error('XML exceeds expanded-size limit')
  return {
    xml: xmlBytes.toString('utf8').replace(/^\uFEFF/, ''),
    compressedBytes: size,
    xmlBytes: xmlBytes.byteLength,
    gzipped,
    lastModified: response.headers.get('last-modified') || null,
  }
}

export async function runXmltvSourceProbe({
  now = Date.now(), downloader = downloadXmltvFeed, feeds = FEEDS,
} = {}) {
  const results = []
  for (const feed of feeds) {
    const started = Date.now()
    try {
      const data = await downloader(feed.url)
      const assessment = analyzeXmltvDocument(data.xml, { now })
      results.push({
        source: feed.id, status: 'ok', url: feed.url,
        elapsedMs: Date.now() - started, compressedBytes: data.compressedBytes ?? null,
        xmlBytes: data.xmlBytes ?? null, lastModified: data.lastModified ?? null,
        ...assessment,
      })
    } catch (error) {
      // A broken community feed must not prevent the other sources being tested.
      results.push({
        source: feed.id, status: 'error', url: feed.url,
        elapsedMs: Date.now() - started, error: String(error?.message || error).slice(0, 240),
      })
    }
  }
  return { testedAt: new Date(now).toISOString(), mode: 'read-only', sources: results }
}

function markdownSummary(report) {
  const rows = ['## XMLTV G0 – read-only source comparison', '',
    '| Source | Status | Channels with EPG | Future programmes | ZDF horizon (hours) | ZDF 120h coverage |',
    '|---|---|---:|---:|---:|---:|']
  for (const item of report.sources) {
    const zdf = item.keyChannels?.ZDF
    rows.push('| ' + item.source + ' | ' + item.status +
      ' | ' + (item.channelsWithProgrammes ?? '—') +
      ' | ' + (item.futureProgrammes ?? '—') +
      ' | ' + (zdf ? zdf.horizonHours : '—') +
      ' | ' + (zdf ? zdf.best120hCoveragePercent + '%' : '—') + ' |')
  }
  rows.push('', 'No data was published to MovieHub. Feed presence does not establish rights, reliability over time or playable links.')
  return rows.join('\n') + '\n'
}

async function main() {
  const out = resolve('artifacts/xmltv-source-probe/report.json')
  const report = await runXmltvSourceProbe()
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(report, null, 2) + '\n')
  const summary = markdownSummary(report)
  process.stdout.write(summary)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
  if (!report.sources.some((source) => source.status === 'ok')) process.exitCode = 1
}

if (process.argv[1]?.endsWith('probe-xmltv-feeds.mjs')) {
  main().catch((error) => {
    console.error('XMLTV probe failed without publishing data:', error)
    process.exitCode = 1
  })
}
