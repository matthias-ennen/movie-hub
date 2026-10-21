import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validate,membership,audit,fetchCurrentPublicIndex,
 MAX_TMDB_REQUESTS,INPUT} from './youtube-movies-twenty-one-g1.mjs'

const baseline=validate(JSON.parse(await readFile(INPUT,'utf8')))
test('original true 21 uncertain cases, 26 original film IDs, two negative controls',()=>{
 assert.equal(baseline.unresolved.length,21)
 assert.equal(new Set(baseline.unresolved.map(x=>x.videoId)).size,21)
 assert.equal(baseline.priorTmdbMovieIdHints.length,26)
 assert.equal(baseline.unresolved.filter(x=>x.contentTypeControl).length,2)
 assert.equal(MAX_TMDB_REQUESTS,80)
 assert.ok(baseline.unresolved.find(x=>x.videoId==='3ivgYkh5Res'))
 assert.ok(baseline.unresolved.find(x=>x.videoId==='EBiseL2xAz8'))
})
test('public index check has a strict movie-only membership and no personal data',()=>{
 const snapshot={kind:'search-index',version:1,generatedAt:'2026-10-21',
  entries:[{type:'movie',tmdbId:10112},{type:'series',tmdbId:26022},
   {type:'movie',tmdbId:4437,scope:'personal'}]}
 const r=membership(snapshot,[10112,26022,4437,9999])
 assert.deepEqual(r.present,[10112])
 assert.deepEqual(r.absent,[26022,4437,9999])
 assert.equal(r.checked,4)
 assert.throws(()=>membership({entries:[]},[1]),/Unrecognized/)
})
test('targeted TMDB-only research preserves ambiguous status and compares 26 public film hints',async()=>{
 let calls=0,publicReads=0
 const out=await audit({data:baseline,at:()=> '2026-10-21T13:15:00Z',
  tmdbGet:async(path,p)=>{
   calls++
   if(path==='/search/movie'){
    assert.ok(['de-DE','en-US'].includes(p.language))
    if(p.query==='2010')return{results:[{id:4437,title:'2010',original_title:'2010',release_date:'1984-01-01'}]}
    return{results:[]}
   }
   if(path==='/movie/4437')return{runtime:116}
   if(path==='/search/tv')return{results:[{id:123456,name:p.query}]}
   throw Error('Unexpected TMDB: '+path)
  },
  publicIndexGet:async()=>{
   publicReads++
   return{kind:'search-index',version:1,generatedAt:'2026-10-21T10:00:00Z',
    entries:[{type:'movie',tmdbId:10112},{type:'movie',tmdbId:4437},
     {type:'series',tmdbId:26022}]}
  }})
 assert.equal(calls,41) // 38 movie searches, one detail, two TV searches
 assert.equal(publicReads,1)
 assert.equal(out.stats.tmdbCalls,41)
 assert.equal(out.rows.length,21)
 assert.equal(out.rows.filter(x=>x.status==='nonmovie-content-control').length,2)
 assert.equal(out.rows.find(x=>x.id==='3ivgYkh5Res').status,'single-movie-runtime-supported-review')
 assert.deepEqual(out.rows.find(x=>x.id==='3ivgYkh5Res').filmHints.map(x=>x.id),[4437])
 assert.equal(out.rows.find(x=>x.id==='4Dy4kWCnXxY').status,'tv-title-only-review')
 assert.equal(out.index.state,'public-index-checked')
 assert.ok(out.index.present.includes(10112))
 assert.ok(out.index.present.includes(4437))
 assert.ok(out.index.absent.includes(26022))
 assert.ok(out.report.includes('absent-from-PUBLIC-index-only'))
 assert.ok(out.report.includes('not accepted'))
})
test('public index fetch is read-only, rejects HTML and version mismatches',async()=>{
 const data={kind:'search-index',version:1,entries:[],generatedAt:'2026-10-21'}
 const r=await fetchCurrentPublicIndex(async(url,opts)=>{
  assert.ok(url.includes('/search-index.json'))
  assert.equal(opts.cache,'no-store')
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})
 })
 assert.equal(r.kind,'search-index')
 await assert.rejects(()=>fetchCurrentPublicIndex(async()=>new Response('<html>error</html>')),SyntaxError)
 await assert.rejects(()=>fetchCurrentPublicIndex(async()=>new Response(JSON.stringify({entries:[]}))),/version mismatch/)
})
test('missing public index does not become evidence of absence',async()=>{
 const out=await audit({data:baseline,
  tmdbGet:async(path)=>({results:[]}),
  publicIndexGet:async()=>{throw Error('network unavailable')}})
 assert.equal(out.index.state,'public-index-unavailable')
 assert.equal(out.index.checked,0)
 assert.equal(out.stats.tmdbCalls,40) // 38 movie calls plus two TV checks
 assert.equal(out.rows.length,21)
 assert.ok(out.report.includes('not-checked'))
})
test('changed source input fails closed',()=>{
 assert.throws(()=>validate({...baseline,unresolved:baseline.unresolved.slice(0,-1)}),/21\/26/)
})
