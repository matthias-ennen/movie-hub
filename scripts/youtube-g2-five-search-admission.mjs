/**
 * One conservative, atomic FIVE-search reservation for the existing manually
 * triggered public-badge pilot. Reuses the SAME Pacific-day GCS ledger used by
 * the one-search full-catalog workflow, so 5 + 1 cannot overbook 10/day.
 *
 * This is not shared Google-project quota leasing, automatic discovery, offer
 * authority or permission to publish candidates. Monitoring can lag and
 * outside callers remain unknown. Fail closed before obtaining the API key.
 */
import {readFile} from 'node:fs/promises'
import {verifyBudgetPreflight,reserveWithAtomicGcs}
  from './youtube-g2-atomic-search-budget-ledger.mjs'

export const FIVE_SEARCH_PREFLIGHT_PATH=
  'artifacts/youtube-g2/pacific-search-preflight/summary.json'
export const FIVE_SEARCH_RESERVATION_CALLS=5
const safeId=x=>Number.isSafeInteger(x)&&x>0
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)
  &&a.length===b.length&&a.every((x,i)=>x===b[i])

export function assertFiveSearchPlan(plan){
  const ids=plan?.tmdbRefs?.map(ref=>ref?.tmdbId)
  if(plan?.maxSearchAttempts!==FIVE_SEARCH_RESERVATION_CALLS
    ||plan.publicationPermitted!==false
    ||!Array.isArray(plan.tmdbRefs)
    ||plan.tmdbRefs.length!==FIVE_SEARCH_RESERVATION_CALLS
    ||!ids.every(safeId)||new Set(ids).size!==ids.length
    ||plan.tmdbRefs.some(x=>x.mediaType!=='movie')
    ||plan.monitoringRemainingQuotaMeasured!==false)
    throw Error('G2_FIVE_SEARCH_BUDGET_PLAN_NOT_TRUSTED')
  return ids
}

export function assertFiveSearchAdmission(admission,plan){
  const ids=assertFiveSearchPlan(plan)
  if(admission?.source!=='gcs-atomic-five-search-reservation'
    ||!safeId(admission.runId)
    ||admission.maximumSearchAttempts!==FIVE_SEARCH_RESERVATION_CALLS
    ||admission.internalReservationRecorded!==true
    ||admission.quotaIsSharedAndNotGuaranteed!==true
    ||admission.noAutomaticRetries!==true
    ||admission.offerApproval!==false
    ||!same(admission.tmdbIds,ids))
    throw Error('G2_FIVE_SEARCH_ATOMIC_RESERVATION_REQUIRED')
  return admission
}

export async function admitExactlyFiveYoutubeSearches({
  plan,preflight,now=new Date().toISOString(),runId,
  bucket,reserve=reserveWithAtomicGcs,
}={}){
  const ids=assertFiveSearchPlan(plan)
  verifyBudgetPreflight(preflight,{now})
  if(!safeId(runId)||typeof reserve!=='function'
    ||bucket?.name!=='movie-hub-62459-nightly-checkpoints')
    throw Error('G2_FIVE_SEARCH_RESERVATION_CONTEXT_REQUIRED')
  const result=await reserve(bucket,{
    now,runId,calls:FIVE_SEARCH_RESERVATION_CALLS,preflight,
  })
  if(result?.runId!==runId
    ||result.reservationCalls!==FIVE_SEARCH_RESERVATION_CALLS
    ||result.globalGoogleQuotaGuaranteed!==false
    ||result.automaticallyCallYoutube!==false
    ||result.youtubeSearchCallsPerformed!==0
    ||result.providerWrites!==0)
    throw Error('G2_FIVE_SEARCH_GCS_RESERVATION_READBACK_INVALID')
  return assertFiveSearchAdmission({
    source:'gcs-atomic-five-search-reservation',runId,tmdbIds:ids,
    maximumSearchAttempts:FIVE_SEARCH_RESERVATION_CALLS,
    internalReservationRecorded:true,quotaIsSharedAndNotGuaranteed:true,
    noAutomaticRetries:true,offerApproval:false,
  },plan)
}

export async function admitPreparedFiveSearches({
  plan,reportPath=FIVE_SEARCH_PREFLIGHT_PATH,
  now=new Date().toISOString(),runId=Number(process.env.GITHUB_RUN_ID),
}={}){
  assertFiveSearchPlan(plan)
  if(process.env.YOUTUBE_G2_WRITE_MODE
    ||process.env.DATA_CHECKPOINT_BUCKET!=='movie-hub-62459-nightly-checkpoints'
    ||!safeId(runId))
    throw Error('G2_FIVE_SEARCH_LIVE_CLOUD_CONTEXT_REJECTED')
  const preflight=JSON.parse(await readFile(reportPath,'utf8'))
  verifyBudgetPreflight(preflight,{now})
  const [{applicationDefault,initializeApp,deleteApp},{getStorage}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/storage')])
  const app=initializeApp({credential:applicationDefault(),
    projectId:'movie-hub-62459'},'youtube-g2-five-guarded-search')
  try{
    const bucket=getStorage(app).bucket(process.env.DATA_CHECKPOINT_BUCKET)
    return await admitExactlyFiveYoutubeSearches({
      plan,preflight,now:new Date().toISOString(),runId,bucket,
    })
  }finally{
    await deleteApp(app)
  }
}
