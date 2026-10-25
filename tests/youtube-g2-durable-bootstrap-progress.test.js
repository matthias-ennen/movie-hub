import {describe,it,expect} from 'vitest'
import {
 advanceCompletedBootstrapQa,
 loadBootstrapProgress,persistCompletedBootstrapQa,
 PROGRESS_KIND,PROGRESS_OBJECT,PROGRESS_BUCKET,
} from '../scripts/youtube-g2-durable-bootstrap-progress.mjs'
import {YOUTUBE_FULL_CATALOG_PLAN}
  from '../scripts/youtube-g2-full-catalog-queue.mjs'

const now='2026-10-25T12:00:00Z'
const queueIdentity='a'.repeat(64)
const sourceSha='b'.repeat(40)
const workflow=(id=501)=>({
  runId:id,sourceSha,verifiedCompletedSuccess:true,
  verifiedMainBranch:true,verifiedPrivateArtifact:true,
})
function qa(offset=0,selectedCount=2,total=5){
  const ids=Array.from({length:selectedCount},(_,i)=>101+offset+i)
  return {
    plan:{
      mode:YOUTUBE_FULL_CATALOG_PLAN,
      publicationPermitted:false,verifiedDEOffers:0,
      confirmedDirectLinks:0,catalogWrites:0,firestoreWrites:0,
      providerWrites:0,badgeWrites:0,nightlyWrites:0,
      batch:{
        offset,total,selectedCount,
        nextOffset:offset+selectedCount===total?null:offset+selectedCount,
        queueIdentity,youtubeSearchCallsPlanned:selectedCount*2,
      },
      plan:ids.map(tmdbId=>({
        key:'movie:'+tmdbId,tmdbId,mediaType:'movie',
        confirmedVideoId:null,playbackRoute:null,
        publicationPermitted:false,
      })),
    },
    pilot:{
      summary:{
        publicationPermitted:false,verifiedDirectLinks:0,
        catalogWrites:0,firestoreWrites:0,providerWrites:0,
        badgeWrites:0,nightlyWrites:0,
        processedMovies:selectedCount,
        calls:{youtubeSearches:selectedCount*2},
        statusCounts:{'no-video-candidate':selectedCount},
      },
      rows:ids.map(tmdbId=>({
        tmdbId,status:'no-video-candidate',
        videoCandidates:[],reviewedVideoId:null,
        directPlaybackRoute:null,publicationPermitted:false,
        verifiedDePlayback:false,
      })),
    },
  }
}
function mockedBucket(){
  const state=new Map()
  return {
    name:PROGRESS_BUCKET,state,
    file(name,options={}){
      return {
        async getMetadata(){
          const r=state.get(name)
          if(!r)throw Object.assign(new Error('not found'),{code:404})
          return [{generation:String(r.generation)}]
        },
        async download(){
          const r=state.get(name)
          if(!r||options.generation
            &&String(options.generation)!==String(r.generation))
            throw Object.assign(new Error('not found'),{code:404})
          return [Buffer.from(r.bytes)]
        },
        async save(bytes,opts){
          const old=state.get(name),gen=old?.generation??0
          if(opts?.preconditionOpts?.ifGenerationMatch!==gen)
            throw Object.assign(new Error('generation mismatch'),{code:412})
          state.set(name,{bytes:Buffer.from(bytes),generation:gen+1})
        },
      }
    },
  }
}
describe('YouTube durable bootstrap cursor: only immutable successful QA, never 429',()=>{
  it('advances exactly the successful reviewed batch; "no candidate" is not a DE offer',()=>{
    const first=advanceCompletedBootstrapQa({
      qa:qa(0,2,5),workflow:workflow(601),now,
    })
    expect(first).toMatchObject({
      nextOffset:2,automaticNextBatchAllowed:false,
      independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
      extraYouTubeApiRequests:0,
      progress:{
        kind:PROGRESS_KIND,nextOffset:2,total:5,
        completed:false,autoSearchEnabled:false,productionWrites:0,
      },
    })
    const second=advanceCompletedBootstrapQa({
      current:first.progress,qa:qa(2,2,5),
      workflow:workflow(602),now,
    })
    expect(second.progress.nextOffset).toBe(4)
    const last=advanceCompletedBootstrapQa({
      current:second.progress,qa:qa(4,1,5),
      workflow:workflow(603),now,
    })
    expect(last.nextOffset).toBe(null)
    expect(last.progress.completed).toBe(true)
    expect(last.progress.batches.map(x=>x.runId)).toEqual([601,602,603])
  })
  it('never advances on a partial batch, cancelled run, 429, duplicate, mismatch or queue mutation',()=>{
    const first=advanceCompletedBootstrapQa({
      qa:qa(),workflow:workflow(601),now,
    })
    const bad=[
      {current:first.progress,qa:qa(0,2,5),workflow:workflow(604)},
      {current:first.progress,qa:qa(2,2,6),workflow:workflow(604)},
      {current:first.progress,qa:qa(2,2,5),workflow:workflow(601)},
      {current:first.progress,qa:qa(2,2,5),workflow:{
        ...workflow(604),verifiedCompletedSuccess:false,
      }},
      {current:first.progress,qa:qa(2,2,5),workflow:{
        ...workflow(604),verifiedMainBranch:false,
      }},
      {current:first.progress,qa:qa(2,2,5),workflow:{
        ...workflow(604),verifiedPrivateArtifact:false,
      }},
    ]
    bad[1].qa.plan.batch.queueIdentity='c'.repeat(64)
    for(const x of bad)expect(()=>advanceCompletedBootstrapQa({...x,now})).toThrow()
    for(const mutate of [
      x=>{x.pilot.rows.pop()},
      x=>{x.pilot.summary.processedMovies=1},
      x=>{x.pilot.summary.calls.youtubeSearches=5},
      x=>{x.pilot.summary.verifiedDirectLinks=1},
      x=>{x.pilot.rows[0].directPlaybackRoute='youtube://unverified'},
      x=>{x.pilot.rows[0].publicationPermitted=true},
      x=>{x.pilot.rows[0].tmdbId=9999},
      x=>{x.plan.batch.nextOffset=4},
      x=>{x.plan.publicationPermitted=true},
    ]){
      const q=qa();mutate(q)
      expect(()=>advanceCompletedBootstrapQa({
        qa:q,workflow:workflow(604),now,
      })).toThrow()
    }
  })
  it('uses GCS compare-and-swap; two racing completions cannot move cursor twice',async()=>{
    const b=mockedBucket()
    const jobs=await Promise.allSettled([
      persistCompletedBootstrapQa(b,{qa:qa(),workflow:workflow(701),now}),
      persistCompletedBootstrapQa(b,{qa:qa(),workflow:workflow(702),now}),
    ])
    expect(jobs.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    expect(jobs.filter(x=>x.status==='rejected')).toHaveLength(1)
    expect(jobs.find(x=>x.status==='rejected').reason.code).toBe(412)
    const state=await loadBootstrapProgress(b)
    expect(state.generation).toBe('1')
    expect(state.progress.nextOffset).toBe(2)
    expect(state.progress.batches).toHaveLength(1)
    expect(b.state.has(PROGRESS_OBJECT)).toBe(true)
    const next=await persistCompletedBootstrapQa(b,{
      qa:qa(2,2,5),workflow:workflow(703),now,
    })
    expect(next).toMatchObject({
      nextOffset:4,completed:false,consumedRuns:2,
      quotaReservationAcquired:false,autoSearchEnabled:false,
      youtubeCallsPerformed:0,productionWrites:0,
    })
  })
  it('rejects a foreign object store before any read/write',async()=>{
    const b=mockedBucket();b.name='public-other-bucket'
    await expect(persistCompletedBootstrapQa(b,{
      qa:qa(),workflow:workflow(),now,
    })).rejects.toThrow('YOUTUBE_BOOTSTRAP_PRIVATE_BUCKET_REQUIRED')
    expect(b.state.size).toBe(0)
  })
})
