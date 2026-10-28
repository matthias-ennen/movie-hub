/**
 * Scheduled, strictly read-only nightly discovery of previously unknown
 * PUBLIC YouTube-badged TMDB movies. Uses one PT-day GCS CAS reservation,
 * never Google-project quota guarantees. Progress survives crashes in a
 * private CAS queue; candidate VIDEO IDs are stored only in the private,
 * checksummed known-candidates checkpoint.
 *
 * This makes no DE-offer, film-cut, rights or playback-route approvals.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet} from './youtube-api-smoke.mjs'
import {loadPublicMovieHubIndex,runTmdbFirstLinkPilot}
  from './youtube-g2-tmdb-first-link-pilot.mjs'
import {exactYoutubeProviderIds,exactDeYoutubeOfferTypes}
  from './youtube-g2-tmdb-first-link-model.mjs'
import {
  loadDurableCandidateCheckpoint,mergeCandidateCheckpoint,
  saveDurableCandidateCheckpoint,
} from './youtube-g2-durable-candidate-checkpoint.mjs'
import {
  loadNightlyQueue,putNightlyResult,saveNightlyQueue,
  selectNightlyPublicBadgeMovies,
} from './youtube-g2-nightly-queue.mjs'
import {pacificSearchDay}
  from './youtube-g2-pacific-search-preflight.mjs'
import {recoverNightlyFailureReport,classifyNightlyFailure}
  from './youtube-g2-nightly-failure-report.mjs'
import {
  verifyBudgetPreflight,isDegradedOneSearchPreflight,
  loadBudgetLedger,reserveWithAtomicGcs,ADAPTER_SEARCH_DAY_CAP,
  DEGRADED_ONE_SEARCH_DAY_CAP,
} from './youtube-g2-atomic-search-budget-ledger.mjs'

export const NIGHTLY_DISCOVERY_REPORT='artifacts/youtube-g2/nightly-discovery/summary.json'
export const NIGHTLY_MAX_TMDB_PREFLIGHT_MOVIES=60
export const NIGHTLY_MIN_SEARCH_INTERVAL_MS=20000
export const NIGHTLY_TMDB_MAX_REQUESTS=1+NIGHTLY_MAX_TMDB_PREFLIGHT_MOVIES+3*ADAPTER_SEARCH_DAY_CAP
const isId=x=>Number.isSafeInteger(x)&&x>0
const sleep=ms=>new Promise(done=>setTimeout(done,ms))
function redactedSummary(summary){
  return {
    kind:'moviehub-youtube-g2-nightly-budgeted-discovery',
    ...summary,independentlyVerifiedDEOffers:0,publicationPermitted:false,
    publishedPlaybackRoutes:0,firestoreWrites:0,providerWrites:0,
    catalogWrites:0,badgeWrites:0,
  }
}

/** All live Google/Cloud API clients are injected so no network is used by unit tests. */
export async function runNightlyDiscovery({
  publicIndex,bucket,tmdbGet,youtubeApi,
  preflight,runId,now=()=>new Date().toISOString(),
  wait=sleep,
}={}){
  if(!isId(runId)||typeof now!=='function'||typeof wait!=='function'
    ||typeof tmdbGet!=='function'||typeof youtubeApi!=='function'
    ||bucket?.name!=='movie-hub-62459-nightly-checkpoints')
    throw Error('G2_NIGHTLY_RUNNER_CONTEXT_INVALID')
  const startedAt=now()
  const degradedOneSearch=isDegradedOneSearchPreflight(preflight,{now:startedAt})
  const day=degradedOneSearch
    ?pacificSearchDay(startedAt)
    :verifyBudgetPreflight(preflight,{now:startedAt})
  const current=await loadBudgetLedger(bucket,day)
  const remaining=ADAPTER_SEARCH_DAY_CAP-
    (current.ledger?.totalConservativelyReserved||0)
  // The unmeasured mode is ONE attempt per PT day across ALL cooperating
  // workflows, not one attempt per GitHub run. A prior manual reservation
  // consumes the same degraded-mode allowance.
  const runCapacity=degradedOneSearch
    ?(current.ledger?.totalConservativelyReserved?0:DEGRADED_ONE_SEARCH_DAY_CAP)
    :remaining
  if(!Number.isInteger(remaining)||remaining<0||remaining>ADAPTER_SEARCH_DAY_CAP)
    throw Error('G2_NIGHTLY_DAILY_BUDGET_INVALID')
  let progress=await loadNightlyQueue(bucket)
  let candidates=await loadDurableCandidateCheckpoint(bucket)
  if(!candidates.checkpoint)
    throw Error('G2_NIGHTLY_PRIVATE_CANDIDATES_NOT_BOOTSTRAPPED')
  const plan=selectNightlyPublicBadgeMovies({
    publicIndex,checkpoint:candidates.checkpoint,progress:progress.queue,
    now:startedAt,limit:NIGHTLY_MAX_TMDB_PREFLIGHT_MOVIES,
  })
  const base={
    pacificDate:day.date,dayLimit:ADAPTER_SEARCH_DAY_CAP,
    quotaMode:degradedOneSearch?'one-call-unmeasured-no-quota-guarantee'
      :'observed-monitoring-guarded',
    priorReserved:ADAPTER_SEARCH_DAY_CAP-remaining,
    publicBadgeFilms:plan.totalPublicBadgeMovies,
    previouslyKnownVideoFilms:plan.knownCandidateMovies,
    stillEligible:plan.pendingMovies,checkedNoOffer:0,
    selectedForSearch:0,searchCalls:0,videoDetailCalls:0,
    savedNewCandidateFilms:0,finishedWithoutCandidates:0,
    status:runCapacity===0?'daily-budget-exhausted':
      plan.pendingMovies===0?'no-unknown-public-films':'pending',
  }
  if(runCapacity===0||!plan.movieIds.length)
    return redactedSummary(base)

  let tmdbReads=0
  const guardedTmdb=async(path,params)=>{
    if(!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path)
      ||++tmdbReads>NIGHTLY_TMDB_MAX_REQUESTS)
      throw Error('G2_NIGHTLY_TMDB_ENDPOINT_OR_BUDGET_EXCEEDED')
    return tmdbGet(path,params)
  }
  // Qualify cheaper DE provider hints first. Do not reserve quota for
  // movies that presently do not even have a DE YouTube provider hint.
  const directory=await guardedTmdb('/watch/providers/movie',{
    language:'de-DE',watch_region:'DE',
  })
  const youtubeProviderIds=exactYoutubeProviderIds(directory)
  if(!youtubeProviderIds.length)throw Error('G2_NIGHTLY_TMDB_YOUTUBE_PROVIDER_MISSING')
  const eligible=[],noOffer=[]
  for(const tmdbId of plan.movieIds){
    const snap=await guardedTmdb('/movie/'+tmdbId+'/watch/providers',{})
    if(exactDeYoutubeOfferTypes(snap,youtubeProviderIds).length){
      eligible.push(tmdbId)
      if(eligible.length>=runCapacity)break
    }else noOffer.push(tmdbId)
  }

  // Record negative DE provider snapshots as resumable work (30-day TTL).
  // No YouTube call can happen in this section.
  if(noOffer.length){
    let doc=progress.queue
    for(const tmdbId of noOffer)
      doc=putNightlyResult(doc,{tmdbId,state:'no-current-offer',
        runId,now:now()})
    progress=await saveNightlyQueue(bucket,doc,{
      expectedGeneration:progress.generation,
    })
  }
  base.checkedNoOffer=noOffer.length
  if(!eligible.length)
    return redactedSummary({...base,status:'no-current-offer-candidates'})

  // The reservation is pessimistic (NOT refunded for 403/429, a skip or
  // crash). This is the SAME GCS PT-day ledger as manual 5 and 1 searches.
  const allocation=Math.min(eligible.length,runCapacity)
  const admitted=await reserveWithAtomicGcs(bucket,{
    now:now(),runId,calls:allocation,preflight,degradedOneSearch,
  })
  if(admitted.reservationCalls!==allocation
    ||admitted.globalGoogleQuotaGuaranteed!==false
    ||admitted.automaticallyCallYoutube!==false
    ||admitted.youtubeSearchCallsPerformed!==0)
    throw Error('G2_NIGHTLY_RESERVATION_READBACK_INVALID')
  const report={...base,selectedForSearch:allocation,
    status:'research-in-progress'}
  let lastSearchAt=null,videoDetailCalls=0,actualSearches=0
  for(const tmdbId of eligible.slice(0,allocation)){
    if(pacificSearchDay(now()).date!==day.date)
      throw Error('G2_NIGHTLY_PACIFIC_DAY_CHANGED_MID_RUN')
    // CAS persists "started" BEFORE network work. A killed job skips this
    // film for 2 days before retry, rather than silently resetting cursor.
    progress=await saveNightlyQueue(bucket,putNightlyResult(progress.queue,{
      tmdbId,state:'started',runId,now:now(),
    }),{expectedGeneration:progress.generation})
    const pilot=await runTmdbFirstLinkPilot({
      publicIndex,seedRefs:[{mediaType:'movie',tmdbId}],limit:1,
      knownDeviceCandidates:[],knownVideoCandidatesByTmdbId:new Map(),
      searchesPerUncachedMovie:1,now,
      tmdbGet:guardedTmdb,
      youtubeApi:async(endpoint,params)=>{
        if(pacificSearchDay(now()).date!==day.date)
          throw Error('G2_NIGHTLY_PACIFIC_DAY_CHANGED_MID_RUN')
        if(endpoint==='search'){
          if(actualSearches>=allocation)
            throw Error('G2_NIGHTLY_SEARCH_RESERVATION_EXCEEDED')
          if(lastSearchAt!==null){
            const pause=Math.max(0,NIGHTLY_MIN_SEARCH_INTERVAL_MS-
              (Date.now()-lastSearchAt))
            if(pause>0)await wait(pause)
          }
          // Count BEFORE transport; never auto-retry 403/429.
          lastSearchAt=Date.now()
          actualSearches++
        }else if(endpoint==='videos'){
          if(++videoDetailCalls>allocation)
            throw Error('G2_NIGHTLY_VIDEO_DETAILS_EXCEEDED')
        }else throw Error('G2_NIGHTLY_YOUTUBE_ENDPOINT_FORBIDDEN')
        return youtubeApi(endpoint,params)
      },
    })
    if(pilot.rows.length!==1||pilot.rows[0].tmdbId!==tmdbId
      ||pilot.summary.calls.youtubeSearches>1
      ||pilot.summary.calls.youtubeVideoLookups>1
      ||pilot.summary.publicationPermitted!==false
      ||pilot.summary.verifiedDirectLinks!==0
      ||pilot.rows[0].publicationPermitted!==false
      ||pilot.rows[0].directPlaybackRoute!==null
      ||pilot.rows[0].reviewedVideoId!==null
      ||pilot.summary.firestoreWrites!==0
      ||pilot.summary.providerWrites!==0
      ||pilot.summary.catalogWrites!==0
      ||pilot.summary.badgeWrites!==0)
      throw Error('G2_NIGHTLY_PILOT_UNSAFE')
    const row=pilot.rows[0]
    if(row.videoCandidates.length){
      const planEnvelope={
        publicationPermitted:false,verifiedDEOffers:0,confirmedDirectLinks:0,
        catalogWrites:0,firestoreWrites:0,providerWrites:0,
        badgeWrites:0,nightlyWrites:0,
        plan:[{tmdbId}],batch:{selectedCount:1},
      }
      const merged=mergeCandidateCheckpoint(candidates.checkpoint,{
        plan:planEnvelope,pilot,
      },{runId,now:now()})
      await saveDurableCandidateCheckpoint(bucket,merged.checkpoint,{
        expectedGeneration:candidates.generation,
      })
      candidates=await loadDurableCandidateCheckpoint(bucket)
      report.savedNewCandidateFilms+=merged.newMovies
    }else report.finishedWithoutCandidates++
    progress=await saveNightlyQueue(bucket,putNightlyResult(progress.queue,{
      tmdbId,state:row.videoCandidates.length?
        'known-candidate':'no-video-candidates',runId,now:now(),
    }),{expectedGeneration:progress.generation})
    report.searchCalls=actualSearches
    report.videoDetailCalls=videoDetailCalls
  }
  return redactedSummary({...report,status:'completed',
    unusedReservedSearches:allocation-actualSearches,
    checkedTmdbReads:tmdbReads})
}

