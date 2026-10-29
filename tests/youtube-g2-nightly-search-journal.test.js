import {describe,it,expect} from 'vitest'
import {ensureSearchJournal,loadSearchJournal,changeSearchJournal,
  validateSearchJournal} from '../scripts/youtube-g2-nightly-search-journal.mjs'
import {buildFailedNightlySummary,classifyNightlyFailure}
  from '../scripts/youtube-g2-nightly-failure-report.mjs'

const NOW='2026-10-25T18:00:00.000Z',RUN=779001
const bucket=()=>{
  const objects=new Map()
  return {
    name:'movie-hub-62459-nightly-checkpoints',objects,
    file(name,options={}){
      return {
        async getMetadata(){
          const o=objects.get(name)
          if(!o)throw Object.assign(Error('missing'),{code:404})
          return [{generation:String(o.generation)}]
        },
        async download(){
          const o=objects.get(name)
          if(!o||options.generation&&String(options.generation)!==String(o.generation))
            throw Object.assign(Error('missing'),{code:404})
          return [Buffer.from(o.bytes)]
        },
        async save(bytes,opts){
          const o=objects.get(name),generation=o?.generation??0
          if(opts?.preconditionOpts?.ifGenerationMatch!==generation)
            throw Object.assign(Error('CAS conflict'),{code:412})
          objects.set(name,{generation:generation+1,bytes:Buffer.from(bytes)})
        },
      }
    },
  }
}
const advance=(b,s,event)=>changeSearchJournal(b,s,{now:NOW,runId:RUN,event})

describe('private live-nightly Google quota journal',()=>{
  it('journals each attempt, success, rate-limit and confirmed quota',async()=>{
    const b=bucket()
    let x=await ensureSearchJournal(b,{now:NOW,runId:RUN})
    x=await advance(b,x,'attempt')
    x=await advance(b,x,'success')
    x=await advance(b,x,'attempt')
    x=await advance(b,x,'rate-limit')
    x=await advance(b,x,'attempt')
    x=await advance(b,x,'quota')
    expect(x.journal).toMatchObject({
      state:'quota-exhausted',attempts:3,successful:1,
      rateLimited:1,quotaRejected:1,pendingAttempts:0,
    })
    expect((await loadSearchJournal(b,{now:NOW,runId:RUN})).journal)
      .toEqual(x.journal)
    await expect(advance(b,x,'attempt')).rejects.toThrow('G2_NIGHTLY_SEARCH_AFTER_STOP')
    expect(JSON.stringify(x.journal)).not.toMatch(/tmdbId|videoId|secret|https?:/)
  })
  it('preserves uncertain attempts on a crashed or retried run',async()=>{
    const b=bucket()
    let x=await ensureSearchJournal(b,{now:NOW,runId:RUN})
    x=await advance(b,x,'attempt')
    const resumed=await ensureSearchJournal(b,{now:NOW,runId:RUN})
    expect(resumed.journal.pendingAttempts).toBe(1)
    x=await advance(b,resumed,'recover')
    expect(x.journal).toMatchObject({attempts:1,pendingAttempts:0,uncertain:1})
    x=await advance(b,x,'attempt')
    x=await advance(b,x,'success')
    x=await advance(b,x,'complete')
    expect(x.journal).toMatchObject({attempts:2,uncertain:1,
      successful:1,state:'completed'})
    expect(()=>validateSearchJournal({...x.journal,attempts:3},
      {day:x.day,runId:RUN})).toThrow('G2_NIGHTLY_SEARCH_JOURNAL_NOT_TRUSTED')
  })
  it('reports the exact persisted attempted count even after process failure',async()=>{
    const b=bucket()
    let x=await ensureSearchJournal(b,{now:NOW,runId:RUN})
    x=await advance(b,x,'attempt')
    x=await advance(b,x,'success')
    x=await advance(b,x,'attempt')
    const r=buildFailedNightlySummary({
      now:NOW,runId:RUN,realQuotaMode:true,journal:x.journal,
      error:Error('G2_NIGHTLY_TMDB_HTTP_502'),
    })
    expect(r).toMatchObject({
      status:'failed',dayLimit:null,selectedForSearch:2,
      searchCalls:2,successfulSearchCalls:1,uncertainSearchAttempts:1,
      durableAttemptCountKnown:true,actualSearchCallsMeasured:false,
      productionWrites:undefined,
    })
    expect(r.firestoreWrites).toBe(0)
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE_SECRET|tmdbId|videoId/)
  })
  it('does not misreport storage throttling as YouTube rate limiting',()=>{
    expect(classifyNightlyFailure(Error('RESOURCE_EXHAUSTED 429')))
      .toBe('checkpoint-storage-transient')
    expect(classifyNightlyFailure(
      Error('YouTube API: HTTP 429 bei search [RATE_LIMITED]')))
      .toBe('youtube-rate-limit')
  })
})
