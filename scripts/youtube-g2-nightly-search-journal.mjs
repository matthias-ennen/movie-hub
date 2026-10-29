/**
 * Private, counts-only GCS journal for the real-quota scheduled search loop.
 * Each search is recorded BEFORE transport and its outcome AFTER transport.
 * A crash can leave pendingAttempts > 0: those are honestly uncertain,
 * never counted as confirmed Google responses or silently refunded.
 * The Google API (not this journal) decides daily quota exhaustion.
 */
import {pacificSearchDay} from './youtube-g2-pacific-search-preflight.mjs'

export const SEARCH_JOURNAL_KIND='moviehub-youtube-g2-nightly-search-journal'
export const SEARCH_JOURNAL_PREFIX='youtube-g2/private-nightly-search-journal/v1/'
const validCount=x=>Number.isSafeInteger(x)&&x>=0
const validRun=x=>Number.isSafeInteger(x)&&x>0
const optionalCount=x=>x===undefined||validCount(x)
const optionalTime=x=>x===undefined||x===null
  ||typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)
    &&Number.isFinite(Date.parse(x))
const copy=x=>JSON.parse(JSON.stringify(x))
const nameFor=(day,runId)=>SEARCH_JOURNAL_PREFIX+day.date+'/'+runId+'.json'

