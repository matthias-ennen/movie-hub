/**
 * #388: Re-score one authenticated, PRIVATE search.list diagnostic's stored
 * VIDEO IDs using ONLY videos.list and exact TMDB DE watch-provider reads.
 * Never repeats the discovery search, grants an offer or publishes a route.
 * Input files must originate from ONE verified, successful GitHub artifact.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {loadPublicMovieHubIndex,runTmdbFirstLinkPilot}
  from './youtube-g2-tmdb-first-link-pilot.mjs'
import {selectExplicitYoutubeBadgedMovies}
  from './youtube-g2-tmdb-first-link-model.mjs'
import {mapFromCandidateCheckpoint}
  from './youtube-g2-durable-candidate-checkpoint.mjs'
import {getSecret,youtubeGet} from './youtube-api-smoke.mjs'
import {
  ONE_SEARCH_QUOTA_KIND,ONE_SEARCH_QUOTA_OUTPUT,ONE_SEARCH_CHECKPOINT,
  ONE_SEARCH_PRIVATE_CANDIDATES,
} from './youtube-g2-one-search-quota-diagnostic.mjs'

export const NO_SEARCH_FOLLOWUP_KIND='moviehub-youtube-g2-one-search-candidate-review'
export const NO_SEARCH_FOLLOWUP_OUTPUT='artifacts/youtube-g2/one-search-candidate-review'
const INPUT_KIND='moviehub-youtube-g2-one-search-private-candidate-hints'
const VID=/^[A-Za-z0-9_-]{11}$/
const MAX_AGE=7*86400000
const validTmdb=id=>Number.isSafeInteger(id)&&id>0
const fail=()=>{throw Error('G2_ONE_SEARCH_REVIEW_SOURCE_UNTRUSTED')}
const readJson=async path=>JSON.parse(await readFile(path,'utf8'))

export function planOneSearchNoSearchReview({
  summary,hints,checkpoint,publicIndex,now=new Date().toISOString(),
}={}){
  const at=Date.parse(now),observed=Date.parse(summary?.generatedAt)
  if(!Number.isFinite(at)||!Number.isFinite(observed)
    ||at-observed< -60000||at-observed>MAX_AGE
    ||summary?.kind!==ONE_SEARCH_QUOTA_KIND
    ||summary.searchCallsAttempted!==1
    ||summary.searchOutcome!=='search-accessible'
    ||summary.googleFailureClass!=='OK'
    ||summary.noAutomaticRetry!==true||summary.privateArtifact!==true
    ||summary.quotaActuallyMeasured!==false||summary.quotaAvailableUnits!==null
    ||summary.independentlyVerifiedDEOffers!==0
    ||summary.confirmedPlaybackRoutes!==0
    ||['firestoreWrites','catalogWrites','providerWrites','badgeWrites']
      .some(k=>summary[k]!==0)
    ||!validTmdb(summary.sampledExactTmdbFilmId)
    ||!Number.isInteger(summary.responseCandidateCount)
    ||summary.responseCandidateCount<0||summary.responseCandidateCount>10
    ||hints?.kind!==INPUT_KIND||hints.schemaVersion!==1
    ||hints.generatedAt!==summary.generatedAt
    ||hints.sampledExactTmdbFilmId!==summary.sampledExactTmdbFilmId
    ||hints.searchCallsAttempted!==1
    ||hints.metadataRechecked!==false
    ||hints.independentDEOffersVerified!==0
    ||hints.publishedPlaybackRoutes!==0
    ||hints.privateArtifact!==true||hints.publicationPermitted!==false
    ||!Array.isArray(hints.videoIds)
    ||hints.videoIds.length<1
    ||hints.videoIds.length>summary.responseCandidateCount
    ||hints.videoIds.some(x=>typeof x!=='string'||!VID.test(x))
    ||new Set(hints.videoIds).size!==hints.videoIds.length)fail()
  const known=mapFromCandidateCheckpoint(checkpoint)
  const tmdbId=hints.sampledExactTmdbFilmId
  if(known.has(tmdbId))fail()
  // Shared checkpoint may contain the same video under a different film:
  // crossing TMDB identities would manufacture a seemingly exact link.
  if([...known.values()].some(ids=>hints.videoIds.some(id=>ids.includes(id))))
    fail()
  const date=Date.parse(publicIndex?.generatedAt)
  if(!Number.isFinite(date)||at-date< -86400000||at-date>30*86400000)
    fail()
  const selection=selectExplicitYoutubeBadgedMovies(publicIndex,
    [{mediaType:'movie',tmdbId}],{limit:1})
  if(selection.selected.length!==1||selection.selected[0].tmdbId!==tmdbId)
    fail()
  return {tmdbId,videoIds:[...hints.videoIds],generatedAt:summary.generatedAt,
    sourceOutcome:summary.searchOutcome,publicBadgeChecked:true,
    checkpointMovieCount:known.size,publicationPermitted:false}
}

export async function reviewOneSearchCandidates({
  summary,hints,checkpoint,publicIndex,tmdbGet,youtubeApi,
  now=new Date().toISOString(),
}={}){
  const plan=planOneSearchNoSearchReview({summary,hints,checkpoint,publicIndex,now})
  if(typeof tmdbGet!=='function'||typeof youtubeApi!=='function')
    throw Error('G2_ONE_SEARCH_REVIEW_READ_ONLY_CALLBACKS_REQUIRED')
  let videoCalls=0,tmdbCalls=0
  const videosOnly=async(path,params)=>{
    if(path!=='videos')throw Error('G2_ONE_SEARCH_REVIEW_SEARCH_FORBIDDEN')
    if(++videoCalls>1
      ||params?.part!=='snippet,contentDetails,status'
      ||!Array.isArray(params.id?.split(','))
      ||params.id.split(',').some(id=>!plan.videoIds.includes(id))
      ||new Set(params.id.split(',')).size!==plan.videoIds.length)
      throw Error('G2_ONE_SEARCH_REVIEW_VIDEO_LOOKUP_NOT_BOUNDED')
    return youtubeApi(path,params)
  }
  const tmdbOnly=async(path,params)=>{
    if(!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path)
      ||++tmdbCalls>3)
      throw Error('G2_ONE_SEARCH_REVIEW_TMDB_LOOKUP_NOT_BOUNDED')
    return tmdbGet(path,params)
  }
  const pilot=await runTmdbFirstLinkPilot({
    publicIndex,seedRefs:[{mediaType:'movie',tmdbId:plan.tmdbId}],limit:1,
    knownVideoCandidatesByTmdbId:new Map([[plan.tmdbId,plan.videoIds]]),
    knownDeviceCandidates:[],tmdbGet:tmdbOnly,youtubeApi:videosOnly,
    searchesPerUncachedMovie:1,now:()=>now,
  })
  const s=pilot.summary,r=pilot.rows[0]
  if(s.processedMovies!==1||s.selectedMovies!==1
    ||s.calls.youtubeSearches!==0
    ||s.calls.youtubeVideoLookups!==videoCalls||videoCalls>1
    ||s.calls.tmdbGetRequests!==tmdbCalls||tmdbCalls>3
    ||s.verifiedDirectLinks!==0||s.publicationPermitted!==false
    ||['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
      .some(k=>s[k]!==0)
    ||pilot.rows.length!==1||r.tmdbId!==plan.tmdbId
    ||r.publicationPermitted!==false||r.directPlaybackRoute!==null
    ||r.reviewedVideoId!==null
    ||r.videoCandidates.some(c=>!plan.videoIds.includes(c.videoId))
    ||(r.tmdbDeOfferTypes.length>0
       &&(r.candidateDiscoveryMode!=='trusted-previous-candidate-ids'
         ||s.knownCandidateReuseMovies!==1||videoCalls!==1)))
    throw Error('G2_ONE_SEARCH_REVIEW_RECONCILIATION_FAILED')
  return {
    summary:{
      kind:NO_SEARCH_FOLLOWUP_KIND,generatedAt:now,
      sourceObservedAt:plan.generatedAt,tmdbId:plan.tmdbId,
      candidateIdsInPrivateInput:plan.videoIds.length,
      currentTmdbDeYoutubeOfferHint:r.tmdbDeOfferTypes.length>0,
      reviewStatus:r.status,recheckedMetadataCount:r.videoCandidates.length,
      youtubeSearchCalls:0,youtubeVideoLookups:videoCalls,tmdbGetRequests:tmdbCalls,
      independentDeOffersVerified:0,verifiedFilmOrCut:false,
      verifiedDePlayback:false,publishedPlaybackRoutes:0,
      catalogWrites:0,firestoreWrites:0,providerWrites:0,
      badgeWrites:0,privateArtifact:true,publicationPermitted:false,
    },
    // This includes candidate IDs/titles/watch URLs. NEVER publish or log it.
    rows:pilot.rows,
  }
}

async function tmdbLive(path,params,token){
  const u=new URL('https://api.themoviedb.org/3'+path)
  for(const [k,v] of Object.entries(params||{}))u.searchParams.set(k,String(v))
  const response=await fetch(u,{headers:{accept:'application/json',
    authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)})
  if(!response.ok)throw Error('G2_ONE_SEARCH_REVIEW_TMDB_HTTP_'+response.status)
  return response.json()
}
export async function liveOneSearchNoSearchReview({
  input=ONE_SEARCH_QUOTA_OUTPUT,checkpointPath=ONE_SEARCH_CHECKPOINT,
  output=NO_SEARCH_FOLLOWUP_OUTPUT,tmdbToken=process.env.TMDB_API_READ_TOKEN,
  youtubeKey,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)
    throw Error('G2_ONE_SEARCH_REVIEW_NO_PRODUCT_WRITES')
  const [summary,hints,checkpoint,publicIndex]=await Promise.all([
    readJson(input+'/summary.json'),
    readJson(input+'/'+ONE_SEARCH_PRIVATE_CANDIDATES),
    readJson(checkpointPath),loadPublicMovieHubIndex(),
  ])
  // Do not access secrets or make YouTube/TMDB calls on untrusted inputs.
  planOneSearchNoSearchReview({summary,hints,checkpoint,publicIndex})
  if(typeof tmdbToken!=='string'||tmdbToken.length<15)
    throw Error('G2_ONE_SEARCH_REVIEW_TMDB_TOKEN_REQUIRED')
  const key=youtubeKey||getSecret()
  const result=await reviewOneSearchCandidates({
    summary,hints,checkpoint,publicIndex,
    tmdbGet:(path,params)=>tmdbLive(path,params,tmdbToken),
    youtubeApi:(path,params)=>youtubeGet(path,params,key),
  })
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/summary.json',JSON.stringify(result.summary,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/qa.private.json',JSON.stringify(result,null,2)+'\n',{mode:0o600}),
  ])
  console.log(JSON.stringify(result.summary))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  liveOneSearchNoSearchReview().catch(e=>{
    console.error('G2 ONE SEARCH NO-SEARCH REVIEW FAILED CLOSED: '+e.message)
    process.exitCode=1
  })
}
