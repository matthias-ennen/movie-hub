import test from 'node:test'
import assert from 'node:assert/strict'
import { analyze, FILMS } from './youtube-movies-store-id-g1.mjs'

test('only finite research cases with two eleven-character known video IDs',()=>{
 assert.equal(FILMS.length,4)
 assert.equal(FILMS.filter(x=>x.knownId).length,2)
 assert.ok(FILMS.filter(x=>x.knownId).every(x=>/^[A-Za-z0-9_-]{11}$/.test(x.knownId)))
})
test('two search modes per film, known ID recall and privacy-safe report',async()=>{
 const calls=[]
 const api=async(endpoint,params)=>{
   calls.push({endpoint,params})
   if(endpoint==='videos')return {items:[{id:'-oMYcSU3oVo',snippet:{title:'Kedi',channelTitle:'YouTube Movies'},contentDetails:{duration:'PT1H15M'},status:{privacyStatus:'public'}}]}
   if(endpoint==='search')return {items:params.videoType==='movie'
     ? [{id:{videoId:'-oMYcSU3oVo'},snippet:{title:'Kedi',channelTitle:'YouTube Movies'}}]
     : [{id:{videoId:'abcdefghijk'},snippet:{title:'Wrong/Trailer',channelTitle:'Other'}}]}
   throw Error('Unexpected')
 }
 const r=await analyze({api,at:()=> '2026-10-21'})
 assert.equal(r.calls,9)
 assert.equal(r.searchCalls,8)
 assert.equal(calls.filter(x=>x.endpoint==='videos').length,1)
 assert.equal(calls.filter(x=>x.endpoint==='search').length,8)
 assert.ok(calls.filter(x=>x.endpoint==='search').every(x=>x.params.regionCode==='DE' && x.params.type==='video' && x.params.maxResults===10))
 assert.equal(r.outcomes[0].knownIdResolved,true)
 assert.equal(r.outcomes[1].knownIdResolved,false)
 assert.equal(r.outcomes[0].variants[0].foundKnown,true)
 assert.equal(r.outcomes[0].variants[1].foundKnown,false)
 assert.ok(!r.report.includes('KEY_PRIVATE_DO_NOT_PRINT'))
 assert.ok(r.report.includes('keine** Bestätigung') || r.report.includes('keine**'))
})
test('records sanitized API failures without pretending a missing result is negative evidence',async()=>{
 const api=async(endpoint,params)=>{
   if(endpoint==='videos')return{items:[]}
   if(params.videoType==='movie')throw Error('API disabled')
   return{items:[]}
 }
 const r=await analyze({api})
 assert.equal(r.outcomes[0].variants[0].state,'api-error')
 assert.equal(r.outcomes[0].variants[1].state,'ok')
 assert.equal(r.outcomes[0].knownIdResolved,false)
 assert.equal(r.calls,9)
 assert.ok(r.report.includes('ID im öffentlichen Data-API-Abruf'))
})