async function tmdbLive(path,params,token){
  const url=new URL('https://api.themoviedb.org/3'+path)
  for(const [key,value] of Object.entries(params||{}))
    url.searchParams.set(key,String(value))
  const response=await fetch(url,{
    headers:{accept:'application/json',authorization:'Bearer '+token},
    signal:AbortSignal.timeout(20000),
  })
  if(!response.ok)throw Error('G2_NIGHTLY_TMDB_HTTP_'+response.status)
  return response.json()
}
export async function liveNightlyDiscovery({
  token=process.env.TMDB_API_READ_TOKEN,
  preflightPath='artifacts/youtube-g2/pacific-search-preflight/summary.json',
  runId=Number(process.env.GITHUB_RUN_ID),
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE
    ||process.env.DATA_CHECKPOINT_BUCKET!=='movie-hub-62459-nightly-checkpoints'
    ||!isId(runId)||typeof token!=='string'||token.length<15)
    throw Error('G2_NIGHTLY_LIVE_CLOUD_CONTEXT_INVALID')
  const preflight=JSON.parse(await readFile(preflightPath,'utf8'))
  verifyBudgetPreflight(preflight,{now:new Date().toISOString()})
  const [{applicationDefault,initializeApp,deleteApp},{getStorage}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/storage')])
  const app=initializeApp({credential:applicationDefault(),
    projectId:'movie-hub-62459'},'youtube-g2-nightly-budgeted-discovery')
  try{
    const bucket=getStorage(app).bucket(process.env.DATA_CHECKPOINT_BUCKET)
    // Load public index and preflight before touching the API key.
    const publicIndex=await loadPublicMovieHubIndex()
    let apiKey
    const guardedYoutube=async(path,params)=>{
      apiKey??=getSecret()
      return youtubeGet(path,params,apiKey)
    }
    const summary=await runNightlyDiscovery({
      publicIndex,bucket,preflight,runId,
      tmdbGet:(p,q)=>tmdbLive(p,q,token),youtubeApi:guardedYoutube,
    })
    await mkdir('artifacts/youtube-g2/nightly-discovery',{recursive:true})
    await writeFile(NIGHTLY_DISCOVERY_REPORT,
      JSON.stringify(summary,null,2)+'\n',{mode:0o600})
    console.log(JSON.stringify(summary))
    return summary
  }finally{
    await deleteApp(app)
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  liveNightlyDiscovery().catch(async error=>{
    // Keep the real execution FAILED. An anonymized, read-only recovery
    // snapshot lets operators see durable progress without claiming a
    // precise YouTube request count after a crash / 429 / IAM outage.
    console.error('G2 NIGHTLY DISCOVERY FAILED CLOSED: '+
      classifyNightlyFailure(error))
    try{
      await recoverNightlyFailureReport({error})
    }catch{
      console.error('G2 NIGHTLY RECOVERY AUDIT UNAVAILABLE')
    }
    process.exitCode=1
  })
}
