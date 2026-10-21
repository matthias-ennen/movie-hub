import test from 'node:test'
import assert from 'node:assert/strict'
import {CASES,TYPES,LIMIT,classify,evaluate,audit} from './youtube-movies-three-offers-g1.mjs'

const directory=[
 {id:192,name:'YouTube',family:'youtube-family'},
 {id:235,name:'YouTube Free',family:'youtube-family'},
 {id:188,name:'YouTube Premium',family:'youtube-family'},
 {id:3,name:'Google Play Movies',family:'google-play-movies'}
]
const sample={results:{DE:{
 rent:[{provider_id:192,provider_name:'YouTube'}],
 buy:[{provider_id:192,provider_name:'YouTube'}],
 free:[{provider_id:234,provider_name:'Arte'}],
 flatrate:[{provider_id:188,provider_name:'YouTube Premium'}]
}}}
test('exact YouTube-family and Google-provider classes',()=>{
 assert.equal(CASES.length,3)
 assert.equal(TYPES.length,5)
 assert.equal(classify('YouTube'),'youtube-family')
 assert.equal(classify('YouTube Free'),'youtube-family')
 assert.equal(classify('YouTube Premium'),'youtube-family')
 assert.equal(classify('Google Play Movies'),'google-play-movies')
 assert.equal(classify('Google TV'),'google-tv')
 assert.equal(classify('YouTube Amazing Movies'),null)
})
test('provider-specific offers are not borrowed from competitors',()=>{
 const row=evaluate(CASES[1],directory,sample)
 assert.equal(row.hasDe,true)
 assert.deepEqual(row.offerings.find(p=>p.id===192).offerTypes,['rent','buy'])
 assert.deepEqual(row.offerings.find(p=>p.id===235).offerTypes,[])
 assert.deepEqual(row.offerings.find(p=>p.id===188).offerTypes,['flatrate'])
 assert.deepEqual(row.offerings.find(p=>p.id===3).offerTypes,[])
 assert.deepEqual(row.competitors.find(p=>p.type==='free').otherProviders,['Arte'])
 assert.ok(!JSON.stringify(row).includes('priceEUR'))
})
test('missing German detail is marked unknown rather than absent offer',()=>{
 const row=evaluate(CASES[0],directory,{results:{US:{buy:[{provider_id:192}]}}})
 assert.equal(row.hasDe,false)
 assert.ok(row.offerings.every(p=>p.sourceStatus==='de-detail-missing'))
 assert.ok(row.offerings.every(p=>p.offerTypes.length===0))
})
test('exactly four TMDB read-only calls, safe report, source separation',async()=>{
 const paths=[]
 const token='SUPER_SECRET_TEST_TOKEN'
 const request=async(uri,init)=>{
   paths.push({path:uri.pathname,auth:init.headers.Authorization})
   const data=uri.pathname==='/watch/providers/movie'
     ?{results:directory.map(p=>({provider_id:p.id,provider_name:p.name}))}
     :sample
   return {ok:true,json:async()=>data}
 }
 const result=await audit({token,request,at:()=> '2026-10-21T10:40Z'})
 assert.equal(result.calls,LIMIT)
 assert.deepEqual(paths.map(p=>p.path),[
  '/watch/providers/movie','/movie/9479/watch/providers',
  '/movie/238/watch/providers','/movie/872585/watch/providers'
 ])
 assert.ok(paths.every(p=>p.auth==='Bearer '+token))
 assert.ok(!result.report.includes(token))
 assert.ok(result.report.includes('echte DE-YouTube-Shop-Buttons, Preis und Entitlement UNBEKANNT'))
 assert.ok(result.report.includes('YouTube Free'))
})
test('failed requests do not continue or reveal API secrets',async()=>{
 let count=0
 await assert.rejects(
  audit({token:'SUPER_SECRET_TEST_TOKEN',request:async()=>{
   count++;return{ok:false,status:403}
  }}),
  /TMDB HTTP 403/
 )
 assert.equal(count,1)
})
