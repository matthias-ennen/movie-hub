import {test} from 'vitest'
import assert from 'node:assert/strict'
import {createAdaptiveYoutubeTmdbCache,sharedYoutubeSearchKey,readSharedYoutubeTmdbResponse,
  loadYoutubeTmdbCache,saveYoutubeTmdbCache,YOUTUBE_TMDB_CACHE_OBJECT} from '../scripts/youtube-g2-adaptive-tmdb-cache.mjs'
import {createSharedTmdbSearchResponseCache} from '../scripts/shared-tmdb-search-response-cache.mjs'
import {runCuratedTmdbMembership} from '../scripts/youtube-g2-curated-tmdb-membership.mjs'

const DAY=86400000
const AT=Date.parse('2026-11-20T01:00:00Z')
const path='/search/movie'
const params={language:'de-DE',query:'Terrified',include_adult:'false',page:1}
const positive={page:1,results:[{id:100,title:'Terrified'}],total_results:1}
const negative={page:1,results:[],total_results:0}
const detail={id:100,title:'Terrified',original_title:'Terrified',runtime:88,
  release_date:'2017-01-01',alternative_titles:{titles:[]},credits:{cast:[],crew:[]},external_ids:{}}
const detailParams={language:'de-DE',append_to_response:'alternative_titles,credits,external_ids'}
const ttl=cache=>cache.snapshot().entries[0].ttlDays

