import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {parseOriginal,titleVariants,audit,MAX_TMDB_GETS,EXPECTED} from './youtube-movies-hundred-tmdb-g1.mjs'
const vid=i=>'V'+String(i).padStart(10,'0')
function fixture(){
 const rows=Array.from({length:100},(_,j)=>{
  const n=j+1,cat=n<=13?'1':'30'
  const title=n===2?'Reich und Arm - Staffel 1 Ganzer Film Deutsch lernen':
   n===1?'World of Warcraft - O Filme da Historia Dublado':'Movie Candidate '+n
  return{rank:n,videoId:vid(n),title,category:cat,origin:n<=55?'new-search':'existing-47'}
 })
 const raw=['# G1 – original','- Actual selected **100/100**; missing **0**.',
 '## The up-to-100 video-ID research sample',
 '| # | Video-ID and title | Category | Prior or fresh | Movie plausibility | Runtime | DE signal | Identity and offers |',
 '| ---: | --- | --- | --- | --- | ---: | --- | --- |',
 ...rows.map(x=>'| '+x.rank+' | ['+x.title+'](https://www.youtube.com/watch?v='+x.videoId+
  ') '+x.videoId+' | '+x.category+' | '+x.origin+
  ' | movie-search | 100m | allowed | unverified / unknown |')].join('\n')+'\n'
 const hash=createHash('sha256').update(rows.map(x=>x.videoId).join('\n')+'\n').digest('hex')
 return{raw,hash,rows}
}
const f=fixture()
test('strict original 100 ordered VIDEO IDs and categories, fixture hash; no invented IDs',()=>{
 const a=parseOriginal(f.raw,f.hash)
 assert.equal(a.length,100)
 assert.equal(a.filter(x=>x.category!=='30').length,13)
 assert.equal(a.filter(x=>x.category==='30').length,87)
 assert.equal(EXPECTED,100)
 assert.equal(MAX_TMDB_GETS,310)
 assert.throws(()=>parseOriginal(f.raw),/SHA-256 mismatch/)
 assert.throws(()=>parseOriginal(f.raw.replace('V0000000002','V0000000999'),f.hash),
  /mismatch|video ID/)
 assert.deepEqual(titleVariants({title:'ADAM SANDLER entdeckt ein magisches Geheimnis - COBBLER - DER S'}).slice(0,1),['The Cobbler'])
})
test('all 100 cases use TMDB only; 13 other-category checked before all category-30 cases',async()=>{
 const queries=[]
 const out=await audit({source:f.raw,expectedHash:f.hash,
  now:()=> '2026-10-21T17:12:00+02:00',
  tmdbGet:async(path,params)=>{
   queries.push({path,params})
   if(path==='/search/multi')return{results:[{
     id:10001,media_type:'movie',title:params.query,release_date:'2015-01-01'
   }]}
   if(path==='/search/movie')return{results:[{
     id:10001,title:params.query,release_date:'2015-01-01'
   }]}
   if(path==='/movie/10001')return{runtime:100}
   throw Error('Unexpected TMDB endpoint '+path)
  }})
 assert.equal(out.rows.length,100)
 assert.equal(out.stats.riskCount,13)
 assert.equal(out.stats.filmCategoryCount,87)
 assert.equal(out.stats.calls,300)
 assert.ok(out.stats.calls<=MAX_TMDB_GETS)
 assert.ok(out.rows.every(x=>x.verifiedWork===false&&x.acceptedTmdbId===null&&
  x.verifiedDEPlayback===false&&x.verifiedOffer===false))
 assert.equal(out.rows[0].review,'content-type-risk-review')
 assert.equal(out.rows[1].review,'content-type-risk-review')
 assert.equal(out.rows[13].review,'single-movie-hypothesis-review')
 assert.equal(queries[0].params.query,f.rows[0].title)
 assert.equal(queries[39].params.query,f.rows[13].title)
 assert.ok(queries.every(x=>/^(\/search\/multi|\/search\/movie|\/movie\/\d+)$/.test(x.path)))
 assert.ok(out.report.includes('Exactly the original 100 VIDEO IDs'))
 assert.ok(out.report.includes('0** automated accepted movie IDs'))
})
test('TMDB rate limit does NOT fake work identity and leaves remainder unreviewed',async()=>{
 let requests=0
 const r=await audit({source:f.raw,expectedHash:f.hash,tmdbGet:async()=>{
  requests++
  throw Error('TMDB HTTP 429')
 }})
 assert.equal(requests,1)
 assert.equal(r.stats.calls,1)
 assert.equal(r.stats.unreviewed,99)
 assert.equal(r.rows[0].review,'partial-API-review')
 assert.equal(r.rows[99].review,'not-checked-budget')
 assert.ok(r.report.includes('interruption: YES'))
})
test('TMDB film/TV name collision stays ambiguous and no IDs accepted',async()=>{
 const a=await audit({source:f.raw,expectedHash:f.hash,
  tmdbGet:async(path,params)=>{
   if(path==='/search/multi')return{results:[
    {id:15,media_type:'movie',title:params.query,release_date:'2020-01-01'},
    {id:100,media_type:'tv',name:params.query,first_air_date:'2017-01-01'}]}
   if(path==='/search/movie')return{results:[{
    id:15,title:params.query,release_date:'2020-01-01'}]}
   if(path==='/movie/15')return{runtime:100}
   return{results:[]}
 }})
 assert.equal(a.rows[15].review,'multiple-works-or-film-TV-review')
 assert.ok(a.rows.every(x=>x.acceptedTmdbId===null))
})
