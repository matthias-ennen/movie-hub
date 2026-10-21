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
 assert.equal(r.checked.length,1)
 assert.equal(r.calls,7)
 assert.deepEqual(r.checked[0].actual,['rent'])
 assert.ok(paths.every(x=>x.startsWith('/3/')))
 assert.ok(!r.report.includes('private-test-secret'))
 assert.ok(r.report.includes('keine** offiziellen YouTube-Shop-IDs'))
})