test('positive and empty search schedules survive distinct runs; reads never extend expiry',()=>{
  for(const [response,schedule] of [[positive,[7,14,28,56,56]],[negative,[2,4,8,16,16]]]){
    let time=AT
    const now=()=>time
    let cache=createAdaptiveYoutubeTmdbCache({now})
    for(const days of schedule){
      assert.equal(cache.recordFresh(path,params,response),true)
      assert.equal(ttl(cache),days)
      const saved=cache.snapshot()
      time+=days*DAY-1
      cache=createAdaptiveYoutubeTmdbCache({now,snapshot:saved})
      assert.deepEqual(cache.get(path,params),response)
      assert.deepEqual(cache.snapshot(),saved)
      assert.equal(cache.recordFresh(path,params,response),true)
      assert.deepEqual(cache.snapshot(),saved)
      time++
      assert.equal(cache.get(path,params),null)
    }
  }
})
test('changed ordering/evidence resets and failed or malformed requests cannot renew',()=>{
  let time=AT
  const cache=createAdaptiveYoutubeTmdbCache({now:()=>time})
  cache.recordFresh(path,params,positive)
  time+=7*DAY
  cache.recordFresh(path,params,{total_results:1,results:[{title:'Terrified',id:100}],page:1})
  assert.equal(ttl(cache),14)
  time+=14*DAY
  const prior=cache.snapshot()
  for(const bad of [null,{success:false,results:[]},{status_code:25,results:[]},{results:[{id:100}]},
    {page:2,results:[]},{results:[],total_results:4}]){
    assert.equal(cache.recordFresh(path,params,bad),false)
  }
  assert.deepEqual(cache.snapshot(),prior)
  assert.equal(cache.get(path,params),null)
  const a={results:[{id:100,title:'A'},{id:101,title:'B'}]}
  cache.recordFresh(path,params,a)
  assert.equal(ttl(cache),7)
  time+=7*DAY
  cache.recordFresh(path,params,a)
  assert.equal(ttl(cache),14)
  time+=14*DAY
  cache.recordFresh(path,params,{results:[...a.results].reverse()})
  assert.equal(ttl(cache),7)
  time++
  cache.recordFresh(path,params,negative)
  assert.equal(ttl(cache),2)
})
test('detail admission validates exact ID and complete evidence, defensive copies and snapshot integrity',()=>{
  const now=()=>AT,cache=createAdaptiveYoutubeTmdbCache({now})
  assert.equal(cache.recordFresh('/movie/100',detailParams,{...detail,id:101}),false)
  assert.equal(cache.recordFresh('/movie/100',detailParams,{...detail,credits:{cast:[]}}),false)
  assert.equal(cache.recordFresh('/movie/100',detailParams,detail),true)
  const value=cache.get('/movie/100',detailParams)
  value.title='Changed'
  assert.equal(cache.get('/movie/100',detailParams).title,'Terrified')
  assert.equal(cache.get('/movie/100',{...detailParams,language:'en-US'}),null)
  const corrupted=cache.snapshot()
  corrupted.entries[0].response.title='Changed'
  assert.throws(()=>createAdaptiveYoutubeTmdbCache({now,snapshot:corrupted}),/ENTRY_INVALID/)
  assert.throws(()=>createAdaptiveYoutubeTmdbCache({now:()=>AT-1,snapshot:cache.snapshot()}),/ENTRY_INVALID/)
})
test('TV bridge reads exact first-page searches only, with no writes or YouTube renewal',()=>{
  const canonical=JSON.stringify([path,{language:'de-DE',query:'Terrified',include_adult:'false'}])
  assert.equal(sharedYoutubeSearchKey(path,params),canonical)
  assert.equal(sharedYoutubeSearchKey(path,{...params,page:'1'}),canonical)
  assert.equal(sharedYoutubeSearchKey(path,{...params,page:2}),null)
  assert.equal(sharedYoutubeSearchKey(path,{...params,region:'DE'}),null)
  assert.notEqual(sharedYoutubeSearchKey(path,{...params,year:'2017'}),canonical)
  const shared=createSharedTmdbSearchResponseCache({
    get(namespace,key){assert.equal(namespace,'tmdb-search-v1');return key===canonical?positive:null},
    set(){assert.fail('TV cache must remain read-only')},
  })
  assert.deepEqual(readSharedYoutubeTmdbResponse(shared,path,params),positive)
  assert.equal(readSharedYoutubeTmdbResponse(shared,path,{...params,language:'en-US'}),null)
  assert.equal(readSharedYoutubeTmdbResponse(shared,'/movie/100',detailParams),null)
  assert.equal(shared.counts().stored,0)
})
function fakeBucket(){
  let data=null,generation=0
  return {name:'movie-hub-62459-nightly-checkpoints',file(name,options={}){
    assert.equal(name,YOUTUBE_TMDB_CACHE_OBJECT)
    return {
      async getMetadata(){if(data===null)throw Object.assign(Error('missing'),{code:404})
        return [{size:String(data.length),generation:String(generation)}]},
      async download(){assert.equal(options.generation,String(generation));return [Buffer.from(data)]},
      async save(value,opts){if(opts.preconditionOpts.ifGenerationMatch!==generation)
        throw Object.assign(Error('conflict'),{code:412})
        data=Buffer.from(value);generation++},
    }
  }}
}
test('private persistence works between runs and rejects stale concurrent writes',async()=>{
  const bucket=fakeBucket(),now=()=>AT
  const first=await loadYoutubeTmdbCache(bucket,{now})
  const concurrent=await loadYoutubeTmdbCache(bucket,{now})
  first.cache.recordFresh(path,params,positive)
  const saved=await saveYoutubeTmdbCache(bucket,first.cache,{now,expectedGeneration:first.generation})
  assert.equal(saved.generation,'1')
  assert.deepEqual(saved.cache.get(path,params),positive)
  await assert.rejects(saveYoutubeTmdbCache(bucket,concurrent.cache,{now,expectedGeneration:concurrent.generation}),/conflict/)
  assert.deepEqual((await loadYoutubeTmdbCache(bucket,{now})).cache.get(path,params),positive)
  await assert.rejects(loadYoutubeTmdbCache({name:'public-bucket'},{now}),/PRIVATE_CACHE_BUCKET/)
})
test('offline real membership matcher yields identical rows and zero live calls on repeat',async()=>{
  const observedAt=new Date(AT).toISOString()
  const audit={mode:'CURATED_TWO_PLAYLISTS_READ_ONLY',observedAt,fullyScanned:true,publicationPermitted:false,
    playlistSummaries:[{mode:'free',playlistId:'PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ',fullyScanned:true},
      {mode:'rent-buy',playlistId:'PLJWJS8p_IeEo',fullyScanned:true}],
    uniqueVideoIds:1,candidates:[{videoId:'8VDNOwUBRHo',videoTitle:'Terrified',minutes:88,
      playlistModes:['free'],editorialOfferHint:'free',status:'review-tmdb-work-identity',screened:true,
      deRegionSignal:'allowed',accepted:false,toImport:false,playbackRoute:null,verifiedOfferType:null}],
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0}
  const publicIndex={kind:'search-index',version:1,country:'DE',source:'published',generatedAt:observedAt,
    entries:[{type:'movie',tmdbId:100,title:'Terrified'}],count:1}
  const tmdbGet=async p=>p==='/search/movie'?positive:p==='/search/tv'?negative:detail
  const options={audit,publicIndex,now:()=>observedAt}
  const baseline=await runCuratedTmdbMembership({...options,tmdbGet})
  const cache=createAdaptiveYoutubeTmdbCache({now:()=>AT})
  const warm=await runCuratedTmdbMembership({...options,tmdbGet,persistentCache:cache})
  const restored=createAdaptiveYoutubeTmdbCache({now:()=>AT+DAY,snapshot:cache.snapshot()})
  const replay=await runCuratedTmdbMembership({...options,persistentCache:restored,
    tmdbGet:async()=>assert.fail('unexpected live request')})
  assert.ok(baseline.summary.tmdbCalls>0)
  assert.equal(warm.summary.tmdbCalls,baseline.summary.tmdbCalls)
  assert.deepEqual(replay.rows,baseline.rows)
  assert.equal(replay.summary.tmdbCalls,0)
  for(const c of Object.values(replay.summary.tmdbRequestAudit)){
    assert.equal(c.lookups,c.actualStarts+c.cacheHits+c.persistentHits+c.sharedHits+c.budgetSkipped)
  }
  const own=createAdaptiveYoutubeTmdbCache({now:()=>AT})
  const shared=await runCuratedTmdbMembership({...options,tmdbGet,persistentCache:own,
    sharedResponseCache:{get:key=>JSON.parse(key)[0]==='/search/movie'?positive:null}})
  assert.deepEqual(shared.rows,baseline.rows)
  assert.ok(shared.summary.tmdbRequestAudit.searchMovie.sharedHits>0)
  assert.ok(own.snapshot().entries.every(e=>JSON.parse(e.key)[0]!=='/search/movie'))
})
