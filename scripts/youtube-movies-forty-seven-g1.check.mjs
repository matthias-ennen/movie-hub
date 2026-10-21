import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {audit,collectObservations,EXPECTED_UNIQUE,EXPECTED_OBSERVATIONS,
 MAX_YOUTUBE_CALLS,MAX_TMDB_CALLS,INPUT} from './youtube-movies-forty-seven-g1.mjs'

const manifest=JSON.parse(await readFile(INPUT,'utf8'))
const unique=collectObservations(manifest.observations)
const youtubeMovie=(id,title,regionRestriction={allowed:['DE']})=>({
 id,snippet:{title,channelId:'UC-'+id,channelTitle:'YouTube Movies'},
 status:{privacyStatus:'public'},
 contentDetails:{duration:'PT1H32M',regionRestriction}
})
test('all four evidenced inputs preserved: 49 sightings, exactly 47 distinct IDs',()=>{
 assert.equal(EXPECTED_UNIQUE,47)
 assert.equal(EXPECTED_OBSERVATIONS,49)
 assert.equal(MAX_YOUTUBE_CALLS,1)
 assert.equal(MAX_TMDB_CALLS,94)
 assert.equal(manifest.observations.length,49)
 assert.equal(unique.length,47)
 const duplicates=unique.filter(x=>x.sources.length>1).map(x=>x.videoId).sort()
 assert.deepEqual(duplicates,['9PsAlt9VHQ0','IxL_x8G1_FU'])
 assert.equal(unique.filter(x=>x.sources.includes('user-supplied')).length,11)
 assert.ok(unique.every(x=>x.evidence.length&&x.oldTitles.length))
})
test('read-only YouTube-first keeps newly discovered titles, series and excluded regions separate',async()=>{
 const [a,b,c]=unique.slice(0,3)
 let youtube=0,tmdb=0
 const r=await audit({manifest,at:()=> '2026-10-21T12:00:00Z',
  youtubeApi:async(endpoint,p)=>{
   youtube++
   assert.equal(endpoint,'videos')
   assert.equal(p.part,'snippet,contentDetails,status')
   assert.equal(p.id.split(',').length,47)
   return {items:[
    youtubeMovie(a.videoId,'Fresh New Film'),
    youtubeMovie(b.videoId,'River Series'),
    youtubeMovie(c.videoId,'Blocked Film',{blocked:['DE']})
   ]}
  },
  tmdbGet:async(path,p)=>{
   tmdb++
   if(path==='/search/multi'){
    assert.equal(p.language,'de-DE')
    if(p.query==='Fresh New Film')return{results:[
     {media_type:'movie',title:'Fresh New Film',id:321,release_date:'2024-01-01'}]}
    if(p.query==='River Series')return{results:[
     {media_type:'tv',name:'River Series',id:999}]}
   }
   if(path==='/movie/321')return{runtime:91}
   throw Error('Unexpected TMDB request')
  }
 })
 assert.equal(youtube,1)
 assert.equal(tmdb,3)
 assert.equal(r.stats.uniqueVideoIds,47)
 assert.equal(r.stats.videoDetailsResolved,3)
 assert.equal(r.rows.find(x=>x.videoId===a.videoId).status,'plausible-review')
 assert.equal(r.rows.find(x=>x.videoId===a.videoId).tmdbId,321)
 assert.equal(r.rows.find(x=>x.videoId===b.videoId).status,'series-title-review')
 assert.equal(r.rows.find(x=>x.videoId===c.videoId).status,'DE-excluded-metadata')
 assert.equal(r.stats.statuses['youtube-not-resolved'],44)
 assert.ok(r.rows.every(x=>x.existingInMovieHub==='not-checked'&&!x.verifiedWork))
 assert.ok(r.report.includes('number of truly NEW MovieHub works is UNKNOWN'))
 assert.ok(r.report.includes('no auto-accepted films'))
 assert.ok(r.report.includes('different actual channel IDs'))
})
test('identical film and series titles remain ambiguous, no forced TMDB film identity',async()=>{
 const first=unique[0]
 const out=await audit({manifest,youtubeApi:async()=>({
  items:[youtubeMovie(first.videoId,'Shared Title')]
 }),tmdbGet:async(path)=>{
  assert.equal(path,'/search/multi')
  return{results:[
   {media_type:'movie',title:'Shared Title',id:777},
   {media_type:'tv',name:'Shared Title',id:888}
  ]}
 }})
 const r=out.rows[0]
 assert.equal(r.status,'ambiguous-work-or-media-type-review')
 assert.equal(r.tmdbId,null)
 assert.equal(out.stats.tmdbCalls,1)
 assert.equal(out.stats.youtubeCalls,1)
})
test('invalid or incomplete 47-ID evidence fails without silent candidate dropping',async()=>{
 const broken={...manifest,observations:manifest.observations.slice(1)}
 await assert.rejects(()=>audit({manifest:broken,youtubeApi:async()=>({items:[]}),
  tmdbGet:async()=>({results:[]})}),/inventory mismatch/)
 assert.throws(()=>collectObservations([{videoId:'private',title:'X',source:'oops',evidence:'x'}]),/Invalid/)
})
