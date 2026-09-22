import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractAllStations } from './generate-waipu-station-order-doc.mjs'
import { WaipuPublicApiClient } from './waipu-public-data.mjs'
import {
  WAIPU_OFFICIAL_FIRST_50_STATIONS,
  WAIPU_STATION_ORDER_SOURCE,
} from './waipu-station-order.mjs'

export const WAIPU_STATION_INVENTORY_VERSION = 1
const TECHNICAL_SOURCE = 'https://web-proxy.waipu.tv/station-config'
const DEFAULT_OUTPUT = 'artifacts/waipu-station-inventory'
const USER_AGENT = 'MovieHub-Waipu-Station-Inventory/1.0 (read-only; contact via repository)'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// These aliases are reviewed inventory evidence, not runtime publication data.
// The first 50 retain their already approved stable IDs; later aliases bridge
// marketing names on waipu.tv to different display names in station-config.
export const WAIPU_STATION_INVENTORY_REVIEWED_ALIASES = Object.freeze([
  ...WAIPU_OFFICIAL_FIRST_50_STATIONS.map(({ websiteName, id }) => [websiteName, id]),
  ['GEO HD', 'geo'],
  ['Alles was zahlt SD', 'alleswaszaehlt'],
  ['Comedy Central / VIVA HD', 'comedy_central'],
  ['Landlust HD', 'landlust'],
  ['EWTN.TV HD', 'ewtn'],
  ['wetter.com SD', 'wettercom'],
  ['Planet Movie HD', 'planetmovies'],
  ['More Than Sports TV (eoTV) HD', 'eotv'],
  ['auto motor und sport channel HD', 'amsc'],
  ['auto motor und sport tv HD', 'automotorsporttv'],
  ['DELUXE MUSIC TV HD', 'deluxetv'],
  ['Quello Concerts by Stingray HD', 'quello'],
  ['xite R&B HD', 'xiterb'],
  ['Goldstar SD', 'goldstar'],
  ['Deutsches Musik Fernsehen HD', 'deutschesmusikfernsehen'],
  ['Curiosity Channel powered by SPIEGEL HD', 'spiegelwissen'],
  ['FOCUS TV HD', 'focustv'],
  ['ONE (aka EINS Festival) HD', 'einsfestival'],
  ['Bigtime HD', 'bigtime'],
  ['CNN International Europe HD', 'cnn_europe'],
  ['BBC News, Europe HD', 'bbc_world_news_europe'],
  ['CNBC HD', 'cnbc_europe'],
  ['France 24 (en) HD', 'france24_en'],
  ['SR Fernsehen HD', 'sr'],
  ['HSE 24 HD', 'home_shopping_europe'],
  ['Royalworld HD', 'royalworld'],
  ['Big Brother HD', 'bigbrother'],
])

function cleanText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim()
}

export function stationMatchKey(value) {
  return cleanText(value)
    .toLocaleLowerCase('de-DE')
    .replace(/\b(?:full\s*hd|ultra\s*hd|uhd|hd|sd|4k)\b$/i, '')
    .replace(/&/g, ' und ')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '')
}

export function stationHints(value) {
  const text = cleanText(value).toLocaleLowerCase('de-DE')
  return [
    /catch[ -]?up|replay/.test(text) ? 'catch-up' : null,
    /\bvod\b|video[ -]?on[ -]?demand|waiputhek/.test(text) ? 'vod' : null,
    /regional|lokal/.test(text) ? 'regional-hint' : null,
  ].filter(Boolean)
}

function technicalStation(raw) {
  const id = String(raw?.id || '').trim()
  const displayName = cleanText(raw?.displayName)
  if (!id || !displayName) return null
  return {
    id,
    displayName,
    logoTemplateUrl: String(raw?.logoTemplateUrl || '').trim() || null,
    streamQualities: Array.isArray(raw?.streamQualities)
      ? [...new Set(raw.streamQualities.map(String).filter(Boolean))]
      : [],
    matchKey: stationMatchKey(displayName),
    hints: stationHints(displayName),
  }
}

function groupBy(values, keyOf) {
  const grouped = new Map()
  for (const value of values) {
    const key = keyOf(value)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(value)
  }
  return grouped
}

