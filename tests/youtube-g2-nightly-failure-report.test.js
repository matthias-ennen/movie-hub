import {describe,it,expect} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  buildFailedNightlySummary,classifyNightlyFailure,saveFailedNightlyReport,
} from '../scripts/youtube-g2-nightly-failure-report.mjs'
import {initialNightlyQueue,putNightlyResult,saveNightlyQueue}
  from '../scripts/youtube-g2-nightly-queue.mjs'
import {
  prepareResearchReservation,reserveWithAtomicGcs,
} from '../scripts/youtube-g2-atomic-search-budget-ledger.mjs'
import {evaluatePacificSearchBudget,RATE,QUOTA}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'

const NOW='2026-10-25T18:00:00.000Z'
const RUN=610001
const preflight=()=>evaluatePacificSearchBudget({
  now:NOW,rateHttp:200,rateResponse:{timeSeries:[{
    metric:{type:RATE,labels:{quota_metric:QUOTA}},
    resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
    points:[{
      interval:{startTime:'2026-10-25T17:49:00Z',endTime:'2026-10-25T17:50:00Z'},
      value:{int64Value:'5'},
    }],
  }]},
  exceededHttp:200,exceededResponse:{timeSeries:[]},
})
function fakeBucket(){
  const saved=new Map()
  return {
    name:'movie-hub-62459-nightly-checkpoints',saved,
    file(name,opts={}){
      return {
        async getMetadata(){
          const item=saved.get(name)
          if(!item)throw Object.assign(Error('missing'),{code:404})
          return [{generation:String(item.generation)}]
        },
        async download(){
          const item=saved.get(name)
          if(!item||(opts.generation
              &&String(opts.generation)!==String(item.generation)))
            throw Object.assign(Error('missing generation'),{code:404})
          return [Buffer.from(item.bytes)]
        },
        async save(bytes,options={}){
          const existing=saved.get(name)
          const generation=existing?.generation??0
          if(options.preconditionOpts?.ifGenerationMatch!==generation)
            throw Object.assign(Error('CAS conflict'),{code:412})
          saved.set(name,{generation:generation+1,bytes:Buffer.from(bytes)})
        },
      }
    },
  }
}

describe('anonymized YouTube nightly budget audit after a FAILED research job',()=>{
  it('recovers exactly reserved attempts and saved cursor without guessing searches',()=>{
    const p=preflight()
    const prior=prepareResearchReservation({
      now:NOW,runId:609999,calls:3,preflight:p,
    })
    const own=prepareResearchReservation({
      now:NOW,runId:RUN,calls:4,preflight:p,previous:prior.ledger,
    })
    let q=putNightlyResult(initialNightlyQueue(NOW),{
      tmdbId:1250,runId:RUN,state:'started',now:NOW,
    })
    q=putNightlyResult(q,{
      tmdbId:1300,runId:RUN,state:'no-video-candidates',now:NOW,
    })
    q=putNightlyResult(q,{
      tmdbId:1350,runId:609999,state:'no-current-offer',now:NOW,
    })
    const report=buildFailedNightlySummary({
      now:NOW,runId:RUN,ledger:own.ledger,queue:q,
      error:Error('HTTP 429: Authorization Bearer PRIVATE_SECRET'),
    })
    expect(report).toMatchObject({
      status:'failed',failureCategory:'youtube-rate-limit',
      dayLimit:200,priorReserved:3,selectedForSearch:4,
      sharedDayReserved:7,searchCalls:null,
      actualSearchCallsMeasured:false,videoDetailCalls:null,
      runStartedFilms:2,runCompletedFilms:1,runUnfinishedFilms:1,
      independentlyVerifiedDEOffers:0,publicationPermitted:false,
      firestoreWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
    })
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE_SECRET|1250|1300|1350|videoId|watchUrl|tmdbId/)
    expect(report.privateKnownCandidateFilmCount).toBeNull()
  })
  it('reports UNKNOWN rather than zero when GCS readback is unavailable',()=>{
    const r=buildFailedNightlySummary({
      now:NOW,runId:RUN,error:Error('CAS conflict 412'),
    })
    expect(r).toMatchObject({
      failureCategory:'checkpoint-consistency',
      priorReserved:null,selectedForSearch:null,sharedDayReserved:null,
      searchCalls:null,actualSearchCallsMeasured:false,
      runStartedFilms:null,runCompletedFilms:null,
      privateKnownCandidateFilmCount:null,
      ledgerReadbackAvailable:false,cursorReadbackAvailable:false,
      candidateReadbackAvailable:false,
    })
  })
  it('writes only safe aggregate counts by independently reading ledger and queue',async()=>{
    const bucket=fakeBucket()
    await reserveWithAtomicGcs(bucket,{
      now:NOW,runId:RUN,calls:2,preflight:preflight(),
    })
    const queue=putNightlyResult(initialNightlyQueue(NOW),{
      tmdbId:1995,runId:RUN,state:'started',now:NOW,
    })
    await saveNightlyQueue(bucket,queue,{expectedGeneration:'0'})
    const dir=await mkdtemp(join(tmpdir(),'moviehub-youtube-nightly-error-'))
    try{
      const output=join(dir,'summary.json')
      const report=await saveFailedNightlyReport({
        bucket,now:NOW,runId:RUN,error:Error('HTTP 429 Secret 1234567890'),
        output,
      })
      const text=await readFile(output,'utf8')
      expect(JSON.parse(text)).toEqual(report)
      expect(report).toMatchObject({
        selectedForSearch:2,sharedDayReserved:2,priorReserved:0,
        runStartedFilms:1,runCompletedFilms:0,
        ledgerReadbackAvailable:true,cursorReadbackAvailable:true,
        candidateReadbackAvailable:false,
      })
      expect(text).not.toMatch(/1995|1234567890|youtube\.com\/watch/)
    }finally{
      await rm(dir,{recursive:true,force:true})
    }
  })
  it('uses finite public failure categories instead of copying sensitive messages',()=>{
    for(const [message,expected] of [
      ['YouTube HTTP 429','youtube-rate-limit'],
      ['403 PERMISSION_DENIED','authorization-or-api-block'],
      ['CAS 412','checkpoint-consistency'],
      ['YOUTUBE_RESEARCH_SEARCH_PREFLIGHT_NOT_TRUSTED','quota-preflight-or-monitoring'],
      ['G2_NIGHTLY_TMDB_HTTP_502','tmdb-source'],
      ['secret.api.key=sensitive','other-unclassified'],
    ]){
      expect(classifyNightlyFailure(Error(message))).toBe(expected)
    }
  })
})
