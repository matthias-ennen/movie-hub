import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  WAIPU_OFFICIAL_FIRST_50_STATIONS,
  WAIPU_STATION_ORDER_SOURCE,
} from './waipu-station-order.mjs'

const outputPath = resolve('docs/WAIPU_STATION_ORDER.md')

function decodeHtml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .trim()
}

function extractAllStations(html) {
  const activeStart = html.indexOf('<div role="tabpanel" class="tab-pane fade active in "')
  if (activeStart < 0) throw new Error('Der aktive Reiter „Alle Sender“ wurde nicht gefunden.')
  const nextPanel = html.indexOf('<div role="tabpanel"', activeStart + 1)
  const panel = html.slice(activeStart, nextPanel < 0 ? html.length : nextPanel)
  return [...panel.matchAll(/<span class="po-data-sender"[\s\S]*?<\/span>/g)]
    .map(([entry]) => decodeHtml(entry.match(/\balt="([^"]+)"/)?.[1]))
    .filter(Boolean)
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|')
}

async function main() {
  const response = await fetch(WAIPU_STATION_ORDER_SOURCE, {
    headers: { 'user-agent': 'MovieHub station-order documentation generator' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Waipu-Senderseite antwortete mit HTTP ${response.status}.`)
  const stations = extractAllStations(await response.text())
  if (stations.length < 50) throw new Error(`Senderliste ist unerwartet kurz (${stations.length}).`)

  WAIPU_OFFICIAL_FIRST_50_STATIONS.forEach((station, index) => {
    if (stations[index] !== station.websiteName) {
      throw new Error(`Reihenfolge weicht an Position ${index + 1} ab: ${stations[index]} statt ${station.websiteName}.`)
    }
  })

  const lines = [
    '# Offizielle Waipu-Senderreihenfolge',
    '',
    `Quelle: ${WAIPU_STATION_ORDER_SOURCE}`,
    '',
    `Stand: ${new Date().toISOString().slice(0, 10)} · ${stations.length} Einträge im Reiter „Alle Sender“.`,
    '',
    'Die ersten 50 Einträge sind die in Movie Hub aktivierte Ausbaustufe. Der Import verwendet feste Waipu-IDs; die öffentliche Webseite wird weder von der App noch vom Nachtjob zur Laufzeit abgefragt.',
    '',
    '## In Movie Hub aktivierte Sender 1–50',
    '',
    '| Nr. | Waipu-ID | Name in Movie Hub | Name auf waipu.tv |',
    '| ---: | --- | --- | --- |',
    ...WAIPU_OFFICIAL_FIRST_50_STATIONS.map((station, index) => (
      `| ${index + 1} | \`${station.id}\` | ${escapeCell(station.name)} | ${escapeCell(station.websiteName)} |`
    )),
    '',
    '## Vollständige Reihenfolge im Reiter „Alle Sender“',
    '',
    '| Nr. | Sender |',
    '| ---: | --- |',
    ...stations.map((name, index) => `| ${index + 1} | ${escapeCell(name)} |`),
    '',
  ]
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8')
  process.stdout.write(`Dokumentiert: ${stations.length} Sender in ${outputPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
