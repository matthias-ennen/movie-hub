import {describe,it,expect,vi} from 'vitest'
import {
  prepareSharedSearchOutcome,reserveSharedSearchWithGcs,
  readSharedSearchLedger,executeSharedBudgetedSearch,
} from '../scripts/youtube-g2-shared-search-gateway.mjs'
import {pacificSearchDay}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'

const NOW='2026-10-28T18:00:00.000Z'
const day=pacificSearchDay(NOW)
const approval=Object.freeze({
  kind:'moviehub-youtube-project-quota-approval-v1',
  projectId:'movie-hub-62459',
  googleSearchLimitVerified:100,sharedSearchDayCap:95,
  allSearchCallersMigrated:true,externalConsumersAccountedFor:true,
  explicitOperatorApproval:true,reviewedAt:'2026-10-28T17:00:00.000Z',
})
const opts=runId=>({now:NOW,runId,attemptNumber:1,admission:approval})
const conflict=()=>Object.assign(Error('synthetic generation conflict'),{code:412})

function memoryBucket(onSave=()=>{}){
  const saved=new Map(),writes=[]
  return {
    name:'movie-hub-62459-nightly-checkpoints',saved,writes,
    file(name,options={}){
      return {
        async getMetadata(){
          const record=saved.get(name)
          if(!record)throw Object.assign(Error('missing'),{code:404})
          return [{generation:String(record.generation)}]
        },
        async download(){
          const record=saved.get(name)
          if(!record||options.generation!==undefined
            &&Number(options.generation)!==record.generation)
            throw Object.assign(Error('missing generation'),{code:404})
          return [Buffer.from(record.bytes)]
        },
        async save(bytes,settings){
          const existing=saved.get(name),generation=existing?.generation??0
          writes.push({generation,requested:settings?.preconditionOpts?.ifGenerationMatch})
          if(settings?.preconditionOpts?.ifGenerationMatch!==generation
            ||settings.resumable!==false
            ||settings.contentType!=='application/json')
            throw conflict()
          await onSave({name,bytes,existing,saved,writes})
          if((saved.get(name)?.generation??0)!==generation)
            throw conflict()
          saved.set(name,{generation:generation+1,bytes:Buffer.from(bytes)})
        },
      }
    },
  }
}

describe('future shared YouTube search reservations: CAS-only retries',()=>{
  it('accepts five simultaneous attempts in five unique slots (not one duplicated slot)',async()=>{
    const b=memoryBucket()
    const api=Array.from({length:5},()=>vi.fn(async()=>({items:[]})))
    const outcomes=await Promise.allSettled(api.map((search,i)=>
      executeSharedBudgetedSearch({
        bucket:b,...opts(745001+i),now:()=>NOW,search,
      })))
    expect(outcomes.every(x=>x.status==='fulfilled')).toBe(true)
    expect(api.every(x=>x.mock.calls.length===1)).toBe(true)
    const ledger=(await readSharedSearchLedger(b,day)).ledger
    expect(ledger.records).toHaveLength(5)
    expect(new Set(ledger.records.map(x=>x.runId)).size).toBe(5)
    expect(ledger.records.every(x=>x.state==='success')).toBe(true)
    expect(b.saved.size).toBe(1)
  })
  it('rereads a concurrent quota halt and performs no YouTube API call',async()=>{
    let conflicted=false
    const b=memoryBucket(({name,existing,saved})=>{
      if(conflicted||!existing)return
      conflicted=true
      const current=JSON.parse(existing.bytes.toString('utf8'))
      const updated=prepareSharedSearchOutcome({
        day,previous:current,runId:745101,attemptNumber:1,
        state:'quota-exceeded',
      })
      saved.set(name,{generation:existing.generation+1,
        bytes:Buffer.from(JSON.stringify(updated))})
    })
    await reserveSharedSearchWithGcs(b,opts(745101))
    const api=vi.fn(async()=>({items:[]}))
    await expect(executeSharedBudgetedSearch({
      bucket:b,...opts(745102),now:()=>NOW,search:api,
    })).rejects.toThrow('YOUTUBE_SHARED_SEARCH_DAY_HALTED')
    expect(api).not.toHaveBeenCalled()
    expect(conflicted).toBe(true)
    const ledger=(await readSharedSearchLedger(b,day)).ledger
    expect(ledger.haltedForQuota).toBe(true)
    expect(ledger.records).toHaveLength(1)
    expect(ledger.records[0].state).toBe('quota-exceeded')
  })
  it('fails closed after at most five real GCS conflicts, never calling API',async()=>{
    let conflicts=0
    const b=memoryBucket(()=>{
      conflicts++
      throw conflict()
    })
    const api=vi.fn(async()=>({items:[]}))
    await expect(executeSharedBudgetedSearch({
      bucket:b,...opts(745201),now:()=>NOW,search:api,
    })).rejects.toThrow('YOUTUBE_SHARED_SEARCH_RESERVATION_CAS_CONFLICT')
    expect(conflicts).toBe(5)
    expect(b.writes).toHaveLength(5)
    expect(api).not.toHaveBeenCalled()
    expect(b.saved.size).toBe(0)
  })
  it('does not retry ambiguous non-CAS write errors or the API transport',async()=>{
    let writes=0
    const b=memoryBucket(()=>{
      writes++
      throw Object.assign(Error('uncertain storage disconnect'),{code:503})
    })
    const api=vi.fn(async()=>({items:[]}))
    await expect(executeSharedBudgetedSearch({
      bucket:b,...opts(745301),now:()=>NOW,search:api,
    })).rejects.toThrow('uncertain storage disconnect')
    expect(writes).toBe(1)
    expect(api).not.toHaveBeenCalled()
  })
  it('does not double-reserve or dispatch after an uncertain committed CAS',async()=>{
    let inserted=false
    const b=memoryBucket(({name,bytes,saved})=>{
      if(inserted)return
      inserted=true
      saved.set(name,{generation:1,bytes:Buffer.from(bytes)})
      throw conflict()
    })
    const api=vi.fn(async()=>({items:[]}))
    await expect(executeSharedBudgetedSearch({
      bucket:b,...opts(745401),now:()=>NOW,search:api,
    })).rejects.toThrow('YOUTUBE_SHARED_SEARCH_ATTEMPT_ALREADY_RESERVED')
    expect(api).not.toHaveBeenCalled()
    const rows=(await readSharedSearchLedger(b,day)).ledger.records
    expect(rows).toHaveLength(1)
    expect(rows[0].state).toBe('reserved-unknown')
  })
})
