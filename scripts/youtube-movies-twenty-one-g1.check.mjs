import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {EXPECTED,MAX_TMDB_CALLS,MAX_MOVIE_DETAILS,INPUT,variants,validate,audit21}
 from './youtube-movies-twenty-one-g1.mjs'
const source=JSON.parse(await readFile(INPUT,'utf8'))
test('manifest preserves exactly 10 ambiguous, 2 TV, 9 unmatched original live G1 cases',()=>{
 const rows=validate(source)
 assert.equal(EXPECTED,21)
 assert.equal(rows.length,21)
 assert.equal(new Set(rows.map(x=>x.videoId)).size,21)
 assert.ok(rows.every(x=>x.minutes>=60))
 assert.ok(MAX_TMDB_CALLS<=140)
 assert.equal(MAX_MOVIE_DETAILS,3)
 assert.deepEqual(variants('El Club (OmU)'),['El Club (OmU)','El Club'])
 assert.deepEqual(variants('Back In Time OmU'),['Back In Time OmU','Back In Time'])
 assert.deepEqual(variants('Sahara'),['Sahara'])
 assert.ok(rows.some(x=>x.title.startsWith('Peter Maffay')))
 assert.ok(rows.some(x=>x.title.startsWith('Janette Oke')))
})
test('movie ambiguity, discovered alias, TV collision and concert controls are not accepted automatically',async()=>{
 const calls=[]
 const out=await audit21({manifest:source,at:()=> '2026-10-21T15:06:00+02:00',
  tmdbGet:async(path,params)=>{
   calls.push([path,params])
   if(path==='/search/movie'){
    if(params.query==='War Story')return{results:[
     {id:11,title:'War Story',release_date:'2014-01-01'},
     {id:12,title:'War Story',release_date:'2024-01-01'}]}
    if(params.query==='Back In Time')return{results:[
     {id:70,title:'Back In Time',release_date:'2015-01-01'}]}
    if(params.query==='Paradise')return{results:[]}
    return {results:[]}
   }
   if(path==='/search/tv'){
    if(params.query==='Paradise')return{results:[{id:33,name:'Paradise'}]}
    return {results:[]}
   }
   if(path==='/movie/11')return{runtime:90}
   if(path==='/movie/12')return{runtime:91}
   if(path==='/movie/70')return{runtime:93}
   throw Error('Unexpected lookup '+path)
  }
 })
 assert.equal(out.rows.length,21)
 assert.equal(out.rows.find(x=>x.title==='War Story').status,'ambiguous-film-or-tv-review')
 assert.equal(out.rows.find(x=>x.title==='Back In Time OmU').status,'single-film-hypothesis-review')
 assert.equal(out.rows.find(x=>x.title==='Paradise').status,'tv-title-hypothesis-review')
 assert.equal(out.rows.find(x=>x.title.startsWith('Peter Maffay')).status,'non-film-risk-review')
 assert.equal(out.rows.find(x=>x.title.startsWith('Janette Oke')).status,'non-film-risk-review')
 assert.ok(out.rows.every(x=>x.acceptedMovieId===null&&x.confirmedWork===false))
 assert.ok(calls.every(([path])=>path==='/search/movie'||path==='/search/tv'||/^\/movie\/\d+$/.test(path)))
 assert.ok(calls.every(([path,params])=>path.startsWith('/search/')?params.language==='de-DE':params.language==='de-DE'))
 assert.equal(out.stats.tmdbCalls,calls.length)
 assert.ok(out.stats.tmdbCalls<=MAX_TMDB_CALLS)
 assert.ok(out.report.includes('no new YouTube API calls'))
 assert.ok(out.report.includes('Work confirmations: ZERO')===false)
 assert.ok(out.report.includes('accepted=0'))
})
test('invalid or truncated manifest fails closed',async()=>{
 assert.throws(()=>validate({...source,rows:source.rows.slice(1)}),/mismatch|invalid/)
 const duplicate=structuredClone(source);duplicate.rows[1].videoId=duplicate.rows[0].videoId
 assert.throws(()=>validate(duplicate),/duplicate/)
})
test('TMDB outages remain research uncertainties, not new movie titles',async()=>{
 const a=await audit21({manifest:source,tmdbGet:async()=>{throw Error('TMDB 503')}})
 assert.equal(a.rows.length,21)
 assert.equal(a.rows.find(x=>x.title==='War Story').status,'incomplete-api-review')
 assert.ok(a.rows.every(x=>x.acceptedMovieId===null))
 assert.ok(a.stats.tmdbCalls>=42&&a.stats.tmdbCalls<=63)
})
