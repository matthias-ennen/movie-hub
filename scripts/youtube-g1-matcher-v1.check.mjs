import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {reviewHundred,scoreCandidate,classifyVideo,MAX_MOVIE_DETAILS,ORIGINAL_COUNT} from './youtube-g1-matcher-v1.mjs'
const yid=n=>'X'+String(n).padStart(10,'0')
const titles={6:'World of Warcraft - O Filme da Historia Dublado',
 9:'Reich und Arm - Staffel 1 Ganzer Film Deutsch lernen',
 13:'Man Bites Dog (Full Film)',19:'Rambo II - Der Auftrag',
 22:'2010: The Year We Make Contact',30:'War Story',
 35:'Project Hail Mary',53:'Spider-Man: Brand New Day',
 89:'Terminator 2 - Tag der Abrechnung'}
const films={
 10086:{title:'Mann beißt Hund',original_title:"C'est arrivé près de chez vous",
  alternative_titles:{titles:[{title:'Man Bites Dog'}]},runtime:95,release_date:'1992-01-01'},
 1537259:{title:'Man With a Movie Camera: The Found Footage',runtime:138,release_date:'2025-01-01'},
 1369:{title:'Rambo II - Der Auftrag',runtime:96,release_date:'1985-01-01'},
 1370:{title:'Rambo III',runtime:102,release_date:'1988-01-01'},
 4437:{title:'2010',alternative_titles:{titles:[{title:'2010: The Year We Make Contact'}]},runtime:116,release_date:'1984-01-01'},
 167662:{title:'War Story',runtime:173,release_date:'1989-01-01'},
 246013:{title:'War Story',runtime:90,release_date:'2014-01-01'},
 687163:{title:'Der Astronaut – Project Hail Mary',original_title:'Project Hail Mary',runtime:157,release_date:'2026-03-01'},
 969681:{title:'Spider-Man: Brand New Day',runtime:145,release_date:'2026-07-01'},
 280:{title:'Terminator 2 - Tag der Abrechnung',runtime:137,release_date:'1991-01-01'}
}
function fixture(){
 const rows=Array.from({length:100},(_,i)=>({rank:i+1,videoId:yid(i+1),
  category:i>=1&&i<=13?'2':'30',origin:i<55?'new-search':'existing-47',
  title:titles[i+1]||'Movie Research Title '+(i+1),
  minutes:i+1===13?92:i+1===19?96.1:i+1===22?115.8:
   i+1===30?89.3:i+1===35?156.6:i+1===53?145:i+1===89?120:100}))
 const idsFor=x=>x.rank===13?[1537259,10086]:
  x.rank===19?[1370,1369]:x.rank===22?[4437]:
  x.rank===30?[167662,246013]:
  x.rank===35?[687163]:x.rank===53?[969681]:
  x.rank===89?[280]:[100000+x.rank]
 const original=['# G1 source',
  '- Actual selected **100/100**; missing **0**.',
  '## The up-to-100 video-ID research sample',
  '| # | Video-ID and title | Category | Prior or fresh | Movie plausibility | Runtime | DE signal | Identity and offers |',
  '| ---: | --- | --- | --- | --- | ---: | --- | --- |',
  ...rows.map(x=>'| '+x.rank+' | ['+x.title+'](https://www.youtube.com/watch?v='+
   x.videoId+') '+x.videoId+' | '+x.category+' | '+x.origin+
   ' | movie-search | '+x.minutes+'m | allowed | unverified / unknown |')].join('\n')
 const sha=createHash('sha256').update(rows.map(x=>x.videoId).join('\n')+'\n').digest('hex')
 const hints=x=>idsFor(x).map(id=>'Research title ('+id+', 2014, score 3)').join('; ')
 const tmdb=['# G1 TMDB initial',
  '## Category risk group (13)',
  '| Original # | Title | YouTube cat | Film clues (max 3) | TV clues | Runtime Δ | Review |',
  '| ---: | --- | ---: | --- | --- | ---: | --- |',
  ...rows.filter(x=>x.category!=='30').map(x=>'| '+x.rank+' | '+x.title+
   ' | '+x.category+' | '+hints(x)+' | '+(x.rank===9?'TV show (5577)':'none')+
   ' | ?m | multiple-works-or-film-TV-review |'),
  '## Film-category candidates (87), still unconfirmed',
  '| # | Video ID / title | TMDB film clues (max 3) | TV clues | Runtime Δ | Review |',
  '| ---: | --- | --- | --- | ---: | --- |',
  ...rows.filter(x=>x.category==='30').map(x=>'| '+x.rank+
   ' | ['+x.title+'](https://www.youtube.com/watch?v='+x.videoId+') '+x.videoId+
   ' | '+hints(x)+' | none | ?m | single-movie-hypothesis-review |')].join('\n')
 return{rows,original,tmdb,sha}
}
const f=fixture()
async function fakeTMDB(path,params){
 assert.match(path,/^\/movie\/[1-9]\d*$/)
 assert.equal(params.append_to_response,'alternative_titles,credits,external_ids')
 const id=Number(path.split('/').pop())
 return{id,...(films[id]||{title:'Movie Research Title '+(id-100000),runtime:100,
   release_date:'2015-01-01'}),credits:{crew:[{job:'Director',name:'Test Director'}]}}
}
test('year-looking 2010 is a movie title and not a false 2010 release-year claim',()=>{
 const s=scoreCandidate({title:titles[22],minutes:115.8}, {id:4437,...films[4437]})
 assert.equal(s.yearHint,null)
 assert.equal(s.yearMismatch,false)
 assert.equal(s.titleLevel,4)
 assert.equal(s.runtimeDelta,0.2)
})
test('content-type guardrail holds even for plausible movie database result',()=>{
 for(const t of [titles[6],titles[9]]){
  const v=classifyVideo({title:t,category:'2',region:'unknown'},
   [scoreCandidate({title:t,minutes:95},{id:10086,...films[10086]})])
  assert.equal(v.status,'review-source-content-type-risk')
  assert.equal(v.confirmedFilm,false)
 }
})
test('100 ORIGINAL leads; all 100 reviewed once, independent top-3 details, limited GETs',async()=>{
 const called=[]
 const r=await reviewHundred({originalReport:f.original,tmdbReport:f.tmdb,
  expectedHash:f.sha,getMovie:async(path,params)=>{
   called.push(path);return fakeTMDB(path,params)
  },now:()=> '2026-10-21T18:50:00Z'})
 assert.equal(r.rows.length,ORIGINAL_COUNT)
 assert.equal(r.stats.reviewed,100)
 assert.ok(r.stats.calls<=MAX_MOVIE_DETAILS)
 assert.equal(new Set(r.rows.map(x=>x.videoId)).size,100)
 assert.ok(r.rows.every(x=>x.verdict.confirmedMovieId===null&&
  x.verdict.confirmedFilm===false&&x.verdict.confirmedDEPlayback===false&&
  x.verdict.confirmedOffer===false))
 const row=n=>r.rows.find(x=>x.rank===n)
 assert.equal(row(13).verdict.topCandidates[0].tmdbId,10086)
 assert.equal(row(19).verdict.topCandidates[0].tmdbId,1369)
 assert.equal(row(22).verdict.topCandidates[0].tmdbId,4437)
 assert.equal(row(30).verdict.topCandidates[0].tmdbId,246013)
 assert.equal(row(6).verdict.status,'review-source-content-type-risk')
 assert.equal(row(9).verdict.status,'review-source-content-type-risk')
 assert.equal(row(35).verdict.status,'review-current-release-needs-content-check')
 assert.equal(row(53).verdict.status,'review-current-release-needs-content-check')
 assert.equal(row(89).verdict.status,'review-work-or-cut-runtime-conflict')
 assert.deepEqual(row(9).verdict.alternativeTvIds,[5577])
 assert.ok(called.every(p=>p.startsWith('/movie/')))
 assert.equal(r.report.includes('Every candidate REVIEW'),false)
 assert.ok(r.report.includes('All 100 G1 outcomes'))
 assert.ok(r.report.includes('NO YouTube API, NO TMDB search'))
})
test('non-supplied original SHA or tampered ID fails without TMDB calls',async()=>{
 let hits=0
 await assert.rejects(()=>reviewHundred({originalReport:f.original,tmdbReport:f.tmdb,
  getMovie:async()=>{hits++;return {}}}),/SHA-256 mismatch/)
 assert.equal(hits,0)
 await assert.rejects(()=>reviewHundred({originalReport:f.original.replace(yid(13),'XXXXXXXXXXX'),
  tmdbReport:f.tmdb,expectedHash:f.sha,getMovie:async()=>{hits++;return {}}}),
  /mismatch/)
 assert.equal(hits,0)
})
test('429 response makes all remaining video IDs not-checked, no false negatives',async()=>{
 let hits=0
 const r=await reviewHundred({originalReport:f.original,tmdbReport:f.tmdb,
  expectedHash:f.sha,getMovie:async()=>{
   hits++;throw Error('TMDB HTTP 429')
  }})
 assert.equal(hits,1)
 assert.equal(r.rows.length,100)
 assert.equal(r.stats.quotaStopped,true)
 assert.equal(r.rows[0].verdict.status,'review-API-incomplete')
 assert.ok(r.rows.slice(1).every(x=>x.verdict.status==='review-not-checked-quota'))
})
test('conflicting sequels and similar spellings cannot approve film/video work',()=>{
 const x=scoreCandidate({title:titles[19],minutes:96.1},{id:1370,...films[1370]})
 assert.equal(x.sequelConflict,true)
 assert.equal(x.confirmedFilm,false)
 assert.equal(classifyVideo({title:titles[19],category:'30',region:'allowed'},[x]).status,
  'review-sequel-or-supplement-conflict')
})
