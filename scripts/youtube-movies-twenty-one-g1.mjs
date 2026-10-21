// G1 research only: inspect 21 unresolved YouTube movie video IDs using TMDB.
// No provider filters, YouTube API searches, catalog writes, badges or deployment.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {isVideoId,safeTitle} from './youtube-api-smoke.mjs'
import {normalizedTitle} from './youtube-movies-fifty-g1.mjs'
export const INPUT='docs/_work/YOUTUBE_MOVIES_G1_21_REVIEW_TARGETS_2026-10-21.json'
export const OUTPUT='artifacts/youtube-movies-g1/21-identity-alias-review.md'
export const EXPECTED=21,MAX_TMDB_CALLS=140,MAX_MOVIE_DETAILS=3
const clean=x=>safeTitle(x).trim()
const norm=x=>normalizedTitle(x)
const accepted=new Set(['unmatched-or-title-variant','ambiguous-work-or-media-type-review','series-title-review'])
export function variants(title){
 const s=String(title||'').trim()
 const t=s.replace(/\s*(?:\((?:OmU|OV|dt\.)\)|(?:OmU|OV))\s*$/i,'').trim()
 const a=[s,t]
 if(/\s+-\s+/.test(t))a.push(t.split(/\s+-\s+/)[0])
 if(/:\s+/.test(t))a.push(t.split(/:\s+/)[0])
 return [...new Set(a.map(clean).filter(x=>x.length>1))].slice(0,2)
}
export function validate(manifest){
 if(manifest?.schemaVersion!==1||manifest.expectedCount!==EXPECTED||
  !Array.isArray(manifest.rows)||manifest.rows.length!==EXPECTED)throw Error('G1 21-target evidence manifest invalid')
 const ids=new Set(),counts={}
 for(const r of manifest.rows){
  if(!isVideoId(r?.videoId)||!clean(r.title)||!accepted.has(r.previousStatus)||
   !Number.isFinite(r.minutes)||r.minutes<60||ids.has(r.videoId))
   throw Error('G1 evidence contains invalid record or duplicate ID')
  ids.add(r.videoId);counts[r.previousStatus]=(counts[r.previousStatus]||0)+1
 }
 if(counts['ambiguous-work-or-media-type-review']!==10||
  counts['series-title-review']!==2||counts['unmatched-or-title-variant']!==9)
  throw Error('G1 previous-status tally mismatch')
 return manifest.rows
}
function takeCandidates(records,kind){
 const seen=new Set(),out=[]
 for(const x of records||[]){
  const id=Number(x?.id)
  if(!Number.isInteger(id)||id<1||seen.has(id))continue
  seen.add(id)
  out.push({id,title:clean(kind==='movie'?(x.title||x.original_title):(x.name||x.original_name)),
   original:clean(kind==='movie'?x.original_title:x.original_name),
   year:String((kind==='movie'?x.release_date:x.first_air_date)||'').slice(0,4),
   runtime:null,delta:null,alias:false})
 }
 return out
}
export async function audit21({manifest,tmdbGet,at=()=>new Date().toISOString()}={}){
 if(typeof tmdbGet!=='function')throw Error('Read-only TMDB callback missing')
 const source=validate(manifest)
 let calls=0
 async function get(path,query){
  if(!/^\/(?:search\/movie|search\/tv|movie\/\d+)$/.test(path))throw Error('Unapproved TMDB endpoint')
  if(calls>=MAX_TMDB_CALLS)throw Error('G1 research TMDB quota cap reached')
  calls++;return tmdbGet(path,query)
 }
 const rows=[]
 for(const r of source){
  const queries=variants(r.title),byId=new Map(),errors=[]
  for(const q of queries){
   try{
    const v=await get('/search/movie',{query:q,language:'de-DE',include_adult:'false'})
    for(const movie of takeCandidates(v.results,'movie'))if(!byId.has(movie.id))byId.set(movie.id,movie)
   }catch(e){
    if(String(e?.message||'').includes('quota cap'))throw e
    errors.push('movie-query')
   }
  }
  let tv=[]
  try{
   const v=await get('/search/tv',{query:queries[0],language:'de-DE',include_adult:'false'})
   tv=takeCandidates(v.results,'tv')
  }catch(e){
   if(String(e?.message||'').includes('quota cap'))throw e
   errors.push('tv-query')
  }
  const keys=new Set(queries.map(norm))
  const matches=[...byId.values()]
  for(const m of matches)m.alias=keys.has(norm(m.title))||keys.has(norm(m.original))
  matches.sort((a,b)=>Number(b.alias)-Number(a.alias)||a.id-b.id)
  for(const movie of matches.slice(0,MAX_MOVIE_DETAILS)){
   try{
    const detail=await get('/movie/'+movie.id,{language:'de-DE'})
    const runtime=Number(detail?.runtime)
    if(Number.isFinite(runtime)&&runtime>0){
     movie.runtime=runtime
     movie.delta=Math.round(Math.abs(runtime-r.minutes)*10)/10
    }
    if(detail?.release_date)movie.year=String(detail.release_date).slice(0,4)
   }catch(e){
    if(String(e?.message||'').includes('quota cap'))throw e
    errors.push('movie-detail')
   }
  }
  const close=matches.filter(m=>m.alias&&m.delta!==null&&m.delta<=15)
  const sameTv=tv.filter(t=>keys.has(norm(t.title))||keys.has(norm(t.original)))
  const nonfilm=/(?:\blive\b|arenatour|konzert|saga teil\s*\d+)/i.test(r.title)
  let status='unresolved-review'
  if(nonfilm)status='non-film-risk-review'
  else if(close.length>1||close.length&&sameTv.length)status='ambiguous-film-or-tv-review'
  else if(close.length===1)status='single-film-hypothesis-review'
  else if(sameTv.length)status='tv-title-hypothesis-review'
  else if(errors.length)status='incomplete-api-review'
  rows.push({...r,queries,tmdbFilmResults:matches.length,tmdbTvResults:tv.length,
   movieOptions:matches.slice(0,3),sameTv:sameTv.slice(0,3),
   status,errors,acceptedMovieId:null,confirmedWork:false})
 }
 const counts={}
 for(const r of rows)counts[r.status]=(counts[r.status]||0)+1
 const lines=[
  '# MovieHub G1 – Targeted alias and film-vs-TV review of 21 YouTube video IDs','',
  '- Timestamp: '+at(),
  '- Input provenance: original live YouTube 47-video G1 run #39602961148 and artifact #12347785136; no new YouTube API calls.',
  '- Exactly 21 formerly unclear cases: 10 multiple-work/media-type, 2 series-title, 9 missing exact name.',
  '- Official TMDB read-only GETs: '+calls+'/'+MAX_TMDB_CALLS+'. Two original-title-derived movie searches at most, one TV search, details for at most three movie suggestions per item.',
  '- All film identities remain HYPOTHESES; accepted=0, no playback verification, rights or offer proof. Film/TV label and runtime alone cannot confirm a work.',
  '- No gating by existing MovieHub/TMDB DE YouTube providers; YouTube-first discovery preserved.',
  '- No app changes, Firestore/Firebase, badges, Android/TV, catalog writes or provider publishing. G2 not approved.','',
  '## Review result counts','','| Diagnostic category | Number |','| --- | ---: |',
  ...Object.entries(counts).map(([k,v])=>'| '+k+' | '+v+' |'),
  '',
  '## Evidence and TMDB hypotheses','','| Video | Prior category | Minutes | Search variants | Possible movies, ID/year/runtime/difference | Same-name TV candidates | Diagnostic outcome |',
  '| --- | --- | ---: | --- | --- | --- | --- |',
  ...rows.map(x=>'| ['+clean(x.title)+'](https://www.youtube.com/watch?v='+x.videoId+
   ') | '+x.previousStatus+' | '+x.minutes.toFixed(1)+
   ' | '+x.queries.join('; ')+' | '+
   (x.movieOptions.map(m=>clean(m.title)+' ('+m.id+', '+(m.year||'?')+
    ', '+(m.runtime??'?')+' min, diff '+(m.delta??'?')+', alias '+(m.alias?'yes':'no')+')').join('; ')||'none')+
   ' | '+(x.sameTv.map(t=>clean(t.title)+' ('+t.id+')').join('; ')||'none')+
   ' | '+x.status+(x.errors.length?' (API partial failure)':'')+' |'),
  '',
  '## Boundaries','','- Programmatic suggestions are not approved canonical TMDB IDs. Human judgment for version/year, film-vs-TV and original title is still required.',
  '- The repository public/catalog.json currently contains an EMPTY fallback and cannot represent the live published MovieHub title index.',
  '- Missing public search-index file in checkout must not be counted as title absence. Count new MovieHub works only after verifying a real published/current index or authorized catalog source.',
  '- YouTube multi-owner API aggregation and sources must be reviewed against Developer Policies before any G2 publishing.',''
 ]
 return {rows,stats:{tmdbCalls:calls,total:rows.length,counts},report:lines.join('\n')}
}
async function tmdb(path,params,token){
 const url=new URL('https://api.themoviedb.org/3'+path)
 for(const [k,v] of Object.entries(params||{}))url.searchParams.set(k,String(v))
 let response
 try{response=await fetch(url,{headers:{accept:'application/json',Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)})}
 catch{throw Error('TMDB network/timeout')}
 if(!response.ok)throw Error('TMDB HTTP '+response.status)
 return response.json()
}
async function main(){
 const manifest=JSON.parse(await readFile(INPUT,'utf8'))
 const token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB read token unavailable')
 const out=await audit21({manifest,tmdbGet:(p,q)=>tmdb(p,q,token)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile(OUTPUT,out.report+'\n',{mode:0o600})
 console.log('YouTube G1 21 unresolved titles checked against TMDB: '+out.stats.total+
  ' cases, '+out.stats.tmdbCalls+' read-only API calls. Work confirmations: ZERO.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('G1 21-target research failed: '+String(e?.message||'error').slice(0,150));process.exitCode=1})
