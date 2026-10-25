/**
 * AP2 live acceptance: re-evaluate EVERY cached exact movie/video candidate
 * against current MovieHub public badges, current TMDB DE YouTube offers and
 * official YouTube videos.list WITHOUT invoking search.list even once.
 *
 * Global MovieHub TMDB film identities, never personal profile references.
 * CANDIDATES ONLY: no offer grant, route, Firestore, provider or catalog writes.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {mapFromCandidateCheckpoint}
  from './youtube-g2-durable-candidate-checkpoint.mjs'
import {loadPublicMovieHubIndex,runTmdbFirstLinkPilot}
  from './youtube-g2-tmdb-first-link-pilot.mjs'
import {selectYoutubeBadgedMovies}
  from './youtube-g2-tmdb-first-link-model.mjs'
import {getSecret,youtubeGet} from './youtube-api-smoke.mjs'

export const KNOWN_NO_SEARCH_QA_KIND='moviehub-youtube-g2-global-known-video-no-search-recheck'
export const KNOWN_NO_SEARCH_OUTPUT='artifacts/youtube-g2/global-known-no-search-review'
export const KNOWN_NO_SEARCH_CHECKPOINT='artifacts/youtube-g2/trusted-known-candidates/candidates.json'
export const MAX_REUSE_BATCH=25
export const MAX_REUSE_MOVIES=250
const badge=e=>Array.isArray(e?.providerIds)&&e.providerIds.includes('youtube')
  ||Array.isArray(e?.providerOffers)&&e.providerOffers.some(p=>p?.id==='youtube')
const validId=x=>Number.isInteger(x)&&x>0

export function selectGlobalCachedYoutubeResearch({checkpoint,publicIndex,now=new Date().toISOString()}={}){
  const mapping=mapFromCandidateCheckpoint(checkpoint)
  const timestamp=Date.parse(now),published=Date.parse(publicIndex?.generatedAt)
  if(!Number.isFinite(timestamp)||!Number.isFinite(published)
    ||timestamp-published< -86400000||timestamp-published>30*86400000
    ||mapping.size<1||mapping.size>MAX_REUSE_MOVIES)
    throw Error('G2_GLOBAL_CACHED_SOURCE_INVALID')
  // Existing source gate validates exact published DE index, not fallback.
  const source=selectYoutubeBadgedMovies(publicIndex,{limit:1})
  if(source.publicYoutubeBadgedMovies<1)throw Error('G2_GLOBAL_CACHED_NO_SOURCE_MOVIES')
  const publicBadgeIds=new Set()
  const titles=new Map()
  for(const e of publicIndex.entries){
    if(e?.type!=='movie'||!validId(e.tmdbId)||!badge(e))continue
    publicBadgeIds.add(e.tmdbId)
    if(!titles.has(e.tmdbId))titles.set(e.tmdbId,e)
  }
  const selection=[...mapping.keys()].filter(id=>publicBadgeIds.has(id))
    .sort((a,b)=>a-b)
  const noCurrentPublicBadge=[...mapping.keys()]
    .filter(id=>!publicBadgeIds.has(id)).sort((a,b)=>a-b)
  if(selection.length+noCurrentPublicBadge.length!==mapping.size)
    throw Error('G2_GLOBAL_CACHED_COHORT_LOSS')
  return {
    source:KNOWN_NO_SEARCH_QA_KIND,generatedAt:now,
    publicYoutubeBadgedFilms:source.publicYoutubeBadgedMovies,
    storedGlobalFilmIds:mapping.size,
    currentPublicBadgeFilmIds:selection.length,
    noCurrentPublicBadgeFilmIds:noCurrentPublicBadge.length,
    noCurrentPublicBadgeTmdbIds:noCurrentPublicBadge,
    batchPlan:Array.from({length:Math.ceil(selection.length/MAX_REUSE_BATCH)},
      (_,i)=>selection.slice(i*MAX_REUSE_BATCH,(i+1)*MAX_REUSE_BATCH)),
    selection, knownVideoCandidatesByTmdbId:mapping,
  }
}

export async function recheckGlobalCachedYoutubeCandidates({
  checkpoint,publicIndex,tmdbGet,youtubeApi,now=new Date().toISOString(),
}={}){
  const plan=selectGlobalCachedYoutubeResearch({checkpoint,publicIndex,now})
  if(typeof tmdbGet!=='function'||typeof youtubeApi!=='function')
    throw Error('G2_GLOBAL_CACHED_READ_ONLY_CALLBACKS_REQUIRED')
  // Hard gate: even if a caller or future edit accidentally invokes a search,
  // fail immediately BEFORE hitting YouTube quota.
  let videosListCalls=0
  const knownVideosOnly=async(endpoint,params)=>{
    if(endpoint!=='videos')throw Error('G2_GLOBAL_CACHED_YOUTUBE_SEARCH_FORBIDDEN')
    if(++videosListCalls>MAX_REUSE_MOVIES)
      throw Error('G2_GLOBAL_CACHED_VIDEO_DETAILS_BUDGET_EXCEEDED')
    return youtubeApi(endpoint,params)
  }
  const results=[]
  for(const group of plan.batchPlan){
    const pilot=await runTmdbFirstLinkPilot({
      publicIndex,limit:group.length,
      seedRefs:group.map(tmdbId=>({mediaType:'movie',tmdbId})),
      tmdbGet,youtubeApi:knownVideosOnly,
      knownVideoCandidatesByTmdbId:plan.knownVideoCandidatesByTmdbId,
      now:()=>now,
    })
    if(pilot.summary.processedMovies!==group.length
      ||pilot.summary.calls.youtubeSearches!==0
      ||pilot.summary.verifiedDirectLinks!==0
      ||pilot.summary.publicationPermitted!==false
      ||pilot.summary.catalogWrites!==0||pilot.summary.firestoreWrites!==0
      ||pilot.summary.providerWrites!==0||pilot.summary.badgeWrites!==0
      ||pilot.rows.some(r=>r.publicationPermitted!==false
        ||r.directPlaybackRoute!==null||r.reviewedVideoId!==null)){
      throw Error('G2_GLOBAL_CACHED_BATCH_RESEARCH_GATES_FAILED')
    }
    results.push(pilot)
  }
  const rows=results.flatMap(p=>p.rows)
  if(rows.length!==plan.currentPublicBadgeFilmIds
    ||new Set(rows.map(x=>x.tmdbId)).size!==rows.length
    ||rows.some(x=>!plan.selection.includes(x.tmdbId)))
    throw Error('G2_GLOBAL_CACHED_FILM_RECONCILIATION_FAILED')
  const calls={
    youtubeSearches:0,
    youtubeVideoLookups:results.reduce((n,p)=>n+p.summary.calls.youtubeVideoLookups,0),
    tmdbGetRequests:results.reduce((n,p)=>n+p.summary.calls.tmdbGetRequests,0),
  }
  if(calls.youtubeVideoLookups!==videosListCalls)
    throw Error('G2_GLOBAL_CACHED_VIDEO_CALL_ACCOUNTING_FAILED')
  const statuses=Object.fromEntries([...new Set(rows.map(r=>r.status))].sort()
    .map(k=>[k,rows.filter(r=>r.status===k).length]))
  const reviewed=rows.filter(r=>r.candidateDiscoveryMode==='trusted-previous-candidate-ids')
  const expectedReused=rows.filter(r=>r.tmdbDeOfferTypes.length>0)
  if(reviewed.length!==expectedReused.length
    ||rows.some(r=>r.candidateDiscoveryMode==='new-search'))
    throw Error('G2_GLOBAL_CACHED_SEARCH_REUSE_RECONCILIATION_FAILED')
  const summary={
    kind:KNOWN_NO_SEARCH_QA_KIND,generatedAt:now,
    publicYoutubeBadgedFilms:plan.publicYoutubeBadgedFilms,
    globalStoredCandidateFilms:plan.storedGlobalFilmIds,
    currentBadgeCachedFilms:plan.currentPublicBadgeFilmIds,
    cachedFilmsWithoutCurrentPublicBadge:plan.noCurrentPublicBadgeFilmIds,
    filmsWithCurrentTmdbDeYoutubeOffers:expectedReused.length,
    filmsWithoutCurrentTmdbDeYoutubeOffers:rows.length-expectedReused.length,
    reusedVideoCandidateIds:results.reduce((n,p)=>n+p.summary.knownCandidateReusedVideoIds,0),
    avoidedYoutubeSearchCalls:results.reduce((n,p)=>n+p.summary.avoidedYoutubeSearchCalls,0),
    rowsChecked:rows.length,searchCalls:0,
    videosListBatches:calls.youtubeVideoLookups,
    tmdbReadCalls:calls.tmdbGetRequests,
    reviewStatuses:statuses,
    independentlyVerifiedDeOffers:0,
    publishedDirectRoutes:0,
    firebaseWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
    privateReviewArtifact:true,publicationPermitted:false,
  }
  if(summary.avoidedYoutubeSearchCalls!==2*expectedReused.length
    ||summary.rowsChecked+summary.cachedFilmsWithoutCurrentPublicBadge
       !==summary.globalStoredCandidateFilms)
    throw Error('G2_GLOBAL_CACHED_END_TO_END_ACCOUNTING_FAILED')
  return {summary,rows,
    noCurrentPublicBadgeTmdbIds:plan.noCurrentPublicBadgeTmdbIds}
}
export function globalCachedReviewReport({summary,rows}){
  return [
    '# MovieHub globaler TMDB-first Kandidaten-Recheck (YouTube search.list = 0)',
    '',
    '- Technisch geteilter, zugriffsgeschuetzter Checkpoint: '
      +summary.globalStoredCandidateFilms+' Filmidentitaeten.',
    '- Davon noch mit oeffentlichem YouTube TMDB-Badge: '
      +summary.currentBadgeCachedFilms+'.',
    '- Aktuelles TMDB DE YouTube-Angebotstyp-Mapping: '
      +summary.filmsWithCurrentTmdbDeYoutubeOffers+'.',
    '- Unter Verwendung vorhandener IDs erneut bewertet: '
      +summary.reusedVideoCandidateIds+' Kandidateneintraege.',
    '- Vermiedene search.list Anfragen: '+summary.avoidedYoutubeSearchCalls+'.',
    '- Tatsaechliche YouTube search.list Anfragen: **0**.',
    '- Aktuelle videos.list Batch-Lookups: '+summary.videosListBatches+'.',
    '- Echte TMDB Detailabrufe: '+summary.tmdbReadCalls+'.',
    '- Matcher-Review-Ergebnisse: '+JSON.stringify(summary.reviewStatuses),
    '- **0 unabhaengig verifizierte DE Angebote, 0 freigegebene Direktlinks, 0 Produktiv-Writes**.',
    '- Filmfassungen, Kanalherkunft, tatsaechliche DE-Wiedergabe und Tarif sind separat zu bestaetigen.',
    '',
    '| movie:TMDB | Reviewstatus | Quelle | TMDB-DE-Angebotsart | Video-Kandidaten (intern) |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(r=>'| movie:'+r.tmdbId+' | '+r.status
      +' | '+(r.candidateDiscoveryMode||'no-offer')
      +' | '+(r.tmdbDeOfferTypes.join(', ')||'—')
      +' | '+r.videoCandidates.slice(0,3).map(v=>v.videoId).join(', ')+' |'),
    '',
  ].join('\n')
}
async function tmdbLive(path,params={},token){
  if(!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path))
    throw Error('G2_GLOBAL_CACHED_TMDB_PATH_FORBIDDEN')
  const u=new URL('https://api.themoviedb.org/3'+path)
  for(const [key,value] of Object.entries(params))u.searchParams.set(key,String(value))
  const r=await fetch(u,{headers:{accept:'application/json',
      authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)})
  if(!r.ok)throw Error('G2_GLOBAL_CACHED_TMDB_HTTP_'+r.status)
  return r.json()
}
export async function liveCachedReview({
  checkpointPath=KNOWN_NO_SEARCH_CHECKPOINT,
  output=KNOWN_NO_SEARCH_OUTPUT,
  token=process.env.TMDB_API_READ_TOKEN,
  youtubeKey=getSecret(),
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('G2_GLOBAL_CACHED_NO_WRITES')
  if(!token||token.length<15)throw Error('G2_GLOBAL_CACHED_TMDB_TOKEN_REQUIRED')
  const [checkpoint,publicIndex]=await Promise.all([
    readFile(checkpointPath,'utf8').then(JSON.parse),
    loadPublicMovieHubIndex(),
  ])
  const result=await recheckGlobalCachedYoutubeCandidates({
    checkpoint,publicIndex,
    tmdbGet:(path,params)=>tmdbLive(path,params,token),
    youtubeApi:(path,params)=>youtubeGet(path,params,youtubeKey),
  })
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/qa.json',JSON.stringify(result,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',globalCachedReviewReport(result)+'\n',{mode:0o600}),
  ])
  console.log(JSON.stringify(result.summary))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  liveCachedReview().catch(e=>{
    console.error('GLOBAL-KNOWN-YOUTUBE-RECHECK FAILED CLOSED: '+e.message)
    process.exitCode=1
  })
}