export function buildWaipuStationInventory(officialNames, technicalStations, {
  generatedAt = new Date().toISOString(),
  reviewedAliases = WAIPU_STATION_INVENTORY_REVIEWED_ALIASES,
} = {}) {
  const official = (Array.isArray(officialNames) ? officialNames : [])
    .map((name, index) => ({ position: index + 1, name: cleanText(name), matchKey: stationMatchKey(name) }))
    .filter(({ name, matchKey }) => name && matchKey)
  const technical = (Array.isArray(technicalStations) ? technicalStations : [])
    .map(technicalStation)
    .filter(Boolean)
  const officialByKey = groupBy(official, ({ matchKey }) => matchKey)
  const technicalByKey = groupBy(technical, ({ matchKey }) => matchKey)
  const technicalById = new Map(technical.map((entry) => [entry.id, entry]))
  const reviewedIdByKey = new Map(
    reviewedAliases.map(([name, id]) => [stationMatchKey(name), id]),
  )

  const officialEntries = official.map((entry) => {
    const candidates = technicalByKey.get(entry.matchKey) || []
    const duplicateOfficial = (officialByKey.get(entry.matchKey) || []).length > 1
    const reviewedId = reviewedIdByKey.get(entry.matchKey)
    const reviewedCandidate = reviewedId ? technicalById.get(reviewedId) : null
    const resolvedCandidates = reviewedCandidate ? [reviewedCandidate] : candidates
    const status = reviewedCandidate || (candidates.length === 1 && !duplicateOfficial)
      ? 'matched'
      : candidates.length === 0 ? 'unmatched' : 'ambiguous'
    return {
      ...entry,
      status,
      matchMethod: reviewedCandidate
        ? 'reviewed-alias'
        : status === 'matched' ? 'normalized-name' : null,
      candidates: resolvedCandidates.map(({ id, displayName, hints }) => ({ id, displayName, hints })),
    }
  })

  const officialByTechnicalId = groupBy(
    officialEntries.filter(({ status, candidates }) => status === 'matched' && candidates.length === 1),
    ({ candidates }) => candidates[0].id,
  )
  const matchedOfficialPositions = new Set(
    officialEntries.filter(({ status }) => status === 'matched').map(({ position }) => position),
  )

  const technicalEntries = technical.map((entry) => {
    const assignedMatches = officialByTechnicalId.get(entry.id) || []
    const unresolvedNameMatches = (officialByKey.get(entry.matchKey) || [])
      .filter(({ position }) => !matchedOfficialPositions.has(position))
    const matches = assignedMatches.length ? assignedMatches : unresolvedNameMatches
    return {
      ...entry,
      status: assignedMatches.length === 1
        ? 'matched'
        : matches.length === 0 ? 'technical-only' : 'ambiguous',
      officialPositions: matches.map(({ position }) => position),
    }
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, 'de'))

  const counts = {
    official: officialEntries.length,
    technical: technicalEntries.length,
    matchedOfficial: officialEntries.filter(({ status }) => status === 'matched').length,
    reviewedAliasMatches: officialEntries.filter(({ matchMethod }) => matchMethod === 'reviewed-alias').length,
    ambiguousOfficial: officialEntries.filter(({ status }) => status === 'ambiguous').length,
    unmatchedOfficial: officialEntries.filter(({ status }) => status === 'unmatched').length,
    technicalOnly: technicalEntries.filter(({ status }) => status === 'technical-only').length,
    catchUpHints: technicalEntries.filter(({ hints }) => hints.includes('catch-up')).length,
    vodHints: technicalEntries.filter(({ hints }) => hints.includes('vod')).length,
  }

  return {
    schemaVersion: WAIPU_STATION_INVENTORY_VERSION,
    kind: 'waipu-station-inventory',
    generatedAt,
    sources: { official: WAIPU_STATION_ORDER_SOURCE, technical: TECHNICAL_SOURCE },
    matching: 'normalized-name-v1',
    counts,
    official: officialEntries,
    technical: technicalEntries,
  }
}

