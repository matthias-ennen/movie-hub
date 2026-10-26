import {describe,it,expect,vi} from 'vitest'
import {runNightlyDiscovery}
  from '../scripts/youtube-g2-nightly-discovery-live.mjs'
import {
  loadNightlyQueue,
} from '../scripts/youtube-g2-nightly-queue.mjs'
import {
  saveDurableCandidateCheckpoint,loadDurableCandidateCheckpoint,
} from '../scripts/youtube-g2-durable-candidate-checkpoint.mjs'
import {evaluatePacificSearchBudget,RATE,QUOTA}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'
import {reserveWithAtomicGcs}
  from '../scripts/youtube-g2-atomic-search-budget-ledger.mjs'

const NOW='2026-10-25T18:00:00.000Z'
const sample={timeSeries:[{
  metric:{type:RATE,labels:{quota_metric:QUOTA}},
  resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
  points:[{
    interval:{startTime:'2026-10-25T17:49:00Z',
      endTime:'2026-10-25T17:50:00Z'},
    value:{int64Value:'15'},
  }],
}]}
const preflight=()=>evaluatePacificSearchBudget({
  now:NOW,rateHttp:200,rateResponse:sample,
  exceededHttp:200,exceededResponse:{timeSeries:[]},
})
const checkpoint={
  kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
  createdAt:'2026-10-25T16:00:00.000Z',
  updatedAt:'2026-10-25T17:00:00.000Z',
  evidenceStatus:'candidate-only-not-independent-DE-offer',
  verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
  entries:[{tmdbId:101,videoIds:['Abc12345678'],
    provenance:[{kind:'original-trusted-25-film-archive',runId:401001}]}],
}
const publicIndex=()=>({
  kind:'search-index',version:1,country:'DE',source:'tmdb',
  generatedAt:'2026-10-25T17:55:00Z',
  entries:[
    ...[101,102,103,104].map(tmdbId=>({
      type:'movie',tmdbId,title:'Film '+tmdbId,
      originalTitle:'Film '+tmdbId,year:2000,providerIds:['youtube'],
    })),
    ...Array.from({length:102},(_,i)=>({
      type:'movie',tmdbId:10000+i,title:'Other '+i,
      year:2010,providerIds:['google-tv'],
    })),
  ],count:106,
})
function bucket(){
  const objects=new Map()
  return {
    name:'movie-hub-62459-nightly-checkpoints',objects,
    file(name,options={}){
      return {
        async getMetadata(){
          const v=objects.get(name)
          if(!v)throw Object.assign(Error('missing'),{code:404})
          return [{generation:String(v.generation)}]
        },
        async download(){
          const v=objects.get(name)
          if(!v||options.generation&&String(options.generation)!==String(v.generation))
            throw Object.assign(Error('missing'),{code:404})
          return [Buffer.from(v.bytes)]
        },
        async save(data,opts){
          const v=objects.get(name)
          const generation=v?.generation??0
          if(opts?.preconditionOpts?.ifGenerationMatch!==generation)
            throw Object.assign(Error('CAS precondition'),{code:412})
          objects.set(name,{generation:generation+1,bytes:Buffer.from(data)})
        },
      }
    },
  }
}
async function seededBucket(){
  const b=bucket()
  await saveDurableCandidateCheckpoint(b,checkpoint,{expectedGeneration:'0'})
  return b
}
function services(){
  const tmdbGet=vi.fn(async path=>{
    if(path==='/watch/providers/movie')return {
      results:[{provider_name:'YouTube',provider_id:192}],
    }
    if(/^\/movie\/\d+\/watch\/providers$/.test(path)){
      const id=Number(path.split('/')[2])
      return {results:{DE:id===103?{buy:[{provider_id:3}]}:{
        rent:[{provider_id:192}],
      }}}
    }
    if(/^\/movie\/\d+$/.test(path)){
      const id=Number(path.split('/')[2])
      return {id,title:'Film '+id,original_title:'Film '+id,
        release_date:'2000-01-01',runtime:100,credits:{crew:[]},
        alternative_titles:{titles:[]}}
    }
    throw Error('Unexpected TMDB endpoint')
  })
  const youtubeApi=vi.fn(async endpoint=>{
    if(endpoint==='search')return {items:[]}
    if(endpoint==='videos')return {items:[]}
    throw Error('Unexpected YouTube endpoint')
  })
  return {tmdbGet,youtubeApi}
}
describe('scheduled nightly movie research: shared 10 PT calls and private resume',()=>{
  it('uses two actual search calls, skips a known ID and no-offer case, saves cursor',async()=>{
    const b=await seededBucket(),s=services()
    const summary=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:preflight(),
      runId:610101,now:()=>NOW,wait:async()=>{},...s,
    })
    expect(summary).toMatchObject({
      dayLimit:10,priorReserved:0,publicBadgeFilms:4,
      previouslyKnownVideoFilms:1,selectedForSearch:2,
      checkedNoOffer:1,searchCalls:2,videoDetailCalls:0,
      finishedWithoutCandidates:2,status:'completed',
      independentlyVerifiedDEOffers:0,publicationPermitted:false,
      firestoreWrites:0,providerWrites:0,badgeWrites:0,
    })
    expect(s.youtubeApi.mock.calls.map(x=>x[0])).toEqual(['search','search'])
    const cursor=(await loadNightlyQueue(b)).queue
    expect(cursor.entries.map(e=>[e.tmdbId,e.state])).toEqual([
      [102,'no-video-candidates'],[103,'no-current-offer'],
      [104,'no-video-candidates'],
    ])
    const candidates=await loadDurableCandidateCheckpoint(b)
    expect(candidates.checkpoint.entries).toHaveLength(1)
  })
  it('honors an already exhausted daily shared ledger without asking YouTube or TMDB',async()=>{
    const b=await seededBucket(),s=services()
    await reserveWithAtomicGcs(b,{
      now:NOW,runId:610200,calls:10,preflight:preflight(),
    })
    const summary=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:preflight(),
      runId:610201,now:()=>NOW,...s,
    })
    expect(summary).toMatchObject({
      status:'daily-budget-exhausted',
      priorReserved:10,selectedForSearch:0,searchCalls:0,
    })
    expect(s.tmdbGet).not.toHaveBeenCalled()
    expect(s.youtubeApi).not.toHaveBeenCalled()
  })
  it('keeps spent reservations and started cursor on Google 429 with NO retry',async()=>{
    const b=await seededBucket(),s=services()
    s.youtubeApi.mockRejectedValue(Error('HTTP 429 RATE_LIMITED'))
    await expect(runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:preflight(),
      runId:610300,now:()=>NOW,wait:async()=>{},...s,
    })).rejects.toThrow('HTTP 429 RATE_LIMITED')
    expect(s.youtubeApi).toHaveBeenCalledTimes(1)
    const cursor=(await loadNightlyQueue(b)).queue
    expect(cursor.entries.find(e=>e.tmdbId===102)).toMatchObject({
      state:'started',runId:610300,
    })
    const second=await loadNightlyQueue(b)
    expect(second.queue.entries.some(e=>e.tmdbId===103&&e.state==='no-current-offer'))
      .toBe(true)
    const reserve=JSON.parse([...b.objects].find(([path])=>
      path.includes('private-search-budget'))[1].bytes.toString('utf8'))
    expect(reserve.totalConservativelyReserved).toBe(2)
    expect(reserve.reservations).toHaveLength(1)
  })
  it('fails closed before all external calls on stale monitoring, source or GCS bucket',async()=>{
    const b=await seededBucket(),s=services(),p=preflight()
    p.rate.units=90
    await expect(runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:p,
      runId:610400,now:()=>NOW,...s,
    })).rejects.toThrow('YOUTUBE_RESEARCH_SEARCH_PREFLIGHT_NOT_TRUSTED')
    await expect(runNightlyDiscovery({
      publicIndex:{...publicIndex(),source:'fallback'},bucket:b,
      preflight:preflight(),runId:610401,now:()=>NOW,...s,
    })).rejects.toThrow('G2_NIGHTLY_PUBLIC_INDEX_NOT_TRUSTED')
    expect(s.youtubeApi).not.toHaveBeenCalled()
    expect(s.tmdbGet).not.toHaveBeenCalled()
  })
})
