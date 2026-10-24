/**
 * Read-only G2 TMDB-first pilot. MovieHub's ALREADY-published YouTube badges
 * choose the work; YouTube search only proposes exact candidate VIDEO IDs.
 * No new titles, no provider writes, no Firestore, no playback publication.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getSecret, youtubeGet } from './youtube-api-smoke.mjs'
import {validateKnownCandidateMap} from './youtube-g2-known-candidate-reuse.mjs'
import { planTmdbFirstYoutubeQueries } from './youtube-g2-tmdb-first-query-plan.mjs'
import {
  TMDB_FIRST_GOLDEN,compareTmdbFirstPilotToGolden,
} from './youtube-g2-quality-golden.mjs'
import {
  planTmdbFirstPriorDeviceCandidates,TMDB_FIRST_KNOWN_DEVICE_CANDIDATES,
  TMDB_FIRST_PRIOR_DEVICE_CANDIDATE_KIND,
} from './youtube-g2-tmdb-first-prior-device-candidates.mjs'
import {
  TMDB_FIRST_MAX_SEARCHES, TMDB_FIRST_MAX_TITLES,
  selectYoutubeBadgedMovies, selectExplicitYoutubeBadgedMovies, exactYoutubeProviderIds,
  exactDeYoutubeOfferTypes, evaluateTmdbFirstYoutubeLinks,
  summarizeTmdbFirstPilot,
} from './youtube-g2-tmdb-first-link-model.mjs'

export const PUBLIC_INDEX = 'https://movie-hub-62459.web.app/search-index.json'
export const OUTPUT = 'artifacts/youtube-g2/tmdb-first-link-pilot'
const MAX_INDEX_BYTES = 30 * 1024 * 1024
const MAX_TMDB_GETS = 1 + TMDB_FIRST_MAX_TITLES * 2
const MAX_VIDEO_GETS = 11
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
  limit = TMDB_FIRST_MAX_TITLES, seedRefs = null, now = () => new Date().toISOString(),
  knownDeviceCandidates = TMDB_FIRST_KNOWN_DEVICE_CANDIDATES,
  knownVideoCandidatesByTmdbId = null,
  // Default remains zero for historical pilots and offline/mocked tests.
  // The live full-catalog runner opts into deliberate, serial spacing to
  // respect the actual Google 429 RATE_LIMITED search bucket.
  minimumSearchIntervalMs = 0,
  waitBetweenSearches = ms=>new Promise(resolve=>setTimeout(resolve,ms)),
} = {}) {
  if (typeof tmdbGet !== 'function' || typeof youtubeApi !== 'function') {
    throw new Error('READ_ONLY_API_CALLBACKS_REQUIRED')
  }
  if(!Number.isInteger(minimumSearchIntervalMs)
    ||minimumSearchIntervalMs<0||minimumSearchIntervalMs>60000
    ||typeof waitBetweenSearches!=='function')
    throw Error('YOUTUBE_SEARCH_SPACING_INVALID')
  // An archival map is a read-only search shortcut, not approval evidence.
  // Reject malformed inputs before TMDB and YouTube network operations.
  const knownMap=validateKnownCandidateMap(knownVideoCandidatesByTmdbId)
  const observedAt = new Date(now()).toISOString()
  const age = Date.parse(observedAt) - Date.parse(publicIndex?.generatedAt || '')
  if (!Number.isFinite(age) || age < -86400000 || age > 30 * 86400000) {
    throw new Error('PUBLISHED_INDEX_STALE_OR_FUTURE')
  }
  const selection = seedRefs === null
    ? selectYoutubeBadgedMovies(publicIndex, { limit })
    : selectExplicitYoutubeBadgedMovies(publicIndex, seedRefs, { limit })
  if (!selection.selected.length) throw new Error('NO_EXISTING_YOUTUBE_BADGED_MOVIES')
  const priorDeviceIds = planTmdbFirstPriorDeviceCandidates(
    selection.selected,knownDeviceCandidates)
  const counters = { youtubeSearches: 0, youtubeVideoLookups: 0, tmdbGetRequests: 0 }
  let reusedMovies=0,reusedCandidateIds=0,avoidedSearches=0
  const yt = async (path, params) => {
    if (path === 'search') {
      if (++counters.youtubeSearches > TMDB_FIRST_MAX_SEARCHES) throw new Error('SEARCH_BUDGET_HARD_STOP')
      // Sequential calls already await the preceding Google response.
      // Before EVERY second and subsequent search request, add an explicit
      // quiet interval. NEVER retry an HTTP 429; no hidden catch/replay.
      if(counters.youtubeSearches>1&&minimumSearchIntervalMs>0)
        await waitBetweenSearches(minimumSearchIntervalMs)
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
      pending.push({ seed, offerTypes, tmdbFilm: { id: seed.tmdbId },
        videoIds: [], searchedVideoIds: [], priorDeviceId: null })
      continue
    }
    const tmdbFilm = await tm('/movie/' + seed.tmdbId, {
      language: 'de-DE', append_to_response: 'alternative_titles,credits,external_ids',
    })
    if (Number(tmdbFilm?.id) !== seed.tmdbId) throw new Error('TMDB_TITLE_ID_MISMATCH')
    // First precise DE movie search; then original-title/no-year discovery.
    // Still exactly two calls/work and every result remains review-only.
    const searches = planTmdbFirstYoutubeQueries(seed, tmdbFilm)
    const videoIds = new Set()
    const archivedIds=knownMap?.get(seed.tmdbId)||null
    if(archivedIds?.length){
      reusedMovies++
      reusedCandidateIds+=archivedIds.length
      avoidedSearches+=searches.length
      for(const id of archivedIds){videoIds.add(id);allIds.add(id)}
    }else{
      for (const params of searches) {
        const response = await yt('search', params)
        for (const candidate of (response.items || [])) {
          const id = candidate?.id?.videoId
          if (!validVideoId(id)) continue
          videoIds.add(id); allIds.add(id)
        }
      }
    }
    const searchedVideoIds=archivedIds?.length?[]:[...videoIds]
    // A previously user-observed exact video may be missing from search.list
    // even when videos.list can still resolve it. Fetch and match it through
    // the same read-only film/cut gates, never as independently verified offer.
    const priorDeviceId=priorDeviceIds.get(seed.tmdbId)||null
    if(priorDeviceId){videoIds.add(priorDeviceId);allIds.add(priorDeviceId)}
    pending.push({seed,offerTypes,tmdbFilm,
      videoIds:[...videoIds],searchedVideoIds,priorDeviceId,
      discoveryMode:archivedIds?.length?'trusted-previous-candidate-ids':'new-search'})
  }
  if (allIds.size > 525) throw new Error('VIDEO_RESULT_HARD_STOP')
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
  const rows = pending.map(({seed,offerTypes,tmdbFilm,videoIds,
    searchedVideoIds,priorDeviceId,discoveryMode})=>{
    const row=evaluateTmdbFirstYoutubeLinks(seed,tmdbFilm,offerTypes,
      videoIds.map(id=>sourceVideos.get(id)).filter(Boolean),{observedAt})
    if(!priorDeviceId)return {...row,
      candidateDiscoveryMode:discoveryMode||'no-current-tmdb-de-youtube-offer',
      priorDeviceCandidate:null}
    return {...row,
      candidateDiscoveryMode:discoveryMode||'no-current-tmdb-de-youtube-offer',
      priorDeviceCandidate:{
      videoId:priorDeviceId,
      evidenceKind:TMDB_FIRST_PRIOR_DEVICE_CANDIDATE_KIND,
      returnedByCurrentSearch:discoveryMode==='new-search'
        ?searchedVideoIds.includes(priorDeviceId):null,
      currentSearchPerformed:discoveryMode==='new-search',
      currentVideoMetadataAvailable:sourceVideos.has(priorDeviceId),
      inTop10RankedCandidates:row.videoCandidates.some(x=>x.videoId===priorDeviceId),
      offerOrPlaybackIndependentlyVerified:false,
      publicationPermitted:false,
    }}
  })
  const summary={
    ...summarizeTmdbFirstPilot(rows, selection, counters),
    priorDeviceCandidatesResearched:rows.filter(r=>r.priorDeviceCandidate).length,
    priorDeviceCandidatesMissingFromSearch:rows.filter(r=>r.priorDeviceCandidate
      && r.priorDeviceCandidate.currentSearchPerformed
      && !r.priorDeviceCandidate.returnedByCurrentSearch).length,
    knownCandidateReuseMovies:reusedMovies,
    knownCandidateReusedVideoIds:reusedCandidateIds,
    avoidedYoutubeSearchCalls:avoidedSearches,
    priorDeviceCandidatesResolvedViaVideoDetails:rows.filter(r=>r.priorDeviceCandidate
      && r.priorDeviceCandidate.currentVideoMetadataAvailable).length,
    priorDeviceCandidatesInTop10:rows.filter(r=>r.priorDeviceCandidate
      && r.priorDeviceCandidate.inTop10RankedCandidates).length,
    priorDeviceCandidatesApprovedAsOffers:0,
  }
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
    '- Trusted known-video refresh: '+(summary.knownCandidateReuseMovies||0)
      +' films / '+(summary.knownCandidateReusedVideoIds||0)+' archived candidate IDs; '
      +(summary.avoidedYoutubeSearchCalls||0)+' search.list requests avoided. All candidates remain unapproved.',
    '- YouTube video batch lookup: ' + summary.calls.youtubeVideoLookups + '/' + MAX_VIDEO_GETS,
    '- Known prior-device candidate check: ' + summary.priorDeviceCandidatesResearched
      + ' reviewed; ' + summary.priorDeviceCandidatesMissingFromSearch
      + ' were missing from current search.list; '
      + summary.priorDeviceCandidatesResolvedViaVideoDetails
      + ' resolved via official videos.list. NO direct link or DE offer approved.',
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
/** Only read-only, opt-in comparison to the EXACT original 25 TMDB IDs. */
export function planOriginalTmdbFirstGoldenReplay(){
  if(TMDB_FIRST_GOLDEN.length!==TMDB_FIRST_MAX_TITLES
    ||new Set(TMDB_FIRST_GOLDEN.map(x=>x.tmdbId)).size!==TMDB_FIRST_MAX_TITLES
    ||TMDB_FIRST_GOLDEN.some(x=>!Number.isInteger(x.tmdbId)||x.tmdbId<=0))
    throw Error('G2_TMDB_FIRST_GOLDEN_REPLAY_INVALID')
  return TMDB_FIRST_GOLDEN.map(x=>({mediaType:'movie',tmdbId:x.tmdbId}))
}

