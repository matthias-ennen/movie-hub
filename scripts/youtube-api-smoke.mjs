// Isolated, read-only G1 probe. Never publish credentials, video payloads or catalog changes.
import { spawnSync } from 'node:child_process'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const SOURCES = Object.freeze([
  { name: 'CiNENET Deutschland', channelId: 'UClyuw-OWE6taGFv0reZI6eQ', playlistId: 'PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD' },
  { name: 'Netzkino', channelId: 'UCGkHFrwE8KEuOHPVsIOskAg', playlistId: null },
])
export const PAGE_LIMIT = 12

export function getRegionSignal(restriction) {
  if (Array.isArray(restriction?.blocked) && restriction.blocked.includes('DE')) return 'DE gesperrt (Metadaten)'
  if (Array.isArray(restriction?.allowed)) {
    return restriction.allowed.includes('DE') ? 'DE in Freigabeliste' : 'DE nicht in Freigabeliste'
  }
  return 'kein DE-Signal; Wiedergabe ungeprüft'
}

export function safeTitle(value) {
  return String(value ?? '').replace(/[\r\n|<>\\*\[\]_`]/g, ' ').replace(/\s+/g, ' ').slice(0, 85)
}

export function isVideoId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(value)
}

export function getSecret() {
  // The runner authenticates via GitHub OIDC; the secret never enters Actions YAML, logs or files.
  const result = spawnSync('gcloud', [
    'secrets', 'versions', 'access', 'latest',
    '--secret=YOUTUBE_API_KEY', '--project=movie-hub-62459',
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 65536, windowsHide: true })
  if (result.error || result.status !== 0) {
    throw new Error('Secret Manager: Zugriff auf YOUTUBE_API_KEY fehlgeschlagen. Einzel-Secret-IAM und aktive Version prüfen.')
  }
  const secret = result.stdout.trim()
  if (!secret || secret.length < 15) throw new Error('Secret Manager: Secret leer oder ungültig.')
  return secret
}

export async function youtubeGet(endpoint, params, key, fetchImpl = fetch) {
  const url = new URL('https://www.googleapis.com/youtube/v3/' + endpoint)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value))
  // Do not put the API key into a query string (URLs may be logged by infrastructure).
  let response
  try {
    response = await fetchImpl(url, {
      headers: { 'x-goog-api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new Error('YouTube API: Netzwerk- oder Zeitüberschreitungsfehler bei ' + endpoint)
  }
  if (!response.ok) {
    // Intentionally do not log raw error body, request object, URL or key.
    throw new Error('YouTube API: HTTP ' + response.status + ' bei ' + endpoint + '. API-Aktivierung, API-Key-Restriktion und Quota prüfen.')
  }
  const data = await response.json()
  if (!data || !Array.isArray(data.items)) throw new Error('YouTube API: Antwort ohne items bei ' + endpoint)
  return data
}

export async function runSmoke(api) {
  const channelData = await api('channels', {
    part: 'snippet,contentDetails', id: SOURCES.map((source) => source.channelId).join(','),
  })
  const channels = new Map(channelData.items.map((item) => [item.id, item]))
  const lines = [
    '# YouTube Data API – read-only G1 Smoke-Test',
    '',
    '- Ausführung: ' + new Date().toISOString(),
    '- Modus: manuell, nichtproduktiv; max. ' + PAGE_LIMIT + ' Playlist-Einträge je Publisher',
    '- Keine Film-, Rechts- oder DE-Abspielbestätigung aus API-Metadaten ableiten.',
    '',
  ]
  const collected = []
  const stats = []
  for (const source of SOURCES) {
    const channel = channels.get(source.channelId)
    if (!channel) throw new Error('YouTube-Kanal nicht per API gefunden: ' + source.name)
    const playlistId = source.playlistId || channel.contentDetails?.relatedPlaylists?.uploads
    if (!playlistId) throw new Error('Keine Upload-Playlist im API-Kanal: ' + source.name)
    const info = await api('playlists', { part: 'snippet,contentDetails', id: playlistId })
    const playlist = info.items.find((item) => item.id === playlistId)
    if (!playlist) throw new Error('Playlist nicht öffentlich abrufbar: ' + source.name)
    const items = await api('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: PAGE_LIMIT })
    const ids = [...new Set(items.items
      .map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
      .filter(isVideoId))]
    stats.push({ name: source.name, listed: items.items.length, unique: ids.length,
      total: playlist.contentDetails?.itemCount ?? 'unbekannt', ids })
    collected.push(...ids)
  }
  const uniqueIds = [...new Set(collected)]
  const details = uniqueIds.length
    ? await api('videos', { part: 'snippet,contentDetails,status', id: uniqueIds.join(',') })
    : { items: [] }
  const videoMap = new Map(details.items.map((item) => [item.id, item]))
  for (const row of stats) {
    lines.push('## ' + row.name, '')
    lines.push('- Aktuelle Playlist-Item-Anzahl laut API: **' + row.total + '**')
    lines.push('- In dieser Probe gelesene Einträge: **' + row.listed + '**')
    lines.push('- Eindeutige gültige Video-IDs: **' + row.unique + '**')
    lines.push('- Mit videos.list aufgelöste Videos: **' + row.ids.filter((id) => videoMap.has(id)).length + '**')
    lines.push('')
    lines.push('| Videotitel (Probe) | Dauer | Deutschland-Signal |')
    lines.push('| --- | --- | --- |')
    for (const id of row.ids) {
      const v = videoMap.get(id)
      if (!v) {
        lines.push('| [Video nicht im Detailabruf] | – | ungeprüft |')
        continue
      }
      lines.push('| ' + safeTitle(v.snippet?.title) + ' | ' +
        String(v.contentDetails?.duration || 'unbekannt').slice(0,30) + ' | ' +
        getRegionSignal(v.contentDetails?.regionRestriction) + ' |')
    }
    lines.push('')
  }
  lines.push('## Einordnung', '',
    '- Videometadaten abgerufen: **' + videoMap.size + ' / ' + uniqueIds.length + '** eindeutige IDs.',
    '- API-Aufrufe bei erfolgreichem vollständigem Durchlauf: **6** (1 channels, 2 playlists, 2 playlistItems, 1 videos).',
    '- Anteil rechtlich bestätigter Vollfilme: **nicht bestimmt**.',
    '- TMDB-Matching: **nicht ausgeführt**; kein produktiver Adapter/Import.',
    '- Tatsächliche Deutschland-Wiedergabe/Fire TV: **nicht getestet**.',
    '- RegionRestriction ist ein technischer Indikator, kein Playback- oder Lizenzbeweis.',
    '- Geheimnisse: **niemals ausgegeben**.',
    '')
  return lines.join('\n')
}

async function main() {
  const secret = getSecret()
  const report = await runSmoke((endpoint, params) => youtubeGet(endpoint, params, secret))
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) await appendFile(summaryPath, report + '\n', 'utf8')
  const reportPath = resolve('artifacts/youtube-api-g1/report.md')
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, report + '\n', 'utf8')
  // The report contains only deliberately selected public metadata, never the API key or raw API responses.
  process.stdout.write(report + '\n')
  process.stdout.write('Read-only YouTube API smoke abgeschlossen. Bericht in Job-Zusammenfassung und Artefakt.\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Read-only YouTube API smoke fehlgeschlagen: ' + error.message)
    process.exitCode = 1
  })
}
