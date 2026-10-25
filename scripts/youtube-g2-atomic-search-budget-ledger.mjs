/**
 * Durable, fail-closed reservation of THIS ADAPTER's own search.list calls.
 * Does not authorize a search or imply external project callers share ledger.
 * GCS ifGenerationMatch protects simultaneous cooperating research jobs.
 * A reservation is NEVER refunded: failed attempts may still cost quota.
 *
 * This module has NO automatically activated workflow or API calls.
 */
import {pacificSearchDay,KIND as PREFLIGHT_KIND}
  from './youtube-g2-pacific-search-preflight.mjs'

export const LEDGER_KIND='moviehub-youtube-g2-search-reservation-ledger'
export const LEDGER_PREFIX='youtube-g2/private-search-budget/v1/days/'
export const ADAPTER_SEARCH_DAY_CAP=10
export const PROJECT_SEARCH_DAY_LIMIT=100
const safeRun=x=>Number.isSafeInteger(x)&&x>0
const copy=x=>JSON.parse(JSON.stringify(x))

export function verifyBudgetPreflight(preflight,{now}={}){
  const day=pacificSearchDay(now),t=Date.parse(now)
  if(preflight?.kind!==PREFLIGHT_KIND
    ||preflight.pacificDate!==day.date
    ||preflight.resetStartUTC!==day.start
    ||preflight.nextResetUTC!==day.end
    ||preflight.measuredProjectDailyLimit!==PROJECT_SEARCH_DAY_LIMIT
    ||preflight.researchBudgetProposed!==ADAPTER_SEARCH_DAY_CAP
    ||preflight.smallBatchAdvisory!==true
    ||!Array.isArray(preflight.blocks)||preflight.blocks.length!==0
    ||preflight.rate?.http!==200||preflight.rate.complete!==true
    ||!Number.isInteger(preflight.rate.points)||preflight.rate.points<1
    ||!Number.isInteger(preflight.rate.units)||preflight.rate.units<0
    ||preflight.rate.units>50
    ||preflight.exceeded?.http!==200||preflight.exceeded.complete!==true
    ||preflight.exceeded.exceededTrue!==0
    ||!Number.isInteger(preflight.monitoringSampleAgeMinutes)
    ||preflight.monitoringSampleAgeMinutes<0
    ||preflight.monitoringSampleAgeMinutes>15
    ||preflight.otherConsumersReserve!==30
    ||preflight.monitoringLagBuffer!==10
    ||preflight.acquiredSharedReservation!==false
    ||preflight.authorizedSearchCalls!==0
    ||preflight.automaticSearchAllowed!==false
    ||preflight.currentQuotaRemaining!==null
    ||preflight.monitoringIsActualRemainingQuota!==false
    ||preflight.youtubeSearchCalls!==0||preflight.quotaWrites!==0
    ||preflight.firestoreWrites!==0||preflight.providerWrites!==0
    ||preflight.privateArtifact!==true||preflight.publicationPermitted!==false
    ||!Number.isFinite(Date.parse(preflight.checkedAt))
    ||Date.parse(preflight.checkedAt)>t
    ||t-Date.parse(preflight.checkedAt)>5*60*1000)
    throw Error('YOUTUBE_RESEARCH_SEARCH_PREFLIGHT_NOT_TRUSTED')
  return day
}
export function validateBudgetLedger(doc,day){
  if(doc?.kind!==LEDGER_KIND||doc.schemaVersion!==1
    ||doc.projectId!=='movie-hub-62459'
    ||doc.service!=='youtube.googleapis.com'
    ||doc.pacificDate!==day.date||doc.dayStartUTC!==day.start
    ||doc.nextResetUTC!==day.end
    ||doc.projectLimit!==PROJECT_SEARCH_DAY_LIMIT
    ||doc.adapterDayCap!==ADAPTER_SEARCH_DAY_CAP
    ||doc.remainingSharedProjectCalls!==null
    ||doc.externalCallersCoordinated!==false
    ||doc.automaticSearchApproved!==false
    ||doc.verifiedGermanOffers!==0||doc.playbackRoutesPublished!==0
    ||doc.productionWrites!==0
    ||!Array.isArray(doc.reservations)||doc.reservations.length>10)
    throw Error('YOUTUBE_SEARCH_LEDGER_NOT_TRUSTED')
  const ids=new Set()
  let sum=0
  for(const r of doc.reservations){
    if(!safeRun(r?.runId)||ids.has(r.runId)
      ||!Number.isInteger(r.calls)||r.calls<1||r.calls>ADAPTER_SEARCH_DAY_CAP
      ||!Number.isFinite(Date.parse(r.reservedAt))
      ||Date.parse(r.reservedAt)<Date.parse(day.start)
      ||Date.parse(r.reservedAt)>=Date.parse(day.end)
      ||r.state!=='reserved-conservatively-no-refund')
      throw Error('YOUTUBE_SEARCH_LEDGER_RESERVATION_UNTRUSTED')
    ids.add(r.runId);sum+=r.calls
  }
  if(sum>ADAPTER_SEARCH_DAY_CAP||sum!==doc.totalConservativelyReserved)
    throw Error('YOUTUBE_SEARCH_LEDGER_BUDGET_EXCEEDED')
  return copy(doc)
}
function emptyLedger(day){
  return {
    kind:LEDGER_KIND,schemaVersion:1,
    projectId:'movie-hub-62459',service:'youtube.googleapis.com',
    pacificDate:day.date,dayStartUTC:day.start,nextResetUTC:day.end,
    projectLimit:PROJECT_SEARCH_DAY_LIMIT,
    adapterDayCap:ADAPTER_SEARCH_DAY_CAP,
    totalConservativelyReserved:0,
    remainingSharedProjectCalls:null,
    externalCallersCoordinated:false,
    automaticSearchApproved:false,
    verifiedGermanOffers:0,playbackRoutesPublished:0,productionWrites:0,
    reservations:[],
  }
}
export function prepareResearchReservation({
  now,runId,calls,preflight,previous=null,
}={}){
  const day=verifyBudgetPreflight(preflight,{now})
  if(!safeRun(runId)||!Number.isInteger(calls)||calls<1
    ||calls>ADAPTER_SEARCH_DAY_CAP)
    throw Error('YOUTUBE_RESEARCH_RESERVATION_INPUT_INVALID')
  const old=previous===null?emptyLedger(day):validateBudgetLedger(previous,day)
  if(old.reservations.some(r=>r.runId===runId))
    throw Error('YOUTUBE_RESEARCH_RUN_ALREADY_RESERVED')
  if(old.totalConservativelyReserved+calls>ADAPTER_SEARCH_DAY_CAP)
    throw Error('YOUTUBE_RESEARCH_INTERNAL_DAILY_CAP_EXHAUSTED')
  const next=validateBudgetLedger({
    ...old,totalConservativelyReserved:old.totalConservativelyReserved+calls,
    reservations:[...old.reservations,{
      runId,calls,reservedAt:new Date(now).toISOString(),
      state:'reserved-conservatively-no-refund',
    }],
  },day)
  return {day,ledger:next,spentOrReserved:next.totalConservativelyReserved,
    reservationCalls:calls,
    // A CAS success protects our own cooperating ledger, NOT global Google quota.
    projectCallsRemaining:null,automaticSearchApproved:false}
}
const objectName=day=>LEDGER_PREFIX+day.date+'.json'
export async function loadBudgetLedger(bucket,day){
  if(typeof bucket?.file!=='function'||bucket.name!=='movie-hub-62459-nightly-checkpoints')
    throw Error('YOUTUBE_SEARCH_GCS_BUCKET_REQUIRED')
  const name=objectName(day)
  let meta
  try{[meta]=await bucket.file(name).getMetadata()}
  catch(e){
    if(Number(e?.code)===404)return {ledger:null,generation:'0',name}
    throw e
  }
  const generation=String(meta?.generation)
  if(!/^\d+$/.test(generation)
    ||!Number.isSafeInteger(Number(generation)))
    throw Error('YOUTUBE_SEARCH_GCS_GENERATION_UNSAFE')
  const [buf]=await bucket.file(name,{generation}).download()
  if(!Buffer.isBuffer(buf)||buf.length>12000)
    throw Error('YOUTUBE_SEARCH_GCS_LEDGER_OVERSIZE')
  const ledger=validateBudgetLedger(JSON.parse(buf.toString('utf8')),day)
  return {ledger,generation,name}
}
export async function reserveWithAtomicGcs(bucket,{
  now,runId,calls,preflight,
}={}){
  const day=verifyBudgetPreflight(preflight,{now})
  const previous=await loadBudgetLedger(bucket,day)
  const planned=prepareResearchReservation({
    now,runId,calls,preflight,previous:previous.ledger,
  })
  const serialized=Buffer.from(JSON.stringify(planned.ledger)+'\n')
  if(serialized.length>12000)throw Error('YOUTUBE_SEARCH_LEDGER_TOO_LARGE')
  // A 412 means another actor won the generation CAS. Stop, never retry
  // blindly or overbook. No YouTube calls can occur in this module.
  await bucket.file(previous.name).save(serialized,{
    resumable:false,contentType:'application/json',
    preconditionOpts:{ifGenerationMatch:Number(previous.generation)},
  })
  const current=await loadBudgetLedger(bucket,day)
  const record=current.ledger?.reservations.find(x=>x.runId===runId)
  if(!record||record.calls!==calls
    ||current.ledger.totalConservativelyReserved!==
      planned.ledger.totalConservativelyReserved)
    throw Error('YOUTUBE_SEARCH_GCS_RESERVATION_READBACK_MISMATCH')
  return {
    day:day.date,runId,reservationCalls:calls,
    totalAdapterReservations:current.ledger.totalConservativelyReserved,
    // This is an internal reservation record, NOT a Google lease.
    globalGoogleQuotaGuaranteed:false,
    automaticallyCallYoutube:false,
    currentRemainingProjectQuota:null,
    youtubeSearchCallsPerformed:0,providerWrites:0,
  }
}
