// Standalone, read-only G1 source-quality pilot. Never publish MovieHub data or secrets.
// Enumerate actual publisher playlists first, then take a bounded, reproducible sample.
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getSecret, youtubeGet, SOURCES, isVideoId, safeTitle, getRegionSignal } from './youtube-api-smoke.mjs'

export const MAX_VIDEOS = 200
export const MAX_PAGES_PER_PLAYLIST = 70
export const MAX_API_CALLS = 90
const MIN_SHORT_SECONDS = 20 * 60
const MIN_CANDIDATE_SECONDS = 45 * 60

export function durationSeconds(raw) {
  const match = String(raw || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!match || !match.slice(1).some((v) => v !== undefined)) return null
  const [days, hours, minutes, seconds] = match.slice(1).map((v) => Number(v || 0))
  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

export function stratifiedSelection(ids, limit, newCount = 20) {
  const source = [...new Set(ids.filter(isVideoId))]
  const desired = Math.min(Math.max(0, limit), source.length)
  if (desired === 0) return []
  const output = []
  const seen = new Set()
  function add(id) {
    if (!id || seen.has(id) || output.length >= desired) return
    seen.add(id)
    output.push(id)
  }
  // Reserve a small newest slice, then distribute the rest over the entire upload history.
  source.slice(0, Math.min(newCount, desired)).forEach(add)
  const remainder = desired - output.length
  for (let i = 0; i < remainder; i++) {
    const index = Math.min(source.length - 1, Math.floor(((i + 0.5) * source.length) / remainder))
    add(source[index])
  }
  // Fill overlaps without introducing randomness or silently shrinking the sample.
  for (const id of source) add(id)
  return output
}

export function classifyVideo(video, expectedChannel) {
  if (!video) return 'missing-detail'
  if (video.snippet?.channelId !== expectedChannel) return 'foreign-channel'
  if (video.status?.privacyStatus && video.status.privacyStatus !== 'public') return 'non-public'
  const seconds = durationSeconds(video.contentDetails?.duration)
  if (seconds === null) return 'unknown-duration'
  if (seconds < MIN_SHORT_SECONDS) return 'short'
  if (seconds < MIN_CANDIDATE_SECONDS) return 'medium-uncertain'
  const restriction = video.contentDetails?.regionRestriction
  if (Array.isArray(restriction?.blocked) && restriction.blocked.includes('DE')) return 'DE-blocked'
  if (Array.isArray(restriction?.allowed) && !restriction.allowed.includes('DE')) return 'DE-not-allowed'
  return 'long-video-candidate'
}

function numericViews(raw) {
  if (raw === undefined || raw === null || !/^\d+$/.test(String(raw))) return null
  return BigInt(String(raw))
}

function displayViews(value) {
  return value === null ? 'nicht gemeldet' : new Intl.NumberFormat('de-DE').format(value)
}

export function sortedCandidates(videos, expectedChannel) {
  return videos
    .filter((video) => classifyVideo(video, expectedChannel) === 'long-video-candidate')
    .sort((a, b) => {
      const av = numericViews(a.statistics?.viewCount)
      const bv = numericViews(b.statistics?.viewCount)
      if (av === null && bv !== null) return 1
      if (bv === null && av !== null) return -1
      if (av !== null && bv !== null && av !== bv) return bv > av ? 1 : -1
      return String(a.id).localeCompare(String(b.id))
    })
}

export async function readPlaylist(api, playlistId) {
  const records = []
  const seenTokens = new Set()
  let nextPage = null
  let pages = 0
  do {
    if (pages >= MAX_PAGES_PER_PLAYLIST) throw new Error('Playlist-Seitengrenze erreicht; kein Teilinventar als vollständig ausgeben.')
    const params = { part: 'contentDetails', playlistId, maxResults: 50 }
    if (nextPage) params.pageToken = nextPage
    const data = await api('playlistItems', params)
    pages++
    if (data.items.length === 0 && data.nextPageToken) throw new Error('Leere Playlist-Seite mit Fortsetzungstoken.')
    for (const item of data.items) {
      const id = item.contentDetails?.videoId
      if (isVideoId(id)) records.push(id)
    }
    nextPage = data.nextPageToken || null
    if (nextPage) {
      if (seenTokens.has(nextPage)) throw new Error('YouTube-Pagination wiederholt sich; Inventar abgebrochen.')
      seenTokens.add(nextPage)
    }
  } while (nextPage)
  return { ids: [...new Set(records)], pages, listedItems: records.length, duplicates: records.length - new Set(records).size }
}

export async function runInventoryPilot(api, now = new Date()) {
  let calls = 0
  const counts = {}
  async function checked(endpoint, params) {
    if (calls >= MAX_API_CALLS) throw new Error('YouTube G1 API-Request-Budget erschöpft; kein partielles Resultat veröffentlichen.')
    calls++
    counts[endpoint] = (counts[endpoint] || 0) + 1
    return api(endpoint, params)
  }
  const channelData = await checked('channels', { part: 'snippet,contentDetails',
    id: SOURCES.map((source) => source.channelId).join(',') })
  const channelMap = new Map(channelData.items.map((x) => [x.id, x]))
  const records = []
  for (const source of SOURCES) {
    const channel = channelMap.get(source.channelId)
    if (!channel) throw new Error('Publisherkanal fehlt: ' + source.name)
    const playlistId = source.playlistId || channel.contentDetails?.relatedPlaylists?.uploads
    if (!playlistId) throw new Error('Upload-Playlist fehlt: ' + source.name)
    const info = await checked('playlists', { part: 'snippet,contentDetails', id: playlistId })
    const match = info.items.find((x) => x.id === playlistId)
    if (!match) throw new Error('Publisher-Playlist nicht öffentlich lesbar: ' + source.name)
    // Complete the full playlist ID inventory before selecting sample positions.
    const inventoried = await readPlaylist(checked, playlistId)
    records.push({ source, playlistId, reported: match.contentDetails?.itemCount,
      ...inventoried })
  }
  const first = records[0]
  const second = records[1]
  const firstChosen = stratifiedSelection(first.ids, Math.min(40, first.ids.length), 0)
  const secondChosen = stratifiedSelection(second.ids, Math.min(MAX_VIDEOS - firstChosen.length, second.ids.length))
  const selected = [...new Set([...firstChosen, ...secondChosen])]
  const detailMap = new Map()
  for (let p = 0; p < selected.length; p += 50) {
    const data = await checked('videos', { part: 'snippet,contentDetails,status,statistics',
      id: selected.slice(p, p + 50).join(',') })
    for (const item of data.items) {
      if (isVideoId(item.id)) detailMap.set(item.id, item)
    }
  }
  const lines = [
    '# YouTube G1 – schreibgeschützter, zeitlich verteilter Stichprobenpilot',
    '',
    '- Ausführung: ' + now.toISOString(),
    '- 100–200 eindeutige Video-IDs aus bekannten Publisher-Playlists; **kein TMDB-Matching und keine Rechtefreigabe**.',
    '- Sortierung nach YouTube-Aufrufen gilt **nur innerhalb dieser Stichprobe** und ist keine globale Top-Liste.',
    '',
    '## Inventar und Auswahl',
    '',
    '| Publisher / Playlist | Playlist-Einträge laut API | eindeutige inventarisierte IDs | Seiten | gewählte Stichprobe |',
    '| --- | ---: | ---: | ---: | ---: |',
  ]
  for (const rec of records) {
    const chosen = rec === first ? firstChosen : secondChosen
    lines.push('| ' + rec.source.name + ' | ' + (rec.reported ?? 'unbekannt') + ' | ' +
      rec.ids.length + ' | ' + rec.pages + ' | ' + chosen.length + ' |')
  }
  lines.push('', '- Eindeutige Stichproben-IDs nach Quellzusammenführung: **' + selected.length + '**',
    '- Erfolgreich aufgelöste Video-Metadaten: **' + detailMap.size + '**',
    '- Video-ID-Überschneidungen zwischen den beiden ausgewählten Stichproben: **' +
      (firstChosen.length + secondChosen.length - selected.length) + '**', '')
  for (const rec of records) {
    const ids = rec === first ? firstChosen : secondChosen
    const groups = {}
    let allowed = 0
    let blocked = 0
    let unknown = 0
    const videos = ids.map((id) => detailMap.get(id))
    for (const video of videos) {
      const status = classifyVideo(video, rec.source.channelId)
      groups[status] = (groups[status] || 0) + 1
      const region = video?.contentDetails?.regionRestriction
      if (region?.blocked?.includes('DE') || (Array.isArray(region?.allowed) && !region.allowed.includes('DE'))) blocked++
      else if (region?.allowed?.includes('DE')) allowed++
      else unknown++
    }
    const leaders = sortedCandidates(videos, rec.source.channelId).slice(0, 12)
    lines.push('## ' + rec.source.name, '',
      '- Laufzeit-/Quellenfilter: ' + Object.entries(groups).map(([k, v]) => k + '=' + v).join(', '),
      '- DE-Metadatensignale: explizit erlaubt **' + allowed + '**; explizit eingeschränkt **' + blocked +
        '**; ohne eindeutiges Signal **' + unknown + '**.',
      '- Beliebtheitssortierung: nur **' + leaders.length + '** erste Langvideo-Kandidaten der Stichprobe, nicht global.', '',
      '| YouTube-Video | Minuten | Aufrufe | DE-Region |',
      '| --- | ---: | ---: | --- |')
    for (const item of leaders) {
      const seconds = durationSeconds(item.contentDetails?.duration)
      const id = item.id
      lines.push('| [' + safeTitle(item.snippet?.title) + '](https://www.youtube.com/watch?v=' + id + ') | ' +
        (seconds === null ? '?' : Math.floor(seconds / 60)) + ' | ' +
        displayViews(numericViews(item.statistics?.viewCount)) + ' | ' +
        getRegionSignal(item.contentDetails?.regionRestriction) + ' |')
    }
    lines.push('')
  }
  lines.push('## Betrieb und Grenzen', '',
    '- Erfolgreiche API-Aufrufe: **' + calls + '** (' +
      Object.entries(counts).map(([k,v]) => k + '=' + v).join(', ') + ').',
    '- Inventarisierung der beiden Quellen war seitenvollständig innerhalb des harten 70-Seiten-/Quellenlimits.',
    '- 20-Minuten-Untergrenze: Shorts/Clips; ab 45 Minuten lediglich **Langvideo-Kandidat**, niemals automatische Vollfilmfreigabe.',
    '- Ranking berücksichtigt nur verfügbare `statistics.viewCount`-Werte der ausgewählten Stichprobe.',
    '- YouTube-Uploads und Upload-Datum sind keine TMDB-Filme oder Filmerscheinungsjahre.',
    '- TMDB-Matching / Rechte / FREE-/ADS-Angebotsklasse / DE-App-Wiedergabe **nicht durchgeführt**.',
    '- Kein Import, keine MovieHub-Badges, keine Katalog- oder Cloud-Schreibzugriffe.',
    '')
  return { report: lines.join('\n'), counts, sampled: selected.length, resolved: detailMap.size, inventory: records.map((rec) => ({
    publisher: rec.source.name, ids: rec.ids.length, pages: rec.pages,
  })) }
}

async function main() {
  const secret = getSecret()
  const result = await runInventoryPilot((endpoint, params) => youtubeGet(endpoint, params, secret))
  const file = resolve('artifacts/youtube-api-g1/inventory-report.md')
  await mkdir(resolve('artifacts/youtube-api-g1'), { recursive: true })
  await writeFile(file, result.report + '\n', 'utf8')
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, result.report + '\n')
  process.stdout.write(result.report + '\n')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Avoid printing raw third-party payloads, query tokens or the secret.
    console.error('G1-Inventarpilot konnte nicht vollständig abgeschlossen werden. Job/Quoten und Berechtigungen prüfen.')
    process.exitCode = 1
  })
}
