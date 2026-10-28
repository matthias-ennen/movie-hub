import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  initialNightlyQueue,validateNightlyQueue,putNightlyResult,
  selectNightlyPublicBadgeMovies,loadNightlyQueue,saveNightlyQueue,
} from '../scripts/youtube-g2-nightly-queue.mjs'

const AT='2026-10-25T18:00:00.000Z'
const checkpoint={
  kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
  createdAt:'2026-10-25T16:00:00Z',updatedAt:'2026-10-25T17:00:00Z',
  evidenceStatus:'candidate-only-not-independent-DE-offer',
  verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
  entries:[{tmdbId:101,videoIds:['Abc12345678'],
    provenance:[{kind:'original-trusted-25-film-archive',runId:401001}]}],
}
const publicIndex=()=>({
  kind:'search-index',version:1,source:'tmdb',country:'DE',
  generatedAt:'2026-10-25T17:50:00.000Z',
  entries:[
    {type:'movie',tmdbId:101,providerIds:['youtube']},
    {type:'movie',tmdbId:102,providerIds:['youtube']},
    {type:'movie',tmdbId:103,providerOffers:[{id:'youtube'}]},
    {type:'movie',tmdbId:104,providerIds:['youtube']},
    {type:'movie',tmdbId:105,providerIds:['google-tv']},
    {type:'series',tmdbId:106,providerIds:['youtube']},
  ],count:6,
})
function bucket(){
  const saved=new Map()
  return {
    name:'movie-hub-62459-nightly-checkpoints',saved,
    file(name,options={}){
      return {
        async getMetadata(){
          const record=saved.get(name)
          if(!record)throw Object.assign(Error('missing'),{code:404})
          return [{generation:String(record.generation)}]
        },
        async download(){
          const record=saved.get(name)
          if(!record||options.generation
            &&String(options.generation)!==String(record.generation))
            throw Object.assign(Error('missing generation'),{code:404})
          return [Buffer.from(record.bytes)]
        },
        async save(bytes,opts={}){
          const old=saved.get(name)
          const generation=old?.generation??0
          if(opts.preconditionOpts?.ifGenerationMatch!==generation)
            throw Object.assign(Error('GCS CAS conflict'),{code:412})
          saved.set(name,{bytes:Buffer.from(bytes),generation:generation+1})
        },
      }
    },
  }
}
describe('private nightly movie cursor / capped public badge queue',()=>{
  it('plans only currently badged unseen public movies, not private or Google-TV-only identities',()=>{
    const selected=selectNightlyPublicBadgeMovies({
      publicIndex:publicIndex(),checkpoint,now:AT,
    })
    expect(selected).toMatchObject({
      movieIds:[102,103,104],totalPublicBadgeMovies:4,
      knownCandidateMovies:1,pendingMovies:3,
      verifiedDEOffers:0,publicationPermitted:false,
    })
    expect(selected).not.toHaveProperty('personalData')
  })
  it('persists completed negatives for 30 days and resumes remaining work on the next day',()=>{
    let progress=initialNightlyQueue(AT)
    progress=putNightlyResult(progress,{
      tmdbId:102,state:'no-video-candidates',runId:610011,now:AT,
    })
    progress=putNightlyResult(progress,{
      tmdbId:103,state:'no-current-offer',runId:610011,now:AT,
    })
    expect(selectNightlyPublicBadgeMovies({
      publicIndex:publicIndex(),checkpoint,progress,now:AT,
    }).movieIds).toEqual([104])
    const later='2026-11-25T18:00:00.000Z'
    const index={...publicIndex(),generatedAt:'2026-11-25T17:00:00.000Z'}
    expect(selectNightlyPublicBadgeMovies({
      publicIndex:index,checkpoint,progress,now:later,
    }).movieIds).toEqual([104,102,103])
  })
  it('holds interrupted films for two days; completion under same run cannot be restarted',()=>{
    let progress=putNightlyResult(initialNightlyQueue(AT),{
      tmdbId:102,state:'started',runId:610012,now:AT,
    })
    expect(selectNightlyPublicBadgeMovies({
      publicIndex:publicIndex(),checkpoint,progress,now:AT,
    }).movieIds).toEqual([103,104])
    progress=putNightlyResult(progress,{
      tmdbId:102,state:'known-candidate',runId:610012,now:AT,
    })
    expect(()=>putNightlyResult(progress,{
      tmdbId:102,state:'started',runId:610012,now:AT,
    })).toThrow('G2_NIGHTLY_FINISHED_MOVIE_CANNOT_RESTART')
    expect(validateNightlyQueue(progress).entries).toHaveLength(1)
  })
  it('never accepts forged offers, duplicates or personal IDs',()=>{
    for(const mutate of [
      doc=>{doc.verifiedDEOffers=1},
      doc=>{doc.privateOnly=false},
      doc=>{doc.productionWrites=1},
      doc=>{doc.entries=[{tmdbId:1,state:'done',runId:1,updatedAt:AT}]},
      doc=>{doc.entries=[{tmdbId:1,state:'started',runId:1,updatedAt:AT},
        {tmdbId:1,state:'started',runId:2,updatedAt:AT}]},
    ]){
      const doc=initialNightlyQueue(AT)
      mutate(doc)
      expect(()=>validateNightlyQueue(doc)).toThrow()
    }
    expect(()=>selectNightlyPublicBadgeMovies({
      publicIndex:{...publicIndex(),source:'fallback'},checkpoint,now:AT,
    })).toThrow('G2_NIGHTLY_PUBLIC_INDEX_NOT_TRUSTED')
  })
  it('can plan 600 public badge preflights offline while the live runner remains capped at 60',()=>{
    const all=Array.from({length:1200},(_,i)=>({
      type:'movie',tmdbId:1000+i,providerIds:['youtube'],
    }))
    const index={kind:'search-index',version:1,source:'tmdb',country:'DE',
      generatedAt:'2026-10-25T17:50:00.000Z',entries:all,count:all.length}
    let progress=putNightlyResult(initialNightlyQueue(AT),{
      tmdbId:1001,state:'started',runId:610020,now:AT,
    })
    progress=putNightlyResult(progress,{
      tmdbId:1002,state:'no-current-offer',runId:610020,now:AT,
    })
    const large=selectNightlyPublicBadgeMovies({
      publicIndex:index,checkpoint,progress,now:AT,limit:600,
    })
    expect(large.movieIds).toHaveLength(600)
    expect(large.movieIds[0]).toBe(1000)
    expect(large.movieIds[599]).toBe(1601)
    expect(large.movieIds).not.toContain(1001)
    expect(large.movieIds).not.toContain(1002)
    expect(large).toMatchObject({
      totalPublicBadgeMovies:1200,knownCandidateMovies:0,
      recentProgressMovies:2,pendingMovies:1198,queueTruncated:true,
      publicationPermitted:false,verifiedDEOffers:0,
    })
    expect(selectNightlyPublicBadgeMovies({
      publicIndex:index,checkpoint,now:AT,
    }).movieIds).toHaveLength(120)
    expect(()=>selectNightlyPublicBadgeMovies({
      publicIndex:index,checkpoint,now:AT,limit:601,
    })).toThrow('G2_NIGHTLY_PUBLIC_INDEX_NOT_TRUSTED')
    const live=readFileSync(new URL(
      '../scripts/youtube-g2-nightly-discovery-live.mjs',import.meta.url),'utf8')
    expect(live).toContain('NIGHTLY_MAX_TMDB_PREFLIGHT_MOVIES=60')
    expect(live).toContain('now:startedAt,limit:NIGHTLY_MAX_TMDB_PREFLIGHT_MOVIES')
    expect(live).toContain('NIGHTLY_TMDB_MAX_REQUESTS=1+NIGHTLY_MAX_TMDB_PREFLIGHT_MOVIES')
  })
  it('saves with CAS, validates readback and rejects stale concurrent writers',async()=>{
    const b=bucket()
    const first=await loadNightlyQueue(b)
    expect(first).toMatchObject({queue:null,generation:'0'})
    const done=putNightlyResult(null,{
      tmdbId:102,state:'started',runId:610013,now:AT,
    })
    const saved=await saveNightlyQueue(b,done,{expectedGeneration:'0'})
    expect(saved.generation).toBe('1')
    expect(saved.queue.entries[0]).toMatchObject({tmdbId:102,state:'started'})
    await expect(saveNightlyQueue(b,done,{
      expectedGeneration:'0',
    })).rejects.toMatchObject({code:412})
    const next=await saveNightlyQueue(b,putNightlyResult(saved.queue,{
      tmdbId:102,state:'no-video-candidates',runId:610013,now:AT,
    }),{expectedGeneration:saved.generation})
    expect(next.generation).toBe('2')
    expect(next.queue.entries[0].state).toBe('no-video-candidates')
  })
})
