import {test} from 'vitest'
import assert from 'node:assert/strict'
import {createYoutubeTmdbShadowCollector,youtubeTmdbShadowAllowed,openYoutubeTmdbShadowSession}
  from '../scripts/youtube-g2-tmdb-cache-shadow.mjs'
import {createAdaptiveYoutubeTmdbCache} from '../scripts/youtube-g2-adaptive-tmdb-cache.mjs'
import {runCuratedTmdbMembership} from '../scripts/youtube-g2-curated-tmdb-membership.mjs'

const path='/search/movie',params={language:'de-DE',query:'Test',include_adult:'false',page:1}
const response={page:1,results:[{id:100,title:'Test'}]}
const newer={page:1,results:[{id:101,title:'Test'}]}
test('shadow records would-have hits and compares live responses but never serves caches',()=>{
  const now=()=>Date.parse('2026-11-20T01:00:00Z')
  const cache=createAdaptiveYoutubeTmdbCache({now})
  cache.recordFresh(path,params,response)
  const shadow=createYoutubeTmdbShadowCollector({cache,sharedResponseCache:{get:()=>response}})
  assert.equal(shadow.adapter.get(path,params),null)
  assert.equal(shadow.adapter.recordFresh(path,params,newer),true)
  const m=shadow.counts().byEndpoint.searchMovie
  assert.equal(m.lookups,1)
  assert.equal(m.persistentWouldHit,1)
  assert.equal(m.sharedWouldHit,1)
  assert.equal(m.persistentCompared,1)
  assert.equal(m.sharedCompared,1)
  assert.equal(m.sharedEqual,0)
  assert.equal(m.persistentEqual,0)
  assert.deepEqual(cache.get(path,params),newer)
})
test('failed responses and abandoned transport requests do not renew evidence',()=>{
  let now=Date.parse('2026-11-20T01:00:00Z')
  const cache=createAdaptiveYoutubeTmdbCache({now:()=>now})
  cache.recordFresh(path,params,response)
  now+=7*86400000
  const shadow=createYoutubeTmdbShadowCollector({cache})
  assert.equal(shadow.adapter.get(path,params),null)
  const prior=cache.snapshot()
  shadow.adapter.get(path,params)
  assert.equal(shadow.adapter.recordFresh(path,params,{status_code:25,results:[]}),false)
  assert.deepEqual(cache.snapshot(),prior)
  assert.equal(shadow.counts().byEndpoint.searchMovie.rejected,1)
})
test('only the scheduled trusted central main run may open the production shadow session',()=>{
  const env={GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'schedule',
    MOVIEHUB_TRUSTED_CENTRAL_NIGHTLY:'true',DATA_CHECKPOINT_ENABLED:'true',
    DATA_CHECKPOINT_BUCKET:'movie-hub-62459-nightly-checkpoints',
    MOVIEHUB_YOUTUBE_TMDB_SHADOW:'private-shadow-v1'}
  assert.equal(youtubeTmdbShadowAllowed(env),true)
  for(const key of Object.keys(env))assert.equal(youtubeTmdbShadowAllowed({...env,[key]:'off'}),false)
})
test('restore, write and CAS failures do not change live matching',async()=>{
  const now=()=>Date.parse('2026-11-20T01:00:00Z')
  const unavailable=await openYoutubeTmdbShadowSession({bucket:{name:'wrong'},now})
  assert.equal(unavailable.adapter,null)
  assert.equal((await unavailable.finish()).status,'restore_unavailable')
  const bucket={name:'movie-hub-62459-nightly-checkpoints',file(){return{
    async getMetadata(){throw Object.assign(Error('missing'),{code:404})},
    async save(){throw Object.assign(Error('concurrency'),{code:412})},
  }}}
  const session=await openYoutubeTmdbShadowSession({bucket,now})
  assert.equal(session.adapter.get(path,params),null)
  assert.equal(session.adapter.recordFresh(path,params,response),true)
  assert.equal((await session.finish()).status,'save_unavailable')
})
test('actual matcher in shadow mode uses the same live calls and produces exactly the baseline rows',async()=>{
  const at='2026-11-20T01:00:00.000Z',now=()=>Date.parse(at)
  const audit={mode:'CURATED_TWO_PLAYLISTS_READ_ONLY',observedAt:at,fullyScanned:true,publicationPermitted:false,
    playlistSummaries:[{mode:'free',playlistId:'PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ',fullyScanned:true},
      {mode:'rent-buy',playlistId:'PLJWJS8p_IeEo',fullyScanned:true}],
    uniqueVideoIds:1,candidates:[{videoId:'8VDNOwUBRHo',videoTitle:'Test',minutes:88,
      playlistModes:['free'],editorialOfferHint:'free',status:'review-tmdb-work-identity',screened:true,
      deRegionSignal:'allowed',accepted:false,toImport:false,playbackRoute:null,verifiedOfferType:null}],
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0}
  const publicIndex={kind:'search-index',version:1,country:'DE',source:'published',generatedAt:at,
    entries:[{type:'movie',tmdbId:100,title:'Test'}],count:1}
  const tmdbGet=async p=>p==='/search/movie'?response:p==='/search/tv'?{results:[]}:
    {id:100,title:'Test',original_title:'Test',runtime:88,release_date:'2017-01-01',
      alternative_titles:{titles:[]},credits:{cast:[],crew:[]},external_ids:{}}
  const options={audit,publicIndex,now:()=>at,tmdbGet}
  const baseline=await runCuratedTmdbMembership(options)
  const cache=createAdaptiveYoutubeTmdbCache({now})
  cache.recordFresh(path,params,newer) // deliberately differs from fresh response
  const shadow=createYoutubeTmdbShadowCollector({cache})
  const actual=await runCuratedTmdbMembership({...options,persistentCache:shadow.adapter})
  assert.equal(actual.summary.tmdbCalls,baseline.summary.tmdbCalls)
  assert.deepEqual(actual.rows,baseline.rows)
  assert.equal(shadow.counts().byEndpoint.searchMovie.persistentWouldHit,1)
  assert.equal(shadow.counts().byEndpoint.searchMovie.persistentEqual,0)
})
