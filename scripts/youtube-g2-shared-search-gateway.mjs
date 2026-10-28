/**
 * #388 – candidate foundation for a PROJECT-WIDE YouTube search.list budget.
 *
 * NOT connected to a live workflow. The existing conservative v1 10/1-call
 * gates remain authoritative until all project callers have migrated and
 * actual Google-project limits/other consumers have been verified.
 *
 * Each permitted search gets a single GCS generation-CAS reservation before
 * transport. Unknown/crashed attempts remain spent; no automatic retries.
 * The ledger NEVER stores API keys, search terms, titles, video or TMDB IDs.
 */
import {pacificSearchDay} from './youtube-g2-pacific-search-preflight.mjs'

export const SHARED_SEARCH_GATE_KIND='moviehub-youtube-shared-search-gateway-v1'
export const SHARED_SEARCH_PREFIX='youtube-g2/private-shared-search-budget/v1/days/'
export const NOMINAL_SEARCH_LIMIT=100
export const TARGET_SEARCH_CAP=95
export const SHARED_BUCKET_NAME='movie-hub-62459-nightly-checkpoints'
const MAX_BYTES=65536
const statuses=new Set(['reserved-unknown','success','quota-exceeded',
  'rate-limited','failed-unknown'])
const copy=x=>JSON.parse(JSON.stringify(x))
const validRun=x=>Number.isSafeInteger(x)&&x>0
const validAttempt=x=>Number.isInteger(x)&&x>0&&x<=TARGET_SEARCH_CAP
const name=day=>SHARED_SEARCH_PREFIX+day.date+'.json'

/**
 * This is only a DECLARATION of readiness, never independent proof of quota.
 * Future live wiring must derive the declaration from an explicitly reviewed
 * project configuration; no workflow currently supplies it.
 */
