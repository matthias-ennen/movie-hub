import test from 'node:test'
import assert from 'node:assert/strict'
import {USER_VIDEO_IDS,MAX_API_CALLS,MAX_PUBLIC_PLAYLISTS_PER_CHANNEL,
 MAX_ITEMS_PER_PLAYLIST,durationMinutes,deRegion,references,audit}
 from './youtube-movies-user-twelve-g1.mjs'

const video=(id,channelId='UC_TEST',i=0)=>({
 id,snippet:{title:'Film '+i,channelId,channelTitle:'Filme & Shows von YouTube'},
 contentDetails:{duration:'PT1H32M',regionRestriction:{allowed:['DE']}},
 status:{privacyStatus:'public'}
})
test('all twelve genuine user IDs are distinct and unchanged',()=>{
 assert.equal(USER_VIDEO_IDS.length,12)
 assert.equal(new Set(USER_VIDEO_IDS).size,12)
 assert.equal(references()[0],'q9Gba51rkHw')
 assert.equal(references()[11],'h4Tv29mk4LE')
 assert.ok(MAX_API_CALLS<=90)
 assert.ok(MAX_PUBLIC_PLAYLISTS_PER_CHANNEL<=5)
 assert.ok(MAX_ITEMS_PER_PLAYLIST<=50)
 assert.equal(durationMinutes('PT2H30M'),150)
 assert.equal(durationMinutes('P1DT1H2M30S'),1502.5)
 assert.equal(durationMinutes('PT0S'),0)
 assert.equal(durationMinutes('not-a-duration'),null)
 assert.equal(deRegion({blocked:['DE']}),'blocked')
 assert.equal(deRegion({allowed:['US']}),'not-in-allowlist')
 assert.equal(deRegion({allowed:['DE']}),'allowed')
 assert.equal(deRegion(null),'unknown')
})
test('one batched video request resolves user IDs and matches actual named public playlists',async()=>{
 const calls={videos:0,channels:0,playlists:0,playlistItems:0}
 const api=async(endpoint,params)=>{
  calls[endpoint]++
  if(endpoint==='videos'){
   assert.equal(params.id.split(',').length,12)
   return {items:USER_VIDEO_IDS.map((id,i)=>video(id,i<7?'UC_A':'UC_B',i))}
  }
  if(endpoint==='channels'){
   assert.equal(params.id.split(',').length,2)
   return {items:[
    {id:'UC_A',snippet:{title:'Filmverleih A'},contentDetails:{relatedPlaylists:{uploads:'UU_A'}}},
    {id:'UC_B',snippet:{title:'Filmverleih B'},contentDetails:{relatedPlaylists:{uploads:'UU_B'}}}
   ]}
  }
  if(endpoint==='playlists'){
   assert.equal(params.maxResults,50)
   return {items:params.channelId==='UC_A'?
    [{id:'PL_FILME_A',snippet:{title:'Filme auf YouTube'},contentDetails:{itemCount:65}}]:
    [{id:'PL_FILME_B',snippet:{title:'Movie collection B'}}]}
  }
  if(endpoint==='playlistItems'){
   assert.equal(params.maxResults,50)
   if(params.playlistId==='PL_FILME_A')return{
    items:[{contentDetails:{videoId:USER_VIDEO_IDS[0]}},
      {contentDetails:{videoId:USER_VIDEO_IDS[2]}}],nextPageToken:'NOT-FETCHED'
   }
   if(params.playlistId==='PL_FILME_B')return{
    items:[{contentDetails:{videoId:USER_VIDEO_IDS[9]}}]
   }
   if(params.playlistId==='UU_A')return {items:[{contentDetails:{videoId:USER_VIDEO_IDS[0]}}]}
   if(params.playlistId==='UU_B')return {items:[]}
   throw Error('unexpected playlist ID '+params.playlistId)
  }
  throw Error('unexpected endpoint '+endpoint)
 }
 const result=await audit({api,at:()=> '2026-10-21T13:00:00+02:00'})
 assert.deepEqual(calls,{videos:1,channels:1,playlists:2,playlistItems:4})
 assert.equal(result.stats.apiCalls,8)
 assert.equal(result.stats.resolved,12)
 assert.equal(result.stats.channelCount,2)
 assert.equal(result.stats.matchedVideoIds,3)
 assert.equal(result.playlists.length,4)
 assert.equal(result.playlists.find(p=>p.playlistId==='PL_FILME_A').name,'Filme auf YouTube')
 assert.equal(result.playlists.find(p=>p.playlistId==='PL_FILME_A').more,true)
 assert.deepEqual(result.playlists.find(p=>p.playlistId==='PL_FILME_A').matches,
  [USER_VIDEO_IDS[0],USER_VIDEO_IDS[2]])
 assert.equal(result.report.includes('is= is NOT a playlist ID'),true)
 assert.equal(result.report.includes('no membership in inspected first pages'),true)
 assert.equal(result.report.includes('Filme auf YouTube'),true)
 assert.equal(result.report.includes('full YouTube'),false)
})
test('empty/missing video responses are not misrepresented as proven absent films or playlists',async()=>{
 const result=await audit({api:async(endpoint)=>{
  if(endpoint==='videos')return{items:[]}
  throw Error('should not request '+endpoint)
 }})
 assert.equal(result.stats.apiCalls,1)
 assert.equal(result.stats.resolved,0)
 assert.equal(result.stats.channelCount,0)
 assert.equal(result.playlists.length,0)
 assert.equal(result.entries.length,12)
 assert.ok(result.report.includes('unresolved'))
})
test('public playlist API errors are recorded, not invented as empty playlist membership',async()=>{
 const result=await audit({api:async(endpoint)=>{
  if(endpoint==='videos')return{items:USER_VIDEO_IDS.map((id,i)=>video(id,'UC_A',i))}
  if(endpoint==='channels')return{items:[{id:'UC_A',snippet:{title:'A'}}]}
  if(endpoint==='playlists')throw Error('YouTube HTTP 403')
  throw Error('unexpected endpoint: '+endpoint)
 }})
 assert.equal(result.stats.apiCalls,3)
 assert.equal(result.channels[0].publicStatus,'not-accessible')
 assert.equal(result.stats.matchedVideoIds,0)
 assert.ok(result.report.includes('not-accessible'))
})
test('playlistItems API failures are reported per playlist and do not create false matches',async()=>{
 const result=await audit({api:async(endpoint)=>{
  if(endpoint==='videos')return{items:USER_VIDEO_IDS.map((id,i)=>video(id,'UC_A',i))}
  if(endpoint==='channels')return{items:[{id:'UC_A',snippet:{title:'A'}}]}
  if(endpoint==='playlists')return{items:[{id:'PL_TEST',snippet:{title:'Test'}}]}
  if(endpoint==='playlistItems')throw Error('YouTube HTTP 403')
  throw Error('unexpected endpoint: '+endpoint)
 }})
 assert.equal(result.stats.apiCalls,4)
 assert.equal(result.playlists[0].status,'not-accessible')
 assert.equal(result.stats.matchedVideoIds,0)
})
