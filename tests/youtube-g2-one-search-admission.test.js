import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  assertExactlyOneNewFilmSearch,admitExactlyOneYoutubeSearch,
} from '../scripts/youtube-g2-one-search-admission.mjs'
import {evaluatePacificSearchBudget,RATE,EXCEEDED,QUOTA}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'
import {reserveWithAtomicGcs}
  from '../scripts/youtube-g2-atomic-search-budget-ledger.mjs'

const NOW='2026-10-25T18:00:00Z'
const series=(metric,value)=>({timeSeries:[{
  metric:{type:metric,labels:{quota_metric:QUOTA}},
  resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
  points:[{interval:{startTime:'2026-10-25T17:49:00Z',
    endTime:'2026-10-25T17:50:00Z'},value}],
}]})
const preflight=()=>evaluatePacificSearchBudget({
  now:NOW,rateHttp:200,rateResponse:series(RATE,{int64Value:'15'}),
  exceededHttp:200,exceededResponse:{timeSeries:[]},
})
const plan=()=>({
  publicationPermitted:false,verifiedDEOffers:0,confirmedDirectLinks:0,
  catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  batch:{selectedCount:1,plannedSearchesPerUncachedMovie:1,
    youtubeSearchCallsPlanned:1,estimatedYoutubeSearchQuotaUnits:1,
    knownCandidateReuseMovies:0,realYoutubeApiRequestsPerformed:0},
  plan:[{mediaType:'movie',tmdbId:238,exactPublicYoutubeBadge:true,
    confirmedVideoId:null,playbackRoute:null,publicationPermitted:false}],
})
function bucket(){
  const saved=new Map()
  return {
    name:'movie-hub-62459-nightly-checkpoints',
    file(name,options={}){
      return {
        async getMetadata(){
          const v=saved.get(name)
          if(!v)throw Object.assign(Error('404'),{code:404})
          return [{generation:String(v.generation)}]
        },
        async download(){
          const v=saved.get(name)
          if(!v||options.generation&&String(options.generation)!==String(v.generation))
            throw Object.assign(Error('404'),{code:404})
          return [Buffer.from(v.bytes)]
        },
        async save(bytes,opts){
          const old=saved.get(name),generation=old?.generation??0
          if(opts.preconditionOpts.ifGenerationMatch!==generation)
            throw Object.assign(Error('generation conflict'),{code:412})
          saved.set(name,{generation:generation+1,bytes:Buffer.from(bytes)})
        },
      }
    },
    saved,
  }
}
describe('exactly one newly discovered movie: real GCS CAS search admission',()=>{
  it('requires an exact one-film, one-query, no-publication research plan',()=>{
    expect(assertExactlyOneNewFilmSearch(plan())).toBe(238)
    for(const change of [
      p=>{p.batch.selectedCount=2},
      p=>{p.batch.youtubeSearchCallsPlanned=2},
      p=>{p.batch.estimatedYoutubeSearchQuotaUnits=0},
      p=>{p.batch.knownCandidateReuseMovies=1},
      p=>{p.batch.plannedSearchesPerUncachedMovie=2},
      p=>{p.batch.realYoutubeApiRequestsPerformed=1},
      p=>{p.plan[0].exactPublicYoutubeBadge=false},
      p=>{p.plan[0].playbackRoute={target:'https://youtube.com'}},
      p=>{p.catalogWrites=1},
      p=>{p.verifiedDEOffers=1},
    ]){
      const x=structuredClone(plan());change(x)
      expect(()=>assertExactlyOneNewFilmSearch(x)).toThrow(
        'G2_ONE_NEW_MOVIE_RESEARCH_PLAN_NOT_SAFE')
    }
  })
  it('uses fresh monitoring plus an actual atomic reservation, never a fake advisory lease',async()=>{
    const b=bucket()
    const r=await admitExactlyOneYoutubeSearch({
      plan:plan(),preflight:preflight(),now:NOW,runId:850001,bucket:b,
    })
    expect(r).toMatchObject({
      tmdbId:238,maximumSearchAttempts:1,
      quotaIsSharedAndNotGuaranteed:true,internalReservationRecorded:true,
      noAutomaticRetries:true,offerApproval:false,
    })
    const ledger=JSON.parse([...b.saved.values()][0].bytes.toString('utf8'))
    expect(ledger.totalConservativelyReserved).toBe(1)
    expect(ledger.reservations[0].runId).toBe(850001)
    // Rerun of the same GitHub Actions run must never spend a second search.
    await expect(admitExactlyOneYoutubeSearch({
      plan:plan(),preflight:preflight(),now:NOW,runId:850001,bucket:b,
    })).rejects.toThrow('YOUTUBE_RESEARCH_RUN_ALREADY_RESERVED')
    expect(ledger.totalConservativelyReserved).toBe(1)
  })
  it('blocks missing telemetry and wrong bucket before any reservation',async()=>{
    const b=bucket()
    for(const mutate of [
      p=>{p.smallBatchAdvisory=false;p.blocks=['monitoring-missing']},
      p=>{p.checkedAt='2026-10-25T17:00:00Z'},
      p=>{p.rate.units=77},
      p=>{p.exceeded.exceededTrue=1},
      p=>{p.authorizedSearchCalls=1},
    ]){
      const data=preflight();mutate(data)
      await expect(admitExactlyOneYoutubeSearch({
        plan:plan(),preflight:data,now:NOW,runId:850003,bucket:b,
      })).rejects.toThrow()
    }
    expect(b.saved.size).toBe(0)
    const wrong=bucket();wrong.name='public'
    await expect(admitExactlyOneYoutubeSearch({
      plan:plan(),preflight:preflight(),now:NOW,runId:850004,bucket:wrong,
    })).rejects.toThrow('G2_ONE_SEARCH_RESERVATION_CONTEXT_REQUIRED')
    expect(wrong.saved.size).toBe(0)
  })
  it('rejects a forged GCS acknowledgement and never accepts global quota claims',async()=>{
    const stub=vi.fn(async()=>({
      runId:850005,reservationCalls:1,globalGoogleQuotaGuaranteed:true,
      automaticallyCallYoutube:false,youtubeSearchCallsPerformed:0,
      providerWrites:0,
    }))
    await expect(admitExactlyOneYoutubeSearch({
      plan:plan(),preflight:preflight(),now:NOW,runId:850005,
      bucket:bucket(),reserve:stub,
    })).rejects.toThrow('G2_ONE_SEARCH_GCS_ADMISSION_READBACK_INVALID')
    expect(stub).toHaveBeenCalledTimes(1)
  })
  it('fails pessimistically on concurrent GCS reservation and keeps daily cap',async()=>{
    const b=bucket()
    const a=await Promise.allSettled([
      reserveWithAtomicGcs(b,{now:NOW,runId:850006,calls:7,preflight:preflight()}),
      reserveWithAtomicGcs(b,{now:NOW,runId:850007,calls:7,preflight:preflight()}),
    ])
    expect(a.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    expect(a.filter(x=>x.status==='rejected')).toHaveLength(1)
    expect(JSON.parse([...b.saved.values()][0].bytes.toString()).totalConservativelyReserved).toBe(7)
  })
  it('workflow must get live metrics before any research, with one push-call cap',()=>{
    const workflow=readFileSync(new URL('../.github/workflows/youtube-g2-full-catalog-queue.yml',
      import.meta.url),'utf8')
    const restore=workflow.indexOf('Restore persistent private candidate checkpoint')
    const monitoring=workflow.indexOf('Collect current Pacific search telemetry')
    const research=workflow.indexOf('Research at most one NEW movie')
    const merge=workflow.indexOf('Merge completed read-only candidates')
    expect(restore).toBeGreaterThan(0)
    expect(monitoring).toBeGreaterThan(restore)
    expect(research).toBeGreaterThan(monitoring)
    expect(merge).toBeGreaterThan(research)
    expect(workflow).toContain("github.event_name == 'push' && '1'")
    expect(workflow).toContain('youtube-one-guarded-once')
    expect(workflow).toContain('youtube-g2-pacific-search-preflight.mjs')
    const live=readFileSync(new URL('../scripts/youtube-g2-full-catalog-queue-live.mjs',
      import.meta.url),'utf8')
    const admission=live.indexOf('await admitPreparedOneSearchPlan({plan})')
    expect(admission).toBeGreaterThan(0)
    expect(live.indexOf('const key=getSecret()')).toBeGreaterThan(admission)
    expect(live).toContain('++attemptedGoogleSearches!==1')
    expect(live).not.toContain("if(p==='search')throw Error('G2_SEARCH_LIST_ATOMIC_QUOTA_ADMISSION_NOT_YET_CONNECTED')")
  })
})