export function assertSharedSearchReadiness(admission,now){
  const day=pacificSearchDay(now)
  const checked=Date.parse(admission?.reviewedAt)
  const age=Date.parse(now)-checked
  if(admission?.kind!=='moviehub-youtube-project-quota-approval-v1'
    ||admission.projectId!=='movie-hub-62459'
    ||admission.googleSearchLimitVerified!==NOMINAL_SEARCH_LIMIT
    ||admission.sharedSearchDayCap!==TARGET_SEARCH_CAP
    ||admission.allSearchCallersMigrated!==true
    ||admission.externalConsumersAccountedFor!==true
    ||admission.explicitOperatorApproval!==true
    ||!Number.isFinite(checked)||age<0||age>30*86400000)
    throw Error('YOUTUBE_SHARED_SEARCH_PROJECT_NOT_APPROVED')
  return day
}
function empty(day){
  return {kind:SHARED_SEARCH_GATE_KIND,schemaVersion:1,
    projectId:'movie-hub-62459',pacificDate:day.date,
    dayStartUTC:day.start,nextResetUTC:day.end,
    nominalGoogleLimit:NOMINAL_SEARCH_LIMIT,
    sharedSearchDayCap:TARGET_SEARCH_CAP,
    haltedForQuota:false,records:[]}
}
export function validateSharedSearchLedger(doc,day){
  if(doc?.kind!==SHARED_SEARCH_GATE_KIND||doc.schemaVersion!==1
    ||doc.projectId!=='movie-hub-62459'
    ||doc.pacificDate!==day.date||doc.dayStartUTC!==day.start
    ||doc.nextResetUTC!==day.end
    ||doc.nominalGoogleLimit!==NOMINAL_SEARCH_LIMIT
    ||doc.sharedSearchDayCap!==TARGET_SEARCH_CAP
    ||typeof doc.haltedForQuota!=='boolean'
    ||!Array.isArray(doc.records)||doc.records.length>TARGET_SEARCH_CAP)
    throw Error('YOUTUBE_SHARED_SEARCH_LEDGER_NOT_TRUSTED')
  const keys=new Set()
  let quotaFailures=0
  for(const row of doc.records){
    const key=String(row?.runId)+':'+String(row?.attemptNumber)
    const at=Date.parse(row?.reservedAt)
    if(!validRun(row?.runId)||!validAttempt(row?.attemptNumber)
      ||keys.has(key)||!statuses.has(row?.state)
      ||!Number.isFinite(at)||at<Date.parse(day.start)
      ||at>=Date.parse(day.end)
      ||Object.keys(row).some(k=>!['runId','attemptNumber','reservedAt','state']
        .includes(k)))
      throw Error('YOUTUBE_SHARED_SEARCH_ATTEMPT_NOT_TRUSTED')
    keys.add(key)
    if(row.state==='quota-exceeded')quotaFailures++
  }
  if(doc.haltedForQuota!==(quotaFailures>0)
    ||Object.keys(doc).some(k=>!['kind','schemaVersion','projectId',
      'pacificDate','dayStartUTC','nextResetUTC','nominalGoogleLimit',
      'sharedSearchDayCap','haltedForQuota','records'].includes(k)))
    throw Error('YOUTUBE_SHARED_SEARCH_LEDGER_SHAPE_INVALID')
  return copy(doc)
}
export function prepareSharedSearchReservation({
  now,runId,attemptNumber,admission,previous=null,
}={}){
  const day=assertSharedSearchReadiness(admission,now)
  if(!validRun(runId)||!validAttempt(attemptNumber))
    throw Error('YOUTUBE_SHARED_SEARCH_ATTEMPT_ID_INVALID')
  const current=previous===null?empty(day):
    validateSharedSearchLedger(previous,day)
  if(current.haltedForQuota)throw Error('YOUTUBE_SHARED_SEARCH_DAY_HALTED')
  if(current.records.length>=TARGET_SEARCH_CAP)
    throw Error('YOUTUBE_SHARED_SEARCH_DAY_BUDGET_EXHAUSTED')
  if(current.records.some(row=>row.runId===runId
    &&row.attemptNumber===attemptNumber))
    throw Error('YOUTUBE_SHARED_SEARCH_ATTEMPT_ALREADY_RESERVED')
  return {day,ledger:validateSharedSearchLedger({
    ...current,records:[...current.records,{
      runId,attemptNumber,reservedAt:new Date(now).toISOString(),
      state:'reserved-unknown',
    }],
  },day)}
}
export function prepareSharedSearchOutcome({
  day,previous,runId,attemptNumber,state,
}={}){
  if(!statuses.has(state)||state==='reserved-unknown')
    throw Error('YOUTUBE_SHARED_SEARCH_OUTCOME_INVALID')
  const doc=validateSharedSearchLedger(previous,day)
  const row=doc.records.find(x=>x.runId===runId
    &&x.attemptNumber===attemptNumber)
  if(!row||row.state!=='reserved-unknown')
    throw Error('YOUTUBE_SHARED_SEARCH_OUTCOME_NOT_PENDING')
  row.state=state
  if(state==='quota-exceeded')doc.haltedForQuota=true
  return validateSharedSearchLedger(doc,day)
}
export async function readSharedSearchLedger(bucket,day){
  if(bucket?.name!==SHARED_BUCKET_NAME||typeof bucket?.file!=='function')
    throw Error('YOUTUBE_SHARED_SEARCH_PRIVATE_BUCKET_REQUIRED')
  let generation='0'
  let meta
  const object=name(day)
  try{[meta]=await bucket.file(object).getMetadata()}
  catch(e){
    if(Number(e?.code)===404)return {ledger:null,generation,object}
    throw e
  }
  generation=String(meta?.generation)
  if(!/^[0-9]+$/.test(generation)
    ||!Number.isSafeInteger(Number(generation)))
    throw Error('YOUTUBE_SHARED_SEARCH_GENERATION_INVALID')
  const [bytes]=await bucket.file(object,{generation}).download()
  if(!Buffer.isBuffer(bytes)||bytes.length>MAX_BYTES)
    throw Error('YOUTUBE_SHARED_SEARCH_LEDGER_TOO_LARGE')
  return {ledger:validateSharedSearchLedger(
    JSON.parse(bytes.toString('utf8')),day),generation,object}
}
async function saveCas(bucket,read,ledger){
  const bytes=Buffer.from(JSON.stringify(ledger)+'\n')
  if(bytes.length>MAX_BYTES)throw Error('YOUTUBE_SHARED_SEARCH_LEDGER_TOO_LARGE')
  // A 412 is a conflict, not an invitation to replay an API request.
  await bucket.file(read.object).save(bytes,{
    resumable:false,contentType:'application/json',
    preconditionOpts:{ifGenerationMatch:Number(read.generation)},
  })
}
export async function reserveSharedSearchWithGcs(bucket,options){
  const planned=prepareSharedSearchReservation(options)
  const read=await readSharedSearchLedger(bucket,planned.day)
  const final=prepareSharedSearchReservation({...options,
    previous:read.ledger})
  await saveCas(bucket,read,final.ledger)
  const readback=await readSharedSearchLedger(bucket,planned.day)
  if(readback.ledger?.records.length!==final.ledger.records.length
    ||!readback.ledger.records.some(x=>x.runId===options.runId
      &&x.attemptNumber===options.attemptNumber
      &&x.state==='reserved-unknown'))
    throw Error('YOUTUBE_SHARED_SEARCH_RESERVATION_READBACK_FAILED')
  return {day:planned.day,runId:options.runId,
    attemptNumber:options.attemptNumber,
    reservedSearches:readback.ledger.records.length,
    guaranteedGoogleRemaining:null}
}
export async function finishSharedSearchWithGcs(bucket,{
  day,runId,attemptNumber,state,
}={}){
  const read=await readSharedSearchLedger(bucket,day)
  const ledger=prepareSharedSearchOutcome({
    day,previous:read.ledger,runId,attemptNumber,state})
  await saveCas(bucket,read,ledger)
  const check=await readSharedSearchLedger(bucket,day)
  if(!check.ledger.records.some(x=>x.runId===runId
    &&x.attemptNumber===attemptNumber&&x.state===state))
    throw Error('YOUTUBE_SHARED_SEARCH_OUTCOME_READBACK_FAILED')
  return {state,reservedSearches:check.ledger.records.length,
    haltedForQuota:check.ledger.haltedForQuota}
}
export function classifySharedSearchFailure(error){
  const message=String(error?.message||'')
  if(/QUOTA_EXHAUSTED|quotaExceeded|dailyLimitExceeded/.test(message))
    return 'quota-exceeded'
  if(/RATE_LIMITED|rateLimitExceeded|HTTP 429/.test(message))
    return 'rate-limited'
  return 'failed-unknown'
}
/**
 * All requests must flow through this boundary AFTER a future migration.
 * This function accepts a function that executes one specific search.list.
 * It NEVER retries an uncertain request or exposes search parameters.
 */
export async function executeSharedBudgetedSearch({
  bucket,admission,runId,attemptNumber,search,
  now=()=>new Date().toISOString(),
}={}){
  if(typeof search!=='function'||typeof now!=='function')
    throw Error('YOUTUBE_SHARED_SEARCH_TRANSPORT_REQUIRED')
  const lease=await reserveSharedSearchWithGcs(bucket,{
    now:now(),runId,attemptNumber,admission})
  let outcome='success',result,error
  try{
    if(pacificSearchDay(now()).date!==lease.day.date)
      throw Error('YOUTUBE_SHARED_SEARCH_PACIFIC_DAY_CHANGED')
    result=await search()
  }catch(e){error=e;outcome=classifySharedSearchFailure(e)}
  await finishSharedSearchWithGcs(bucket,{...lease,state:outcome})
  if(error)throw error
  return result
}
