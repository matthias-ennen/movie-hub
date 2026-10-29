/**
 * Best-effort, READ-ONLY recovery of durable nightly research state on error.
 *
 * A failed runner must remain FAILED. This report exposes counts only, never
 * personal data, film IDs, video IDs, raw errors, secrets or watch URLs.
 * GCS reservations are evidence of allocated attempts, NOT proof an external
 * YouTube request actually happened. Never infer actual searches from them.
 */
import {mkdir,writeFile} from 'node:fs/promises'
import {loadSearchJournal,validateSearchJournal}
  from './youtube-g2-nightly-search-journal.mjs'
import {dirname} from 'node:path'
import {pacificSearchDay} from './youtube-g2-pacific-search-preflight.mjs'
import {NIGHTLY_QUOTA_OBSERVATION_SAFETY_CAP,loadBudgetLedger,validateBudgetLedger}
  from './youtube-g2-atomic-search-budget-ledger.mjs'
import {loadNightlyQueue,validateNightlyQueue}
  from './youtube-g2-nightly-queue.mjs'
import {loadDurableCandidateCheckpoint,validateCandidateCheckpoint}
  from './youtube-g2-durable-candidate-checkpoint.mjs'

export const FAILURE_REPORT_PATH='artifacts/youtube-g2/nightly-discovery/summary.json'

export function classifyNightlyFailure(error){
  const message=String(error?.message||'')
  // Do not call a Cloud Storage 429 or RESOURCE_EXHAUSTED a YouTube rate-limit.
  if(/^YouTube API: HTTP (?:403|429) bei search \[(?:RATE_LIMITED|RATE_LIMIT_OR_QUOTA_UNCLASSIFIED|QUOTA_OR_RATE_LIMIT)\]/.test(message))
    return 'youtube-rate-limit'
  if(/^YouTube API: HTTP 403 bei search \[QUOTA_EXHAUSTED\]/.test(message))
    return 'youtube-quota-exhausted-unexpected'
  if(/^YouTube API:/.test(message)
    ||/(?:^|\b)(?:403|PERMISSION_DENIED|UNAUTHENTICATED)(?:\b|_)/i.test(message))
    return 'authorization-or-api-block'
  if(/(?:CAS|GENERATION|READBACK|\b412\b|PRECONDITION)/i.test(message))
    return 'checkpoint-consistency'
  if(/(?:RESOURCE_EXHAUSTED|\b429\b|GCS|STORAGE|DOWNLOAD|UPLOAD)/i.test(message))
    return 'checkpoint-storage-transient'
  if(/(?:PREFLIGHT|MONITOR|TELEMETRY|QUOTA)/i.test(message))
    return 'quota-preflight-or-monitoring'
  if(/(?:TMDB)/i.test(message))return 'tmdb-source'
  return 'other-unclassified'
}

export function buildFailedNightlySummary({
  now=new Date().toISOString(),runId,ledger=null,queue=null,
  checkpoint=null,journal=null,realQuotaMode=false,error=null,
}={}){
  const day=pacificSearchDay(now)
  if(realQuotaMode){
    const valid=journal===null?null:validateSearchJournal(journal,{day,runId})
    const progress=queue===null?null:validateNightlyQueue(queue)
    const candidates=checkpoint===null?null:validateCandidateCheckpoint(checkpoint)
    const thisRun=progress?.entries.filter(r=>r.runId===runId)??[]
    return {
      kind:'moviehub-youtube-g2-nightly-budgeted-discovery',
      status:'failed',failureCategory:classifyNightlyFailure(error),
      quotaMode:'google-enforced-no-internal-daily-cap',
      pacificDate:day.date,dayLimit:null,priorReserved:null,
      sharedDayReserved:null,googleProjectRemaining:null,
      quotaExceededConfirmed:valid?.quotaRejected===1,
      selectedForSearch:valid?.attempts??null,
      searchCalls:valid?.attempts??null,
      successfulSearchCalls:valid?.successful??null,
      rateLimitResponses:valid?.rateLimited??null,
      uncertainSearchAttempts:valid===null?null:
        valid.uncertain+valid.pendingAttempts,
      durableAttemptCountKnown:valid!==null,
      actualSearchCallsMeasured:false,
      videoDetailCalls:null,checkedTmdbReads:null,
      savedNewCandidateFilms:null,finishedWithoutCandidates:null,
      runStartedFilms:progress===null?null:thisRun.length,
      runCompletedFilms:progress===null?null:
        thisRun.filter(r=>r.state!=='started').length,
      runUnfinishedFilms:progress===null?null:
        thisRun.filter(r=>r.state==='started').length,
      privateKnownCandidateFilmCount:candidates?.entries.length??null,
      ledgerReadbackAvailable:valid!==null,
      journalReadbackAvailable:valid!==null,
      cursorReadbackAvailable:progress!==null,
      candidateReadbackAvailable:candidates!==null,
      independentlyVerifiedDEOffers:0,publicationPermitted:false,
      publishedPlaybackRoutes:0,firestoreWrites:0,providerWrites:0,
      catalogWrites:0,badgeWrites:0,
    }
  }
  // Missing or unavailable GCS evidence is UNKNOWN, never silently zero.
  const budget=ledger===null?null:validateBudgetLedger(ledger,day)
  const progress=queue===null?null:validateNightlyQueue(queue)
  const candidates=checkpoint===null?null:validateCandidateCheckpoint(checkpoint)
  const safeRun=Number.isSafeInteger(runId)&&runId>0?runId:null
  const own=safeRun===null?null:
    budget?.reservations.find(r=>r.runId===safeRun)??null
  const thisRun=safeRun===null?[]:
    progress?.entries.filter(r=>r.runId===safeRun)??[]
  const completed=thisRun.filter(r=>r.state!=='started').length
  const started=thisRun.filter(r=>r.state==='started').length
  const total=budget?.totalConservativelyReserved??null
  const ownCalls=budget===null?null:(own?.calls??0)
  return {
    kind:'moviehub-youtube-g2-nightly-budgeted-discovery',
    status:'failed',failureCategory:classifyNightlyFailure(error),
    pacificDate:day.date,dayLimit:NIGHTLY_QUOTA_OBSERVATION_SAFETY_CAP,
    quotaExceededConfirmed:false,successfulSearchCalls:null,
    priorReserved:total===null?null:total-ownCalls,
    selectedForSearch:ownCalls,
    sharedDayReserved:total,
    // Only a successful in-process final report can know actual API attempts.
    searchCalls:null,actualSearchCallsMeasured:false,
    videoDetailCalls:null,checkedTmdbReads:null,
    savedNewCandidateFilms:null,finishedWithoutCandidates:null,
    runStartedFilms:progress===null?null:thisRun.length,
    runCompletedFilms:progress===null?null:completed,
    runUnfinishedFilms:progress===null?null:started,
    privateKnownCandidateFilmCount:candidates?.entries.length??null,
    ledgerReadbackAvailable:budget!==null,
    cursorReadbackAvailable:progress!==null,
    candidateReadbackAvailable:candidates!==null,
    independentlyVerifiedDEOffers:0,publicationPermitted:false,
    publishedPlaybackRoutes:0,firestoreWrites:0,providerWrites:0,
    catalogWrites:0,badgeWrites:0,
  }
}

