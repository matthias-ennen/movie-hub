/**
 * Read-only G2 TMDB-first pilot. MovieHub's ALREADY-published YouTube badges
 * choose the work; YouTube search only proposes exact candidate VIDEO IDs.
 * No new titles, no provider writes, no Firestore, no playback publication.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getSecret, youtubeGet } from './youtube-api-smoke.mjs'
import {
  TMDB_FIRST_MAX_SEARCHES, TMDB_FIRST_MAX_TITLES,
  selectYoutubeBadgedMovies, exactYoutubeProviderIds,
  exactDeYoutubeOfferTypes, evaluateTmdbFirstYoutubeLinks,
  summarizeTmdbFirstPilot,
} from './youtube-g2-tmdb-first-link-model.mjs'

export const PUBLIC_INDEX = 'https://movie-hub-62459.web.app/search-index.json'
export const OUTPUT = 'artifacts/youtube-g2/tmdb-first-link-pilot'
const MAX_INDEX_BYTES = 30 * 1024 * 1024
const MAX_TMDB_GETS = 1 + TMDB_FIRST_MAX_TITLES * 2
const MAX_VIDEO_GETS = 10
const maxResults = 10
const validVideoId = id => /^[A-Za-z0-9_-]{11}$/.test(String(id || ''))

export async function loadPublicMovieHubIndex(request = fetch) {
  const response = await request(PUBLIC_INDEX, {
    headers: { accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  })
  if (!response?.ok || response?.status !== 200 || response?.url !== PUBLIC_INDEX) {
    throw new Error('PUBLISHED_INDEX_FETCH_FAILED')
  }
  if (Number(response.headers?.get?.('content-length') || 0) > MAX_INDEX_BYTES) {
    throw new Error('PUBLISHED_INDEX_OVERSIZE')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_INDEX_BYTES) throw new Error('PUBLISHED_INDEX_OVERSIZE')
  return JSON.parse(new TextDecoder().decode(bytes))
}

export async function runTmdbFirstLinkPilot({
  publicIndex, tmdbGet, youtubeApi,
  limit = TMDB_FIRST_MAX_TITLES, now = () => new Date().toISOString(),
} = {}) {
  if (typeof tmdbGet !== 'function' || typeof youtubeApi !== 'function') {
    throw new Error('READ_ONLY_API_CALLBACKS_REQUIRED')
  }
  const observedAt = new Date(now()).toISOString()
  const age = Date.parse(observedAt) - Date.parse(publicIndex?.generatedAt || '')
  if (!Number.isFinite(age) || age < -86400000 || age > 30 * 86400000) {
    throw new Error('PUBLISHED_INDEX_STALE_OR_FUTURE')
  }
  const selection = selectYoutubeBadgedMovies(publicIndex, { limit })
  if (!selection.selected.length) throw new Error('NO_EXISTING_YOUTUBE_BADGED_MOVIES')
  const counters = { youtubeSearches: 0, youtubeVideoLookups: 0, tmdbGetRequests: 0 }
  const yt = async (path, params) => {
    if (path === 'search') {
      if (++counters.youtubeSearches > TMDB_FIRST_MAX_SEARCHES) throw new Error('SEARCH_BUDGET_HARD_STOP')
    } else if (path === 'videos') {
      if (++counters.youtubeVideoLookups > MAX_VIDEO_GETS) throw new Error('VIDEO_BUDGET_HARD_STOP')
    } else throw new Error('YOUTUBE_ENDPOINT_NOT_APPROVED')
    return youtubeApi(path, params)
  }
  const tm = async (path, params) => {
    if (!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path)) {
      throw new Error('TMDB_ENDPOINT_NOT_APPROVED')
    }
    if (++counters.tmdbGetRequests > MAX_TMDB_GETS) throw new Error('TMDB_BUDGET_HARD_STOP')
    return tmdbGet(path, params)
  }
  const directory = await tm('/watch/providers/movie', { language: 'de-DE', watch_region: 'DE' })
  const youtubeProviderIds = exactYoutubeProviderIds(directory)
  if (!youtubeProviderIds.length) throw new Error('NO_EXACT_TMDB_YOUTUBE_PROVIDER')
  const pending = []
  const sourceVideos = new Map()
  const allIds = new Set()
  for (const seed of selection.selected) {
    const offerDetail = await tm('/movie/' + seed.tmdbId + '/watch/providers')
    const offerTypes = exactDeYoutubeOfferTypes(offerDetail, youtubeProviderIds)
    if (!offerTypes.length) {
      pending.push({ seed, offerTypes, tmdbFilm: { id: seed.tmdbId }, videoIds: [] })
      continue
    }
    const tmdbFilm = await tm('/movie/' + seed.tmdbId, {
      language: 'de-DE', append_to_response: 'alternative_titles,credits,external_ids',
    })
    if (Number(tmdbFilm?.id) !== seed.tmdbId) throw new Error('TMDB_TITLE_ID_MISMATCH')
    // Pass A: licensed Movie-type search. Pass B: publisher uploads, if present.
    // Search outputs are discovery, not proof that a movie is in the paid store.
    const searches = [
      { part: 'snippet', type: 'video', videoType: 'movie',
        regionCode: 'DE', maxResults, order: 'relevance', q: [seed.title, seed.year].filter(Boolean).join(' ') },
      { part: 'snippet', type: 'video', videoDuration: 'long',
        regionCode: 'DE', maxResults, order: 'relevance',
        q: [seed.originalTitle || seed.title, seed.year].filter(Boolean).join(' ') },
    ]
    const videoIds = new Set()
    for (const params of searches) {
      const response = await yt('search', params)
      for (const candidate of (response.items || [])) {
        const id = candidate?.id?.videoId
        if (!validVideoId(id)) continue
        videoIds.add(id); allIds.add(id)
      }
    }
    pending.push({ seed, offerTypes, tmdbFilm, videoIds: [...videoIds] })
  }
  if (allIds.size > 500) throw new Error('VIDEO_RESULT_HARD_STOP')
  const ids = [...allIds]
  for (let i = 0; i < ids.length; i += 50) {
    const details = await yt('videos', {
      part: 'snippet,contentDetails,status',
      id: ids.slice(i, i + 50).join(','),
    })
    for (const item of (details.items || [])) {
      if (validVideoId(item.id)) sourceVideos.set(item.id, item)
    }
  }
  const rows = pending.map(({ seed, offerTypes, tmdbFilm, videoIds }) =>
    evaluateTmdbFirstYoutubeLinks(seed, tmdbFilm, offerTypes,
      videoIds.map(id => sourceVideos.get(id)).filter(Boolean), { observedAt }))
  const summary = summarizeTmdbFirstPilot(rows, selection, counters)
  if (summary.processedMovies !== selection.selected.length || summary.publicationPermitted !== false) {
    throw new Error('TMDB_FIRST_AUDIT_INTEGRITY_FAILED')
  }
  return { summary, rows }
}
export function pilotMarkdown({ summary, rows }) {
  const lines = [
    '# MovieHub YouTube G2 – TMDB-FIRST LINK AUDIT (read-only)',
    '',
    '- MovieHub LIVE public index is seed source: ' + PUBLIC_INDEX,
    '- Published YouTube-badged movies in index: ' + summary.publicYoutubeBadgedMovies,
    '- Selected/processed: ' + summary.selectedMovies + '/' + summary.processedMovies,
    '- YouTube search: ' + summary.calls.youtubeSearches + '/' + TMDB_FIRST_MAX_SEARCHES,
    '- YouTube video batch lookup: ' + summary.calls.youtubeVideoLookups + '/' + MAX_VIDEO_GETS,
    '- TMDB GET: ' + summary.calls.tmdbGetRequests + '/' + MAX_TMDB_GETS,
    '- **Verified direct routes: 0 – all video IDs are hypotheses only.**',
    '- **No new movie titles, series or provider badges imported.**',
    '- TMDB DE YouTube offering must be verified per movie; Google TV and Google Play are not automatically YouTube.',
    '- Search results, title exactness, runtimes and regionRestriction do not verify DE playback, rights, tariff or storefront listing.',
    '- Personal MovieHub titles and series are not covered by this PUBLIC movie sample. Never report "all existing badges linked".',
    '- Zero MovieHub production writes and no Nightly changes.',
    '',
    '| MovieHub TMDB film | TMDB DE YouTube offer types | Outcome | Proposed video IDs (review only) |',
    '| --- | --- | --- | --- |',
    ...rows.map(row => '| ' + row.title.replace(/[|]/g, ' ') + ' (movie:' + row.tmdbId + ')'
      + ' | ' + (row.tmdbDeOfferTypes.join(', ') || 'not confirmed')
      + ' | ' + row.status + ' | '
      + (row.videoCandidates.slice(0, 3).map(x => x.videoId + ' (title='
        + x.titleLevel + ', delta=' + (x.runtimeDelta ?? '?') + 'm)').join('; ') || '—') + ' |'),
    '',
  ]
  return lines.join('\n')
}
async function tmdbLive(path, params, token) {
  const url = new URL('https://api.themoviedb.org/3' + path)
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, String(value))
  const response = await fetch(url, {
    headers: { accept: 'application/json', authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error('TMDB read HTTP ' + response.status)
  return response.json()
}
async function main() {
  if (process.env.YOUTUBE_G2_WRITE_MODE) throw new Error('RESEARCH_ONLY_NO_WRITE')
  const tmdbToken = process.env.TMDB_API_READ_TOKEN
  if (!tmdbToken || tmdbToken.length < 15) throw new Error('TMDB_READ_TOKEN_MISSING')
  const key = getSecret()
  const index = await loadPublicMovieHubIndex()
  const result = await runTmdbFirstLinkPilot({
    publicIndex: index,
    tmdbGet: (path, params) => tmdbLive(path, params, tmdbToken),
    youtubeApi: (path, params) => youtubeGet(path, params, key),
  })
  await mkdir(OUTPUT, { recursive: true })
  await writeFile(OUTPUT + '/qa.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  await writeFile(OUTPUT + '/report.md', pilotMarkdown(result) + '\n', { mode: 0o600 })
  process.stdout.write(JSON.stringify({
    mode: result.summary.mode, processed: result.summary.processedMovies,
    statusCounts: result.summary.statusCounts, calls: result.summary.calls,
    verifiedDirectLinks: 0, productionWrites: 0,
  }) + '\n')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { process.stderr.write('TMDB FIRST AUDIT FAILED CLOSED: ' + err.message + '\n'); process.exitCode = 1 })
}