/**
 * Keep all 25 original works accounted for, while actually researching ONLY
 * the subset still bearing YouTube badges in the current PUBLIC DE index.
 * Losing a badge is a meaningful source delta, not permission to search
 * a title as if TMDB still asserted a YouTube offer.
 */
export async function runOriginalTmdbFirstGoldenReplay({
  publicIndex,tmdbGet,youtubeApi,now=()=>new Date().toISOString(),
  knownDeviceCandidates,
}={}){
  const original=planOriginalTmdbFirstGoldenReplay()
  // Reuse the independently-tested current DE index/source validation.
  const eligible=selectYoutubeBadgedMovies(publicIndex,{limit:1})
  if(!eligible.selected.length)throw Error('G2_GOLDEN_NO_CURRENT_PUBLIC_YOUTUBE_BADGES')
  const currentIds=new Set((publicIndex.entries||[]).filter(x=>
    x?.type==='movie'
    &&((Array.isArray(x.providerIds)&&x.providerIds.includes('youtube'))
      ||(Array.isArray(x.providerOffers)&&x.providerOffers.some(o=>o?.id==='youtube')))
  ).map(x=>Number(x.tmdbId)))
  const active=original.filter(ref=>currentIds.has(ref.tmdbId))
  const missing=original.filter(ref=>!currentIds.has(ref.tmdbId))
  if(!active.length)throw Error('G2_GOLDEN_NO_RESEARCHABLE_TMDB_IDS')
  const live=await runTmdbFirstLinkPilot({
    publicIndex,seedRefs:active,limit:TMDB_FIRST_MAX_TITLES,
    tmdbGet,youtubeApi,now,
    ...(knownDeviceCandidates?{knownDeviceCandidates}:{}),
  })
  const liveRows=new Map(live.rows.map(row=>[row.tmdbId,row]))
  const rows=original.map(ref=>liveRows.get(ref.tmdbId)||{
    ...ref,title:'TMDB movie '+ref.tmdbId+' (no current public YouTube badge)',
    status:'no-current-public-youtube-badge',
    tmdbDeOfferTypes:[],videoCandidates:[],reviewedVideoId:null,
    directPlaybackRoute:null,priorDeviceCandidate:null,
    publicationPermitted:false,
  })
  const statusCounts={...live.summary.statusCounts}
  if(missing.length)statusCounts['no-current-public-youtube-badge']=missing.length
  const summary={
    ...live.summary,
    // Be explicit: fewer than 25 films may currently have public badges.
    // processedMovies reports real API-observed works, NOT padding rows.
    selectedMovies:original.length,
    historicalCohortMovies:original.length,
    historicalCohortAccountedFor:rows.length,
    historicalPublicBadgeMissingIds:missing.map(x=>x.tmdbId),
    statusCounts,
  }
  const result={summary,rows}
  // This validates 25 distinct original IDs and exact per-row fail-closed
  // semantics before any comparative artifact is published.
  compareTmdbFirstPilotToGolden(result)
  return result
}

