import test from 'node:test'
import assert from 'node:assert/strict'
import {TARGET_TITLES,QUERY_STRATA,MAX_SEARCH_CALLS,MAX_TMDb_CALLS,
 selectFifty,assessTmdb,normalizedTitle,minutes,storeChannelLabel,deAssessment,run}
 from './youtube-movies-fifty-g1.mjs'

test('G1 sample is exactly fifty with twenty diverse source queries',()=>{
 assert.equal(TARGET_TITLES,50)
 assert.equal(QUERY_STRATA.length,20)
 assert.equal(new Set(QUERY_STRATA.map(x=>x.q)).size,20)
 assert.equal(MAX_SEARCH_CALLS,20)
 assert.ok(MAX_TMDb_CALLS>=100)
})
test('movie candidacy is conservative and distinguishes title/region/channel',()=>{
 assert.equal(minutes('PT2H15M30S'),135.5)
 assert.equal(minutes('PT20M'),20)
 assert.equal(minutes('bad'),null)
 assert.equal(storeChannelLabel('YouTube Movies'),true)
 assert.equal(storeChannelLabel('YouTube Movies & TV'),true)
 assert.equal(storeChannelLabel('YouTube movie fan channel'),false)
 assert.equal(deAssessment({allowed:['US']}),'excluded')
 assert.equal(deAssessment({allowed:['DE']}),'allowed')
 assert.equal(deAssessment({blocked:['DE']}),'excluded')
 assert.equal(deAssessment(null),'unknown')
 assert.equal(normalizedTitle('The Test (2022)'),normalizedTitle('The Test 2023'))
 assert.equal(assessTmdb('Film A',[{id:123,title:'Film A',release_date:'2022-01-01'}]).status,'title-exact-review')
 assert.equal(assessTmdb('Film A',[{id:123,title:'Film A'},{id:456,title:'Film A'}]).status,'ambiguous-review')
})
test('round-robin selects 50 distinct YouTube titles and rejects wrong channels, shorts and DE blocks',()=>{
 const discoveries=[{name:'a',hits:[
  {videoId:'abcdefghijk',rank:1},{videoId:'bbbbbbbbbbb',rank:2},{videoId:'ccccccccccc',rank:3},
  {videoId:'ddddddddddd',rank:4}
 ]}]
 const mk=(title,minutes,channel,regions)=>({
  snippet:{title,channelTitle:channel,channelId:'CH'},status:{privacyStatus:'public'},
  contentDetails:{duration:'PT'+minutes+'M',regionRestriction:regions}
 })
 const details=new Map([
 ['abcdefghijk',mk('Film A',90,'YouTube Movies',{allowed:['DE']})],
 ['bbbbbbbbbbb',mk('Film A 2022',90,'YouTube Movies',{allowed:['DE']})],
 ['ccccccccccc',mk('Film C',15,'YouTube Movies',{allowed:['DE']})],
 ['ddddddddddd',mk('Film D',90,'Fan Made YouTube Movies',{allowed:['DE']})]
 ])
 assert.deepEqual(selectFifty(discoveries,details,50).map(x=>x.title),['Film A'])
})
test('realistic mocked 20-search pilot finds 50 distinct YouTube-sourced titles, batches metadata and checks TMDB conservatively',async()=>{
 const calls={search:0,videos:0,tmdb:0},seenKeys=[]
 const youtubeApi=async(endpoint,params)=>{
  if(endpoint==='search'){
   calls.search++;assert.equal(params.type,'video');assert.equal(params.videoType,'movie')
   assert.equal(params.regionCode,'DE');assert.equal(params.maxResults,50)
   const stratum=QUERY_STRATA.findIndex(x=>x.q===params.q)
   assert.ok(stratum>=0)
   return {items:Array.from({length:5},(_,i)=>({
    id:{videoId:String(100000+stratum*5+i).padStart(11,'0')}
   }))}
  }
  if(endpoint==='videos'){
   calls.videos++
   const ids=params.id.split(',');assert.ok(ids.length<=50)
   seenKeys.push(...ids)
   return {items:ids.map(id=>({
    id,snippet:{title:'Movie Sample '+(Number(id)-100000),
      channelTitle:'YouTube Movies',channelId:'UC_YT_MOVIES'},
    status:{privacyStatus:'public'},
    contentDetails:{duration:'PT2H',regionRestriction:{allowed:['DE']}}
   }))}
  }
  throw Error('Unexpected endpoint')
 }
 const tmdbGet=async(path,query)=>{
  calls.tmdb++
  if(path==='/search/movie'){
   assert.equal(query.language,'de-DE')
   return {results:[{id:Number(query.query.match(/\d+$/)[0])+1,
     title:query.query,release_date:'1999-01-01'}]}
  }
  if(/^\/movie\/\d+$/.test(path))return{runtime:120}
  throw Error('Unexpected TMDB endpoint')
 }
 const r=await run({youtubeApi,tmdbGet,at:()=> '2026-10-21T13:00:00Z'})
 assert.equal(r.chosen.length,50)
 assert.equal(new Set(r.chosen.map(x=>normalizedTitle(x.title))).size,50)
 assert.equal(new Set(r.chosen.map(x=>x.videoId)).size,50)
 assert.equal(calls.search,20)
 assert.equal(calls.videos,2)
 assert.equal(calls.tmdb,100)
 assert.equal(r.counts.quota,2002)
 assert.equal(seenKeys.length,100)
 assert.ok(r.chosen.every(x=>x.status==='plausible-review'))
 assert.ok(r.report.includes('TARGET: **50'))
 assert.ok(r.report.includes('No Firestore, catalog, badges'))
 assert.equal(new Set(r.chosen.map(x=>x.stratum)).size,20)
})
test('fewer than fifty matches are honestly reported and never padded',async()=>{
 const data=await run({
  youtubeApi:async(endpoint)=>{
   if(endpoint==='search')return {items:[]}
   if(endpoint==='videos')throw Error('No video detail call expected')
  },
  tmdbGet:async()=>{throw Error('No TMDB call expected')},
  at:()=> '2026-10-21'
 })
 assert.equal(data.chosen.length,0)
 assert.equal(data.counts.searchCalls,20)
 assert.equal(data.counts.videoCalls,0)
 assert.equal(data.counts.tmdbCalls,0)
 assert.ok(data.report.includes('ACTUAL: **0**'))
})
