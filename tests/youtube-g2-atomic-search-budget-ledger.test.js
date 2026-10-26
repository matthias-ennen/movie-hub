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
    now,rateHttp:200,rateResponse:exampleSeries(RATE,{int64Value:'15'}),
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
describe('YouTube adapter own 10-call Pacific-day atomic GCS reservation ledger',()=>{
  it('counts requests pessimistically and never turns an internal reservation into Google quota',()=>{
    const p=preflight()
    expect(p.smallBatchAdvisory).toBe(true)
    const a=prepareResearchReservation({now,runId:601001,calls:4,preflight:p})
    expect(a.ledger).toMatchObject({
      kind:LEDGER_KIND,pacificDate:'2026-10-25',
      adapterDayCap:10,totalConservativelyReserved:4,
      remainingSharedProjectCalls:null,externalCallersCoordinated:false,
      automaticSearchApproved:false,productionWrites:0,
    })
    const b=prepareResearchReservation({
      now,runId:601002,calls:6,preflight:p,previous:a.ledger,
    })
    expect(b.ledger.totalConservativelyReserved).toBe(10)
    expect(b.ledger.reservations).toHaveLength(2)
    expect(()=>prepareResearchReservation({
      now,runId:601003,calls:1,preflight:p,previous:b.ledger,
    })).toThrow('YOUTUBE_RESEARCH_INTERNAL_DAILY_CAP_EXHAUSTED')
    expect(()=>prepareResearchReservation({
      now,runId:601001,calls:1,preflight:p,previous:b.ledger,
    })).toThrow('YOUTUBE_RESEARCH_RUN_ALREADY_RESERVED')
  })
  it('shares 10 PT-day calls between a 5-search batch and one-search research jobs',async()=>{
    const b=bucket(),p=preflight()
    const five=await reserveWithAtomicGcs(b,{
      now,runId:610001,calls:5,preflight:p,
    })
    expect(five).toMatchObject({
      reservationCalls:5,totalAdapterReservations:5,
      globalGoogleQuotaGuaranteed:false,
    })
    for(let i=0;i<5;i++){
      const one=await reserveWithAtomicGcs(b,{
        now,runId:610002+i,calls:1,preflight:p,
      })
      expect(one.totalAdapterReservations).toBe(6+i)
    }
    await expect(reserveWithAtomicGcs(b,{
      now,runId:610007,calls:5,preflight:p,
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
      now,runId:601102,calls:6,preflight:p,
    })
    expect(second.totalAdapterReservations).toBe(10)
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
      now,runId:601301,calls:11,preflight:p,
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
  it('rejects wrong Google bucket identity before any read or write',async()=>{
    const b=bucket();b.name='a-public-bucket'
    await expect(reserveWithAtomicGcs(b,{
      now,runId:601501,calls:1,preflight:preflight(),
    })).rejects.toThrow('YOUTUBE_SEARCH_GCS_BUCKET_REQUIRED')
    expect(b.saved.size).toBe(0)
  })
})