/** Read every source independently. A partial GCS outage must still produce
 * an honest anonymized report; NEVER mutate any stored checkpoint or ledger.
 */
export async function saveFailedNightlyReport({
  bucket=null,runId,error,now=new Date().toISOString(),
  output=FAILURE_REPORT_PATH,realQuotaMode=false,
}={}){
  let ledger=null,queue=null,checkpoint=null,journal=null
  if(bucket?.name==='movie-hub-62459-nightly-checkpoints'){
    const day=pacificSearchDay(now)
    const snapshots=await Promise.allSettled([
      loadBudgetLedger(bucket,day),
      loadNightlyQueue(bucket),
      loadDurableCandidateCheckpoint(bucket),
      ...(realQuotaMode?[loadSearchJournal(bucket,{now,runId})]:[]),
    ])
    if(snapshots[0].status==='fulfilled')
      ledger=snapshots[0].value.ledger
    if(snapshots[1].status==='fulfilled')
      queue=snapshots[1].value.queue
    if(snapshots[2].status==='fulfilled')
      checkpoint=snapshots[2].value.checkpoint
    if(realQuotaMode&&snapshots[3]?.status==='fulfilled')
      journal=snapshots[3].value.journal
  }
  const summary=buildFailedNightlySummary({
    now,runId,ledger,queue,checkpoint,journal,realQuotaMode,error,
  })
  await mkdir(dirname(output),{recursive:true})
  await writeFile(output,JSON.stringify(summary,null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify({
    kind:summary.kind,status:summary.status,
    failureCategory:summary.failureCategory,
    readback:{
      ledger:summary.ledgerReadbackAvailable,
      queue:summary.cursorReadbackAvailable,
      candidates:summary.candidateReadbackAvailable,
    },
    reservation:summary.selectedForSearch,
    successfulSearches:summary.successfulSearchCalls,
    rateLimitResponses:summary.rateLimitResponses??null,
    uncertainSearchAttempts:summary.uncertainSearchAttempts??null,
    quotaExceededConfirmed:summary.quotaExceededConfirmed===true,
    durableAttemptCountKnown:summary.durableAttemptCountKnown??false,
    actualSearchCallsKnown:summary.actualSearchCallsMeasured??false,
    productionWrites:0,
  }))
  return summary
}

/** Fallback must work when OIDC or Cloud Storage failed entirely. */
export async function recoverNightlyFailureReport({
  runId=Number(process.env.GITHUB_RUN_ID),error,
  output=FAILURE_REPORT_PATH,realQuotaMode=false,
}={}){
  let bucket=null,app=null,deleteApp=null
  try{
    if(!process.env.YOUTUBE_G2_WRITE_MODE
      &&process.env.DATA_CHECKPOINT_BUCKET==='movie-hub-62459-nightly-checkpoints'){
      const [{applicationDefault,initializeApp,deleteApp:remove},{getStorage}]
        =await Promise.all([import('firebase-admin/app'),import('firebase-admin/storage')])
      deleteApp=remove
      app=initializeApp({
        credential:applicationDefault(),projectId:'movie-hub-62459',
      },'youtube-g2-nightly-failure-readback')
      bucket=getStorage(app).bucket(process.env.DATA_CHECKPOINT_BUCKET)
    }
    return await saveFailedNightlyReport({bucket,runId,error,output,realQuotaMode})
  }catch{
    return saveFailedNightlyReport({runId,error,output,realQuotaMode})
  }finally{
    if(app&&deleteApp)await deleteApp(app).catch(()=>{})
  }
}
