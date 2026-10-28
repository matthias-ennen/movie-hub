/**
 * Best-effort, READ-ONLY recovery of durable nightly research state on error.
 *
 * A failed runner must remain FAILED. This report exposes counts only, never
 * personal data, film IDs, video IDs, raw errors, secrets or watch URLs.
 * GCS reservations are evidence of allocated attempts, NOT proof an external
 * YouTube request actually happened. Never infer actual searches from them.
 */
import {mkdir,writeFile} from 'node:fs/promises'
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
  if(/(?:^|\b)(?:429|RATE_LIMIT|RESOURCE_EXHAUSTED)(?:\b|_)/i.test(message))
    return 'youtube-rate-limit'
  if(/(?:^|\b)(?:403|PERMISSION_DENIED|UNAUTHENTICATED)(?:\b|_)/i.test(message))
    return 'authorization-or-api-block'
  if(/(?:CAS|GENERATION|READBACK|\b412\b|PRECONDITION)/i.test(message))
    return 'checkpoint-consistency'
  if(/(?:PREFLIGHT|MONITOR|TELEMETRY|QUOTA)/i.test(message))
    return 'quota-preflight-or-monitoring'
  if(/(?:TMDB)/i.test(message))return 'tmdb-source'
  return 'other-unclassified'
}

export function buildFailedNightlySummary({
  now=new Date().toISOString(),runId,ledger=null,queue=null,
  checkpoint=null,error=null,
}={}){
  const day=pacificSearchDay(now)
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
  output=FAILURE_REPORT_PATH,
}={}){
  let ledger=null,queue=null,checkpoint=null
  if(bucket?.name==='movie-hub-62459-nightly-checkpoints'){
    const day=pacificSearchDay(now)
    const snapshots=await Promise.allSettled([
      loadBudgetLedger(bucket,day),
      loadNightlyQueue(bucket),
      loadDurableCandidateCheckpoint(bucket),
    ])
    if(snapshots[0].status==='fulfilled')
      ledger=snapshots[0].value.ledger
    if(snapshots[1].status==='fulfilled')
      queue=snapshots[1].value.queue
    if(snapshots[2].status==='fulfilled')
      checkpoint=snapshots[2].value.checkpoint
  }
  const summary=buildFailedNightlySummary({
    now,runId,ledger,queue,checkpoint,error,
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
    actualSearchCallsKnown:false,productionWrites:0,
  }))
  return summary
}

/** Fallback must work when OIDC or Cloud Storage failed entirely. */
export async function recoverNightlyFailureReport({
  runId=Number(process.env.GITHUB_RUN_ID),error,
  output=FAILURE_REPORT_PATH,
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
    return await saveFailedNightlyReport({bucket,runId,error,output})
  }catch{
    return saveFailedNightlyReport({runId,error,output})
  }finally{
    if(app&&deleteApp)await deleteApp(app).catch(()=>{})
  }
}
