import {describe,it,expect} from 'vitest'
import {evaluatePacificSearchBudget,RATE,EXCEEDED,QUOTA}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'
import {
  LEDGER_KIND,LEDGER_PREFIX,validateBudgetLedger,
  prepareResearchReservation,loadBudgetLedger,reserveWithAtomicGcs,
} from '../scripts/youtube-g2-atomic-search-budget-ledger.mjs'

const now='2026-10-25T18:00:00Z'
const interval={startTime:'2026-10-25T17:49:00Z',
  endTime:'2026-10-25T17:50:00Z'}
function exampleSeries(metric,value){
  return {timeSeries:[{
    metric:{type:metric,labels:{quota_metric:QUOTA}},
    resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
    points:[{interval,value}],
  }]}
}
function preflight(){
  return evaluatePacificSearchBudget({
    now,rateHttp:200,rateResponse:exampleSeries(RATE,{int64Value:'5'}),
    exceededHttp:200,exceededResponse:{timeSeries:[]},
  })
}
function bucket(){
  const saved=new Map()
  const b={
    name:'movie-hub-62459-nightly-checkpoints',
    file(name,options={}){
      return {
        async getMetadata(){
          const doc=saved.get(name)
          if(!doc)throw Object.assign(new Error('404'),{code:404})
          return [{generation:String(doc.generation)}]
        },
        async download(){
          const doc=saved.get(name)
          if(!doc||options.generation
            &&String(options.generation)!==String(doc.generation))
            throw Object.assign(new Error('missing object generation'),{code:404})
          return [Buffer.from(doc.bytes)]
        },
        async save(bytes,opts){
          const old=saved.get(name),generation=old?.generation??0
          if(opts?.preconditionOpts?.ifGenerationMatch!==generation)
            throw Object.assign(new Error('Precondition failed'),{code:412})
          if(opts.resumable!==false||opts.contentType!=='application/json')
            throw Error('Unsafe GCS write')
          saved.set(name,{generation:generation+1,bytes:Buffer.from(bytes)})
        },
      }
    },
    saved,
  }
  return b
}
describe('YouTube adapter own 50-call Pacific-day atomic GCS reservation ledger',()=>{
  it('counts requests pessimistically and never turns an internal reservation into Google quota',()=>{
    const p=preflight()
    expect(p.smallBatchAdvisory).toBe(true)
    const a=prepareResearchReservation({now,runId:601001,calls:4,preflight:p})
    expect(a.ledger).toMatchObject({
      kind:LEDGER_KIND,pacificDate:'2026-10-25',
      adapterDayCap:50,totalConservativelyReserved:4,
      remainingSharedProjectCalls:null,externalCallersCoordinated:false,
      automaticSearchApproved:false,productionWrites:0,
    })
    const b=prepareResearchReservation({
      now,runId:601002,calls:46,preflight:p,previous:a.ledger,
    })
    expect(b.ledger.totalConservativelyReserved).toBe(50)
    expect(b.ledger.reservations).toHaveLength(2)
    expect(()=>prepareResearchReservation({
      now,runId:601003,calls:1,preflight:p,previous:b.ledger,
    })).toThrow('YOUTUBE_RESEARCH_INTERNAL_DAILY_CAP_EXHAUSTED')
    expect(()=>prepareResearchReservation({
      now,runId:601001,calls:1,preflight:p,previous:b.ledger,
    })).toThrow('YOUTUBE_RESEARCH_RUN_ALREADY_RESERVED')
  })
  it('shares 50 PT-day calls between five-search and one-search research jobs',async()=>{
    const b=bucket(),p=preflight()
    const five=await reserveWithAtomicGcs(b,{
      now,runId:610001,calls:5,preflight:p,
    })
    expect(five).toMatchObject({
      reservationCalls:5,totalAdapterReservations:5,
      globalGoogleQuotaGuaranteed:false,
    })
    for(let i=0;i<45;i++){
      const one=await reserveWithAtomicGcs(b,{
        now,runId:610002+i,calls:1,preflight:p,
      })
      expect(one.totalAdapterReservations).toBe(6+i)
    }
    await expect(reserveWithAtomicGcs(b,{
      now,runId:610047,calls:5,preflight:p,
    })).rejects.toThrow('YOUTUBE_RESEARCH_INTERNAL_DAILY_CAP_EXHAUSTED')
    expect(b.saved.size).toBe(1)
  })
  it('uses generation 0 for first storage reservation and CAS for later writes',async()=>{
    const b=bucket(),p=preflight()
    const a=await reserveWithAtomicGcs(b,{now,runId:601101,calls:4,preflight:p})
    expect(a).toMatchObject({
      day:'2026-10-25',totalAdapterReservations:4,
      reservationCalls:4,globalGoogleQuotaGuaranteed:false,
      automaticallyCallYoutube:false,currentRemainingProjectQuota:null,
      youtubeSearchCallsPerformed:0,providerWrites:0,
    })
    const state=await loadBudgetLedger(b,{
      date:'2026-10-25',start:'2026-10-25T07:00:00.000Z',
      end:'2026-10-26T07:00:00.000Z',
    })
    expect(state.generation).toBe('1')
    expect(state.name).toBe(LEDGER_PREFIX+'2026-10-25.json')
    const second=await reserveWithAtomicGcs(b,{
      now,runId:601102,calls:46,preflight:p,
    })
    expect(second.totalAdapterReservations).toBe(50)
    await expect(reserveWithAtomicGcs(b,{
      now,runId:601103,calls:1,preflight:p,
    })).rejects.toThrow('YOUTUBE_RESEARCH_INTERNAL_DAILY_CAP_EXHAUSTED')
  })
  it('prevents concurrent reservation double-spend with GCS generation precondition',async()=>{
    const b=bucket(),p=preflight()
    const result=await Promise.allSettled([
      reserveWithAtomicGcs(b,{now,runId:601201,calls:7,preflight:p}),
      reserveWithAtomicGcs(b,{now,runId:601202,calls:7,preflight:p}),
    ])
    expect(result.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    expect(result.filter(x=>x.status==='rejected')).toHaveLength(1)
    expect(result.find(x=>x.status==='rejected').reason.code).toBe(412)
    const [doc]=[...b.saved.values()]
    expect(JSON.parse(doc.bytes.toString()).totalConservativelyReserved).toBe(7)
  })
  it('blocks missing actual quota evidence, stale dates and forged reserved records',()=>{
    const p=preflight()
    for(const mutation of [
      x=>{x.smallBatchAdvisory=false},
      x=>{x.currentQuotaRemaining=100},
      x=>{x.authorizedSearchCalls=1},
      x=>{x.monitoringSampleAgeMinutes=18},
      x=>{x.blocks=['fake-limit']},
      x=>{x.rate.units=99},
      x=>{x.exceeded.exceededTrue=1},
      x=>{x.checkedAt='2026-10-24T00:00:00Z'},
      x=>{x.pacificDate='2026-10-24'},
    ]){
      const x=structuredClone(p);mutation(x)
      expect(()=>prepareResearchReservation({
        now,runId:601301,calls:1,preflight:x,
      })).toThrow('YOUTUBE_RESEARCH_SEARCH_PREFLIGHT_NOT_TRUSTED')
    }
    expect(()=>prepareResearchReservation({
      now,runId:601301,calls:51,preflight:p,
    })).toThrow('YOUTUBE_RESEARCH_RESERVATION_INPUT_INVALID')
    const a=prepareResearchReservation({now,runId:601401,calls:4,preflight:p})
    for(const mutation of [
      x=>{x.totalConservativelyReserved=0},
      x=>{x.reservations[0].calls=20},
      x=>{x.reservations[0].state='refunded'},
      x=>{x.externalCallersCoordinated=true},
      x=>{x.automaticSearchApproved=true},
      x=>{x.productionWrites=1},
    ]){
      const x=structuredClone(a.ledger);mutation(x)
      expect(()=>validateBudgetLedger(x,a.day)).toThrow()
    }
  })
  it('upgrades an existing v1 10/day document in-place under the SAME CAS generation',async()=>{
    const b=bucket(),p=preflight()
    const day={date:'2026-10-25',start:'2026-10-25T07:00:00.000Z',
      end:'2026-10-26T07:00:00.000Z'}
    const a=prepareResearchReservation({now,runId:601601,calls:10,preflight:p})
    const legacy={...a.ledger,adapterDayCap:10}
    expect(()=>validateBudgetLedger(legacy,a.day)).toThrow('YOUTUBE_SEARCH_LEDGER_NOT_TRUSTED')
    expect(validateBudgetLedger(legacy,a.day,{allowLegacyCap:true}).totalConservativelyReserved)
      .toBe(10)
    const key=LEDGER_PREFIX+day.date+'.json'
    b.saved.set(key,{generation:1,bytes:Buffer.from(JSON.stringify(legacy))})
    const updated=await reserveWithAtomicGcs(b,{now,runId:601602,calls:40,preflight:p})
    expect(updated.totalAdapterReservations).toBe(50)
    const {ledger,generation}=await loadBudgetLedger(b,day)
    expect(generation).toBe('2')
    expect(ledger.adapterDayCap).toBe(50)
    expect(ledger.reservations).toMatchObject([{runId:601601,calls:10},
      {runId:601602,calls:40}])
    await expect(reserveWithAtomicGcs(b,{now,runId:601603,calls:1,preflight:p}))
      .rejects.toThrow('YOUTUBE_RESEARCH_INTERNAL_DAILY_CAP_EXHAUSTED')
  })
  it('rejects a legacy ledger with more than the historical 10 reservations',()=>{
    const p=preflight()
    const a=prepareResearchReservation({now,runId:601701,calls:1,preflight:p})
    const fake={...a.ledger,adapterDayCap:10,totalConservativelyReserved:50,
      reservations:Array.from({length:50},(_,i)=>({
        runId:601800+i,calls:1,reservedAt:now,
        state:'reserved-conservatively-no-refund',
      }))}
    expect(()=>validateBudgetLedger(fake,a.day,{allowLegacyCap:true})).toThrow()
  })
  it('rejects wrong Google bucket identity before any read or write',async()=>{
    const b=bucket();b.name='a-public-bucket'
    await expect(reserveWithAtomicGcs(b,{
      now,runId:601501,calls:1,preflight:preflight(),
    })).rejects.toThrow('YOUTUBE_SEARCH_GCS_BUCKET_REQUIRED')
    expect(b.saved.size).toBe(0)
  })
})
