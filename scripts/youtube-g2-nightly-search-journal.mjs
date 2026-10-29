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
const copy=x=>JSON.parse(JSON.stringify(x))
const nameFor=(day,runId)=>SEARCH_JOURNAL_PREFIX+day.date+'/'+runId+'.json'

export function validateSearchJournal(value,{day,runId}={}){
  if(value?.kind!==SEARCH_JOURNAL_KIND||value.schemaVersion!==1
    ||value.pacificDate!==day?.date||value.runId!==runId
    ||!['running','completed','quota-exhausted'].includes(value.state)
    ||!['attempts','successful','quotaRejected','rateLimited',
      'failed','pendingAttempts'].every(k=>validCount(value[k]))
    ||value.attempts!==value.successful+value.quotaRejected+
      value.rateLimited+value.failed+value.pendingAttempts
    ||value.quotaRejected>1
    ||value.state==='quota-exhausted'&&value.quotaRejected!==1
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
export async function changeSearchJournal(bucket,snapshot,{now,runId,event}={}){
  const day=pacificSearchDay(now)
  if(!snapshot||snapshot.day?.date!==day.date
    ||snapshot.name!==nameFor(day,runId))
    throw Error('G2_NIGHTLY_SEARCH_JOURNAL_DAY_CHANGED')
  const old=snapshot.journal||{
    kind:SEARCH_JOURNAL_KIND,schemaVersion:1,runId,pacificDate:day.date,
    state:'running',attempts:0,successful:0,quotaRejected:0,
    rateLimited:0,failed:0,pendingAttempts:0,
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
    if(event==='rate-limit')next.rateLimited++
    if(event==='failed')next.failed++
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
  const current=await loadSearchJournal(bucket,{now,runId})
  if(JSON.stringify(current.journal)!==JSON.stringify(next))
    throw Error('G2_NIGHTLY_SEARCH_JOURNAL_READBACK_MISMATCH')
  return current
}
export async function ensureSearchJournal(bucket,{now,runId}={}){
  const current=await loadSearchJournal(bucket,{now,runId})
  return current.journal?current:
    changeSearchJournal(bucket,current,{now,runId,event:'init'})
}
