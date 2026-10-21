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


test('uses the original one videos.list batch for newly discovered movies and known IDs',async()=>{
 const { runtimeMinutes }=await import('./youtube-movies-store-id-g1.mjs')
 assert.equal(runtimeMinutes('PT1H16M39S'),76.65)
 assert.equal(runtimeMinutes('PT48M'),48)
 assert.equal(runtimeMinutes('unknown'),null)
 let batchedIds=[]
 const api=async(endpoint,params)=>{
   if(endpoint==='search')return {items:params.videoType==='movie'
     ?[{id:{videoId:'nJf67zNZhoc'},snippet:{title:'Tim Burton Nightmare Before Christmas',channelTitle:'YouTube Movies'}}]
     :[]}
   if(endpoint==='videos'){
     batchedIds=params.id.split(',')
     return {items:[
       {id:'-oMYcSU3oVo',snippet:{title:'Kedi',channelTitle:'YouTube Movies',channelId:'UC_REF'},contentDetails:{duration:'PT1H19M',regionRestriction:{allowed:['DE']}},status:{privacyStatus:'public'}},
       {id:'Hw0CGCHl3V8',snippet:{title:'Nightmare',channelTitle:'YouTube Movies',channelId:'UC_REF'},contentDetails:{duration:'PT1H16M39S',regionRestriction:{allowed:['US']}},status:{privacyStatus:'public'}},
       {id:'nJf67zNZhoc',snippet:{title:'Tim Burton Nightmare Before Christmas',channelTitle:'YouTube Movies',channelId:'UC_REF'},contentDetails:{duration:'PT1H16M39S',regionRestriction:{allowed:['DE']}},status:{privacyStatus:'public'}}
     ]}
   }
   throw Error('Unexpected endpoint')
 }
 const r=await analyze({api,at:()=> '2026-10-21'})
 assert.equal(r.calls,9)
 assert.equal(r.searchCalls,8)
 assert.deepEqual(new Set(batchedIds),new Set(['-oMYcSU3oVo','Hw0CGCHl3V8','nJf67zNZhoc']))
 assert.equal(r.outcomes.find(x=>x.tmdb===9479).detail.deExcluded,true)
 assert.equal(r.outcomes.find(x=>x.tmdb===392011).detail.deExcluded,false)
 const candidate=r.candidateDetails.find(x=>x.id==='nJf67zNZhoc')
 assert.equal(candidate.knownChannel,true)
 assert.equal(candidate.filmLength,true)
 assert.equal(candidate.detail.deExcluded,false)
 assert.ok(r.report.includes('Neuer G1-Abgleich'))
 assert.ok(r.report.includes('PT1H16M39S'))
})
