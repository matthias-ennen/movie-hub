import {describe,it,expect,vi} from 'vitest'
import {pacificSearchDay}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'
import {
  prepareSharedSearchReservation,prepareSharedSearchOutcome,
  reserveSharedSearchWithGcs,finishSharedSearchWithGcs,
  readSharedSearchLedger,executeSharedBudgetedSearch,
  summarizeSharedSearchLedger,TARGET_SEARCH_CAP,
} from '../scripts/youtube-g2-shared-search-gateway.mjs'

const NOW='2026-10-28T18:00:00.000Z'
const DAY=pacificSearchDay(NOW)
const approval={
  kind:'moviehub-youtube-project-quota-approval-v1',
  projectId:'movie-hub-62459',googleSearchLimitVerified:100,
  sharedSearchDayCap:95,allSearchCallersMigrated:true,
  externalConsumersAccountedFor:true,explicitOperatorApproval:true,
  reviewedAt:'2026-10-28T17:00:00.000Z',
}
function bucket(onSave=()=>{}){
  const saved=new Map()
  return {
    name:'movie-hub-62459-nightly-checkpoints',saved,
    file(name,options={}){
      return {
        async getMetadata(){
          const value=saved.get(name)
          if(!value)throw Object.assign(Error('not found'),{code:404})
          return [{generation:String(value.generation)}]
        },
        async download(){
          const value=saved.get(name)
          if(!value||options.generation
            &&String(options.generation)!==String(value.generation))
            throw Object.assign(Error('not found'),{code:404})
          return [Buffer.from(value.bytes)]
        },
        async save(bytes,opts){
          const current=saved.get(name),generation=current?.generation??0
          if(opts?.preconditionOpts?.ifGenerationMatch!==generation)
            throw Object.assign(Error('CAS 412'),{code:412})
          if(opts.resumable!==false||opts.contentType!=='application/json')
            throw Error('unsafe GCS write')
          await onSave({name,bytes,opts,current,saved})
          const after=saved.get(name)
          if((after?.generation??0)!==generation)
            throw Object.assign(Error('CAS 412'),{code:412})
          saved.set(name,{generation:generation+1,bytes:Buffer.from(bytes)})
        },
      }
    },
  }
}
const reserve=(runId,attemptNumber=1)=>({
  now:NOW,runId,attemptNumber,admission:approval,
})
const conflict=()=>Object.assign(Error('CAS 412'),{code:412})

describe('Future project-wide search gateway: concurrent outcome reconciliation',()=>{
  it('persists a quotaExceeded day halt after another runner reserves meanwhile',async()=>{
    let inserted=false
    const b=bucket(({name,bytes,current,saved})=>{
      const next=JSON.parse(bytes.toString('utf8'))
      if(inserted||!next.records.some(x=>x.state==='quota-exceeded'))
        return
      inserted=true
      const concurrent=prepareSharedSearchReservation({
        ...reserve(812002),previous:JSON.parse(current.bytes.toString('utf8')),
      })
      saved.set(name,{generation:current.generation+1,
        bytes:Buffer.from(JSON.stringify(concurrent.ledger))})
    })
    const original=await reserveSharedSearchWithGcs(b,reserve(812001))
    const outcome=await finishSharedSearchWithGcs(b,{
      ...original,state:'quota-exceeded',
    })
    expect(inserted).toBe(true)
    expect(outcome).toMatchObject({haltedForQuota:true,reservedSearches:2})
    const doc=(await readSharedSearchLedger(b,DAY)).ledger
    expect(doc.records.map(x=>x.state))
      .toEqual(['quota-exceeded','reserved-unknown'])
    await expect(reserveSharedSearchWithGcs(b,reserve(812003)))
      .rejects.toThrow('YOUTUBE_SHARED_SEARCH_DAY_HALTED')
  })
  it('treats an already recorded identical outcome as idempotent readback',async()=>{
    const b=bucket()
    const reserved=await reserveSharedSearchWithGcs(b,reserve(812101))
    const first=await finishSharedSearchWithGcs(b,{...reserved,state:'success'})
    const again=await finishSharedSearchWithGcs(b,{...reserved,state:'success'})
    expect(first).toEqual(again)
    expect((await readSharedSearchLedger(b,DAY)).ledger.records)
      .toHaveLength(1)
  })
  it('rejects conflicting outcomes rather than rewriting a prior quota block',async()=>{
    const b=bucket()
    const reserved=await reserveSharedSearchWithGcs(b,reserve(812201))
    await finishSharedSearchWithGcs(b,{...reserved,state:'quota-exceeded'})
    await expect(finishSharedSearchWithGcs(b,{
      ...reserved,state:'success',
    })).rejects.toThrow('YOUTUBE_SHARED_SEARCH_OUTCOME_CONFLICT')
    expect((await readSharedSearchLedger(b,DAY)).ledger.haltedForQuota).toBe(true)
  })
  it('stops after finite bookkeeping conflicts and never retries a real YouTube call',async()=>{
    let rejectOutcomes=false,failures=0
    const b=bucket(({bytes})=>{
      if(rejectOutcomes
        &&JSON.parse(bytes.toString('utf8')).records.some(x=>x.state!=='reserved-unknown')){
        failures++
        throw conflict()
      }
    })
    const youtube=vi.fn(async()=>{throw Error('QUOTA_EXHAUSTED')})
    rejectOutcomes=true
    await expect(executeSharedBudgetedSearch({
      bucket:b,...reserve(812301),now:()=>NOW,search:youtube,
    })).rejects.toThrow('YOUTUBE_SHARED_SEARCH_OUTCOME_CAS_CONFLICT')
    expect(failures).toBe(5)
    expect(youtube).toHaveBeenCalledTimes(1)
    // The reserved-unknown record is still spent, NOT eligible for replay.
    const doc=(await readSharedSearchLedger(b,DAY)).ledger
    expect(doc.records).toMatchObject([{state:'reserved-unknown'}])
    await expect(reserveSharedSearchWithGcs(b,reserve(812301)))
      .rejects.toThrow('YOUTUBE_SHARED_SEARCH_ATTEMPT_ALREADY_RESERVED')
  })
  it('reports only sanitized bookkeeping counts and no imaginary Google remainder',()=>{
    let data=null
    const finished=[['success',1],['quota-exceeded',2],
      ['rate-limited',3],['failed-unknown',4]]
    for(const [status,i] of finished){
      const plan=prepareSharedSearchReservation({
        ...reserve(812400+i),previous:data,
      })
      data=prepareSharedSearchOutcome({
        day:plan.day,previous:plan.ledger,
        runId:812400+i,attemptNumber:1,state:status,
      })
    }
    data=prepareSharedSearchReservation({
      ...reserve(812499),previous:data,
    }).ledger
    const summary=summarizeSharedSearchLedger(data,DAY)
    expect(summary).toMatchObject({
      conservativelyReserved:5,unusedInternalSlots:TARGET_SEARCH_CAP-5,
      confirmedByTransport:1,rejectedQuota:1,rejectedRate:1,
      failedWithUncertainTransport:1,outstandingUnknown:1,
      haltedForQuota:true,googleProjectRemaining:null,
      externallyVerifiedCalls:null,exactSentCallsProven:false,
      activationApproved:false,
    })
    expect(JSON.stringify(summary)).not.toContain('8124')
    expect(summarizeSharedSearchLedger(null,DAY)).toMatchObject({
      conservativelyReserved:0,unusedInternalSlots:95,
      googleProjectRemaining:null,
    })
  })
})
