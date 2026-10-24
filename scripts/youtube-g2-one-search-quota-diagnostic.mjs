/**
 * Read-only, ONE search.list request to diagnose the exact MovieHub YouTube
 * project search-bucket problem. No automatic retry, pagination or batch
 * follow-up. Protect the API key, return only sanitized aggregate status.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet} from './youtube-api-smoke.mjs'
import {loadPublicMovieHubIndex} from './youtube-g2-tmdb-first-link-pilot.mjs'
import {selectYoutubeBadgedMovies}
  from './youtube-g2-tmdb-first-link-model.mjs'
import {mapFromCandidateCheckpoint}
  from './youtube-g2-durable-candidate-checkpoint.mjs'
import {planTmdbFirstYoutubeQueries}
  from './youtube-g2-tmdb-first-query-plan.mjs'

export const ONE_SEARCH_QUOTA_KIND='moviehub-youtube-g2-one-search-project-quota-diagnostic'
export const ONE_SEARCH_QUOTA_OUTPUT='artifacts/youtube-g2/one-search-quota-diagnostic'
export const ONE_SEARCH_CHECKPOINT='artifacts/youtube-g2/trusted-known-candidates/candidates.json'
const valid=x=>Number.isInteger(Number(x))&&Number(x)>0
const labelled=e=>Array.isArray(e?.providerIds)&&e.providerIds.includes('youtube')
  ||Array.isArray(e?.providerOffers)&&e.providerOffers.some(p=>p?.id==='youtube')

export function selectExactlyOnePreviouslyUnknownBadgedMovie(publicIndex,checkpoint){
  const existing=mapFromCandidateCheckpoint(checkpoint)
  const validated=selectYoutubeBadgedMovies(publicIndex,{limit:1})
  if(validated.publicYoutubeBadgedMovies<1)
    throw Error('G2_ONE_SEARCH_NO_PUBLIC_BADGED_FILMS')
  const seen=new Set()
  const eligible=publicIndex.entries.filter(e=>{
    const id=Number(e?.tmdbId)
    if(e?.type!=='movie'||!valid(id)||!labelled(e)||seen.has(id))return false
    seen.add(id)
    return !existing.has(id)&&typeof e.title==='string'&&e.title.trim().length>0
  }).sort((a,b)=>Number(a.tmdbId)-Number(b.tmdbId))
  if(!eligible.length)throw Error('G2_ONE_SEARCH_NO_NEW_BADGED_FILMS')
  const x=eligible[0]
  const seed={mediaType:'movie',tmdbId:Number(x.tmdbId),title:x.title,
    originalTitle:x.originalTitle||null,year:Number(x.year)||null}
  const query=planTmdbFirstYoutubeQueries(seed,{original_title:seed.originalTitle})[0]
  if(query.part!=='snippet'||query.type!=='video'
    ||query.regionCode!=='DE'||query.maxResults>10
    ||query.order!=='relevance'||query.videoType!=='movie'
    ||typeof query.q!=='string'||!query.q.trim())
    throw Error('G2_ONE_SEARCH_QUERY_POLICY_REJECTED')
  return {tmdbId:seed.tmdbId,knownCandidateFilms:existing.size,
    publicBadgedMovies:validated.publicYoutubeBadgedMovies,query}
}
const failure=/^YouTube API: HTTP (429|403) bei search \[([A-Z_]+)\]/
export async function runOneSearchQuotaDiagnostic({
  publicIndex,checkpoint,youtubeApi,
  now=new Date().toISOString(),
}={}){
  if(!Number.isFinite(Date.parse(now))||typeof youtubeApi!=='function')
    throw Error('G2_ONE_SEARCH_INPUT_INVALID')
  const select=selectExactlyOnePreviouslyUnknownBadgedMovie(publicIndex,checkpoint)
  const generatedAt=new Date(now).toISOString()
  let outcome='search-accessible',reason='OK',returnedVideos=0,apiCalls=0
  try{
    apiCalls++
    const result=await youtubeApi('search',select.query)
    if(!Array.isArray(result?.items)||result.items.length>10)
      throw Error('G2_ONE_SEARCH_RESPONSE_UNTRUSTED')
    returnedVideos=result.items.length
  }catch(error){
    const parsed=failure.exec(String(error?.message||''))
    if(!parsed)throw error
    outcome=parsed[1]==='429'?'search-throttled-429':'search-rejected-403'
    reason=parsed[2]
  }
  if(apiCalls!==1)throw Error('G2_ONE_SEARCH_CALL_COUNT_MISMATCH')
  const summary={
    kind:ONE_SEARCH_QUOTA_KIND,generatedAt,
    sampledExactTmdbFilmId:select.tmdbId,
    globalCachedMovieIdentities:select.knownCandidateFilms,
    publicTmdbYoutubeBadgeMovies:select.publicBadgedMovies,
    searchCallsAttempted:apiCalls,
    searchOutcome:outcome,googleFailureClass:reason,
    responseCandidateCount:returnedVideos,
    quotaActuallyMeasured:false,quotaAvailableUnits:null,
    independentlyVerifiedDEOffers:0,confirmedPlaybackRoutes:0,
    firestoreWrites:0,catalogWrites:0,providerWrites:0,badgeWrites:0,
    noAutomaticRetry:true,privateArtifact:true,
  }
  return summary
}
export async function oneSearchQuotaLive({
  checkpointPath=ONE_SEARCH_CHECKPOINT,output=ONE_SEARCH_QUOTA_OUTPUT,
  youtubeKey,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)
    throw Error('G2_ONE_SEARCH_RESEARCH_ONLY')
  const [checkpoint,publicIndex]=await Promise.all([
    readFile(checkpointPath,'utf8').then(JSON.parse),
    loadPublicMovieHubIndex(),
  ])
  const key=youtubeKey||getSecret()
  const result=await runOneSearchQuotaDiagnostic({
    checkpoint,publicIndex,
    youtubeApi:(path,params)=>youtubeGet(path,params,key),
  })
  await mkdir(output,{recursive:true})
  await writeFile(output+'/summary.json',JSON.stringify(result,null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify(result))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  oneSearchQuotaLive().catch(e=>{
    // youtubeGet emits known classification without key/request/raw Google body.
    console.error('G2 ONE SEARCH QUOTA DIAGNOSTIC FAILED: '+e.message)
    process.exitCode=1
  })
}
