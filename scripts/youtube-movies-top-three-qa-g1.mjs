// MovieHub G1 – targeted film identity QA from TWO original research artifacts.
// Does not call YouTube; cannot approve a film, add a provider, or change live data.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {parseOriginal} from './youtube-movies-hundred-tmdb-g1.mjs'
export const ORIGINAL='artifacts/youtube-movies-g1/original-all-categories-hundred.md'
export const TMDB_SOURCE='artifacts/youtube-movies-g1/original-hundred-tmdb-review.md'
export const OUTPUT='artifacts/youtube-movies-g1/top-three-matcher-qa.md'
export const PRIORITY_FILM_RANKS=[1,15,17,19,21,22,24,28,30,32,35,37,38,40,43,53,64,78,83,89,98]
export const EXPECTED_CASES=34
export const MAX_DETAILS=102
const clean=s=>String(s??'').replace(/[<>\r\n|]/g,' ').replace(/\s+/g,' ').trim().slice(0,150)
const normalize=s=>clean(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/ß/g,'ss').replace(/&/g,' und ')
 .replace(/[^a-z0-9]+/g,' ').trim()
const pos=n=>Number.isInteger(Number(n))&&Number(n)>0?Number(n):null
const nonfilm=/(?:\bstaffel\b|deutsch lernen|world of warcraft.*historia|gameplay|walkthrough|compilation|zusammenschnitt|let.s play|reaction|review)/i
function extractTitlePairs(s){
 const stripped=clean(s).replace(/\((?:Full\s*Film|Full\s*Movie|OmU|OV|dt\.\/OV)\)/ig,'')
  .replace(/\b(?:Full\s+(?:Film|Movie|Documentary)|Ganzer?\s+Film|Ganze\s+Filme|4K)\b/ig,'')
  .replace(/\s+/g,' ').trim()
 const parts=[stripped]
 if(stripped.includes('•'))parts.push(...stripped.split('•').map(x=>x.trim()))
 // Separated subtitle and film title can contain punctuation; use full form as well.
 if(/\s[-–]\s/.test(stripped))parts.push(...stripped.split(/\s[-–]\s/).filter(x=>x.length>=3))
 return [...new Set(parts.map(normalize).filter(x=>x.length>=3))]
}
function sequelValue(str){
 const s=normalize(str)
 const m=s.match(/\b(?:part|teil|film|rambo|spiderman|pok[eé]mon)\s+(ii|iii|iv|v|vi|vii|viii|ix|x|[2-9])\b/)
 const roman={ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10}
 return m?(roman[m[1]]||Number(m[1])):null
}
export function titleQuality(youtubeTitle,movie){
 const target=extractTitlePairs(youtubeTitle)
 const aliases=[movie?.title,movie?.original_title,
  ...(movie?.alternative_titles?.titles||[]).map(x=>x?.title)].map(normalize).filter(Boolean)
 if(!target.length||!aliases.length)return{level:0,source:'none'}
 for(const t of target)if(aliases.includes(t))return{level:4,source:'exact-title-or-alias'}
 const overlap=(a,b)=>a.length>=4&&b.length>=4&&(a.includes(b)||b.includes(a))
 for(const t of target)if(aliases.some(a=>overlap(t,a)))return{level:2,source:'partial-title'}
 const words=s=>new Set(s.split(' ').filter(x=>x.length>3&&!['film','movie','ganzer','full','deutsch','the','die','eine','oder'].includes(x)))
 let best=0
 for(const t of target)for(const a of aliases){
  const x=words(t),y=words(a)
  if(!x.size||!y.size)continue
  const shared=[...x].filter(k=>y.has(k)).length
  best=Math.max(best,shared/Math.max(x.size,y.size))
 }
 return{level:best>=0.6?1:0,source:best>=0.6?'weak-token-overlap':'none'}
}
export function evaluateMovie(video,movie){
 const titles=titleQuality(video.title,movie)
 const runtime=Number(movie?.runtime)
 const minutes=Number(video.minutes)
 const delta=Number.isFinite(runtime)&&runtime>0&&Number.isFinite(minutes)?
  Math.round(Math.abs(runtime-minutes)*10)/10:null
 const movieYear=Number(String(movie?.release_date||'').slice(0,4))||null
 const sequelYT=sequelValue(video.title),sequelFilm=sequelValue(movie.title||movie.original_title)
 const sequelConflict=sequelYT!==null&&sequelFilm!==null&&sequelYT!==sequelFilm
 const behindScenes=/(?:making.of|behind.the.scenes|featurette|watch .* sleep|trailer)/i.test(
  [movie?.title,movie?.original_title].join(' '))
 let score=titles.level*8
 if(delta!==null)score+=delta<=3?8:delta<=10?6:delta<=15?3:delta<=25?0:-9
 if(sequelConflict)score-=20
 if(behindScenes)score-=14
 const status=nonfilm.test(video.title)?'review-content-type-risk':
  titles.level<1?'review-title-mismatch':
  sequelConflict?'review-sequel-conflict':
  behindScenes?'review-supplementary-content':
  delta===null?'review-runtime-unknown':
  delta>15?'review-version-or-work-runtime-conflict':
  'review-plausible-work-hypothesis'
 return {tmdbId:pos(movie?.id),title:clean(movie?.title),originalTitle:clean(movie?.original_title),
  year:movieYear,directors:(movie?.credits?.crew||[]).filter(x=>x.job==='Director').map(x=>clean(x.name)).slice(0,3),
  titleLevel:titles.level,titleReason:titles.source,runtimeDelta:delta,sequelConflict,behindScenes,
  score,status,confirmedFilm:false,confirmedDEAvailability:false,confirmedOffer:false}
}
export function parseTmdbReport(source,original){
 if(!source.includes('## Category risk group (13)')||
  !source.includes('## Film-category candidates (87)'))throw Error('Not the original hundred TMDB report')
 const originalIds=new Map(original.map(x=>[x.rank,x]))
 const cases=new Map()
 for(const line of source.split(/\r?\n/)){
  if(!/^\|\s*\d+\s*\|/.test(line))continue
  const a=line.split('|').slice(1,-1).map(x=>x.trim())
  if(![6,7].includes(a.length))continue
  const rank=Number(a[0]),item=originalIds.get(rank)
  if(!item)continue
  const isRisk=a.length===7
  const hints=a[isRisk?3:2]
  if(isRisk){
   if(item.category==='30'||Number(a[2])!==Number(item.category))throw Error('Risk category mismatch '+rank)
   if(clean(a[1])!==item.title)throw Error('Source title mismatch '+rank)
  }else{
   if(item.category!=='30')throw Error('Film category mismatch '+rank)
   const id=a[1].match(/watch\?v=([a-zA-Z0-9_-]{11})/)
   if(!id||id[1]!==item.videoId)throw Error('Video ID mismatch '+rank)
  }
  const ids=[]
  if(hints!=='none'){
   for(const part of hints.split(/;\s*/)){
    const m=part.match(/\((\d+),\s*(?:\d{4}|\?),\s*score\s*[0123]\)$/)
    if(!m)throw Error('TMDB movie clue changed '+rank)
    ids.push(Number(m[1]))
   }
  }
  if(ids.length>3||new Set(ids).size!==ids.length||cases.has(rank))throw Error('Duplicate/overflow '+rank)
  cases.set(rank,{...item,previousReview:a[isRisk?6:5],movieIds:ids})
 }
 if(cases.size!==100)throw Error('Expected 100 original TMDB review rows')
 return [...cases.values()].sort((a,b)=>a.rank-b.rank)
}
export function getPriority(cases){
 const selected=[...cases.filter(x=>x.category!=='30'),
  ...PRIORITY_FILM_RANKS.map(rank=>cases.find(x=>x.rank===rank))]
 if(selected.length!==EXPECTED_CASES||
  selected.some(x=>!x)||new Set(selected.map(x=>x.rank)).size!==EXPECTED_CASES||
  selected.slice(0,13).some(x=>x.category==='30'))throw Error('QA priority manifest mismatch')
 return selected
}
export async function review({originalSource,tmdbSource,tmdbGet,now=()=>new Date().toISOString(),expectedHash}={}){
 if(typeof tmdbGet!=='function')throw Error('No read-only TMDB callback')
 const original=parseOriginal(originalSource,expectedHash)
 const existing=parseTmdbReport(tmdbSource,original)
 const cases=getPriority(existing)
 let calls=0,quotaStop=false
 const rows=[]
 for(const v of cases){
  const details=[],errors=[]
  for(const id of v.movieIds){
   if(quotaStop||calls>=MAX_DETAILS){quotaStop=true;break}
   calls++
   try{
    const m=await tmdbGet('/movie/'+id,
     {language:'de-DE',append_to_response:'alternative_titles,credits,external_ids'})
    if(Number(m?.id)!==id)throw Error('TMDB id mismatch')
    details.push(evaluateMovie(v,m))
   }catch(e){
    errors.push('movie '+id+': '+clean(e?.message).slice(0,75))
    if(/429|quota|rate.limit/i.test(String(e?.message||'')))quotaStop=true
   }
  }
  details.sort((a,b)=>b.score-a.score||a.tmdbId-b.tmdbId)
  const lead=details[0]||null,runner=details[1]||null
  const status=nonfilm.test(v.title)?'review-content-type-risk':
   errors.length?'review-partial-API-error':
   !details.length?'review-no-movie-evidence':
   lead.titleLevel<1?'review-poor-title-candidates':
   lead.runtimeDelta===null?'review-runtime-not-compared':
   lead.runtimeDelta>15?'review-version-uncertainty':
   runner&&lead.score-runner.score<8?'review-multiple-close-work-candidates':
   'review-distinct-leading-hypothesis'
  rows.push({rank:v.rank,videoId:v.videoId,title:v.title,category:v.category,
   originalMinutes:v.minutes,priorStatus:v.previousReview,candidates:details,
   improvementOverOldFirst:details.length>1&&details[0].tmdbId!==v.movieIds[0],
   status,errors,confirmedFilm:false,confirmedDEPlayback:false,confirmedOffer:false})
 }
 const counts={}
 for(const r of rows)counts[r.status]=(counts[r.status]||0)+1
 const changed=rows.filter(x=>x.improvementOverOldFirst).length
 const lines=[
 '# G1 – Original 100 movie-video candidate pool: 34 targeted multi-candidate TMDB QA cases','',
 '- Generated '+now(),
 '- Original 100 video IDs: Action #39618878080, artifact #12353497700; strict original SHA checked.',
 '- Original 100 TMDB title research: Action #39628463786, artifact #12358536690.',
 '- **13 high-risk other-category IDs first, then 21 preselected category-30 ambiguity/alias cases.**',
 '- Exactly '+rows.length+' existing-video cases. Movie detail GETs: '+calls+'/'+MAX_DETAILS+
  '. TMDB rate limited: '+quotaStop+'.',
 '- Previously first candidate not current top-ranked in '+changed+' cases. This is QA information, not an accepted identity.',
 '- Work, edit/cut, rights, channel ownership, active DE free/ads/flat/rent/buy/DRM and playback remain UNVERIFIED.',
 '- Every row retains confirmedFilm=false, confirmedDEPlayback=false, confirmedOffer=false. G1 only; no product changes.',
 '- No search.list, no YouTube API, no TMDB search queries, no autoaccepted identities, no catalog/Firestore/nightly/badge writes.','',
 '## Status distribution','',
 '| QA status | Number |','| --- | ---: |',
 ...Object.entries(counts).sort((a,b)=>a[0].localeCompare(b[0]))
  .map(([name,count])=>'| '+name+' | '+count+' |'),'',
 '## Candidate-by-candidate result (relative rank does NOT mean permission to publish)','',
 '| Original # | Original video title | Source category | Previous TMDB review | Revised top 3 TMDB movie ID/year/title/score/runtime Δ | New QA status |',
 '| ---: | --- | ---: | --- | --- | --- |',
 ...rows.map(x=>'| '+x.rank+' | '+clean(x.title)+' | '+x.category+' | '+x.priorStatus+
  ' | '+(x.candidates.map(c=>c.tmdbId+' ('+(c.year||'?')+', '+
   clean(c.title).slice(0,37)+', score '+c.score+', Δ'+(c.runtimeDelta??'?')+'m)').join('; ')||'none')+
  ' | '+x.status+(x.errors.length?' [API caveat]':'')+' |'),
 '',
 '## Unresolved gates','',
 '- Ranks and title/alternative-title scores are review HYPOTHESES only. Independently verify YouTube cut, film credits and actual DE playback.',
 '- A shared title with low runtime delta is not enough to establish a canonical TMDB identity or legal provider offer.',
 '- Remaining 66 original videos are not freshly re-examined by this targeted QA. Avoid conflating 34 retested cases with the full 100.',
 '- Check YouTube API Developer Policies III.E.2 multi-owner aggregation before G2 public provider integration.',
 ''
 ]
 return {rows,stats:{calls,counts,changed,quotaStop},report:lines.join('\n')}
}
async function requestMovie(path,params,token){
 const u=new URL('https://api.themoviedb.org/3'+path)
 for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v))
 const resp=await fetch(u,{headers:{accept:'application/json',Authorization:'Bearer '+token},
  signal:AbortSignal.timeout(14000)})
 if(!resp.ok)throw Error('TMDB HTTP '+resp.status)
 return resp.json()
}
async function main(){
 const token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB read token not configured')
 const [originalSource,tmdbSource]=await Promise.all([
  readFile(ORIGINAL,'utf8'),readFile(TMDB_SOURCE,'utf8')])
 const result=await review({originalSource,tmdbSource,
  tmdbGet:(path,params)=>requestMovie(path,params,token)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile(OUTPUT,result.report+'\n',{mode:0o600})
 console.log('G1 34-case multi-work QA, '+result.stats.calls+
  ' TMDB detail reads. No YouTube or production changes.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('G1 top-3 QA failed: '+clean(e?.message).slice(0,130));process.exitCode=1})
