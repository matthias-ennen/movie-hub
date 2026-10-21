import test from 'node:test'
import assert from 'node:assert/strict'
import {ORDERS,MAX_RESULTS_PER_ORDER,MAX_SEARCH_CALLS,MAX_VIDEO_CALLS,
 MAX_TMDB_CALLS,compare} from './youtube-movies-three-sorts-g1.mjs'
const ids=['AAAAAAAAAAA','BBBBBBBBBBB','CCCCCCCCCCC','DDDDDDDDDDD','EEEEEEEEEEE','FFFFFFFFFFF']
const video=(id)=>({
 id,snippet:{title:({
  AAAAAAAAAAA:'Film A',BBBBBBBBBBB:'Film B',
  CCCCCCCCCCC:'Wrong C',DDDDDDDDDDD:'Film D',
  EEEEEEEEEEE:'Short E',FFFFFFFFFFF:'Blocked F'
 })[id],channelTitle:id===ids[2]?'Unrelated uploader':'YouTube Movies',
 channelId:'UC-'+id,publishedAt:'2026-10-20T10:00:00Z'},
 contentDetails:{duration:id===ids[4]?'PT2M':'PT1H40M',
  regionRestriction:id===ids[5]?{blocked:['DE']}:{allowed:['DE']}},
 status:{privacyStatus:'public'},statistics:{viewCount:'100'}
})
test('three agreed sorts and strict quotas',()=>{
 assert.deepEqual(ORDERS,['viewCount','date','rating'])
 assert.equal(MAX_SEARCH_CALLS,3)
 assert.equal(MAX_VIDEO_CALLS,3)
 assert.equal(MAX_RESULTS_PER_ORDER,50)
 assert.ok(MAX_TMDB_CALLS<=80)
})
test('compare DE movie orders, dedupe by ID, filter actual label and long runtime, TMDB remains provisional',async()=>{
 const lists={viewCount:[ids[0],ids[1],ids[2]],date:[ids[0],ids[3],ids[4]],
  rating:[ids[0],ids[1],ids[5]]}
 const calls={search:0,videos:0,tmdb:0}
 const data=await compare({youtubeApi:async(endpoint,p)=>{
  if(endpoint==='search'){
   calls.search++;assert.equal(p.part,'snippet');assert.equal(p.type,'video')
   assert.equal(p.videoType,'movie');assert.equal(p.regionCode,'DE')
   assert.equal(p.maxResults,50);assert.ok(ORDERS.includes(p.order))
   assert.equal(Object.hasOwn(p,'q'),false);assert.equal(Object.hasOwn(p,'channelId'),false)
   return {items:lists[p.order].map(id=>({id:{kind:'youtube#video',videoId:id},
    snippet:{title:'search title',channelTitle:'YouTube Movies'}}))}
  }
  if(endpoint==='videos'){
   calls.videos++
   assert.ok(p.id.split(',').length<=50)
   assert.equal(p.part,'snippet,contentDetails,status,statistics')
   return {items:p.id.split(',').map(video)}
  }
  throw Error('unexpected API '+endpoint)
 },tmdbGet:async(path,params)=>{
  calls.tmdb++
  if(path==='/search/movie')return {results:[{id:100+Number(params.query.slice(-1).charCodeAt(0)),
   title:params.query,release_date:'2000-01-01'}]}
  if(path.startsWith('/movie/'))return{runtime:100}
  throw Error('unexpected TMDB request '+path)
 },at:()=> '2026-10-21T12:00:00Z'})
 assert.deepEqual(calls,{search:3,videos:1,tmdb:6})
 assert.deepEqual(data.runs.map(r=>r.hits.filter(h=>h.qualified).length),[2,2,2])
 assert.equal(data.stats.uniqueSearchIds,6)
 assert.equal(data.stats.uniqueYoutubeMovieCandidates,3)
 assert.equal(data.stats.matchedAcrossOrders,2)
 assert.deepEqual(data.candidates.find(x=>x.id===ids[0]).orders,ORDERS)
 assert.ok(data.candidates.every(x=>data.matches.get(x.id)?.status==='plausible-review'))
 assert.ok(data.report.includes('TMDB hints'))
 assert.ok(data.report.includes('NO first-page pagination'))
 assert.ok(data.report.includes('No claim of worldwide top ranking'))
})
test('zero results stays zero, never fills sample from other sources',async()=>{
 const a=await compare({youtubeApi:async(endpoint)=>{
  assert.equal(endpoint,'search');return {items:[]}
 },tmdbGet:async()=>{throw Error('no TMDB expected')}})
 assert.equal(a.stats.searches,3)
 assert.equal(a.stats.videos,0)
 assert.equal(a.candidates.length,0)
 assert.deepEqual(a.runs.map(x=>x.searchCount),[0,0,0])
})
test('search error only affects that specific order, is reported clearly',async()=>{
 const a=await compare({youtubeApi:async(endpoint,params)=>{
  assert.equal(endpoint,'search')
  if(params.order==='rating')throw Error('YouTube API: HTTP 400 at search')
  return {items:[]}
 },tmdbGet:async()=>{throw Error('none')}})
 assert.equal(a.stats.searches,3)
 assert.equal(a.stats.videos,0)
 assert.deepEqual(a.runs.map(x=>x.status),['ok','ok','api-error'])
 assert.ok(a.report.includes('HTTP 400'))
})
test('150 possible returned video IDs are deduped, looked up in three batches, wrong channels never accepted',async()=>{
 const a=await compare({youtubeApi:async(endpoint,params)=>{
  if(endpoint==='search'){
   const orderIndex=ORDERS.indexOf(params.order)
   return{items:Array.from({length:50},(_,i)=>({
    id:{videoId:String(100000+orderIndex*50+i).padStart(11,'0')},
    snippet:{title:'Film '+i,channelTitle:'Uploader'}
   }))}
  }
  assert.equal(endpoint,'videos')
  assert.ok(params.id.split(',').length<=50)
  return {items:params.id.split(',').map(id=>({
   id,snippet:{title:'Film '+id,channelTitle:'Uploader'},
   status:{privacyStatus:'public'},
   contentDetails:{duration:'PT2H',regionRestriction:{allowed:['DE']}}
  }))}
 },tmdbGet:async()=>{throw Error('none')}})
 assert.equal(a.stats.searches,3)
 assert.equal(a.stats.videos,3)
 assert.equal(a.stats.uniqueSearchIds,150)
 assert.equal(a.stats.videoDetails,150)
 assert.equal(a.stats.uniqueYoutubeMovieCandidates,0)
 assert.equal(a.stats.tmdbCalls,0)
})
