import test from 'node:test'
import assert from 'node:assert/strict'
import {REFERENCE_IDS,MAX_CHANNELS,MAX_PAGES,MAX_UPLOAD_IDS,MAX_REQUESTS,
 durationMinutes,deValue,audit} from './youtube-movies-channel-uploads-g1.mjs'

const longFilm=(id,i,channelId='UC_A')=>({
 id,snippet:{title:'Movie title '+i,channelTitle:'YouTube Movies',channelId},
 contentDetails:{duration:'PT1H37M',regionRestriction:{allowed:['DE']}},
 status:{privacyStatus:'public'}
})
test('limits and metadata classification',()=>{
 assert.equal(REFERENCE_IDS.length,12)
 assert.ok(MAX_CHANNELS*MAX_PAGES*50>=MAX_UPLOAD_IDS)
 assert.ok(MAX_REQUESTS<=22)
 assert.equal(durationMinutes('PT2H1M30S'),121.5)
 assert.equal(durationMinutes('PT9M'),9)
 assert.equal(durationMinutes('garbage'),null)
 assert.equal(deValue({allowed:['US']}),'excluded')
 assert.equal(deValue({blocked:['DE']}),'excluded')
 assert.equal(deValue({allowed:['DE']}),'allowed')
 assert.equal(deValue(null),'unknown')
})
test('known movie video references feed valid channels/playlist pages, batched details; no TMDB link assertions',async()=>{
 const calls={videos:0,channels:0,playlistItems:0}
 const api=async(endpoint,params)=>{
  calls[endpoint]++
  if(endpoint==='videos'){
   const ids=params.id.split(',')
   assert.ok(ids.length<=50)
   if(ids.includes(REFERENCE_IDS[0]))
    return {items:ids.map((id,i)=>longFilm(id,i,i<8?'UC_A':'UC_B'))}
   return {items:ids.map((id,i)=>longFilm(id,Number(id)))}
  }
  if(endpoint==='channels')return{items:[
   {id:'UC_A',snippet:{title:'YouTube Movies'},contentDetails:{relatedPlaylists:{uploads:'UU_A'}},statistics:{videoCount:'999'}},
   {id:'UC_B',snippet:{title:'YouTube Movies'},contentDetails:{relatedPlaylists:{}}}
  ]}
  if(endpoint==='playlistItems'){
   assert.equal(params.playlistId,'UU_A')
   const offset=params.pageToken?50:0
   const count=params.pageToken?20:50
   return {
    items:Array.from({length:count},(_,i)=>({contentDetails:{videoId:String(100000+offset+i).padStart(11,'0')}})),
    nextPageToken:params.pageToken?undefined:'next'
   }
  }
  throw Error('unexpected endpoint')
 }
 const out=await audit({api,at:()=> '2026-10-21'})
 assert.equal(out.calls,6)
 assert.deepEqual(calls,{videos:3,channels:1,playlistItems:2})
 assert.equal(out.channels.length,2)
 assert.equal(out.channels[0].playlistStatus,'available')
 assert.equal(out.channels[0].listed,70)
 assert.equal(out.channels[1].playlistStatus,'not-present')
 assert.equal(out.eligible.length,70)
 assert.equal(new Set(out.eligible.map(x=>x.id)).size,70)
 assert.ok(out.report.includes('60+ min public'))
 assert.ok(out.report.includes('DOES NOT prove an official store catalog'))
})
test('zero upload feed does not imply no Youtube movies exist',async()=>{
 let calls=0
 const api=async(endpoint,params)=>{
  calls++
  if(endpoint==='videos')return{items:REFERENCE_IDS.map((id,i)=>longFilm(id,i))}
  if(endpoint==='channels')return{items:[{id:'UC_A',snippet:{title:'YouTube Movies'}}]}
  throw Error('unexpected endpoint '+endpoint)
 }
 const r=await audit({api})
 assert.equal(calls,2)
 assert.equal(r.channels[0].playlistStatus,'not-present')
 assert.equal(r.eligible.length,0)
 assert.ok(r.report.includes('information gap'))
})
test('inaccessible public uploads are flagged, not interpreted as a catalog failure',async()=>{
 const api=async(endpoint)=>{
  if(endpoint==='videos')return{items:REFERENCE_IDS.map((id,i)=>longFilm(id,i))}
  if(endpoint==='channels')return{items:[{id:'UC_A',snippet:{title:'YouTube Movies'},
   contentDetails:{relatedPlaylists:{uploads:'UU_A'}}}]}
  if(endpoint==='playlistItems')throw Error('Not accessible')
 }
 const r=await audit({api})
 assert.equal(r.channels[0].playlistStatus,'not-readable')
 assert.equal(r.eligible.length,0)
 assert.equal(r.calls,3)
})
