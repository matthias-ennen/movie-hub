import {describe,it,expect,vi} from 'vitest'
import {
  SHARED_SEARCH_PREFIX,NOMINAL_SEARCH_LIMIT,TARGET_SEARCH_CAP,
  assertSharedSearchReadiness,prepareSharedSearchReservation,
  prepareSharedSearchOutcome,validateSharedSearchLedger,
  readSharedSearchLedger,reserveSharedSearchWithGcs,
  finishSharedSearchWithGcs,executeSharedBudgetedSearch,
  classifySharedSearchFailure,
} from '../scripts/youtube-g2-shared-search-gateway.mjs'
import {pacificSearchDay}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'

const NOW='2026-10-28T18:00:00.000Z'
const approve=()=>({
  kind:'moviehub-youtube-project-quota-approval-v1',
  projectId:'movie-hub-62459',googleSearchLimitVerified:100,
  sharedSearchDayCap:95,allSearchCallersMigrated:true,
  externalConsumersAccountedFor:true,explicitOperatorApproval:true,
  reviewedAt:'2026-10-28T17:00:00.000Z',
})
function bucket(){
  const saved=new Map()
  return {
    name:'movie-hub-62459-nightly-checkpoints',saved,
    file(name,options={}){
      return {
        async getMetadata(){
          const doc=saved.get(name)
          if(!doc)throw Object.assign(Error('not found'),{code:404})
          return [{generation:String(doc.generation)}]
        },
        async download(){
          const doc=saved.get(name)
          if(!doc||options.generation
            &&String(options.generation)!==String(doc.generation))
            throw Object.assign(Error('missing generation'),{code:404})
          return [Buffer.from(doc.bytes)]
        },
        async save(bytes,opts){
          const doc=saved.get(name),generation=doc?.generation??0
          if(opts?.preconditionOpts?.ifGenerationMatch!==generation)
            throw Object.assign(Error('CAS conflict'),{code:412})
          if(opts.resumable!==false||opts.contentType!=='application/json')
            throw Error('unsafe save options')
          saved.set(name,{generation:generation+1,
            bytes:Buffer.from(bytes)})
        },
      }
    },
  }
}
const reserve=(overrides={})=>({
  now:NOW,runId:999201,attemptNumber:1,
  admission:approve(),...overrides,
})

