import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {checkSeeds,summarizePublicArtifact,compareSeeds,getPublicJson,run,INPUT} from './youtube-movies-public-membership-g1.mjs'
const input=JSON.parse(await readFile(INPUT,'utf8'))
test('26 distinct real original G1 TMDB hints, no acceptance',()=>{
 const ids=checkSeeds(input)
 assert.equal(ids.length,26)
 assert.ok(ids.includes(10112))
 assert.ok(ids.includes(687163))
 assert.throws(()=>checkSeeds({...input,tmdbMovieIdHints:ids.slice(1)}),/exactly 26/)
})
test('public index and browse must be genuine, not missing placeholder or personal scope',()=>{
 const index=summarizePublicArtifact('search',{kind:'search-index',version:1,generatedAt:'2026-10-21',
  entries:[{type:'movie',tmdbId:10112},{type:'movie',tmdbId:26022,scope:'personal'},
   {type:'series',tmdbId:687163}]})
 const browse=summarizePublicArtifact('browse',{source:'tmdb',generatedAt:'2026-10-21',
  titles:[{type:'movie',tmdbId:10112},{type:'movie',tmdbId:687163}]})
 const c=compareSeeds([10112,26022,687163],index,browse)
 assert.equal(c.totals.publicSearchPresent,1)
 assert.equal(c.totals.publicBrowsePresent,2)
 assert.equal(c.totals.presentInBoth,1)
 assert.equal(c.totals.absentFromBothPublic,1)
 assert.throws(()=>summarizePublicArtifact('browse',{source:'fallback',titles:[],generatedAt:null}),/complete/)
 assert.throws(()=>summarizePublicArtifact('search',{kind:'search-index',version:1,entries:[],generatedAt:null}),/complete/)
})
test('read-only: exactly two public downloads, zero YouTube/TMDB or private data',async()=>{
 const urls=[]
 const r=await run({manifest:input,at:()=> '2026-10-21T13:30:00Z',
  loadPublic:async kind=>{
   urls.push(kind)
   if(kind==='search')return {kind:'search-index',version:1,generatedAt:'2026-10-21',
    entries:[{type:'movie',tmdbId:10112},{type:'movie',tmdbId:26022,scope:'personal'}]}
   if(kind==='browse')return{source:'tmdb',generatedAt:'2026-10-21',
    titles:[{type:'movie',tmdbId:687163}]}
   throw Error('Unknown request')
  }})
 assert.deepEqual(urls,['search','browse'])
 assert.equal(r.comparison.rows.length,26)
 assert.equal(r.comparison.totals.publicSearchPresent,1)
 assert.equal(r.comparison.totals.publicBrowsePresent,1)
 assert.equal(r.comparison.totals.absentFromBothPublic,24)
 assert.ok(r.report.includes('ZERO YouTube/TMDB API calls'))
 assert.ok(r.report.includes('NOT confirmed film-version'))
 assert.ok(r.report.includes('not-in-this-PUBLIC-artifact'))
})
test('unavailable public response means unknown, never false absence',async()=>{
 const r=await run({manifest:input,loadPublic:async()=>{throw Error('offline')}})
 assert.equal(r.reads.search.status,'unavailable-or-invalid')
 assert.equal(r.comparison.totals.publicBrowsePresent,null)
 assert.equal(r.comparison.totals.absentFromBothPublic,null)
 assert.ok(r.report.includes('not-checked'))
})
test('network read uses fixed public URLs and rejects HTML and excessive response length',async()=>{
 const ok=await getPublicJson('search',async(url,opts)=>{
  assert.match(url,/movie-hub-62459\.web\.app\/search-index\.json/)
  assert.equal(opts.cache,'no-store')
  return new Response(JSON.stringify({kind:'search-index'}),{status:200})
 })
 assert.equal(ok.kind,'search-index')
 await assert.rejects(()=>getPublicJson('browse',async()=>new Response('<html/>')),SyntaxError)
 await assert.rejects(()=>getPublicJson('search',async()=>new Response('',{
  status:200,headers:{'content-length':'40000001'}})),/byte cap/)
})
