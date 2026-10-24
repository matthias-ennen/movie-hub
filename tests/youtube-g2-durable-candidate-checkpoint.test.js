import {describe,it,expect} from 'vitest'
import {TMDB_FIRST_GOLDEN} from '../scripts/youtube-g2-quality-golden.mjs'
import {
  createCandidateCheckpointFromArchive,validateCandidateCheckpoint,
  mapFromCandidateCheckpoint,mergeCandidateCheckpoint,
  loadDurableCandidateCheckpoint,saveDurableCandidateCheckpoint,
} from '../scripts/youtube-g2-durable-candidate-checkpoint.mjs'
const NOW='2026-10-24T14:00:00.000Z'
const status={single:'review-single-video-candidate',
  multiple:'review-multiple-video-editions',
  unresolved:'review-weak-or-unresolved-videos'}
const original=()=>({
  summary:{
    mode:'TMDB_FIRST_LINK_RESEARCH_ONLY',selectedMovies:25,processedMovies:25,
    historicalCohortMovies:25,historicalCohortAccountedFor:25,
    fullAccountInventory:'not-loaded',historicalPublicBadgeMissingIds:[],
    priorDeviceCandidatesApprovedAsOffers:0,
    calls:{youtubeSearches:50,youtubeVideoLookups:5,tmdbGetRequests:51},
    statusCounts:{
      'review-single-video-candidate':13,
      'review-multiple-video-editions':6,
      'review-weak-or-unresolved-videos':6,
    },
    publicationPermitted:false,verifiedDirectLinks:0,verifiedSeriesEpisodes:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  },
  rows:TMDB_FIRST_GOLDEN.map(g=>({
    mediaType:'movie',tmdbId:g.tmdbId,status:status[g.observedClass],
    publicationPermitted:false,reviewedVideoId:null,directPlaybackRoute:null,
    videoCandidates:[{videoId:g.leadVideoId}],
  })),
})
const movie=(tmdbId,ids)=>({
  tmdbId,publicationPermitted:false,reviewedVideoId:null,directPlaybackRoute:null,
  videoCandidates:ids.map(videoId=>({videoId})),
})
function batch(items){
  return {
    plan:{
      publicationPermitted:false,verifiedDEOffers:0,confirmedDirectLinks:0,
      catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
      batch:{selectedCount:items.length},
      plan:items.map(x=>({tmdbId:x.tmdbId})),
    },
    pilot:{
      summary:{
        publicationPermitted:false,verifiedDirectLinks:0,
        processedMovies:items.length,catalogWrites:0,firestoreWrites:0,
        providerWrites:0,badgeWrites:0,nightlyWrites:0,
      },
      rows:items,
    },
  }
}
function memoryBucket(){
  const objects=new Map(), generations=new Map()
  let next=1
  return {
    objects,
    file(name,{generation}={}){
      return {
        async getMetadata(){
          if(!objects.has(name))throw Object.assign(Error('not found'),{code:404})
          return [{generation:String(generations.get(name))}]
        },
        async download(){
          if(!objects.has(name)||generation&&generation!==String(generations.get(name)))
            throw Object.assign(Error('not found'),{code:404})
          return [Buffer.from(objects.get(name))]
        },
        async save(bytes,opts={}){
          const current=generations.get(name)||0
          const expected=opts.preconditionOpts?.ifGenerationMatch
          if(expected!==undefined&&Number(expected)!==current)
            throw Object.assign(Error('precondition failed'),{code:412})
          objects.set(name,Buffer.isBuffer(bytes)?Buffer.from(bytes):Buffer.from(bytes))
          generations.set(name,next++)
        },
      }
    },
  }
}
describe('durable private candidate checkpoint: persistence, integrity, no offers',()=>{
  it('compacts original 25-film private QA without user data or player grants',()=>{
    const doc=createCandidateCheckpointFromArchive(original(),{now:NOW})
    expect(doc.entries.length).toBe(25)
    expect(doc.entries[0].tmdbId).toBeLessThan(doc.entries.at(-1).tmdbId)
    expect(doc.entries.map(e=>e.tmdbId).sort((a,b)=>a-b))
      .toEqual(doc.entries.map(e=>e.tmdbId))
    expect(mapFromCandidateCheckpoint(doc).size).toBe(25)
    expect(doc).toMatchObject({
      verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
      evidenceStatus:'candidate-only-not-independent-DE-offer',
    })
    expect(JSON.stringify(doc)).not.toContain('candidateWatchUrl')
  })
  it('merges later successful batches by exact work ID; no profile or approval writes',()=>{
    const doc=createCandidateCheckpointFromArchive(original(),{now:NOW})
    const existingId=doc.entries[0].tmdbId
    const existingVideoId=doc.entries[0].videoIds[0]
    const qa=batch([
      movie(existingId,[existingVideoId,'More1234567']),
      movie(7777777,['Fresh123456']),
    ])
    const r=mergeCandidateCheckpoint(doc,qa,{runId:40112345678,now:'2026-10-25T10:00:00Z'})
    expect(r).toMatchObject({newMovies:1,newIds:2,existingMovies:25,movies:26})
    expect(r.checkpoint.entries.find(x=>x.tmdbId===existingId).videoIds)
      .toEqual([existingVideoId,'More1234567'])
    expect(r.checkpoint.entries.find(x=>x.tmdbId===7777777).provenance)
      .toEqual([{kind:'successful-readonly-full-catalog-batch',runId:40112345678}])
    expect(r.checkpoint).toMatchObject({approvedDirectRoutes:0,
      verifiedDEOffers:0,productionWrites:0})
  })
  it('rejects forged credentials, writes, offer grants and changed source work IDs',()=>{
    const doc=createCandidateCheckpointFromArchive(original(),{now:NOW})
    for(const mutation of [
      x=>{x.approvedDirectRoutes=1},
      x=>{x.entries[0].videoIds=['https://youtube.com/watch?v=bad']},
      x=>{x.entries[1].tmdbId=x.entries[0].tmdbId},
      x=>{x.entries[0].provenance[0].runId='bad'},
      x=>{x.entries.reverse()},
    ]){
      const x=structuredClone(doc);mutation(x)
      expect(()=>validateCandidateCheckpoint(x)).toThrow()
    }
    const qa=batch([movie(111,['Abc12345678'])])
    for(const mutation of [
      x=>{x.pilot.summary.firestoreWrites=1},
      x=>{x.pilot.summary.verifiedDirectLinks=1},
      x=>{x.pilot.rows[0].tmdbId=112},
      x=>{x.pilot.rows[0].directPlaybackRoute='https://youtu.be/Abc12345678'},
      x=>{x.pilot.rows[0].videoCandidates[0].videoId='bad'},
      x=>{x.plan.confirmedDirectLinks=1},
    ]){
      const x=structuredClone(qa);mutation(x)
      expect(()=>mergeCandidateCheckpoint(doc,x,{runId:40112345678,now:NOW})).toThrow()
    }
  })
  it('writes immutable snapshot, checksum-verifies and refuses concurrent pointer overwrite',async()=>{
    const bucket=memoryBucket()
    const doc=createCandidateCheckpointFromArchive(original(),{now:NOW})
    expect((await loadDurableCandidateCheckpoint(bucket)).checkpoint).toBeNull()
    await saveDurableCandidateCheckpoint(bucket,doc,{expectedGeneration:'0'})
    const loaded=await loadDurableCandidateCheckpoint(bucket)
    expect(loaded.checkpoint).toEqual(doc)
    expect(loaded.generation).not.toBe('0')
    await expect(saveDurableCandidateCheckpoint(bucket,doc,{expectedGeneration:'0'}))
      .rejects.toThrow()
    const latest=[...bucket.objects.keys()].find(x=>x.endsWith('/latest.json'))
    const pointer=JSON.parse(bucket.objects.get(latest).toString())
    const snapshot=bucket.objects.get(pointer.object)
    snapshot[0]=snapshot[0]===123?91:123
    await expect(loadDurableCandidateCheckpoint(bucket))
      .rejects.toThrow('G2_CANDIDATE_SNAPSHOT_CHECKSUM_FAILED')
  })
})
