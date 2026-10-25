/**
 * Exactly one previously unknown public TMDB-YouTube-badged movie per run.
 * Every real search must obtain a fresh PT-day Monitoring advisory AND an
 * atomic, pessimistic private adapter budget reservation first.
 *
 * This never grants shared Google quota, verifies a DE offer or publishes a
 * movie. A failed/429 run keeps its reserved call (no refunds/retries).
 */
import {readFile} from 'node:fs/promises'
import {verifyBudgetPreflight,reserveWithAtomicGcs}
  from './youtube-g2-atomic-search-budget-ledger.mjs'

export const ONE_SEARCH_ADMISSION_REPORT=
  'artifacts/youtube-g2/pacific-search-preflight/summary.json'

export function assertExactlyOneNewFilmSearch(plan){
  if(plan?.publicationPermitted!==false
    ||plan.verifiedDEOffers!==0||plan.confirmedDirectLinks!==0
    ||plan.batch?.selectedCount!==1||plan.plan?.length!==1
    ||plan.batch.plannedSearchesPerUncachedMovie!==1
    ||plan.batch.youtubeSearchCallsPlanned!==1
    ||plan.batch.estimatedYoutubeSearchQuotaUnits!==1
    ||plan.batch.knownCandidateReuseMovies!==0
    ||plan.batch.realYoutubeApiRequestsPerformed!==0
    ||plan.plan[0]?.mediaType!=='movie'
    ||plan.plan[0]?.exactPublicYoutubeBadge!==true
    ||!Number.isSafeInteger(plan.plan[0]?.tmdbId)
    ||plan.plan[0].tmdbId<1
    ||plan.plan[0]?.confirmedVideoId!==null
    ||plan.plan[0]?.playbackRoute!==null
    ||plan.plan[0]?.publicationPermitted!==false
    ||['catalogWrites','firestoreWrites','providerWrites',
      'badgeWrites','nightlyWrites'].some(key=>plan[key]!==0))
    throw Error('G2_ONE_NEW_MOVIE_RESEARCH_PLAN_NOT_SAFE')
  return plan.plan[0].tmdbId
}

export async function admitExactlyOneYoutubeSearch({
  plan,preflight,now=new Date().toISOString(),runId,
  bucket,reserve=reserveWithAtomicGcs,
}={}){
  const tmdbId=assertExactlyOneNewFilmSearch(plan)
  verifyBudgetPreflight(preflight,{now})
  if(!Number.isSafeInteger(runId)||runId<1
    ||typeof reserve!=='function'||!bucket
    ||bucket.name!=='movie-hub-62459-nightly-checkpoints')
    throw Error('G2_ONE_SEARCH_RESERVATION_CONTEXT_REQUIRED')
  const result=await reserve(bucket,{now,runId,calls:1,preflight})
  if(result?.runId!==runId||result.reservationCalls!==1
    ||result.globalGoogleQuotaGuaranteed!==false
    ||result.automaticallyCallYoutube!==false
    ||result.youtubeSearchCallsPerformed!==0
    ||result.providerWrites!==0)
    throw Error('G2_ONE_SEARCH_GCS_ADMISSION_READBACK_INVALID')
  return {
    tmdbId,runId,maximumSearchAttempts:1,
    quotaIsSharedAndNotGuaranteed:true,
    internalReservationRecorded:true,
    noAutomaticRetries:true,offerApproval:false,
  }
}

export async function admitPreparedOneSearchPlan({
  plan,reportPath=ONE_SEARCH_ADMISSION_REPORT,
  now=new Date().toISOString(),runId=Number(process.env.GITHUB_RUN_ID),
}={}){
  const tmdbId=assertExactlyOneNewFilmSearch(plan)
  if(process.env.YOUTUBE_G2_WRITE_MODE
    ||process.env.DATA_CHECKPOINT_BUCKET!=='movie-hub-62459-nightly-checkpoints'
    ||!Number.isSafeInteger(runId)||runId<1)
    throw Error('G2_ONE_SEARCH_LIVE_CLOUD_CONTEXT_REJECTED')
  const preflight=JSON.parse(await readFile(reportPath,'utf8'))
  verifyBudgetPreflight(preflight,{now})
  const [{applicationDefault,initializeApp,deleteApp},{getStorage}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/storage')])
  const app=initializeApp({credential:applicationDefault(),
    projectId:'movie-hub-62459'},'youtube-g2-one-guarded-search')
  try{
    const bucket=getStorage(app).bucket(process.env.DATA_CHECKPOINT_BUCKET)
    const admitted=await admitExactlyOneYoutubeSearch({
      plan,preflight,now:new Date().toISOString(),runId,bucket,
    })
    if(admitted.tmdbId!==tmdbId)throw Error('G2_ADMITTED_MOVIE_CHANGED')
    return admitted
  }finally{
    await deleteApp(app)
  }
}
