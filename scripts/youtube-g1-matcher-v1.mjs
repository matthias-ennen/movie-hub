/**
 * YouTube G1 Matcher v1 – FINAL research-only matching algorithm (100 original video IDs).
 * No YouTube requests, new searches, accepted movie IDs, provider data or production writes.
 * Reuse historical validated candidate discovery; separate film identity from actual offer.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {parseOriginal} from './youtube-movies-hundred-tmdb-g1.mjs'
import {parseTmdbReport,evaluateMovie} from './youtube-movies-top-three-qa-g1.mjs'

export const SOURCE_VIDEO='artifacts/youtube-movies-g1/original-all-categories-hundred.md'
export const SOURCE_TMDB='artifacts/youtube-movies-g1/original-hundred-tmdb-review.md'
export const OUTPUT='artifacts/youtube-movies-g1/matcher-v1-final-hundred.md'
export const MAX_MOVIE_DETAILS=300
export const ORIGINAL_COUNT=100
export const REVIEW_ONLY=true
const simplify=s=>String(s??'').replace(/[<>|\r\n]/g,' ').replace(/\s+/g,' ').trim().slice(0,140)
const norm=s=>simplify(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .replace(/ß/g,'ss').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const typeRisk=/(\bstaffel\s*\d+|episode\s*\d+|folge\s*\d+|deutsch lernen|learn german|gameplay|walkthrough|world of warcraft.*historia|lets play|let.s play|compilation|zusammenschnitt|full season|season \d+|fan edit)/i
const supplemental=/(?:making of|behind the scenes|featurette|trailer|teaser|interview|recap)/i
const sequelToken=s=>{
 const t=norm(s)
 const m=t.match(/\b(?:part|teil|folge|film|rambo|rocky|critters|turtles|terminator|spider man|die hard|stirb langsam)\s+(ii|iii|iv|v|vi|vii|viii|ix|x|[2-9])\b/)
 if(!m)return null
 return ({ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10})[m[1]]||Number(m[1])
}
function yearHint(title){
 // Only an explicitly present *four-digit* year is evidence, not inferred from upload date.
 const found=[...simplify(title).matchAll(/\b(?:19\d{2}|20\d{2})\b/g)]
 return found.length===1?Number(found[0][0]):null
}
function tvHintsFromReport(report){
 const result=new Map()
 for(const line of report.split(/\r?\n/)){
  if(!/^\|\s*\d+\s*\|/.test(line))continue
  const a=line.split('|').slice(1,-1).map(x=>x.trim())
  if(a.length!==6&&a.length!==7)continue
  const rank=Number(a[0]),field=a.length===7?a[4]:a[3]
  if(field==='none'||!field){result.set(rank,[]);continue}
  const matches=[...field.matchAll(/\((\d+)\)/g)].map(x=>Number(x[1]))
  result.set(rank,[...new Set(matches)].slice(0,3))
 }
 return result
}
export function scoreCandidate(video,film,asOfYear=2026){
 const base=evaluateMovie(video,film)
 const explicitYear=yearHint(video.title)
 const movieYear=base.year
 const yearDelta=explicitYear&&movieYear?Math.abs(explicitYear-movieYear):null
 const yearMismatch=yearDelta!==null&&yearDelta>2
 const sequelSource=sequelToken(video.title)
 const sequelMovie=sequelToken(film.title||film.original_title)
 const sequelMismatch=base.sequelConflict||
  (sequelSource!==null&&sequelMovie!==null&&sequelSource!==sequelMovie)
 const extraSupplemental=supplemental.test(String(film?.title||'')+' '+String(film?.original_title||''))
 const sourceTypeRisk=typeRisk.test(video.title)||supplemental.test(video.title)
 const currentReleaseRisk=Boolean(movieYear&&movieYear>=asOfYear)
 // Auxiliary hints NEVER override clear mismatched identity or video content type.
 let score=base.score
 if(explicitYear&&movieYear)score+=yearDelta<=1?4:yearMismatch?-12:0
 if(sequelMismatch&&!base.sequelConflict)score-=25
 if(extraSupplemental&&!base.behindScenes)score-=14
 return {...base,score,yearHint:explicitYear,yearDelta,yearMismatch,
  sequelConflict:sequelMismatch,behindScenes:base.behindScenes||extraSupplemental,
  sourceTypeRisk,currentReleaseRisk,
  movieIdAccepted:null,confirmedFilm:false,confirmedDEAvailability:false,confirmedOffer:false}
}
export function classifyVideo(video,scored,tvIds=[],{incomplete=false,asOfYear=2026}={}){
 const sorted=[...scored].sort((a,b)=>b.score-a.score||a.tmdbId-b.tmdbId)
 const first=sorted[0]||null,second=sorted[1]||null
 const reasons=[]
 let status='review-no-movie-candidate'
 if(typeRisk.test(video.title)||supplemental.test(video.title)){
  status='review-source-content-type-risk';reasons.push('video-title-type-risk')
 }else if(incomplete){
  status='review-API-incomplete';reasons.push('incomplete-details')
 }else if(!first){
  reasons.push('no-existing-movie-hypotheses')
 }else if(first.titleLevel<2){
  status=tvIds.length?'review-film-TV-or-weak-title':'review-weak-title'
  reasons.push('only-weak-title-evidence')
 }else if(first.sequelConflict||first.behindScenes){
  status='review-sequel-or-supplement-conflict'
  reasons.push('sequel-or-making-of-not-equivalent')
 }else if(first.yearMismatch){
  status='review-explicit-year-conflict';reasons.push('year-contradicts-film')
 }else if(first.runtimeDelta===null){
  status='review-runtime-unknown';reasons.push('no-runtime')
 }else if(first.runtimeDelta>15){
  status='review-work-or-cut-runtime-conflict';reasons.push('runtime-gap-over-15-min')
 }else if(second&&second.titleLevel>=2&&first.score-second.score<9){
  status='review-multiple-film-works';reasons.push('no-distinct-film-leader')
 }else if(first.currentReleaseRisk){
  status='review-current-release-needs-content-check';reasons.push('recent-film-video-identity-unknown')
 }else{
  status=tvIds.length?'review-leading-movie-with-TV-alternatives':'review-leading-film-hypothesis'
  reasons.push('best-relative-ranked-film-not-verified')
 }
 if(tvIds.length)reasons.push('TMDB-series-title-alternatives')
 if(video.category!=='30')reasons.push('outside-youtube-movie-category')
 if(video.region!=='allowed')reasons.push('DE-regional-metadata-'+video.region)
 return{status,reasons,topCandidates:sorted.slice(0,3),
  alternativeTvIds:[...tvIds],confidence:status==='review-leading-film-hypothesis'?
   'strong-hypothesis':status==='review-leading-movie-with-TV-alternatives'?
   'mixed-media-review':status==='review-multiple-film-works'?'ambiguous':
   status==='review-source-content-type-risk'?'source-type-risk':'unresolved',
  confirmedMovieId:null,confirmedFilm:false,confirmedDEPlayback:false,
  confirmedOffer:false}
}
export async function reviewHundred({originalReport,tmdbReport,getMovie,
 expectedHash,asOfYear=2026,now=()=>new Date().toISOString()}={}){
 if(typeof getMovie!=='function')throw Error('TMDB read-only getMovie callback missing')
 const originals=parseOriginal(originalReport,expectedHash)
 const source=parseTmdbReport(tmdbReport,originals)
 const byTv=tvHintsFromReport(tmdbReport)
 if(source.length!==ORIGINAL_COUNT||byTv.size!==ORIGINAL_COUNT)
  throw Error('100 original rows and TV provenance do not match')
 const cache=new Map(),rows=[]
 let calls=0,quotaStopped=false
 // No discovery queries. One read per distinct *already proposed* TMDB movie ID.
 for(const video of source){
  if(quotaStopped){
   rows.push({...video,verdict:{status:'review-not-checked-quota',topCandidates:[],
    alternativeTvIds:byTv.get(video.rank)||[],confidence:'unresolved',
    reasons:['rate-limit-stopped'],confirmedMovieId:null,confirmedFilm:false,
    confirmedDEPlayback:false,confirmedOffer:false}})
   continue
  }
  const detail=[],errors=[]
  for(const movieId of video.movieIds){
   if(calls>=MAX_MOVIE_DETAILS){quotaStopped=true;break}
   let film
   if(cache.has(movieId))film=cache.get(movieId)
   else {
    calls++
    try{
     const d=await getMovie('/movie/'+movieId,
      {language:'de-DE',append_to_response:'alternative_titles,credits,external_ids'})
     if(Number(d?.id)!==movieId)throw Error('TMDB film ID mismatch')
     film=d;cache.set(movieId,d)
    }catch(e){
     errors.push(movieId+':'+simplify(e?.message).slice(0,55))
     if(/429|quota|rate.limit|hard cap/i.test(String(e?.message||'')))quotaStopped=true
     continue
    }
   }
   if(film)detail.push(scoreCandidate(video,film,asOfYear))
  }
  const verdict=classifyVideo(video,detail,byTv.get(video.rank)||[],
   {incomplete:errors.length>0||quotaStopped,asOfYear})
  rows.push({...video,verdict,errors})
 }
 const counts={}
 for(const row of rows)counts[row.verdict.status]=(counts[row.verdict.status]||0)+1
 const reviewed=rows.filter(x=>x.verdict.status!=='review-not-checked-quota').length
 const leading=rows.filter(x=>x.verdict.status==='review-leading-film-hypothesis').length
 const multiple=rows.filter(x=>x.verdict.status==='review-multiple-film-works').length
 const safe=s=>simplify(s).replace(/\|/g,'')
 const lines=[
 '# MovieHub G1 – FINAL Matcher v1: exact 100 original YouTube movie-video candidates','',
 '- Generated: '+now(),
 '- Source IDs: original 100-video discovery run #39618878080 / artifact #12353497700.',
 '- Search seeds: original TMDB 100-title run #39628463786 / artifact #12358536690.',
 '- Historical exact 100-ID SHA is validated by parseOriginal; **no video IDs invented or searched**.',
 '- Exactly '+rows.length+'/100 original video IDs; evaluated '+reviewed+
  ', rate/budget stopped: '+quotaStopped+'.',
 '- TMDB read-only detail calls '+calls+'/'+MAX_MOVIE_DETAILS+
  '; unique movie details cached: '+cache.size+'.',
 '- Leading movie hints: '+leading+'; ambiguous matching movies: '+multiple+
  '. Neither means verified actual video/cut/DE offer.',
 '- All movie identifiers remain **UNACCEPTED**, every candidate **REVIEW**, explicit DE offer/rights/playback UNKNOWN.',
 '- Source category, YouTube DE region metadata and TMDB movie matching do NOT verify subscription, purchase, rental, free, ads, copyright or player.',
 '- This is the final **matcher v1** scoring pass for all original 100 IDs; after acceptance freeze rules, do not chase 100% certainty by repeated heuristic tuning.',
 '- NO YouTube API, NO TMDB search, no Firebase/Firestore, app, catalog, provider badge, EPG, nightly or playback mutations.','',
 '## All 100 G1 outcomes','',
 '| Status | Number |','| --- | ---: |',
 ...Object.entries(counts).sort((a,b)=>a[0].localeCompare(b[0]))
  .map(([status,count])=>'| '+status+' | '+count+' |'),'',
 '## Exactly 100 video-ID proposals (all UNVERIFIED)','',
 '| # | Video ID / YouTube title | YouTube category | Top-three TMDB candidates (movie ID, year, Δ minutes, score) | TV IDs | Review status |',
 '| ---: | --- | --- | --- | --- | --- |',
 ...rows.map(row=>'| '+row.rank+' | ['+safe(row.title)+
  '](https://www.youtube.com/watch?v='+row.videoId+') '+row.videoId+
  ' | '+row.category+' | '+(row.verdict.topCandidates.map(c=>
   c.tmdbId+' ('+(c.year||'?')+', '+(c.runtimeDelta??'?')+
   'm, '+c.score+')').join('; ')||'none')+
  ' | '+(row.verdict.alternativeTvIds.join(', ')||'none')+
  ' | '+row.verdict.status+' |'),
 '',
 '## Freeze gate and limitations','',
 '- Accepted work/film/cut identities: 0. This is *scoring only*, not proof of source content.',
 '- Inconsistencies: explicit year conflict, sequel mismatch, insufficient title equivalence, runtime gap >15 min, close competing works, movie/TV collision, current/future-looking release year, and non-film source title cannot become automatic provider data.',
 '- Missing TMDB movie match means only no adequate hint in the fixed initial 100-candidate discovery, not that a film does not exist.',
 '- Remaining unresolved items move to a review queue. Further matcher redevelopment is out of scope; only concrete evidenced code regressions would justify a later bug fix.',
 '- G2 remains BLOCKED by legal/YouTube API multi-owner aggregation interpretation, direct DE offering/playback evidence, and separate user approval.',
 ''
 ]
 return {rows,stats:{calls,counts,reviewed,leading,multiple,quotaStopped,cacheSize:cache.size},
  report:lines.join('\n')}
}
async function getTmdb(path,params,token){
 if(!/^\/movie\/[1-9]\d*$/.test(path))throw Error('TMDB endpoint not permitted')
 const u=new URL('https://api.themoviedb.org/3'+path)
 for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v))
 const res=await fetch(u,{headers:{accept:'application/json',Authorization:'Bearer '+token},
  signal:AbortSignal.timeout(15000)})
 if(!res.ok)throw Error('TMDB HTTP '+res.status)
 return res.json()
}
async function main(){
 const token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB read token missing')
 const [originalReport,tmdbReport]=await Promise.all([
  readFile(SOURCE_VIDEO,'utf8'),readFile(SOURCE_TMDB,'utf8')])
 const out=await reviewHundred({originalReport,tmdbReport,
  getMovie:(p,q)=>getTmdb(p,q,token)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile(OUTPUT,out.report+'\n',{mode:0o600})
 console.log('G1 final matcher v1: '+out.stats.reviewed+'/100 review-only, '+
  out.stats.calls+' unique TMDB detail GETs. No production app changes.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('G1 final matcher v1: '+simplify(e?.message));process.exitCode=1})
