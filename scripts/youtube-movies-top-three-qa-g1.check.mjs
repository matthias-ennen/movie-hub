import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {parseOriginal} from './youtube-movies-hundred-tmdb-g1.mjs'
import {parseTmdbReport,getPriority,titleQuality,evaluateMovie,review,
 EXPECTED_CASES,MAX_DETAILS} from './youtube-movies-top-three-qa-g1.mjs'
function id(n){return 'Q'+String(n).padStart(10,'0')}
const specials={
 6:'World of Warcraft - O Filme da Historia Dublado',
 9:'Reich und Arm - Staffel 1 Ganzer Film Deutsch lernen',
 13:'Man Bites Dog (Full Film)',
 17:'School of Rock',
 19:'Rambo II - Der Auftrag',
 22:'2010: The Year We Make Contact',
 30:'War Story'
}
function fixture(){
 const rows=Array.from({length:100},(_,i)=>({rank:i+1,
  videoId:id(i+1),title:specials[i+1]||'Movie Candidate '+(i+1),
  category:i<13?'1':'30',origin:i>=55?'existing-47':'new-search',
  minutes:i+1===13?92:i+1===30?89.3:i+1===22?115.8:i+1===19?96.1:100}))
 const original=['# G1',
 '- Actual selected **100/100**; missing **0**.',
 '## The up-to-100 video-ID research sample',
 '| # | Video-ID and title | Category | Prior or fresh | Movie plausibility | Runtime | DE signal | Identity and offers |',
 '| ---: | --- | --- | --- | --- | ---: | --- | --- |',
 ...rows.map(r=>'| '+r.rank+' | ['+r.title+
  '](https://www.youtube.com/watch?v='+r.videoId+') '+r.videoId+
  ' | '+r.category+' | '+r.origin+' | movie-search | '+r.minutes+
  'm | allowed | unverified / unknown |')].join('\n')
 const sha=createHash('sha256').update(rows.map(r=>r.videoId).join('\n')+'\n').digest('hex')
 const filmsFor=r=>{
  if(r.rank===13)return[1537259,10086,1199969]
  if(r.rank===19)return[1369,1370]
  if(r.rank===22)return[4437]
  if(r.rank===30)return[167662,246013,975963]
  return[100000+r.rank]
 }
 const clue=r=>filmsFor(r).map(film=>'Film title ('+film+', 2014, score 3)').join('; ')
 const report=['# original hundred research report','## Category risk group (13)',
 '| Original # | Title | YouTube cat | Film clues (max 3) | TV clues | Runtime Δ | Review |',
 '| --- | --- | --- | --- | --- | --- | --- |',
 ...rows.filter(r=>r.category!=='30').map(r=>'| '+r.rank+' | '+r.title+
  ' | '+r.category+' | '+clue(r)+' | none | ?m | multiple-works-or-film-TV-review |'),
 '## Film-category candidates (87), still unconfirmed',
 '| # | Video ID / title | TMDB film clues (max 3) | TV clues | Runtime Δ | Review |',
 '| --- | --- | --- | --- | --- | --- |',
 ...rows.filter(r=>r.category==='30').map(r=>'| '+r.rank+
  ' | ['+r.title+'](https://www.youtube.com/watch?v='+r.videoId+') '+r.videoId+
  ' | '+clue(r)+' | none | ?m | multiple-works-or-film-TV-review |')].join('\n')
 return {rows,original,report,sha}
}
const f=fixture()
const detailed=idNum=>{
 if(idNum===1537259)return {id:idNum,title:'Man With a Movie Camera: The Found Footage',runtime:138,release_date:'2025-01-01'}
 if(idNum===10086)return{id:idNum,title:'Mann beißt Hund',original_title:"C'est arrivé près de chez vous",
   alternative_titles:{titles:[{title:'Man Bites Dog'}]},runtime:96,release_date:'1992-01-01'}
 if(idNum===1199969)return{id:idNum,title:'Dog Bites Man',runtime:109,release_date:'2024-01-01'}
 if(idNum===167662)return{id:idNum,title:'War Story',runtime:173,release_date:'1989-01-01'}
 if(idNum===246013)return{id:idNum,title:'War Story',runtime:90,release_date:'2014-01-01'}
 if(idNum===975963)return{id:idNum,title:'War Story',runtime:120,release_date:'2001-01-01'}
 if(idNum===4437)return{id:idNum,title:'2010',original_title:'2010',
   alternative_titles:{titles:[{title:'2010: The Year We Make Contact'}]},runtime:116,release_date:'1984-01-01'}
 if(idNum===1369)return{id:idNum,title:'Rambo II - Der Auftrag',runtime:96,release_date:'1985-01-01'}
 if(idNum===1370)return{id:idNum,title:'Rambo III',runtime:102,release_date:'1988-01-01'}
 const n=idNum-100000
 return{id:idNum,title:specials[n]||'Movie Candidate '+n,runtime:100,release_date:'2015-01-01'}
}
test('original hundred-source SHA and source-to-source rank/ID consistency are gates',()=>{
 const orig=parseOriginal(f.original,f.sha)
 assert.equal(orig.length,100)
 const rows=parseTmdbReport(f.report,orig)
 assert.equal(rows.length,100)
 const selected=getPriority(rows)
 assert.equal(selected.length,EXPECTED_CASES)
 assert.equal(selected.filter(x=>x.category!=='30').length,13)
 assert.ok(selected.slice(0,13).every(x=>x.category!=='30'))
 assert.equal(MAX_DETAILS,102)
 assert.throws(()=>parseOriginal(f.original),/SHA-256 mismatch/)
 assert.throws(()=>parseTmdbReport(f.report.replace('watch?v='+id(30),'watch?v=XXXXXXXXXXX'),orig),/Video ID mismatch/)
})
test('English/German movie alt-title, 2010 work alias and sequel discriminant',()=>{
 const man=evaluateMovie({title:'Man Bites Dog (Full Film)',minutes:92},detailed(10086))
 assert.equal(titleQuality('Man Bites Dog (Full Film)',detailed(10086)).source,'exact-title-or-alias')
 assert.equal(man.runtimeDelta,4)
 assert.equal(man.status,'review-plausible-work-hypothesis')
 assert.equal(evaluateMovie({title:'2010: The Year We Make Contact',minutes:115.8},detailed(4437)).titleLevel,4)
 const rambo=evaluateMovie({title:'Rambo II - Der Auftrag',minutes:96.1},detailed(1370))
 assert.equal(rambo.sequelConflict,true)
 assert.equal(rambo.status,'review-sequel-conflict')
 assert.equal(rambo.confirmedFilm,false)
})
test('34 fixed QA cases, exact real-world errors corrected by independent top-three runtime reads',async()=>{
 const calls=[]
 const result=await review({originalSource:f.original,tmdbSource:f.report,expectedHash:f.sha,
  now:()=> '2026-10-21T18:00:00Z',
  tmdbGet:async(path,params)=>{
   calls.push({path,params})
   const n=Number(path.split('/').pop())
   assert.equal(params.append_to_response,'alternative_titles,credits,external_ids')
   return detailed(n)
  }})
 assert.equal(result.rows.length,34)
 assert.equal(result.stats.calls,39)
 assert.ok(result.stats.calls<=MAX_DETAILS)
 const find=n=>result.rows.find(x=>x.rank===n)
 assert.equal(find(30).candidates[0].tmdbId,246013)
 assert.equal(find(30).improvementOverOldFirst,true)
 assert.equal(find(13).candidates[0].tmdbId,10086)
 assert.equal(find(13).improvementOverOldFirst,true)
 assert.equal(find(22).candidates[0].tmdbId,4437)
 assert.equal(find(19).candidates[0].tmdbId,1369)
 assert.equal(find(6).status,'review-content-type-risk')
 assert.equal(find(9).status,'review-content-type-risk')
 assert.ok(result.rows.every(x=>x.confirmedFilm===false&&
  x.confirmedDEPlayback===false&&x.confirmedOffer===false))
 assert.ok(result.rows.every(x=>x.candidates.every(y=>y.confirmedFilm===false)))
 assert.ok(calls.every(c=>/^\/movie\/\d+$/.test(c.path)))
 assert.equal(new Set(result.rows.map(x=>x.videoId)).size,34)
 assert.ok(result.report.includes('remaining 66 original videos are not freshly re-examined'))
})
test('on TMDB 429, residual 33 cases explicit not checked, not falsely unmatched',async()=>{
 let requests=0
 const outcome=await review({originalSource:f.original,tmdbSource:f.report,expectedHash:f.sha,
  tmdbGet:async()=>{requests++;throw Error('TMDB HTTP 429')}})
 assert.equal(requests,1)
 assert.equal(outcome.stats.quotaStop,true)
 assert.equal(outcome.rows.filter(x=>x.status==='review-not-checked-quota').length,33)
 assert.equal(outcome.rows.length,34)
 assert.ok(outcome.rows.every(x=>x.confirmedFilm===false))
})
test('no TMDB hint is not a negative work proof, still review',async()=>{
 const report=f.report.replace('Film title (100002, 2014, score 3)','none')
 const result=await review({originalSource:f.original,tmdbSource:report,expectedHash:f.sha,
  tmdbGet:async path=>detailed(Number(path.split('/').pop()))})
 const one=result.rows.find(x=>x.rank===2)
 assert.equal(one.status,'review-no-movie-evidence')
 assert.equal(one.confirmedFilm,false)
})