describe('Future shared YouTube 95-search gateway is fail-closed and inert',()=>{
  it('does not accept readiness without explicit, recent project-wide verification',()=>{
    expect(NOMINAL_SEARCH_LIMIT).toBe(100)
    expect(TARGET_SEARCH_CAP).toBe(95)
    expect(assertSharedSearchReadiness(approve(),NOW).date).toBe('2026-10-28')
    const invalid=[
      x=>{x.googleSearchLimitVerified=10000},
      x=>{x.sharedSearchDayCap=100},
      x=>{x.allSearchCallersMigrated=false},
      x=>{x.externalConsumersAccountedFor=false},
      x=>{x.explicitOperatorApproval=false},
      x=>{x.projectId='other-project'},
      x=>{x.reviewedAt='2026-09-01T00:00:00Z'},
      x=>{x.reviewedAt='2026-10-30T00:00:00Z'},
    ]
    for(const mutate of invalid){
      const policy=approve();mutate(policy)
      expect(()=>assertSharedSearchReadiness(policy,NOW))
        .toThrow('YOUTUBE_SHARED_SEARCH_PROJECT_NOT_APPROVED')
    }
    expect(()=>prepareSharedSearchReservation(reserve({admission:null})))
      .toThrow('YOUTUBE_SHARED_SEARCH_PROJECT_NOT_APPROVED')
  })
  it('counts one attempt at a time, with a hard project-wide 95 cap',()=>{
    let old=null
    for(let i=1;i<=95;i++){
      old=prepareSharedSearchReservation(
        reserve({attemptNumber:i,previous:old})).ledger
    }
    expect(old.records).toHaveLength(95)
    expect(old.records.every(x=>x.state==='reserved-unknown')).toBe(true)
    expect(()=>prepareSharedSearchReservation(reserve({
      runId:999202,attemptNumber:1,previous:old,
    }))).toThrow('YOUTUBE_SHARED_SEARCH_DAY_BUDGET_EXHAUSTED')
    expect(JSON.stringify(old)).not.toContain('TMDB')
    expect(JSON.stringify(old)).not.toContain('watchUrl')
  })
  it('rejects duplicate attempt IDs, corrupt objects and private fields',()=>{
    const x=prepareSharedSearchReservation(reserve())
    expect(()=>prepareSharedSearchReservation(reserve({
      previous:x.ledger,
    }))).toThrow('YOUTUBE_SHARED_SEARCH_ATTEMPT_ALREADY_RESERVED')
    const forged=structuredClone(x.ledger)
    forged.records[0].searchQuery='private film title'
    expect(()=>validateSharedSearchLedger(forged,x.day))
      .toThrow('YOUTUBE_SHARED_SEARCH_ATTEMPT_NOT_TRUSTED')
    const bad=structuredClone(x.ledger)
    bad.records[0].state='refunded'
    expect(()=>validateSharedSearchLedger(bad,x.day)).toThrow()
  })
  it('uses Pacific days across daylight-saving fall-back boundaries',()=>{
    const before=pacificSearchDay('2026-11-01T08:30:00Z')
    const after=pacificSearchDay('2026-11-01T09:30:00Z')
    expect(before).toEqual(after)
    expect(before.date).toBe('2026-11-01')
    expect(Date.parse(before.end)-Date.parse(before.start))
      .toBe(25*3600000)
  })
  it('never refunds quota errors or permits later reservations on that PT day',()=>{
    const first=prepareSharedSearchReservation(reserve())
    const bad=prepareSharedSearchOutcome({
      day:first.day,previous:first.ledger,runId:999201,
      attemptNumber:1,state:'quota-exceeded',
    })
    expect(bad).toMatchObject({haltedForQuota:true})
    expect(bad.records).toHaveLength(1)
    expect(()=>prepareSharedSearchReservation(reserve({
      runId:999202,previous:bad,
    }))).toThrow('YOUTUBE_SHARED_SEARCH_DAY_HALTED')
    expect(()=>prepareSharedSearchOutcome({
      day:first.day,previous:bad,runId:999201,
      attemptNumber:1,state:'success',
    })).toThrow('YOUTUBE_SHARED_SEARCH_OUTCOME_NOT_PENDING')
    expect(classifySharedSearchFailure(
      Error('YouTube API: HTTP 403 bei search [QUOTA_EXHAUSTED]'))).toBe('quota-exceeded')
    expect(classifySharedSearchFailure(
      Error('YouTube API: HTTP 429 bei search [RATE_LIMITED]'))).toBe('rate-limited')
    expect(classifySharedSearchFailure(Error('network-error'))).toBe('failed-unknown')
  })
  it('uses a private GCS generation CAS: two concurrent leases cannot spend one slot',async()=>{
    const b=bucket()
    const results=await Promise.allSettled([
      reserveSharedSearchWithGcs(b,reserve({runId:999301})),
      reserveSharedSearchWithGcs(b,reserve({runId:999302})),
    ])
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    expect(results.filter(x=>x.status==='rejected')).toHaveLength(1)
    const row=(await readSharedSearchLedger(b,pacificSearchDay(NOW))).ledger
    expect(row.records).toHaveLength(1)
    expect(b.saved.size).toBe(1)
    expect([...b.saved.keys()][0]).toBe(
      SHARED_SEARCH_PREFIX+'2026-10-28.json')
  })
  it('records success by CAS without trusting a reservation as external quota',async()=>{
    const b=bucket()
    const granted=await reserveSharedSearchWithGcs(b,reserve())
    expect(granted).toMatchObject({
      reservedSearches:1,guaranteedGoogleRemaining:null,
    })
    const final=await finishSharedSearchWithGcs(b,{
      ...granted,state:'success',
    })
    expect(final).toMatchObject({state:'success',reservedSearches:1,
      haltedForQuota:false})
    expect((await readSharedSearchLedger(b,granted.day)).ledger.records[0].state)
      .toBe('success')
  })
  it('executes no search without prior GCS approval and never retries errors',async()=>{
    const b=bucket(),api=vi.fn(async()=>({items:[]}))
    await expect(executeSharedBudgetedSearch({
      bucket:b,runId:999401,attemptNumber:1,
      admission:null,now:()=>NOW,search:api,
    })).rejects.toThrow('YOUTUBE_SHARED_SEARCH_PROJECT_NOT_APPROVED')
    expect(api).not.toHaveBeenCalled()
    const reply=await executeSharedBudgetedSearch({
      bucket:b,runId:999401,attemptNumber:1,
      admission:approve(),now:()=>NOW,search:api,
    })
    expect(reply).toEqual({items:[]})
    expect(api).toHaveBeenCalledTimes(1)
    const fail=vi.fn(async()=>{throw Error('QUOTA_EXHAUSTED')})
    await expect(executeSharedBudgetedSearch({
      bucket:b,runId:999402,attemptNumber:1,
      admission:approve(),now:()=>NOW,search:fail,
    })).rejects.toThrow('QUOTA_EXHAUSTED')
    expect(fail).toHaveBeenCalledTimes(1)
    const day=pacificSearchDay(NOW)
    const ledger=(await readSharedSearchLedger(b,day)).ledger
    expect(ledger.haltedForQuota).toBe(true)
    expect(ledger.records.map(x=>x.state)).toEqual(['success','quota-exceeded'])
    await expect(executeSharedBudgetedSearch({
      bucket:b,runId:999403,attemptNumber:1,
      admission:approve(),now:()=>NOW,search:api,
    })).rejects.toThrow('YOUTUBE_SHARED_SEARCH_DAY_HALTED')
    expect(api).toHaveBeenCalledTimes(1)
  })
})
