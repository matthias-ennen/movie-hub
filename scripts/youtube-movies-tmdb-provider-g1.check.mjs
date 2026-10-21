import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, audit } from './youtube-movies-tmdb-provider-g1.mjs'
test('keeps YouTube, YouTube Free and Google TV separate',()=>{
 assert.equal(classify('YouTube'),'youtube-family')
 assert.equal(classify('YouTube Free'),'youtube-family')
 assert.equal(classify('Google TV'),'google-tv')
 assert.equal(classify('Google Play Movies'),'google-play-movies')
 assert.equal(classify('Google Cloud'),null)
})
test('read-only TMDB sample verifies offer types without exposing keys',async()=>{
 const paths=[]
 const request=async(url,options)=>{
   const path=new URL(url).pathname
   paths.push(path)
   assert.equal(options.method||'GET','GET')
   if(path.endsWith('/watch/providers/movie'))return{ok:true,json:async()=>({results:[{provider_id:9,provider_name:'YouTube'}]})}
   if(path.endsWith('/discover/movie'))return{ok:true,json:async()=>({total_results:1,results:[{id:55,title:'Test'}]})}
   if(path.endsWith('/movie/55/watch/providers'))return{ok:true,json:async()=>({results:{DE:{rent:[{provider_id:9}]}}})}
   throw Error('Unexpected endpoint')
 }
 const r=await audit({token:'private-test-secret',request,time:()=> '2026-10-21'})
 assert.equal(r.providers.length,1)
 assert.equal(r.rows.length,5)
 assert.equal(r.checked.length,5)
 assert.equal(r.calls,7)
 assert.equal(r.matches,1)
 assert.equal(r.conflicts,4)
 assert.deepEqual(r.checked.map(x=>x.result),['detail-disagrees','detail-disagrees','detail-agrees','detail-disagrees','detail-disagrees'])
 assert.deepEqual(r.checked[0].actual,['rent'])
 assert.deepEqual(r.quality.map(q=>q.checked),[1,1,1,1,1])
 assert.ok(paths.every(x=>x.startsWith('/3/')))
 assert.ok(!r.report.includes('private-test-secret'))
 assert.ok(r.report.includes('keine** offiziellen YouTube-Shop-IDs'))
})

test('per-offer samples reuse movie-detail cache and do not invent absent offers',async()=>{
 let detailCalls=0
 const request=async(url)=>{
   const path=new URL(url).pathname
   if(path.endsWith('/watch/providers/movie')) return {ok:true,json:async()=>({results:[{provider_id:192,provider_name:'YouTube'}]})}
   if(path.endsWith('/discover/movie')) return {ok:true,json:async()=>({total_results:200,results:[{id:10,title:'A'},{id:11,title:'B'}]})}
   if(path.endsWith('/movie/10/watch/providers')||path.endsWith('/movie/11/watch/providers')) {
     detailCalls++
     return {ok:true,json:async()=>({results:{DE:{buy:[{provider_id:192}]}}})}
   }
   throw Error('Unexpected API path: '+path)
 }
 const r=await audit({token:'secret',request})
 assert.equal(r.calls,8)
 assert.equal(detailCalls,2)
 assert.equal(r.checked.length,10)
 assert.equal(r.matches,2)
 assert.equal(r.conflicts,8)
 assert.equal(r.quality.find(q=>q.offer==='buy').matches,2)
 assert.equal(r.quality.find(q=>q.offer==='free').conflicts,2)
 assert.ok(r.report.includes('TMDB-interne Evidenz'))
})
