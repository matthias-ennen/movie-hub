// G1 only: private read-only diagnostic of 21 previously unresolved YouTube title leads.
// No YouTube API calls; no cross-owner YouTube data retrieval; no movie/offer acceptance.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
export const INPUT='docs/_work/YOUTUBE_MOVIES_G1_21_TARGETED_INPUT_2026-10-21.json'
export const OUTPUT='artifacts/youtube-movies-g1/twenty-one-targeted.md'
export const PUBLIC_INDEX_URL='https://movie-hub-62459.web.app/search-index.json'
export const MAX_TMDB_REQUESTS=80
export const MAX_INDEX_BYTES=35_000_000
const norm=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]/g,'')
const safe=s=>String(s??'').replace(/[\r\n|<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,110)
const pos=n=>Number.isInteger(Number(n))&&Number(n)>0?Number(n):null
const moviePath=id=>'https://www.themoviedb.org/movie/'+id

export function validate(data){
 if(data?.schemaVersion!==1||data.sourceRun!==39602961148||
  data.sourceArtifact!==12347785136)throw Error('Baseline evidence mismatch')
 const list=data.unresolved,prior=data.priorTmdbMovieIdHints
 if(!Array.isArray(list)||list.length!==21||!Array.isArray(prior)||prior.length!==26||
  new Set(list.map(x=>x.videoId)).size!==21||new Set(prior).size!==26)
  throw Error('G1 reference counts not 21/26')
 if(list.some(x=>!/^[A-Za-z0-9_-]{11}$/.test(x.videoId)||!safe(x.title)||
  !Number.isFinite(x.observedRuntimeMinutes)||x.observedRuntimeMinutes<60))
  throw Error('Invalid original 21 G1 cases')
 if(prior.some(x=>!pos(x))||list.filter(x=>x.contentTypeControl).length!==2)
  throw Error('Invalid film hint baseline')
 return data
}
export function membership(index,ids){
 if(index?.kind!=='search-index'||index.version!==1||!Array.isArray(index.entries))
  throw Error('Unrecognized public index format')
 const presentIds=new Set(index.entries.filter(x=>x.type==='movie'&&x.scope!=='personal')
  .map(x=>pos(x.tmdbId)).filter(Boolean))
 const input=[...new Set(ids.map(pos).filter(Boolean))]
 return{state:'public-index-checked',generatedAt:index.generatedAt||'unknown',
  entryCount:index.entries.length,checked:input.length,
  present:input.filter(id=>presentIds.has(id)),
  absent:input.filter(id=>!presentIds.has(id))}
}
const quality=(v,title,alias)=>{
 const names=[v.title,v.original_title].map(norm).filter(Boolean)
 const expected=[title,alias].map(norm).filter(Boolean)
 if(names.some(n=>expected.includes(n)))return 2
 if(names.some(n=>expected.some(s=>s.length>=7&&n.length>=5&&(n.includes(s)||s.includes(n)))))return 1
 return 0
}
export async function audit({data,tmdbGet,publicIndexGet,at=()=>new Date().toISOString()}={}){
 validate(data)
 if(typeof tmdbGet!=='function'||typeof publicIndexGet!=='function')
  throw Error('Read-only API functions required')
 let calls=0
 async function tmdb(path,params){
  if(calls>=MAX_TMDB_REQUESTS)throw Error('G1 TMDB request limit')
  calls++
  return tmdbGet(path,params)
 }
 const rows=[]
 for(const source of data.unresolved){
  const row={id:source.videoId,title:safe(source.title),baseline:source.previousReview,
   alias:source.queryAlias||null,filmHints:[],tvHints:[],errors:[],
   status:'unresolved'}
  if(source.contentTypeControl){
   row.status='nonmovie-content-control'
   rows.push(row);continue
  }
  const found=new Map()
  const queries=[{query:source.title,language:'de-DE'},
   {query:source.queryAlias||source.title,language:'en-US'}]
  for(const query of queries){
   try{
    const answer=await tmdb('/search/movie',
     {...query,include_adult:'false',page:1})
    for(const item of (answer?.results||[]).slice(0,20)){
     const id=pos(item.id),score=quality(item,source.title,source.queryAlias||source.title)
     if(id&&score&&(!found.has(id)||score>found.get(id).score))
      found.set(id,{id,score,title:safe(item.title),
       originalTitle:safe(item.original_title),year:String(item.release_date||'').slice(0,4)})
    }
   }catch(e){if(String(e?.message).includes('request limit'))throw e
    row.errors.push('search '+String(e?.message||'failed').slice(0,65))}
  }
  const choices=[...found.values()].sort((a,b)=>b.score-a.score||a.id-b.id)
  for(const candidate of choices.slice(0,2)){
   let delta=null,tmdbRuntime=null
   try{
    const detail=await tmdb('/movie/'+candidate.id,{language:'de-DE'})
    const runtime=Number(detail?.runtime)
    if(Number.isFinite(runtime)&&runtime>0){
     tmdbRuntime=runtime
     delta=Math.round(Math.abs(runtime-source.observedRuntimeMinutes)*10)/10
    }
   }catch(e){if(String(e?.message).includes('request limit'))throw e
    row.errors.push('detail '+String(e?.message||'failed').slice(0,65))}
   row.filmHints.push({...candidate,tmdbRuntime,delta})
  }
  if(source.previousReview==='series-title-review'){
   try{
    const tv=await tmdb('/search/tv',
     {query:source.title,language:'en-US',include_adult:'false',page:1})
    row.tvHints=(tv?.results||[]).filter(x=>
     [x.name,x.original_name].some(n=>norm(n)===norm(source.title)))
      .slice(0,4).map(x=>({id:pos(x.id),title:safe(x.name)})).filter(x=>x.id)
   }catch(e){if(String(e?.message).includes('request limit'))throw e
    row.errors.push('tv '+String(e?.message||'failed').slice(0,65))}
  }
  if(!choices.length)row.status=row.tvHints.length?'tv-title-only-review':'no-strong-movie-title-review'
  else if(choices.length>1)row.status='multiple-movie-work-review'
  else if(row.filmHints[0]?.delta===null)row.status='single-movie-runtime-unchecked-review'
  else if(row.filmHints[0].delta<=15)row.status='single-movie-runtime-supported-review'
  else row.status='single-movie-runtime-conflict-review'
  if(row.errors.length)row.status='tmdb-partial-error-review'
  rows.push(row)
 }
 const ids=[...new Set([...data.priorTmdbMovieIdHints,
  ...rows.flatMap(x=>x.filmHints.map(y=>y.id))])]
 let index
 try{index=membership(await publicIndexGet(),ids)}
 catch(e){index={state:'public-index-unavailable',error:
  String(e?.message||'index error').slice(0,90),checked:0,present:[],absent:[]}}
 const yes=new Set(index.present)
 const statuses={}
 for(const row of rows)statuses[row.status]=(statuses[row.status]||0)+1
 const publicStatus=id=>index.state!=='public-index-checked'?'not-checked':
  yes.has(id)?'present':'absent-from-PUBLIC-index-only'
 const lines=[
  '# MovieHub G1 – targeted 21 unresolved title review, TMDB-only plus public MovieHub search index','',
  '- Generated: '+at(),
  '- Original evidence: GitHub Actions #39602961148 / artifact #12347785136.',
  '- 21 historic YouTube title leads, 19 limited TMDB probes, 2 non-film content controls.',
  '- No new YouTube API requests. TMDB requests: '+calls+'/'+MAX_TMDB_REQUESTS+'.',
  '- Both language variants use ONLY the first TMDB page; max 2 movie details per title.',
  '- All candidates remain REVIEW – no approved identity, rights, price, version or playback route.',
  '- Live public search index: '+index.state+'; generated '+(index.generatedAt||'unknown')+
   '; checked distinct suggested IDs '+index.checked+'.',
  '- An absent PUBLIC index ID does NOT imply absent from personal or account-specific MovieHub titles.',
  '- No production writes, catalog imports, apps, Badges, Firestore, Firebase or scheduler changes. G2 not approved.','',
  '## Counts','', '| Review | Cases |','| --- | ---: |',
  ...Object.entries(statuses).sort((a,b)=>a[0].localeCompare(b[0]))
   .map(([status,count])=>'| '+status+' | '+count+' |'),'',
  '## Targeted film ID hints – NOT accepted film identities','',
  '| Source title | Video ID | Possible TMDB movie IDs (runtime delta) | Public MovieHub index for hints | Status |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map(row=>'| '+safe(row.title)+' | '+row.id+' | '+
   (row.filmHints.length?row.filmHints.map(x=>'['+x.id+']('+moviePath(x.id)+') Δ'+
     (x.delta??'?')+'min').join('; '):'none')+' | '+
   (row.filmHints.length?row.filmHints.map(x=>x.id+': '+publicStatus(x.id)).join('; '):'-')+
   ' | '+row.status+' |'),
  '',
  '## Original 26 provisional TMDB IDs – PUBLIC MovieHub index membership only','',
  '| Provisional TMDB movie ID | PUBLIC search index |','| ---: | --- |',
  ...data.priorTmdbMovieIdHints.map(id=>'| '+id+' | '+publicStatus(id)+' |'),'',
  '## Open G1 gates','',
  '- Check director, year, exact edition and playback through appropriate independent evidence before accepting any movie ID.',
  '- Missing or ambiguous TMDB matches are review leads, not negative YouTube provider availability.',
  '- Compare the public search index only; never infer private titles or personalize across accounts.',
  '- Review YouTube API data aggregation policy before any productive multi-owner offering.',
  ''
 ]
 return{rows,index,stats:{tmdbCalls:calls,statuses},report:lines.join('\n')}
}
export async function fetchCurrentPublicIndex(fetchFn=fetch){
 const res=await fetchFn(PUBLIC_INDEX_URL,{headers:{accept:'application/json'},
  signal:AbortSignal.timeout(25000),cache:'no-store'})
 if(!res.ok)throw Error('Public index HTTP '+res.status)
 const declared=Number(res.headers?.get('content-length')||0)
 if(declared>MAX_INDEX_BYTES)throw Error('Public index exceeds byte cap')
 if(!res.body?.getReader)throw Error('No public index reader')
 const reader=res.body.getReader(),chunks=[]
 let size=0
 while(true){
  const {done,value}=await reader.read()
  if(done)break
  size+=value.byteLength
  if(size>MAX_INDEX_BYTES){await reader.cancel();throw Error('Public index byte cap')}
  chunks.push(value)
 }
 const data=new Uint8Array(size);let at=0
 for(const chunk of chunks){data.set(chunk,at);at+=chunk.byteLength}
 const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data))
 if(parsed?.kind!=='search-index'||parsed.version!==1||!Array.isArray(parsed.entries))
  throw Error('Public search index version mismatch')
 return parsed
}
async function getTmdb(path,params,token){
 const u=new URL('https://api.themoviedb.org/3'+path)
 for(const [k,v] of Object.entries(params||{}))u.searchParams.set(k,String(v))
 let res
 try{res=await fetch(u,{headers:{accept:'application/json',Authorization:'Bearer '+token},
  signal:AbortSignal.timeout(13000)})}
 catch{throw Error('TMDB network/timeout')}
 if(!res.ok)throw Error('TMDB HTTP '+res.status)
 return res.json()
}
async function main(){
 const token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB token required')
 const data=JSON.parse(await readFile(INPUT,'utf8'))
 const result=await audit({data,tmdbGet:(p,q)=>getTmdb(p,q,token),
  publicIndexGet:()=>fetchCurrentPublicIndex()})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile(OUTPUT,result.report+'\n',{mode:0o600})
 console.log('G1 21-title TMDB-only research: '+result.stats.tmdbCalls+
  ' TMDB GETs; public index '+result.index.state+'; 0 productive changes.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(err=>{console.error('G1 targeted 21 failed: '+
 String(err?.message||'unknown').slice(0,140));process.exitCode=1})