export function formatTmdbFirstGoldenReplay(comparison,result) {
  const summary=result.summary
  return [
    '# MovieHub TMDB-first real API rerun: original 25-film golden comparison',
    '',
    '- Historical reference run: '+comparison.sourceRun,
    '- Actual current API processed movies: '+summary.processedMovies,
    '- Historic cohort missing a CURRENT PUBLIC YouTube badge: '
      +comparison.historicalPublicBadgesMissing,
    '- Missing public-badge TMDB IDs (not searched): '
      +comparison.historicalPublicBadgeMissingIds.join(', '),
    '- Exact original TMDB-ID cohort: 25/25 (no contemporary reselection)',
    '- YouTube search.list calls: '+summary.calls.youtubeSearches,
    '- YouTube videos.list batch calls: '+summary.calls.youtubeVideoLookups,
    '- Original observed statuses: '+JSON.stringify(comparison.historicalClassCounts),
    '- Current observed statuses: '+JSON.stringify(summary.statusCounts),
    '- Same status as original: '+comparison.observedSameClass+'/25',
    '- Same leading video ID as original: '+comparison.observedSameLeadVideoId+'/25',
    '- Review-only candidate changes: '+comparison.reviewDeltas.length,
    '- Prior-device exact IDs checked: '+summary.priorDeviceCandidatesResearched,
    '- Prior-device IDs absent from current search: '+summary.priorDeviceCandidatesMissingFromSearch,
    '- Prior-device IDs with current official video details: '+summary.priorDeviceCandidatesResolvedViaVideoDetails,
    '- Prior-device IDs in ranked top 10: '+summary.priorDeviceCandidatesInTop10,
    '- Independent DE offers verified: 0; published direct links: 0; Firestore/database writes: 0.',
    '- These are metadata hypotheses, NOT demonstrated same-film/cut or DE entitlement.',
    '',
    '## Review-only deltas (never auto-publish)',
    ...comparison.reviewDeltas.map(x=>'- TMDB '+x.tmdbId
      +': '+x.previousClass+' / '+x.previousLeadVideoId
      +' → '+x.observedClass+' / '+(x.observedLeadVideoId||'(none)')),
    '',
  ].join('\n')
}

