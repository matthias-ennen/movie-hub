import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {auditFive,validate,MAX_YOUTUBE_READS,MAX_TMDB_READS,INPUT} from './youtube-movies-five-work-evidence-g1.mjs'
const manifest=JSON.parse(await readFile(INPUT,'utf8'))
const ids=validate(manifest)
function vid(source,description='',overrides={}){
 return {
  id:source.videoId,
  snippet:{title:source.youtubeTitle,description,
   channelTitle:'YouTube Movies',channelId:'UC'+source.videoId},
  status:{privacyStatus:'public',embeddable:true},
  contentDetails:{duration:'PT'+String(Math.floor(source.observedYoutubeMinutes))+'M',
   regionRestriction:{allowed:['DE']}},
  ...overrides
 }
}
function movie(source,description=''){
 return{id:source.tmdbMovieId,
  title:source.originalTitle,original_title:source.originalTitle,
  release_date:String(source.releaseYear)+'-01-01',runtime:source.tmdbMinutes,
  credits:{crew:[{job:'Director',name:source.expectedDirector}]},
  external_ids:{imdb_id:'tt0123456'},
  alternative_titles:{titles:[{title:source.knownAlias||source.youtubeTitle}]}}
}
test('exactly five independent video-film pairs; never preapproved',()=>{
 assert.equal(ids.length,5)
 assert.equal(MAX_YOUTUBE_READS,1)
 assert.equal(MAX_TMDB_READS,5)
 assert.equal(new Set(ids.map(x=>x.videoId)).size,5)
 assert.equal(new Set(ids.map(x=>x.tmdbMovieId)).size,5)
 assert.deepEqual(ids.map(x=>x.tmdbMovieId),[4437,246013,75531,319995,394645])
})
test('different public metadata signals stay review, and no raw YouTube description is exposed',async()=>{
 const [a,b,c,d,e]=ids
 const videos=[
  vid(a,'Production year: 1984\nDirector: Peter Hyams\nIMDb: tt0123456\nPRIVATE-NOTE-SENTINEL'),
  vid(b,'Year: 2014\nDirector: Some Other Director\nIMDb tt7654321'),
  vid(c,''),
  vid(d,'', {status:{privacyStatus:'public'},contentDetails:{
   duration:'PT97M',regionRestriction:{blocked:['DE']}}}),
  vid(e,'',{status:{privacyStatus:'private'}})
 ]
 let youtubeCalls=0,tmdbCalls=0
 const out=await auditFive({manifest,at:()=> '2026-10-21T14:00:00Z',
  youtubeApi:async(endpoint,params)=>{youtubeCalls++
   assert.equal(endpoint,'videos');assert.equal(params.part,'snippet,contentDetails,status')
   assert.equal(params.id.split(',').length,5)
   return{items:videos}},
  tmdbGet:async(path,params)=>{tmdbCalls++
   assert.equal(params.append_to_response,'credits,alternative_titles,external_ids')
   const match=ids.find(x=>path==='/movie/'+x.tmdbMovieId)
   assert.ok(match)
   return movie(match)}
 })
 assert.equal(youtubeCalls,1);assert.equal(tmdbCalls,5)
 assert.equal(out.rows.length,5)
 assert.equal(out.rows[0].imdbCrosscheck,'exact-imdb-id-listed')
 assert.equal(out.rows[0].yearCrosscheck,'release-year-listed')
 assert.equal(out.rows[0].descriptionDirectorCrosscheck,'same-director-listed')
 assert.equal(out.rows[0].disposition,'review-direct-identifier-support')
 assert.equal(out.rows[1].imdbCrosscheck,'different-imdb-id-listed')
 assert.equal(out.rows[1].disposition,'review-cross-source-conflict')
 assert.equal(out.rows[2].disposition,'review-title-runtime-only')
 assert.equal(out.rows[3].disposition,'review-DE-region-excluded')
 assert.equal(out.rows[4].disposition,'review-video-not-public')
 assert.ok(out.rows.every(x=>!x.confirmedFilm&&!x.confirmedDEPlayback&&
  !x.confirmedOffer&&!x.confirmedRights))
 assert.equal(out.report.includes('PRIVATE-NOTE-SENTINEL'),false)
 assert.ok(out.report.includes('No automatic TMDB assignment'))
})
test('missing film detail and video metadata are explicit review, never positive',async()=>{
 const data=await auditFive({manifest,youtubeApi:async()=>({items:[]}),
  tmdbGet:async()=>{throw Error('TMDB network unavailable')}})
 assert.equal(data.stats.youtubeCalls,1)
 assert.equal(data.stats.tmdbCalls,5)
 assert.ok(data.rows.every(x=>x.disposition==='review-tmdb-error'))
 assert.ok(data.rows.every(x=>x.confirmedFilm===false))
})
test('missing one video yields video-unavailable even with matching movie seed',async()=>{
 const data=await auditFive({manifest,youtubeApi:async()=>({items:[]}),
  tmdbGet:async p=>movie(ids.find(x=>p==='/movie/'+x.tmdbMovieId))})
 assert.ok(data.rows.every(x=>x.disposition==='review-video-unavailable'))
})
test('untrusted manifest cardinality, duplicate or wrong provenance fails closed',async()=>{
 await assert.rejects(()=>auditFive({...{manifest:{...manifest,candidates:manifest.candidates.slice(1)},
  youtubeApi:async()=>({items:[]}),tmdbGet:async()=>({})}}),/manifest mismatch/)
 assert.throws(()=>validate({...manifest,referenceArtifactId:1}),/manifest mismatch/)
})
