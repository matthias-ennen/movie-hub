import {describe,it,expect,vi} from 'vitest'
import {
  OVERFLOW_MAX_REVIEW_FILMS,OVERFLOW_CURSOR_OBJECT,
  initialOverflowCursor,validateOverflowCursor,
  planOverflowRotation,advanceOverflowCursor,
  loadOverflowCursor,saveOverflowCursor,
} from '../scripts/youtube-g2-overflow-rotation-cursor.mjs'

const at=day=>day+'T10:00:00.000Z'
const day1=at('2026-10-26'),day2=at('2026-10-27'),day3=at('2026-10-28')
const videoId=id=>'Z'+String(id).padStart(10,'0')
const entry=(tmdbId,kind='successful-readonly-full-catalog-batch',id=videoId(tmdbId))=>({
  tmdbId,videoIds:[id],provenance:[{kind,runId:40328668763}],
})
function checkpoint({size=255,baseline=250}={}){
  return {
    kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
    createdAt:'2026-10-25T08:00:00Z',updatedAt:'2026-10-25T20:00:00Z',
    evidenceStatus:'candidate-only-not-independent-DE-offer',
    verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
    entries:Array.from({length:size},(_,i)=>entry(1000+i,
      i<baseline?'published-editorial-playlist-hint'
        :'successful-readonly-full-catalog-batch')),
  }
}
function publicIndex(c){
  const entries=[
    ...c.entries.map(x=>({type:'movie',tmdbId:x.tmdbId,title:'Film '+x.tmdbId,
      year:2010,providerIds:['youtube']})),
    ...Array.from({length:110},(_,i)=>({type:'movie',tmdbId:100000+i,
      title:'Other '+i,providerIds:['other']})),
  ]
  return {kind:'search-index',version:1,source:'tmdb',country:'DE',
    generatedAt:'2026-10-26T09:00:00Z',count:entries.length,entries}
}
function fakeBucket(){
  const store=new Map()
  let currentGen=0
  const file=vi.fn((name,options={})=>{
    if(name!==OVERFLOW_CURSOR_OBJECT)throw Error('unexpected GCS object')
    return {
      async getMetadata(){
        if(!store.has(name))throw Object.assign(Error('not found'),{code:404})
        return [{generation:String(currentGen)}]
      },
      async download(){
        if(!store.has(name))throw Object.assign(Error('not found'),{code:404})
        if(options.generation!==undefined&&Number(options.generation)!==currentGen)
          throw Error('stale-generation')
        return [store.get(name)]
      },
      async save(bytes,opts){
        if(opts?.preconditionOpts?.ifGenerationMatch!==currentGen)
          throw Object.assign(Error('CAS conflict'),{code:412})
        store.set(name,Buffer.from(bytes));currentGen++
      },
    }
  })
  return {bucket:{name:'movie-hub-62459-nightly-checkpoints',file},store}
}
describe('private overflow rotation – candidate-only, no API, no publication',()=>{
  it('reviews only the excess beyond the stable 250 baseline',()=>{
    const c=checkpoint(),p=planOverflowRotation({
      checkpoint:c,publicIndex:publicIndex(c),now:day1})
    expect(OVERFLOW_MAX_REVIEW_FILMS).toBe(25)
    expect(p).toMatchObject({
      checkpointFilms:255,baselineFilms:250,deferredFilms:5,
      eligibleOverflowFilms:5,selectedIds:[1250,1251,1252,1253,1254],
      searchCalls:0,verifiedDEOffers:0,publicationPermitted:false,
      productionWrites:0,wrapped:false,alreadyReviewedToday:false,
    })
  })
  it('is bounded at 3,500 identities and reviews only 25 per day',()=>{
    const c=checkpoint({size:3500}),index=publicIndex(c)
    const p=planOverflowRotation({checkpoint:c,publicIndex:index,now:day1})
    expect(p).toMatchObject({
      checkpointFilms:3500,baselineFilms:250,deferredFilms:3250,
      eligibleOverflowFilms:3250,
    })
    expect(p.selectedIds).toHaveLength(25)
    expect(p.selectedIds[0]).toBe(1250)
    expect(p.selectedIds.at(-1)).toBe(1274)
    const cursor=advanceOverflowCursor(null,p,{now:day1})
    const sameDay=planOverflowRotation({
      checkpoint:c,publicIndex:index,cursor,now:at('2026-10-26')})
    expect(sameDay.selectedIds).toEqual([])
    expect(sameDay.alreadyReviewedToday).toBe(true)
    const nextDay=planOverflowRotation({
      checkpoint:c,publicIndex:index,cursor,now:day2})
    expect(nextDay.selectedIds[0]).toBe(1275)
    expect(nextDay.selectedIds.at(-1)).toBe(1299)
    expect(advanceOverflowCursor(cursor,nextDay,{now:day2}))
      .toMatchObject({lastTmdbId:1299,completedBatches:2,reviewedFilms:50})
  })
  it('wraps only when all higher overflow IDs have been consumed',()=>{
    const c=checkpoint(),index=publicIndex(c)
    const first=planOverflowRotation({
      checkpoint:c,publicIndex:index,now:day1,limit:3})
    const c1=advanceOverflowCursor(null,first,{now:day1})
    const second=planOverflowRotation({
      checkpoint:c,publicIndex:index,cursor:c1,now:day2,limit:3})
    expect(second.selectedIds).toEqual([1253,1254])
    expect(second.wrapped).toBe(false)
    const c2=advanceOverflowCursor(c1,second,{now:day2})
    const third=planOverflowRotation({
      checkpoint:c,publicIndex:index,cursor:c2,now:day3,limit:3})
    expect(third.wrapped).toBe(true)
    expect(third.selectedIds).toEqual([1250,1251,1252])
  })
  it('never promotes a newer low-numbered research film into the baseline',()=>{
    const c=checkpoint()
    c.entries.push(entry(5))
    c.entries.sort((a,b)=>a.tmdbId-b.tmdbId)
    const plan=planOverflowRotation({
      checkpoint:c,publicIndex:publicIndex(c),now:day1})
    expect(plan.baselineFilms).toBe(250)
    expect(plan.selectedIds).toContain(5)
    expect(plan.selectedIds).not.toContain(1000)
  })
  it('excludes cross-title collisions even if one film belongs to the baseline',()=>{
    const c=checkpoint()
    c.entries.find(e=>e.tmdbId===1250).videoIds=[videoId(1000)]
    const p=planOverflowRotation({checkpoint:c,publicIndex:publicIndex(c),now:day1})
    expect(p.collisionQuarantineFilms).toBe(2)
    expect(p.selectedIds).not.toContain(1250)
    expect(p.selectedIds).not.toContain(1000)
    expect(p.publicationPermitted).toBe(false)
  })
  it('excludes films which no longer carry the public YouTube badge',()=>{
    const c=checkpoint(),index=publicIndex(c)
    index.entries.find(x=>x.tmdbId===1250).providerIds=[]
    const p=planOverflowRotation({checkpoint:c,publicIndex:index,now:day1})
    expect(p.missingPublicBadgeFilms).toBe(1)
    expect(p.selectedIds).toEqual([1251,1252,1253,1254])
  })
  it('rejects injected video IDs, publication authority and malformed cursor fields',()=>{
    const x=initialOverflowCursor(day1)
    expect(()=>validateOverflowCursor({...x,videoId:'ABCDEF12345'})).toThrow()
    expect(()=>validateOverflowCursor({...x,publicationPermitted:true})).toThrow()
    expect(()=>validateOverflowCursor({...x,searchCalls:1})).toThrow()
    expect(()=>validateOverflowCursor({...x,updatedAt:'garbage'})).toThrow()
    expect(()=>advanceOverflowCursor(x,{selectedIds:[1250],generatedAt:day1,
      startedAfterTmdbId:0,publicationPermitted:true,searchCalls:0,
      verifiedDEOffers:0,productionWrites:0},{now:day1})).toThrow()
  })
  it('refuses stale index, oversized batch and clocks moving backwards',()=>{
    const c=checkpoint(),index=publicIndex(c)
    expect(()=>planOverflowRotation({checkpoint:c,publicIndex:index,
      now:day1,limit:26})).toThrow()
    expect(()=>planOverflowRotation({checkpoint:c,publicIndex:index,
      now:'2026-12-01T00:00:00.000Z'})).toThrow()
    expect(()=>planOverflowRotation({checkpoint:c,publicIndex:index,
      cursor:initialOverflowCursor(day2),now:day1})).toThrow()
  })
  it('persists a private GCS cursor via generation-CAS and exact readback',async()=>{
    const {bucket}=fakeBucket()
    expect(await loadOverflowCursor(bucket)).toEqual({
      cursor:null,generation:'0'})
    const created=initialOverflowCursor(day1)
    const saved=await saveOverflowCursor(bucket,created,{expectedGeneration:'0'})
    expect(saved).toMatchObject({generation:'1',cursor:created})
    const c=checkpoint(),p=planOverflowRotation({
      checkpoint:c,publicIndex:publicIndex(c),cursor:created,now:day1})
    const progressed=advanceOverflowCursor(created,p,{now:day1})
    expect((await saveOverflowCursor(bucket,progressed,{expectedGeneration:'1'}))
      .cursor).toEqual(progressed)
    await expect(saveOverflowCursor(bucket,created,{expectedGeneration:'1'}))
      .rejects.toThrow('CAS conflict')
  })
  it('rejects the wrong cloud bucket and missing expected generation',async()=>{
    const {bucket}=fakeBucket()
    await expect(loadOverflowCursor({...bucket,name:'foreign'}))
      .rejects.toThrow('G2_OVERFLOW_BUCKET_INVALID')
    await expect(saveOverflowCursor(bucket,initialOverflowCursor(day1)))
      .rejects.toThrow('G2_OVERFLOW_CAS_REQUIRED')
    expect(bucket.file).not.toHaveBeenCalled()
  })
})
