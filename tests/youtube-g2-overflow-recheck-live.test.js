import {describe,it,expect,vi} from 'vitest'
import {OVERFLOW_CURSOR_OBJECT}
  from '../scripts/youtube-g2-overflow-rotation-cursor.mjs'
import {
  OVERFLOW_QA_PREFIX,OVERFLOW_QA_KIND,MAX_OVERFLOW_TMDB_CALLS,
  MAX_OVERFLOW_VIDEOS_CALLS,runOverflowLiveReview,
} from '../scripts/youtube-g2-overflow-recheck-live.mjs'

const now='2026-10-26T18:00:00.000Z'
const video=id=>'Z'+String(id).padStart(10,'0')
function candidateCheckpoint(size=255){
  return {
    kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
    createdAt:'2026-10-25T10:00:00Z',updatedAt:'2026-10-26T09:00:00Z',
    evidenceStatus:'candidate-only-not-independent-DE-offer',
    verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
    entries:Array.from({length:size},(_,i)=>({
      tmdbId:1000+i,videoIds:[video(1000+i)],
      provenance:[{kind:i<250?'original-trusted-25-film-archive'
        :'successful-readonly-full-catalog-batch',runId:40328668763}],
    })),
  }
}
function index(c){
  const entries=[...c.entries.map(e=>({type:'movie',tmdbId:e.tmdbId,
    title:'Film '+e.tmdbId,year:2010,providerIds:['youtube']})),
  ...Array.from({length:101},(_,i)=>({type:'movie',tmdbId:20000+i,
    title:'Other '+i,providerIds:['other']}))]
  return {kind:'search-index',version:1,source:'tmdb',country:'DE',
    generatedAt:'2026-10-26T08:00:00Z',
    count:entries.length,entries}
}
function bucket(){
  const store=new Map(),generation=new Map()
  const b={name:'movie-hub-62459-nightly-checkpoints',file:vi.fn((path,config={})=>({
    async getMetadata(){
      if(!store.has(path))throw Object.assign(Error('404'),{code:404})
      return [{generation:String(generation.get(path))}]
    },
    async download(){
      if(!store.has(path))throw Object.assign(Error('404'),{code:404})
      if(config.generation!==undefined
        &&Number(config.generation)!==generation.get(path))
        throw Error('stale generation')
      return [store.get(path)]
    },
    async save(bytes,{preconditionOpts}={}){
      const prior=generation.get(path)??0
      if(preconditionOpts?.ifGenerationMatch!==prior)
        throw Object.assign(Error('CAS conflict'),{code:412})
      store.set(path,Buffer.from(bytes))
      generation.set(path,prior+1)
    },
  }))}
  return {b,store,generation}
}
function fakePilot({publicIndex,seedRefs,knownVideoCandidatesByTmdbId,
  tmdbGet,youtubeApi}){
  return (async()=>{
    const ids=seedRefs.map(e=>e.tmdbId)
    await tmdbGet('/watch/providers/movie',{language:'de-DE'})
    for(const id of ids){
      await tmdbGet('/movie/'+id+'/watch/providers',{})
      await tmdbGet('/movie/'+id,{language:'de-DE'})
    }
    const sourceIds=ids.map(id=>knownVideoCandidatesByTmdbId.get(id)[0])
    const request=await youtubeApi('videos',{part:'snippet,contentDetails,status',
      id:sourceIds.join(',')})
    if(!request.items)throw Error('fake video missing')
    return {
      summary:{processedMovies:ids.length,publicationPermitted:false,
        verifiedDirectLinks:0,catalogWrites:0,firestoreWrites:0,
        providerWrites:0,badgeWrites:0,
        calls:{youtubeSearches:0,youtubeVideoLookups:1,
          tmdbGetRequests:1+2*ids.length}},
      rows:ids.map(id=>({tmdbId:id,status:'review-single-video-candidate',
        candidateDiscoveryMode:'trusted-previous-candidate-ids',
        videoCandidates:[{videoId:video(id)}],
        publicationPermitted:false,directPlaybackRoute:null,
        reviewedVideoId:null})),
    }
  })()
}
const tmdbGet=vi.fn(async()=>({results:[]}))
const youtubeApi=vi.fn(async()=>({items:[]}))
const run=(cfg={})=>{
  const c=cfg.checkpoint??candidateCheckpoint()
  const {b,store,generation}=cfg.store??bucket()
  return {
    store,generation,b,
    promise:runOverflowLiveReview({checkpoint:c,publicIndex:index(c),
      bucket:b,runId:501,now,pilot:fakePilot,tmdbGet,youtubeApi,...cfg}),
  }
}
describe('G2 manually gated private overflow videos.list review',()=>{
  it('does 5 known-ID reviews, persists immutable private QA, then advances cursor',async()=>{
    const {promise,store}=run()
    const result=await promise
    expect(result).toMatchObject({kind:OVERFLOW_QA_KIND,
      status:'review-complete',selectedMovies:5,searchCalls:0,
      videosListCalls:1,tmdbCalls:11,privateQaStored:true,
      cursorAdvanced:true,publicationPermitted:false,
      verifiedDEOffers:0,publishedDirectRoutes:0,productionWrites:0})
    const qa=JSON.parse(store.get(OVERFLOW_QA_PREFIX+'/501.json'))
    expect(qa.rows.map(x=>x.tmdbId)).toEqual([1250,1251,1252,1253,1254])
    expect(qa.summary.status).toBe('review-complete')
    const cursor=JSON.parse(store.get(OVERFLOW_CURSOR_OBJECT))
    expect(cursor).toMatchObject({lastTmdbId:1254,
      reviewedFilms:5,completedBatches:1,privateOnly:true,
      searchCalls:0,verifiedDEOffers:0,publicationPermitted:false})
  })
  it('does not run API or mutate GCS when there is no overflow',async()=>{
    const c=candidateCheckpoint(250),{promise,store}=run({checkpoint:c})
    const s=await promise
    expect(s.status).toBe('no-eligible-overflow')
    expect(s.selectedMovies).toBe(0)
    expect(store.size).toBe(0)
  })
  it('does not retry on the same UTC date or overwrite private QA',async()=>{
    const shared=bucket(),c=candidateCheckpoint()
    await runOverflowLiveReview({checkpoint:c,publicIndex:index(c),
      bucket:shared.b,runId:501,now,pilot:fakePilot,tmdbGet,youtubeApi})
    const second=await runOverflowLiveReview({checkpoint:c,publicIndex:index(c),
      bucket:shared.b,runId:502,now,pilot:fakePilot,tmdbGet,youtubeApi})
    expect(second.status).toBe('already-reviewed-today')
    expect(shared.store.has(OVERFLOW_QA_PREFIX+'/502.json')).toBe(false)
  })
  it('never calls search.list and never advances the cursor on a failed pilot',async()=>{
    const {b,store}=bucket(),c=candidateCheckpoint()
    const malicious=async({youtubeApi:yt})=>{
      await yt('search',{q:'film'})
      return fakePilot()
    }
    await expect(runOverflowLiveReview({checkpoint:c,publicIndex:index(c),
      bucket:b,runId:501,now,pilot:malicious,tmdbGet,youtubeApi}))
      .rejects.toThrow('G2_OVERFLOW_YOUTUBE_SEARCH_FORBIDDEN_OR_VIDEO_BUDGET')
    expect(store.size).toBe(0)
    expect(youtubeApi).not.toHaveBeenCalledWith('search',expect.anything())
  })
  it('rejects unexpected video lookup IDs before external calls',async()=>{
    const {b,store}=bucket(),c=candidateCheckpoint()
    const evil=async({youtubeApi:yt})=>{
      await yt('videos',{id:'XXXXXXXXXXX'})
    }
    await expect(runOverflowLiveReview({checkpoint:c,publicIndex:index(c),
      bucket:b,runId:501,now,pilot:evil,tmdbGet,youtubeApi}))
      .rejects.toThrow('G2_OVERFLOW_VIDEO_ID_NOT_IN_CHECKPOINT')
    expect(store.size).toBe(0)
  })
  it('rejects fabricated validated offers and wrong publication results',async()=>{
    const {b,store}=bucket(),c=candidateCheckpoint()
    const malicious=async opts=>{
      const r=await fakePilot(opts)
      r.summary.verifiedDirectLinks=1
      return r
    }
    await expect(runOverflowLiveReview({checkpoint:c,publicIndex:index(c),
      bucket:b,runId:501,now,pilot:malicious,tmdbGet,youtubeApi}))
      .rejects.toThrow('G2_OVERFLOW_RESEARCH_NOT_SAFE')
    expect(store.size).toBe(0)
  })
  it('rejects unknown film IDs returned by an otherwise complete review',async()=>{
    const {b,store}=bucket(),c=candidateCheckpoint()
    const corrupt=async opts=>{
      const r=await fakePilot(opts)
      r.rows[0].videoCandidates[0].videoId='XXXXXXXXXXX'
      return r
    }
    await expect(runOverflowLiveReview({checkpoint:c,publicIndex:index(c),
      bucket:b,runId:501,now,pilot:corrupt,tmdbGet,youtubeApi}))
      .rejects.toThrow('G2_OVERFLOW_RESEARCH_NOT_SAFE')
    expect(store.size).toBe(0)
  })
  it('a QA write failure must NOT advance the cursor',async()=>{
    const {b,store}=bucket(),c=candidateCheckpoint(),orig=b.file
    b.file=path=>{
      const f=orig(path)
      return path.startsWith(OVERFLOW_QA_PREFIX)?{
        ...f,save:async()=>{throw Error('GCS-UNAVAILABLE')},
      }:f
    }
    await expect(runOverflowLiveReview({checkpoint:c,publicIndex:index(c),
      bucket:b,runId:501,now,pilot:fakePilot,tmdbGet,youtubeApi}))
      .rejects.toThrow('GCS-UNAVAILABLE')
    expect(store.has(OVERFLOW_CURSOR_OBJECT)).toBe(false)
  })
  it('a cursor CAS conflict leaves the immutable private QA for safe recovery',async()=>{
    const {b,store}=bucket(),c=candidateCheckpoint(),orig=b.file
    b.file=path=>{
      const f=orig(path)
      return path===OVERFLOW_CURSOR_OBJECT?{
        ...f,save:async()=>{throw Object.assign(Error('CAS conflict'),{code:412})},
      }:f
    }
    await expect(runOverflowLiveReview({checkpoint:c,publicIndex:index(c),
      bucket:b,runId:501,now,pilot:fakePilot,tmdbGet,youtubeApi}))
      .rejects.toThrow('CAS conflict')
    expect(store.has(OVERFLOW_QA_PREFIX+'/501.json')).toBe(true)
    expect(store.has(OVERFLOW_CURSOR_OBJECT)).toBe(false)
  })
  it('does not exceed the fixed TMDB/video budget',()=>{
    expect(MAX_OVERFLOW_TMDB_CALLS).toBe(60)
    expect(MAX_OVERFLOW_VIDEOS_CALLS).toBe(5)
  })
})
