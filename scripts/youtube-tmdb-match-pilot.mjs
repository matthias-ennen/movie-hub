// Isolated G1 diagnostic: reuse canonical Waipu/TMDB decision logic, never publish provider offers.
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WaipuTmdbSearchClient, matchWaipuProgram, WAIPU_MATCHER_VERSION } from './waipu-tmdb-matcher.mjs'
import { runInventoryPilot, classifyVideo, durationSeconds } from './youtube-api-inventory-pilot.mjs'
import { SOURCES, getSecret, youtubeGet, safeTitle } from './youtube-api-smoke.mjs'

export const MATCHING_PILOT_VERSION = 1
export const TMDB_REQUEST_CAP = 420
export const MAX_RUNTIME_DELTA_MINUTES = 15
const MAX_LOGGED_EXAMPLES = 20

// Capture only a leading explicit film year, not YouTube's upload year or descriptive dates.
export function extractYouTubeMovieTitle(videoTitle) {
  const raw = String(videoTitle || '').replace(/\s+/g, ' ').trim()
  const yearMatch = raw.slice(0, 110).match(/\(((?:19|20)\d{2})\)/)
  const productionYear = yearMatch ? Number(yearMatch[1]) : null
  let title = yearMatch ? raw.slice(0, raw.indexOf(yearMatch[0])) : raw
  title = title.split(/\s*\(/)[0]
  // Remove only clearly delimited promotional suffixes, never infer the film from an actor name.
  title = title.split(/\s+[-–|]\s+(?:ganzer\s+film|full\s+movie|kompletter\s+film|deutsch\s+ganzer\s+film)\b/i)[0]
  title = title.replace(/\s*[\[\]()]+$/g, '').trim().slice(0, 120)
  return { title, productionYear }
}

export function runtimeAgreement(videoSeconds, tmdbMinutes) {
  if (!Number.isFinite(videoSeconds) || !Number.isFinite(tmdbMinutes) || tmdbMinutes <= 0) {
    return { checked: false, delta: null, withinTolerance: false }
  }
  const delta = Math.round((Math.abs(videoSeconds / 60 - tmdbMinutes)) * 10) / 10
  return { checked: true, delta, withinTolerance: delta <= MAX_RUNTIME_DELTA_MINUTES }
}

export async function analyzeYouTubeMovie(video, expectedChannel, { searchTmdb, loadDetails, now = Date.now } = {}) {
  const kind = classifyVideo(video, expectedChannel)
  if (kind !== 'long-video-candidate') return { status: 'excluded', reason: kind, title: null, videoId: video?.id }
  const parsed = extractYouTubeMovieTitle(video?.snippet?.title)
  if (parsed.title.length < 3) {
    return { status: 'review', reason: 'no-searchable-title', title: parsed.title, videoId: video?.id }
  }
  // The shared search client treats a supplied year as an exact search filter.
  // Omit the field entirely when YouTube supplies no explicit film year.
  const input = { type: 'movie', title: parsed.title,
    ...(parsed.productionYear ? { productionYear: parsed.productionYear } : {}),
  }
  const decision = await matchWaipuProgram(input, { searchTmdb, now })
  const candidate = decision.match || decision.diagnostic?.best || null
  if (!candidate || !Number.isInteger(Number(candidate.tmdbId))) {
    return { status: 'unmatched', reason: decision.reason || 'no-candidate',
      title: parsed.title, videoId: video.id, productionYear: parsed.productionYear }
  }
  // A live remote search result is evidence for a potential identity, not a published movie reference.
  const result = { status: 'review', reason: decision.reason || 'insufficient-evidence',
    title: parsed.title, videoId: video.id, productionYear: parsed.productionYear,
    tmdbId: Number(candidate.tmdbId), tmdbTitle: String(candidate.title || ''),
    tmdbYear: candidate.year ?? null, candidateScore: candidate.score ?? null }
  if (decision.status !== 'matched' || !parsed.productionYear || parsed.productionYear !== candidate.year) {
    result.reason = !parsed.productionYear ? 'no-independent-year' : (decision.reason || 'year-conflict')
    return result
  }
  if (typeof loadDetails !== 'function') {
    result.reason = 'missing-runtime-evidence'
    return result
  }
  const metadata = await loadDetails({ type: 'movie', tmdbId: result.tmdbId })
  const agreement = runtimeAgreement(durationSeconds(video?.contentDetails?.duration), Number(metadata?.runtimeMinutes))
  result.runtimeDeltaMinutes = agreement.delta
  if (!agreement.checked) {
    result.reason = 'missing-runtime-evidence'
    return result
  }
  if (!agreement.withinTolerance) {
    result.reason = 'runtime-conflict'
    return result
  }
  // Conservatively keep even these in research-only status; legal and playback verification remain open.
  return { ...result, status: 'provisional-identity', reason: null }
}

function markdownSafe(value) {
  return safeTitle(value).replace(/\n/g, ' ').slice(0, 85)
}

export async function analyzeSample({ byPublisher, detailMap }, {
  searchTmdb, loadDetails, now = Date.now, maxCandidates = 200,
} = {}) {
  if (typeof searchTmdb !== 'function') throw new TypeError('TMDB search callback is required')
  const grouped = []
  const decisions = []
  for (const group of byPublisher) {
    const counter = {}
    let skipped = 0
    for (const id of group.ids) {
      const video = detailMap.get(id)
      const kind = classifyVideo(video, group.source.channelId)
      if (kind !== 'long-video-candidate') {
        counter[kind] = (counter[kind] || 0) + 1
        skipped++
        continue
      }
      if (decisions.length >= maxCandidates) throw new Error('TMDB-Matching-Stichprobenbudget erschöpft')
      const result = await analyzeYouTubeMovie(video, group.source.channelId, { searchTmdb, loadDetails, now })
      result.publisher = group.source.name
      decisions.push(result)
      counter[result.status] = (counter[result.status] || 0) + 1
      if (result.reason) counter['reason:' + result.reason] = (counter['reason:' + result.reason] || 0) + 1
    }
    grouped.push({ name: group.source.name, counts: counter, skipped, selected: group.ids.length })
  }
  const byTmdb = new Map()
  for (const value of decisions.filter(x=>x.tmdbId)) {
    const key = 'movie:' + value.tmdbId
    if (!byTmdb.has(key)) byTmdb.set(key, [])
    byTmdb.get(key).push(value)
  }
  const possibleDuplicateGroups = [...byTmdb.entries()]
    .filter(([,values])=>values.length>1)
    .map(([key, values])=>({ key, videoCount: values.length }))
  const counts = {}
  for(const x of decisions) counts[x.status] = (counts[x.status]||0)+1
  const rows = [
    '# YouTube G1 – konservative TMDB-Matchinganalyse (nichtproduktiv)', '',
    '- Prüft ausschließlich die bei YouTube als Langvideos vorgefilterten Quellen.',
    '- Vorhandener **Waipu-TMDB-Matcher v' + WAIPU_MATCHER_VERSION +
       '** wiederverwendet; Jahr und Laufzeit als zusätzliche YouTube-Sicherheitsgates.',
    '- **provisional-identity** ist eine *forschungsinterne Hypothese*, kein Produktiv-Match oder Rechtesignal.',
    '- Ohne eindeutiges Titel-/Jahrsignal erfolgt keine automatische Freigabe.',
    '- DE-Playback, kostenloser Zugang und Lizenzrechte sind ungeprüft.',
    '',
    '## Verarbeitete Stichprobe', '',
    '| Publisher | Ausgewählt | Vorherige Ausschlüsse | Provisorische Identität | Manuelle Prüfung | Ohne TMDB-Treffer |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const x of grouped) rows.push('| ' + x.name + ' | ' + x.selected + ' | ' + x.skipped +
    ' | ' + (x.counts['provisional-identity']||0) + ' | ' + (x.counts.review||0) +
    ' | ' + (x.counts.unmatched||0) + ' |')
  rows.push('', '## Ergebniskategorien', '')
  for (const [k,v] of Object.entries(counts).sort()) rows.push('- ' + k + ': **' + v + '**')
  rows.push('- Potenzielle Mehrfach-Videos für dieselbe **TMDB-ID** innerhalb dieser Probe: **' +
    possibleDuplicateGroups.length + ' Identitätsgruppen**.',
    '- Prüfung gegen den **laufenden produktiven MovieHub-Katalog:** **nicht durchgeführt** ' +
    '(versionierter GitHub-Fallback ist kein belastbarer Abgleich zum veröffentlichten Live-Katalog).',
    '- Verbindlich bestätigte filmische/regionale/urheberrechtliche Verfügbarkeit: **0** (nicht getestet).',
    '',
    '## Provisorisch starke Identitäts-Hypothesen (max. ' + MAX_LOGGED_EXAMPLES + ')', '',
    '| YouTube-Titel | TMDB-Titel | TMDB-ID | Filmjahr | Laufzeitdifferenz |',
    '| --- | --- | ---: | ---: | ---: |',
  )
  for(const x of decisions.filter(x=>x.status==='provisional-identity').slice(0,MAX_LOGGED_EXAMPLES)) {
    rows.push('| ' + markdownSafe(x.title) + ' | ' + markdownSafe(x.tmdbTitle) +
      ' | ' + x.tmdbId + ' | ' + x.productionYear + ' | ' + x.runtimeDeltaMinutes + ' min |')
  }
  if(!decisions.some(x=>x.status==='provisional-identity')) rows.push('| *(keine ausreichend belegten automatischen Kandidaten)* | – | – | – | – |')
  rows.push('', '## Häufigste Prüfgründe', '')
  const reasons = {}
  for(const x of decisions) if(x.reason) reasons[x.reason]=(reasons[x.reason]||0)+1
  for(const [k,v] of Object.entries(reasons).sort((a,b)=>b[1]-a[1])) rows.push('- '+k+': **'+v+'**')
  rows.push('', '## Mögliche Video-Dubletten derselben TMDB-ID (nur Probedaten)', '')
  for(const x of possibleDuplicateGroups.slice(0,10)) rows.push('- '+x.key+': '+x.videoCount+' YouTube-Videos')
  if(!possibleDuplicateGroups.length) rows.push('- Keine in den TMDB-Kandidaten erkannt (ohne Garantie).')
  rows.push('', '- Der Bericht enthält nur öffentliche Filmmetadaten und keine API-Schlüssel.',
    '- Keine MovieHub-Katalog-/Provider-/Firestore-/Firebase-Schreiboperation.',
    '- Weiterer Gate-Schritt: manuelle Zuordnung und DE-/Fire-TV-Playback-Versuche, vor Produktivfreigabe.', '')
  return { report: rows.join('\n'), grouped, counts, decisions, possibleDuplicateGroups }
}

async function main() {
  const token = String(process.env.TMDB_API_READ_TOKEN || '').trim()
  if (!token) throw new Error('TMDB_READ_TOKEN_NOT_CONFIGURED')
  const tmdb = new WaipuTmdbSearchClient({
    token, language:'de-DE', maxRequests:TMDB_REQUEST_CAP, paceMs:250, maxRetries:2,
  })
  const youtubeKey = getSecret()
  let report = null
  await runInventoryPilot((endpoint, params) => youtubeGet(endpoint, params, youtubeKey), new Date(), {
    onVideoSample: async (data) => {
      const findings = await analyzeSample(data, {
        searchTmdb: (input) => tmdb.search(input),
        loadDetails: (input) => tmdb.detail(input),
      })
      report = findings.report + '\n- TMDB-API-Anfragen (inklusive Retry): **' + tmdb.requestsStarted + ' / ' + TMDB_REQUEST_CAP + '**.\n'
    },
  })
  if(!report) throw new Error('TMDB_ANALYSIS_NO_REPORT')
  const path = resolve('artifacts/youtube-api-g1/tmdb-match-report.md')
  await mkdir(resolve('artifacts/youtube-api-g1'), { recursive:true })
  await writeFile(path, report + '\n', 'utf8')
  if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,report + '\n','utf8')
  process.stdout.write(report + '\n')
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(() => {
    // Intentionally suppress raw third-party error payloads and secrets from Actions logs.
    console.error('G1 YouTube-TMDB-Matchinganalyse nicht vollständig abgeschlossen. Logs/Quoten/Zugang kontrollieren.')
    process.exitCode=1
  })
}
