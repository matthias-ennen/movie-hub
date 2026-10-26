/**
 * G2 private overflow recheck: existing video IDs ONLY (never YouTube search).
 * Manual research gate until a real GCS/API run is verified. The 250-film
 * baseline and the public Best-Effort link source are not modified.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {
  planOverflowRotation,advanceOverflowCursor,loadOverflowCursor,
  saveOverflowCursor,
} from './youtube-g2-overflow-rotation-cursor.mjs'
import {mapFromCandidateCheckpoint,loadDurableCandidateCheckpoint}
  from './youtube-g2-durable-candidate-checkpoint.mjs'
import {loadPublicMovieHubIndex,runTmdbFirstLinkPilot}
  from './youtube-g2-tmdb-first-link-pilot.mjs'
import {getSecret,youtubeGet} from './youtube-api-smoke.mjs'

export const OVERFLOW_QA_KIND='moviehub-youtube-g2-private-overflow-live-recheck'
export const OVERFLOW_QA_PREFIX='youtube-g2/private-overflow-review/v1/runs'
export const OVERFLOW_OUTPUT='artifacts/youtube-g2/overflow-recheck/summary.json'
export const MAX_OVERFLOW_TMDB_CALLS=60
export const MAX_OVERFLOW_VIDEOS_CALLS=5
const BUCKET='movie-hub-62459-nightly-checkpoints'
const id=x=>Number.isSafeInteger(x)&&x>0
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))
const video=/^[a-zA-Z0-9_-]{11}$/
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex')

async function persistPrivateQa(bucket,runId,doc){
  if(bucket?.name!==BUCKET||typeof bucket.file!=='function'||!id(runId)
    ||doc?.kind!==OVERFLOW_QA_KIND||doc?.schemaVersion!==1
    ||doc?.summary?.searchCalls!==0||doc?.summary?.verifiedDEOffers!==0
    ||doc?.summary?.productionWrites!==0||!Array.isArray(doc.rows)
    ||doc.rows.length<1||doc.rows.length>25)
    throw Error('G2_OVERFLOW_PRIVATE_QA_INVALID')
  const name=OVERFLOW_QA_PREFIX+'/'+runId+'.json'
  const bytes=Buffer.from(JSON.stringify(doc)+'\n','utf8')
  if(bytes.length>2_000_000)
    throw Error('G2_OVERFLOW_PRIVATE_QA_TOO_LARGE')
  await bucket.file(name).save(bytes,{resumable:false,
    contentType:'application/json',
    preconditionOpts:{ifGenerationMatch:0}})
  const [readback]=await bucket.file(name).download()
  if(!Buffer.isBuffer(readback)||sha256(readback)!==sha256(bytes))
    throw Error('G2_OVERFLOW_QA_READBACK_FAILED')
  return {saved:true,bytes:bytes.length}
}
export async function runOverflowLiveReview({
  checkpoint,publicIndex,bucket,tmdbGet,youtubeApi,runId,
  now=new Date().toISOString(),pilot=runTmdbFirstLinkPilot,
}={}){
  if(bucket?.name!==BUCKET||typeof bucket.file!=='function'
    ||!id(runId)||!iso(now)
    ||typeof tmdbGet!=='function'||typeof youtubeApi!=='function'
    ||typeof pilot!=='function')
    throw Error('G2_OVERFLOW_CONTEXT_INVALID')
  const current=await loadOverflowCursor(bucket)
  const plan=planOverflowRotation({
    checkpoint,publicIndex,cursor:current.cursor,now,
  })
  const base={
    kind:OVERFLOW_QA_KIND,generatedAt:now,runId,
    sharedCheckpointCandidateFilms:plan.checkpointFilms,
    stableBaselineFilms:plan.baselineFilms,
    deferredCandidateFilms:plan.deferredFilms,
    collisionQuarantineFilms:plan.collisionQuarantineFilms,
    eligibleOverflowFilms:plan.eligibleOverflowFilms,
    selectedMovies:plan.selectedIds.length,
    alreadyReviewedToday:plan.alreadyReviewedToday,
    reviewMode:'private-overflow-not-published',
    searchCalls:0,videosListCalls:0,tmdbCalls:0,
    verifiedDEOffers:0,publishedDirectRoutes:0,
    productionWrites:0,publicationPermitted:false,
    privateQaStored:false,cursorAdvanced:false,
  }
  if(!plan.selectedIds.length)
    return {...base,status:plan.alreadyReviewedToday?'already-reviewed-today':'no-eligible-overflow'}

  const all=mapFromCandidateCheckpoint(checkpoint)
  const known=new Map(plan.selectedIds.map(tmdbId=>[tmdbId,all.get(tmdbId)]))
  if(known.size!==plan.selectedIds.length
    ||[...known.values()].some(x=>!Array.isArray(x)||!x.length
      ||x.length>10||x.some(v=>!video.test(v))))
    throw Error('G2_OVERFLOW_KNOWN_VIDEO_SOURCE_MISSING')
  let tmdbCalls=0,videosListCalls=0
  const guardedTmdb=(path,params)=>{
    if(!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path)
      ||++tmdbCalls>MAX_OVERFLOW_TMDB_CALLS)
      throw Error('G2_OVERFLOW_TMDB_BUDGET_OR_ENDPOINT')
    return tmdbGet(path,params)
  }
  const guardedYoutube=(endpoint,params)=>{
    if(endpoint!=='videos'||++videosListCalls>MAX_OVERFLOW_VIDEOS_CALLS)
      throw Error('G2_OVERFLOW_YOUTUBE_SEARCH_FORBIDDEN_OR_VIDEO_BUDGET')
    const raw=String(params?.id??'').split(',')
    if(raw.length<1||raw.length>50||raw.some(x=>!video.test(x))
      ||raw.some(x=>![...known.values()].some(ids=>ids.includes(x))))
      throw Error('G2_OVERFLOW_VIDEO_ID_NOT_IN_CHECKPOINT')
    return youtubeApi(endpoint,params)
  }
  const result=await pilot({
    publicIndex,limit:plan.selectedIds.length,
    seedRefs:plan.selectedIds.map(tmdbId=>({mediaType:'movie',tmdbId})),
    knownVideoCandidatesByTmdbId:known,knownDeviceCandidates:[],
    now:()=>now,tmdbGet:guardedTmdb,youtubeApi:guardedYoutube,
  })
  const s=result?.summary,rows=result?.rows
  if(s?.processedMovies!==plan.selectedIds.length
    ||s?.publicationPermitted!==false||s?.verifiedDirectLinks!==0
    ||s?.calls?.youtubeSearches!==0
    ||s?.calls?.youtubeVideoLookups!==videosListCalls
    ||s?.calls?.tmdbGetRequests!==tmdbCalls
    ||s?.catalogWrites!==0||s?.firestoreWrites!==0
    ||s?.providerWrites!==0||s?.badgeWrites!==0
    ||!Array.isArray(rows)||rows.length!==plan.selectedIds.length
    ||new Set(rows.map(x=>x.tmdbId)).size!==rows.length
    ||rows.some((r,i)=>r?.tmdbId!==plan.selectedIds[i]
      ||r?.candidateDiscoveryMode==='new-search'
      ||r?.publicationPermitted!==false
      ||r?.directPlaybackRoute!==null||r?.reviewedVideoId!==null
      ||!Array.isArray(r.videoCandidates)||r.videoCandidates.length>10
      ||r.videoCandidates.some(candidate=>
        !known.get(r.tmdbId)?.includes(candidate?.videoId))
      ||typeof r.status!=='string'
      ||!(/^[a-z0-9-]{1,60}$/).test(r.status)))
    throw Error('G2_OVERFLOW_RESEARCH_NOT_SAFE')
  // Do not claim an offer, or make public link artifacts from this result.
  const precommitSummary={...base,status:'review-complete-awaiting-cursor',
    videosListCalls,tmdbCalls,
    reviewStatuses:Object.fromEntries([...new Set(rows.map(x=>x.status))]
      .sort().map(status=>[status,rows.filter(x=>x.status===status).length])),
    privateQaStored:true,cursorAdvanced:false,
  }
  // Immutable PRIVATE GCS evidence is committed *before* cursor advance.
  // A failure or CAS race leaves the cursor unchanged; no public artifacts.
  await persistPrivateQa(bucket,runId,{
    kind:OVERFLOW_QA_KIND,schemaVersion:1,generatedAt:now,
    summary:precommitSummary,rows,
  })
  const next=advanceOverflowCursor(current.cursor,plan,{now})
  const saved=await saveOverflowCursor(bucket,next,{
    expectedGeneration:current.generation,
  })
  if(saved.cursor.lastTmdbId!==plan.selectedIds.at(-1)
    ||saved.cursor.reviewedFilms!==(current.cursor?.reviewedFilms??0)
      +plan.selectedIds.length)
    throw Error('G2_OVERFLOW_CURSOR_COMMIT_READBACK_INVALID')
  return {...precommitSummary,status:'review-complete',cursorAdvanced:true}
}
async function tmdbLive(path,params={},token){
  if(!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path))
    throw Error('G2_OVERFLOW_TMDB_ENDPOINT_FORBIDDEN')
  const url=new URL('https://api.themoviedb.org/3'+path)
  for(const [name,value] of Object.entries(params))
    url.searchParams.set(name,String(value))
  const response=await fetch(url,{
    headers:{accept:'application/json',authorization:'Bearer '+token},
    signal:AbortSignal.timeout(20000),
  })
  if(!response.ok)throw Error('G2_OVERFLOW_TMDB_HTTP_ERROR')
  return response.json()
}
export async function liveOverflowReview({
  token=process.env.TMDB_API_READ_TOKEN,
  runId=Number(process.env.GITHUB_RUN_ID),
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE||!id(runId)
    ||process.env.DATA_CHECKPOINT_BUCKET!==BUCKET
    ||typeof token!=='string'||token.length<15)
    throw Error('G2_OVERFLOW_LIVE_CONTEXT_INVALID')
  const [{applicationDefault,initializeApp,deleteApp},{getStorage}]=
    await Promise.all([import('firebase-admin/app'),import('firebase-admin/storage')])
  const app=initializeApp({credential:applicationDefault(),
    projectId:'movie-hub-62459'},'youtube-g2-private-overflow-recheck')
  try{
    const bucket=getStorage(app).bucket(BUCKET)
    const [known,publicIndex]=await Promise.all([
      loadDurableCandidateCheckpoint(bucket),loadPublicMovieHubIndex(),
    ])
    if(!known.checkpoint)throw Error('G2_OVERFLOW_CANDIDATES_NOT_BOOTSTRAPPED')
    let apiKey
    const summary=await runOverflowLiveReview({
      checkpoint:known.checkpoint,publicIndex,bucket,runId,
      now:new Date().toISOString(),
      tmdbGet:(path,params)=>tmdbLive(path,params,token),
      youtubeApi:(endpoint,params)=>{
        apiKey??=getSecret()
        return youtubeGet(endpoint,params,apiKey)
      },
    })
    await mkdir('artifacts/youtube-g2/overflow-recheck',{recursive:true})
    await writeFile(OVERFLOW_OUTPUT,JSON.stringify(summary,null,2)+'\n',{mode:0o600})
    // Only whitelist aggregate results on the public Actions console.
    console.log(JSON.stringify({
      status:summary.status,selected:summary.selectedMovies,
      videosListCalls:summary.videosListCalls,searchCalls:0,
      productionWrites:0,verifiedDEOffers:0,
    }))
    return summary
  }finally{
    await deleteApp(app)
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  liveOverflowReview().catch(()=>{
    // Never output raw API/GCS exception text or private candidate IDs.
    console.error('G2 PRIVATE OVERFLOW RECHECK FAILED CLOSED')
    process.exitCode=1
  })
}