async function main() {
  if (process.env.YOUTUBE_G2_WRITE_MODE) throw new Error('RESEARCH_ONLY_NO_WRITE')
  const tmdbToken = process.env.TMDB_API_READ_TOKEN
  if (!tmdbToken || tmdbToken.length < 15) throw new Error('TMDB_READ_TOKEN_MISSING')
  const key = getSecret()
  const index = await loadPublicMovieHubIndex()
  const goldenReplay=process.env.YOUTUBE_G2_TMDB_FIRST_GOLDEN_REPLAY==='1'
  const inputs={
    publicIndex:index,
    tmdbGet:(path,params)=>tmdbLive(path,params,tmdbToken),
    youtubeApi:(path,params)=>youtubeGet(path,params,key),
  }
  const result=goldenReplay
    ?await runOriginalTmdbFirstGoldenReplay(inputs)
    :await runTmdbFirstLinkPilot(inputs)
  if(goldenReplay){
    const comparison=compareTmdbFirstPilotToGolden(result)
    // This report is private GitHub QA only, never public Hosting.
    await mkdir(OUTPUT,{recursive:true})
    await Promise.all([
      writeFile(OUTPUT+'/golden-compare.json',
        JSON.stringify({kind:'moviehub-youtube-g2-tmdb-first-live-golden-comparison',
          schemaVersion:1,privateArtifact:true,publicationPermitted:false,
          liveCurrentRun:true,comparison,summary:result.summary,
          directLinksApproved:0,firestoreWrites:0},null,2)+'\n',{mode:0o600}),
      writeFile(OUTPUT+'/golden-compare.md',
        formatTmdbFirstGoldenReplay(comparison,result)+'\n',{mode:0o600}),
    ])
    console.log(JSON.stringify({
      kind:'moviehub-youtube-g2-tmdb-first-live-golden-comparison',
      originalTmdbIds:25,actuallyResearchedMovies:result.summary.processedMovies,
      publicBadgesNoLongerPresent:comparison.historicalPublicBadgesMissing,
      missingPublicBadgeTmdbIds:comparison.historicalPublicBadgeMissingIds,
      reviewDeltas:comparison.reviewDeltas.length,
      sameClass:comparison.observedSameClass,
      sameLeadingVideoId:comparison.observedSameLeadVideoId,
      priorDeviceResolutions:result.summary.priorDeviceCandidatesResolvedViaVideoDetails,
      verifiedDEOffers:0,apiWrites:0,
    }))
  }
  await mkdir(OUTPUT, { recursive: true })
  await writeFile(OUTPUT + '/qa.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  await writeFile(OUTPUT + '/report.md', pilotMarkdown(result) + '\n', { mode: 0o600 })
  process.stdout.write(JSON.stringify({
    mode: result.summary.mode, processed: result.summary.processedMovies,
    statusCounts: result.summary.statusCounts, calls: result.summary.calls,
    verifiedDirectLinks: 0, productionWrites: 0,
    priorDeviceCandidatesResearched:result.summary.priorDeviceCandidatesResearched,
    priorDeviceCandidatesMissingFromSearch:result.summary.priorDeviceCandidatesMissingFromSearch,
    priorDeviceCandidatesResolvedViaVideoDetails:result.summary.priorDeviceCandidatesResolvedViaVideoDetails,
  }) + '\n')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { process.stderr.write('TMDB FIRST AUDIT FAILED CLOSED: ' + err.message + '\n'); process.exitCode = 1 })
}