export function validateSearchJournal(value,{day,runId}={}){
  if(value?.kind!==SEARCH_JOURNAL_KIND||value.schemaVersion!==1
    ||value.pacificDate!==day?.date||value.runId!==runId
    ||!['running','completed','quota-exhausted','rate-limited'].includes(value.state)
    ||!['attempts','successful','quotaRejected','rateLimited',
      'failed','pendingAttempts','uncertain'].every(k=>validCount(value[k]))
    ||value.attempts!==value.successful+value.quotaRejected+
      value.rateLimited+value.failed+value.pendingAttempts+value.uncertain
    ||value.quotaRejected>1
    ||!['rateLimitHttp429','rateLimitHttp403','rateLimitUnclassified',
      'rateLimitRetryAfterHints'].every(k=>optionalCount(value[k])
        &&(value[k]===undefined||value[k]<=value.rateLimited))
    ||(value.rateLimitHttp429??0)+(value.rateLimitHttp403??0)>value.rateLimited
    ||!optionalTime(value.rateLimitFirstAt)||!optionalTime(value.rateLimitLastAt)
    ||value.state==='quota-exhausted'&&value.quotaRejected!==1
    ||value.state==='rate-limited'&&(value.rateLimited<1||value.quotaRejected!==0)
    ||value.state!=='running'&&value.pendingAttempts!==0)
    throw Error('G2_NIGHTLY_SEARCH_JOURNAL_NOT_TRUSTED')
  return copy(value)
}
export async function loadSearchJournal(bucket,{now,runId}={}){
  if(bucket?.name!=='movie-hub-62459-nightly-checkpoints'
    ||!validRun(runId))throw Error('G2_NIGHTLY_SEARCH_JOURNAL_CONTEXT_INVALID')
  const day=pacificSearchDay(now),name=nameFor(day,runId)
  let meta
  try{[meta]=await bucket.file(name).getMetadata()}
  catch(e){
    if(Number(e?.code)===404)return {journal:null,generation:'0',name,day}
    throw e
  }
  const generation=String(meta?.generation)
  if(!/^\d+$/.test(generation)||!Number.isSafeInteger(Number(generation)))
    throw Error('G2_NIGHTLY_SEARCH_JOURNAL_GENERATION_INVALID')
  const [bytes]=await bucket.file(name,{generation}).download()
  if(!Buffer.isBuffer(bytes)||bytes.length>4096)
    throw Error('G2_NIGHTLY_SEARCH_JOURNAL_SIZE_INVALID')
  return {journal:validateSearchJournal(JSON.parse(bytes.toString('utf8')),
    {day,runId}),generation,name,day}
}
export async function changeSearchJournal(bucket,snapshot,{now,runId,event,
  rateLimitMeta=null}={}){
  const day=pacificSearchDay(now)
  if(!snapshot||snapshot.day?.date!==day.date
    ||snapshot.name!==nameFor(day,runId))
    throw Error('G2_NIGHTLY_SEARCH_JOURNAL_DAY_CHANGED')
  const old=snapshot.journal||{
    kind:SEARCH_JOURNAL_KIND,schemaVersion:1,runId,pacificDate:day.date,
    state:'running',attempts:0,successful:0,quotaRejected:0,
    rateLimited:0,failed:0,pendingAttempts:0,uncertain:0,
    rateLimitHttp429:0,rateLimitHttp403:0,rateLimitUnclassified:0,
    rateLimitRetryAfterHints:0,rateLimitFirstAt:null,rateLimitLastAt:null,
  }
  const next=copy(old)
  if(event==='init'){
    if(snapshot.journal)throw Error('G2_NIGHTLY_SEARCH_JOURNAL_ALREADY_EXISTS')
  }else if(event==='attempt'){
    if(next.state!=='running')throw Error('G2_NIGHTLY_SEARCH_AFTER_STOP')
    next.attempts++;next.pendingAttempts++
  }else if(['success','quota','rate-limit','failed'].includes(event)){
    if(next.pendingAttempts<1||next.state!=='running')
      throw Error('G2_NIGHTLY_SEARCH_OUTCOME_WITHOUT_ATTEMPT')
    next.pendingAttempts--
    if(event==='success')next.successful++
    if(event==='quota'){next.quotaRejected++;next.state='quota-exhausted'}
    if(event==='rate-limit'){
      next.rateLimited++
      // Only persist whitelisted numbers and timestamps. Never store
      // Google error bodies, headers, query text, API keys or video IDs.
      if(rateLimitMeta?.httpStatus===429)
        next.rateLimitHttp429=(next.rateLimitHttp429??0)+1
      if(rateLimitMeta?.httpStatus===403)
        next.rateLimitHttp403=(next.rateLimitHttp403??0)+1
      if(['RATE_LIMIT_OR_QUOTA_UNCLASSIFIED','QUOTA_OR_RATE_LIMIT']
        .includes(rateLimitMeta?.failureClass))
        next.rateLimitUnclassified=(next.rateLimitUnclassified??0)+1
      if(Number.isSafeInteger(rateLimitMeta?.retryAfterMs)
        &&rateLimitMeta.retryAfterMs>=0)
        next.rateLimitRetryAfterHints=(next.rateLimitRetryAfterHints??0)+1
      next.rateLimitFirstAt??=new Date(now).toISOString()
      next.rateLimitLastAt=new Date(now).toISOString()
    }
    if(event==='failed')next.failed++
  }else if(event==='recover'){
    if(next.state!=='running')throw Error('G2_NIGHTLY_SEARCH_RECOVERY_UNSAFE')
    next.uncertain+=next.pendingAttempts
    next.pendingAttempts=0
  }else if(event==='rate-limited-stop'){
    if(next.state!=='running'||next.pendingAttempts!==0
      ||next.rateLimited<1||next.quotaRejected!==0)
      throw Error('G2_NIGHTLY_SEARCH_RATE_LIMIT_STOP_UNSAFE')
    next.state='rate-limited'
  }else if(event==='complete'){
    if(next.state!=='running'||next.pendingAttempts!==0)
      throw Error('G2_NIGHTLY_SEARCH_COMPLETION_UNSAFE')
    next.state='completed'
  }else throw Error('G2_NIGHTLY_SEARCH_JOURNAL_EVENT_INVALID')
  validateSearchJournal(next,{day,runId})
  await bucket.file(snapshot.name).save(JSON.stringify(next)+'\n',{
    resumable:false,contentType:'application/json',
    preconditionOpts:{ifGenerationMatch:Number(snapshot.generation)},
  })
  // The fulfilled conditional upload is durable. Avoid downloading the
  // complete object after EACH request: this loop runs hundreds of times,
  // and those downloads coincided with noisy listener warnings.
  // Read the new generation for the next CAS write; perform full document
  // readback at initialization and at both terminal states.
  if(['init','quota','complete','rate-limited-stop'].includes(event)){
    const current=await loadSearchJournal(bucket,{now,runId})
    if(JSON.stringify(current.journal)!==JSON.stringify(next))
      throw Error('G2_NIGHTLY_SEARCH_JOURNAL_READBACK_MISMATCH')
    return current
  }
  const [metadata]=await bucket.file(snapshot.name).getMetadata()
  const generation=String(metadata?.generation)
  if(!/^\d+$/.test(generation)
    ||!Number.isSafeInteger(Number(generation))
    ||generation===snapshot.generation)
    throw Error('G2_NIGHTLY_SEARCH_JOURNAL_GENERATION_INVALID')
  return {...snapshot,journal:next,generation}
}
export async function ensureSearchJournal(bucket,{now,runId}={}){
  const current=await loadSearchJournal(bucket,{now,runId})
  return current.journal?current:
    changeSearchJournal(bucket,current,{now,runId,event:'init'})
}
