// Isolated G1 research: 13 other-category risk leads first, then 87 YouTube category-30 videos.
// Source is the original GitHub Actions artifact from G1 discovery run #39618878080.
// NO YouTube API calls, no provider badges, no production writes, no movie identity auto-accept.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
export const SOURCE_RUN=39618878080
export const SOURCE_ARTIFACT=12353497700
export const SOURCE='artifacts/youtube-movies-g1/original-all-categories-hundred.md'
export const OUTPUT='artifacts/youtube-movies-g1/hundred-tmdb-review.md'
export const EXPECTED_HASH='f18e3fe44bf8a6c312bf7cf1e02bb22d3770ed2fb0fb4a1a49ea9512c9cc7c27'
export const MAX_TMDB_GETS=310
export const EXPECTED=100
const clean=s=>String(s??'').replace(/[\r\n|<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,145)
const norm=s=>clean(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]/g,'')
const validId=s=>/^[A-Za-z0-9_-]{11}$/.test(String(s??''))
const num=n=>Number.isInteger(Number(n))&&Number(n)>0?Number(n):null
const riskTitle=s=>/(?:staffel|episode|folge\s*\d+|deutsch lernen|world of warcraft|gameplay|walkthrough|let.s play|compilation|zusammenschnitt|concert|konzert|live-stream|reaction|review)/i.test(s)
const queryAliases=[
 [/(?:\bCOBBLER\s*-\s*DER\b|ADAM SANDLER entdeckt)/i,'The Cobbler'],
 [/\bDas Beste kommt noch\b/i,'Le meilleur reste à venir'],
 [/\bReich und Arm\b/i,'Rich Man, Poor Man']
]
export function parseOriginal(markdown){
 if(!markdown.includes('Actual selected **100/100**')||
  !markdown.includes('## The up-to-100 video-ID research sample'))
  throw Error('Wrong or incomplete original G1 100-video report')
 const lines=markdown.split(/\r?\n/),rows=[]
 for(const line of lines){
  if(!/^\|\s*\d+\s*\|/.test(line))continue
  const parts=line.split('|').slice(1,-1).map(s=>s.trim())
  if(parts.length!==8||!/^\d+$/.test(parts[0]))continue
  const m=parts[1].match(/^\[(.*)\]\(https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})\)\s+([A-Za-z0-9_-]{11})$/)
  if(!m||m[2]!==m[3])throw Error('Source video ID mismatch in row '+parts[0])
  const category=parts[2]
  if(!/^\d{1,3}$/.test(category)||!['existing-47','new-search'].includes(parts[3])||
   !/^\d+(?:\.\d+)?m$/.test(parts[5])||!['allowed','unknown','excluded'].includes(parts[6]))
   throw Error('G1 video metadata row changed at '+parts[0])
  rows.push({rank:Number(parts[0]),title:clean(m[1]),videoId:m[2],
   category,origin:parts[3],screeningSignal:parts[4],
   minutes:Number(parts[5].slice(0,-1)),region:parts[6]})
 }
 if(rows.length!==EXPECTED||rows.some((r,i)=>r.rank!==i+1)||
   new Set(rows.map(x=>x.videoId)).size!==EXPECTED)
  throw Error('Expected exactly original 100 numbered unique videos')
 const hash=createHash('sha256').update(rows.map(x=>x.videoId).join('\n')+'\n').digest('hex')
 if(hash!==EXPECTED_HASH)throw Error('Original 100 VIDEO IDs SHA-256 mismatch')
 if(rows.filter(x=>x.category!=='30').length!==13||
   rows.filter(x=>x.category==='30').length!==87||
   rows.filter(x=>x.origin==='existing-47').length!==45)
  throw Error('Original category/origin counts differ')
 return rows
}
export function titleVariants(item){
 let base=clean(item.title).replace(/\s*\((?:OmU|OV|dt\.\/OV)\)/ig,'')
  .replace(/\b(?:FULL MOVIE|FULL FILM|GANZER FILM|GANZE FILME|FULL DOCUMENTARY|4K)\b/ig,'')
  .replace(/\s+/g,' ').trim().replace(/[–-]\s*$/,'')
 const aliases=queryAliases.filter(([rx])=>rx.test(item.title)).map(([,value])=>value)
 if(/\s+[–-]\s+/.test(base)){
  const pieces=base.split(/\s+[–-]\s+/)
  for(const p of pieces){if(p.length>=6&&p.length<=85)aliases.push(p)}
 }
 if(item.title.toLowerCase().includes('staffel'))aliases.push(base.replace(/\bstaffel\s*\d+\b/ig,'').trim())
 return [...new Set([...aliases,base].map(clean).filter(s=>s.length>=3))].slice(0,2)
}
function matchesTitle(item,candidate){
 const titles=[candidate.title,candidate.original_title,candidate.name,candidate.original_name]
  .map(norm).filter(Boolean)
 const words=titleVariants(item).map(norm).filter(Boolean)
 if(titles.some(t=>words.includes(t)))return 3
 if(titles.some(t=>words.some(w=>t.length>=5&&w.length>=5&&
   (t.includes(w)||w.includes(t)))))return 2
 const stop=new Set(['movie','full','film','ganzer','ganze','deutsch','the','ein','eine','of','und','der','die','das'])
 const tokens=s=>new Set(clean(s).toLowerCase().split(/[^a-zA-ZÀ-ÿ0-9]+/)
  .filter(x=>x.length>=4&&!stop.has(x)))
 const a=tokens(item.title)
 const similarities=titles.map(t=>{const b=tokens(t)
  return a.size&&b.size?[...a].filter(x=>b.has(x)).length/Math.max(1,Math.min(a.size,b.size)):0})
 return Math.max(0,...similarities)>=0.7?1:0
}
function candidateRow(item,c,media){
 const s=matchesTitle(item,c)
 return{id:num(c?.id),media,title:clean(c?.title||c?.name),
  original:clean(c?.original_title||c?.original_name),
  year:String(c?.release_date||c?.first_air_date||'').slice(0,4)||null,
  matchStrength:s}
}
const short=(x,n=90)=>clean(x).slice(0,n)
export async function audit({source,tmdbGet,now=()=>new Date().toISOString()}={}){
 if(typeof tmdbGet!=='function')throw Error('TMDB read-only callback required')
 const inputs=parseOriginal(source)
 const ordered=[...inputs.filter(x=>x.category!=='30'),...inputs.filter(x=>x.category==='30')]
 let calls=0,stop=false,rateLimited=false
 const statuses={}
 const rows=[]
 async function get(path,params){
  if(!/^\/(?:search\/movie|search\/multi|movie\/\d+)$/.test(path))throw Error('TMDB endpoint not on G1 allowlist')
  if(calls>=MAX_TMDB_GETS){stop=true;throw Error('G1 TMDB hard cap')}
  calls++
  return tmdbGet(path,params)
 }
 for(const item of ordered){
  const row={...item,variants:titleVariants(item),review:'unresolved-review',
   filmHints:[],tvHints:[],detailRuntime:null,deltaMinutes:null,
   status:'unexamined',errors:[],acceptedTmdbId:null,verifiedWork:false,
   verifiedDEPlayback:false,verifiedOffer:false}
  if(stop){row.review='not-checked-budget';rows.push(row);continue}
  const found=new Map(),tv=new Map()
  try{
   const a=await get('/search/multi',{query:item.title,language:'en-US',include_adult:'false',page:1})
   for(const c of (a?.results||[]).slice(0,20)){
    if(!['movie','tv'].includes(c?.media_type))continue
    const entry=candidateRow(item,c,c.media_type)
    if(!entry.id)continue
    const target=c.media_type==='movie'?found:tv
    if(!target.has(entry.id))target.set(entry.id,entry)
   }
  }catch(e){row.errors.push('multi:'+short(e?.message,50));if(/429|quota|hard cap/i.test(String(e?.message))) {rateLimited=true;stop=true}}
  if(!stop){
   const query=row.variants[0]||item.title
   try{
    const b=await get('/search/movie',{query,language:'de-DE',include_adult:'false',page:1})
    for(const c of (b?.results||[]).slice(0,20)){
     const entry=candidateRow(item,c,'movie')
     if(entry.id&&(!found.has(entry.id)||entry.matchStrength>found.get(entry.id).matchStrength))
      found.set(entry.id,entry)
    }
   }catch(e){row.errors.push('film:'+short(e?.message,50));if(/429|quota|hard cap/i.test(String(e?.message))){rateLimited=true;stop=true}}
  }
  const movie=[...found.values()].sort((a,b)=>b.matchStrength-a.matchStrength||a.id-b.id)
  const tvSorted=[...tv.values()].sort((a,b)=>b.matchStrength-a.matchStrength||a.id-b.id)
  row.filmHints=movie.slice(0,3)
  row.tvHints=tvSorted.filter(t=>t.matchStrength>=2).slice(0,3)
  if(!stop&&movie[0]?.matchStrength>=2){
   try{
    const d=await get('/movie/'+movie[0].id,{language:'de-DE'})
    const minutes=Number(d?.runtime)
    if(Number.isFinite(minutes)&&minutes>0){
     row.detailRuntime=minutes
     row.deltaMinutes=Math.round(Math.abs(item.minutes-minutes)*10)/10
    }
   }catch(e){row.errors.push('detail:'+short(e?.message,50));if(/429|quota|hard cap/i.test(String(e?.message))){rateLimited=true;stop=true}}
  }
  const strongMovie=movie.filter(x=>x.matchStrength>=2)
  const typeRisk=riskTitle(item.title)
  if(stop&&row.errors.length)row.review='partial-API-review'
  else if(typeRisk)row.review='content-type-risk-review'
  else if(strongMovie.length>1||strongMovie.length&&row.tvHints.length)row.review='multiple-works-or-film-TV-review'
  else if(!strongMovie.length&&row.tvHints.length)row.review='TV-title-only-review'
  else if(!strongMovie.length)row.review='unmatched-or-alias-review'
  else if(row.deltaMinutes===null)row.review='movie-hypothesis-runtime-unchecked'
  else if(row.deltaMinutes>15)row.review='movie-hypothesis-runtime-conflict'
  else row.review='single-movie-hypothesis-review'
  if(row.errors.length&&!stop)row.review='partial-API-review'
  row.status='checked-TMDB-only'
  rows.push(row)
 }
 rows.sort((a,b)=>a.rank-b.rank)
 for(const row of rows)statuses[row.review]=(statuses[row.review]||0)+1
 const getCount=p=>rows.filter(p).length
 const risk=rows.filter(x=>x.category!=='30')
 const category30=rows.filter(x=>x.category==='30')
 const lines=[
 '# MovieHub G1 – 100 previously observed video candidates, read-only TMDB film/series/alias review','',
 '- Generated '+now(),
 '- Source original all-category GitHub Actions '+SOURCE_RUN+' / original artifact '+SOURCE_ARTIFACT+'.',
 '- Source report SHA-256 over ordered video IDs: '+EXPECTED_HASH+'.',
 '- SOURCE-SCOPE: Exactly the original 100 VIDEO IDs (13 outside category 30 analyzed FIRST, then 87 from category 30).',
 '- Read-only TMDB GETs: '+calls+'/'+MAX_TMDB_GETS+'; rate/limit interruption: '+(rateLimited?'YES':'NO')+'.',
 '- All rows remain REVIEW. **0** automated accepted movie IDs, **0** verified works and **0** video entitlements/offers.',
 '- A plausible title and runtime is not evidence of actual film cut/rights; no YouTube API video calls or new discovery.',
 '- Category 30 and YouTube Movies display names are categorization, not confirmed copyright, retail, app playback or ownership.',
 '- No new MovieHub catalog/Firestore/Firebase/app/Badge/provider/Android/FireTV/nightly changes; G2 unapproved.','',
 '## Summary','',
 '| Measure | Actual |','| --- | ---: |',
 '| Total input VIDEO IDs | '+rows.length+' |',
 '| Category 30 VIDEO IDs | '+category30.length+' |',
 '| Other-category VIDEO IDs, investigated first | '+risk.length+' |',
 '| TMDB research calls | '+calls+' |',
 '| TMDB search/identity-verified works | **0 (not accepted)** |',
 ...Object.entries(statuses).sort((a,b)=>a[0].localeCompare(b[0]))
  .map(([s,n])=>'| '+s+' | '+n+' |'),
 '',
 '## Category risk group (13): movie vs documentary vs TV/gaming/learning','',
 '| Original # | Title | YouTube cat | Film clues (max 3) | TV clues | Runtime Δ | Review |',
 '| ---: | --- | ---: | --- | --- | ---: | --- |',
 ...risk.map(r=>'| '+r.rank+' | '+short(r.title)+' | '+r.category+
  ' | '+(r.filmHints.map(x=>short(x.title,44)+' ('+x.id+', '+(x.year||'?')+', score '+x.matchStrength+')').join('; ')||'none')+
  ' | '+(r.tvHints.map(x=>short(x.title,40)+' ('+x.id+')').join('; ')||'none')+
  ' | '+(r.deltaMinutes??'?')+'m | '+r.review+' |'),
 '',
 '## Film-category candidates (87), still unconfirmed','',
 '| # | Video ID / title | TMDB film clues (max 3) | TV clues | Runtime Δ | Review |',
 '| ---: | --- | --- | --- | ---: | --- |',
 ...category30.map(r=>'| '+r.rank+' | ['+short(r.title)+'](https://www.youtube.com/watch?v='+r.videoId+
  ') '+r.videoId+' | '+(r.filmHints.map(x=>short(x.title,42)+' ('+x.id+
   ', '+(x.year||'?')+', score '+x.matchStrength+')').join('; ')||'none')+
  ' | '+(r.tvHints.map(x=>short(x.title,28)+' ('+x.id+')').join('; ')||'none')+
  ' | '+(r.deltaMinutes??'?')+'m | '+r.review+' |'),
 '',
 '## Mandatory next gates','',
 '- Review non-film/TV cues first; do not force a TMDB movie just because the VIDEO had a long duration.',
 '- Verify exact work/edition/cut, original year/director and independent identifiers before accepting (movie,tmdbId).',
 '- A source absent from MovieHub public index is not proof it is absent from private user libraries.',
 '- A YouTube public video/DE metadata/genre does not establish a German entitlement, store offering, price, right or playback route.',
 '- Before productizing, review [YouTube API Developer Policies E.2](https://developers.google.com/youtube/terms/developer-policies) on multi-content-owner aggregation; research is not product approval.',
 '- Keep this source/report internal with applicable YouTube API data retention and refresh rules.',
 ''
 ]
 return {rows,stats:{calls,statuses,unreviewed:getCount(x=>x.review==='not-checked-budget'),
  riskCount:risk.length,filmCategoryCount:category30.length,stopped:stop},report:lines.join('\n')}
}
async function tmdbRequest(path,params,token){
 const uri=new URL('https://api.themoviedb.org/3'+path)
 for(const [key,value] of Object.entries(params||{}))uri.searchParams.set(key,String(value))
 let resp
 try{resp=await fetch(uri,{headers:{accept:'application/json',Authorization:'Bearer '+token},
   signal:AbortSignal.timeout(17000)})}
 catch{throw Error('TMDB network/timeout')}
 if(!resp.ok)throw Error('TMDB HTTP '+resp.status)
 return resp.json()
}
async function main(){
 const token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB read token missing')
 const source=await readFile(SOURCE,'utf8')
 const result=await audit({source,tmdbGet:(p,q)=>tmdbRequest(p,q,token)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile(OUTPUT,result.report+'\n',{mode:0o600})
 console.log('G1 100 videos TMDB-only '+result.stats.calls+' GETs, '+result.rows.length+
  ' source candidates. All proposed works unconfirmed, no writes.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('G1 hundred TMDB research failed: '+String(e?.message||'error').slice(0,145));process.exitCode=1})