function markdownTable(entries, columns) {
  if (!entries.length) return '_Keine Einträge._'
  return [
    `| ${columns.map(({ title }) => title).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...entries.map((entry) => `| ${columns.map(({ value }) => String(value(entry) ?? '').replaceAll('|', '\\|')).join(' | ')} |`),
  ].join('\n')
}

export function renderWaipuStationInventoryMarkdown(inventory) {
  const unresolved = inventory.official.filter(({ status }) => status !== 'matched')
  const technicalOnly = inventory.technical.filter(({ status }) => status === 'technical-only')
  const hinted = inventory.technical.filter(({ hints }) => hints.length)
  return [
    '# Waipu-Senderinventar',
    '',
    `Stand: ${inventory.generatedAt}`,
    '',
    'Dieser Bericht ist rein lesend. Er veröffentlicht keine Sender und ändert die produktive 50er-Stufe nicht.',
    '',
    '## Zusammenfassung',
    '',
    '| Kennzahl | Anzahl |',
    '| --- | ---: |',
    `| Öffentlich gelistet | ${inventory.counts.official} |`,
    `| Technischer Senderstamm | ${inventory.counts.technical} |`,
    `| Eindeutig zugeordnet | ${inventory.counts.matchedOfficial} |`,
    `| Davon über geprüfte Alias-Zuordnung | ${inventory.counts.reviewedAliasMatches} |`,
    `| Mehrdeutig | ${inventory.counts.ambiguousOfficial} |`,
    `| Öffentlich ohne technische Zuordnung | ${inventory.counts.unmatchedOfficial} |`,
    `| Nur technisch vorhanden | ${inventory.counts.technicalOnly} |`,
    `| Catch-up-Hinweise | ${inventory.counts.catchUpHints} |`,
    `| VOD-Hinweise | ${inventory.counts.vodHints} |`,
    '',
    '## Offene öffentliche Zuordnungen',
    '',
    markdownTable(unresolved, [
      { title: 'Nr.', value: ({ position }) => position },
      { title: 'Öffentlicher Name', value: ({ name }) => name },
      { title: 'Status', value: ({ status }) => status },
      { title: 'Technische Kandidaten', value: ({ candidates }) => candidates.map(({ id, displayName }) => `${displayName} (${id})`).join(', ') },
    ]),
    '',
    '## Nur technisch vorhandene Einträge',
    '',
    markdownTable(technicalOnly, [
      { title: 'Waipu-ID', value: ({ id }) => `\`${id}\`` },
      { title: 'Name', value: ({ displayName }) => displayName },
      { title: 'Hinweise', value: ({ hints }) => hints.join(', ') },
    ]),
    '',
    '## Technische Einträge mit Klassifikationshinweis',
    '',
    markdownTable(hinted, [
      { title: 'Waipu-ID', value: ({ id }) => `\`${id}\`` },
      { title: 'Name', value: ({ displayName }) => displayName },
      { title: 'Status', value: ({ status }) => status },
      { title: 'Hinweise', value: ({ hints }) => hints.join(', ') },
    ]),
    '',
    'Namenshinweise sind Prüfmarkierungen, keine automatische Freigabe oder Ausschlussentscheidung.',
    '',
  ].join('\n')
}

async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}

export async function runWaipuStationInventory({
  fetchImpl = globalThis.fetch,
  outputDirectory = resolve(root, process.env.WAIPU_STATION_INVENTORY_OUTPUT || DEFAULT_OUTPUT),
  generatedAt = new Date().toISOString(),
  sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
} = {}) {
  const officialResponse = await fetchImpl(WAIPU_STATION_ORDER_SOURCE, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  })
  if (!officialResponse.ok) throw new Error(`Waipu-Senderseite antwortete mit HTTP ${officialResponse.status}.`)
  const officialNames = extractAllStations(await officialResponse.text())
  await sleep(1_000)
  const technical = await new WaipuPublicApiClient({ fetchImpl, userAgent: USER_AGENT }).getStations()
  const inventory = buildWaipuStationInventory(officialNames, technical.value, { generatedAt })
  await Promise.all([
    writeAtomic(resolve(outputDirectory, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`),
    writeAtomic(resolve(outputDirectory, 'report.md'), renderWaipuStationInventoryMarkdown(inventory)),
  ])
  return inventory
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runWaipuStationInventory()
    .then((inventory) => {
      process.stdout.write(`Waipu-Senderinventar: ${inventory.counts.matchedOfficial}/${inventory.counts.official} öffentlich gelistete Sender eindeutig zugeordnet.\n`)
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    })
}
