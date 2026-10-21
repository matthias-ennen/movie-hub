// G1 research only: re-check the 47 observed YouTube movie VIDEO IDs against TMDB.
// Never publish new titles, badges, provider offers or playback routes from this report.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet,isVideoId,safeTitle,getRegionSignal} from './youtube-api-smoke.mjs'
import {minutes,storeChannelLabel,deAssessment,normalizedTitle} from './youtube-movies-fifty-g1.mjs'

export const EXPECTED_UNIQUE=47
export const EXPECTED_OBSERVATIONS=49
export const MAX_YOUTUBE_CALLS=1
export const MAX_TMDB_CALLS=94
export const INPUT='docs/_work/YOUTUBE_MOVIES_G1_47_EVIDENCE_INPUT_2026-10-21.json'
export const OUTPUT='artifacts/youtube-movies-g1/forty-seven-identity-review.md'
const text=value=>safeTitle(value).trim()
const filmKey=value=>normalizedTitle(value)
const num=x=>Number.isInteger(Number(x))&&Number(x)>0?Number(x):null
const url=id=>'https://www.youtube.com/watch?v='+id

export function collectObservations(observations){
 if(!Array.isArray(observations))throw Error('G1 observations must be an array')
 const map=new Map()
 for(const item of observations){
  if(!isVideoId(item?.videoId)||!text(item?.title)||!text(item?.source)||!text(item?.evidence))
   throw Error('Invalid G1 observation')
  const row=map.get(item.videoId)||{videoId:item.videoId,oldTitles:[],sources:[],evidence:[]}
  if(!row.oldTitles.includes(text(item.title)))row.oldTitles.push(text(item.title))
  if(!row.sources.includes(text(item.source)))row.sources.push(text(item.source))
  if(!row.evidence.includes(text(item.evidence)))row.evidence.push(text(item.evidence))
  map.set(item.videoId,row)
 }
 return [...map.values()]
}

export async function audit({manifest,youtubeApi,tmdbGet,at=()=>new Date().toISOString()}={}){
 if(typeof youtubeApi!=='function'||typeof tmdbGet!=='function')throw Error('Read-only API callbacks required')
 if(manifest?.schemaVersion!==1)throw Error('Unsupported manifest schema')
 const obs=manifest.observations
 const collected=collectObservations(obs)
 if(obs.length!==manifest.expectedObservationCount||collected.length!==manifest.expectedUniqueVideoIds||
    collected.length!==EXPECTED_UNIQUE||obs.length!==EXPECTED_OBSERVATIONS)
  throw Error('G1 reference inventory mismatch: never silently drop a candidate')
 const apiStats={youtubeCalls:0,tmdbCalls:0}
 const ids=collected.map(x=>x.videoId)
 apiStats.youtubeCalls++
 const payload=await youtubeApi('videos',{part:'snippet,contentDetails,status',id:ids.join(',')})
 if(!Array.isArray(payload?.items))throw Error('YouTube response missing items')
 const details=new Map(payload.items.filter(x=>isVideoId(x?.id)).map(x=>[x.id,x]))
 const rows=[]
 for(const item of collected){
  const v=details.get(item.videoId)
  const runtime=minutes(v?.contentDetails?.duration)
  const region=deAssessment(v?.contentDetails?.regionRestriction)
  const title=text(v?.snippet?.title||item.oldTitles[0])
  const row={videoId:item.videoId,title,sources:item.sources,
   channelId:String(v?.snippet?.channelId||''),channel:text(v?.snippet?.channelTitle||''),
   durationMinutes:runtime,region,regionSignal:getRegionSignal(v?.contentDetails?.regionRestriction),
   privacy:String(v?.status?.privacyStatus||'not-resolved'),tmdbId:null,year:null,
   runtimeDifference:null,verifiedWork:false,existingInMovieHub:'not-checked',
   status:'unresolved'}
  if(!v){row.status='youtube-not-resolved'}
  else if(row.privacy!=='public'){row.status='youtube-not-public'}
  else if(!storeChannelLabel(row.channel)){row.status='other-channel-review'}
  else if(runtime===null||runtime<60){row.status='short-or-unknown-duration-review'}
  else if(region==='excluded'){row.status='DE-excluded-metadata'}
  else{
   // A YouTube-first candidate remains eligible even if TMDB has no YouTube provider offer.
   // search/multi distinguishes exact movie/series identities; no provider gating.
   if(apiStats.tmdbCalls>=MAX_TMDB_CALLS)throw Error('TMDB call cap before search')
   apiStats.tmdbCalls++
   try{
    const result=await tmdbGet('/search/multi',{query:title,language:'de-DE',include_adult:'false'})
    const candidates=Array.isArray(result?.results)?result.results:[]
    const exact=(type)=>candidates.filter(x=>x.media_type===type&&
      [x.title,x.original_title,x.name,x.original_name].some(s=>filmKey(s)&&filmKey(s)===filmKey(title)))
    const movies=exact('movie'),series=exact('tv')
    const movieIds=[...new Set(movies.map(x=>num(x.id)).filter(Boolean))]
    const tvIds=[...new Set(series.map(x=>num(x.id)).filter(Boolean))]
    if(!movieIds.length&&tvIds.length){row.status='series-title-review'}
    else if(!movieIds.length){row.status='unmatched-or-title-variant'}
    else if(movieIds.length!==1||tvIds.length){row.status='ambiguous-work-or-media-type-review'}
    else{
     row.tmdbId=movieIds[0]
     row.year=String(movies.find(x=>num(x.id)===row.tmdbId)?.release_date||'').slice(0,4)||null
     if(apiStats.tmdbCalls>=MAX_TMDB_CALLS)throw Error('TMDB call cap before movie detail')
     apiStats.tmdbCalls++
     const detail=await tmdbGet('/movie/'+row.tmdbId,{language:'de-DE'})
     const duration=Number(detail?.runtime)
     if(Number.isFinite(duration)&&duration>0){
      row.runtimeDifference=Number(Math.abs(duration-runtime).toFixed(1))
     }
     // Even good title+runtime suggestions are NEVER automatically accepted.
     row.status=row.runtimeDifference!==null&&row.runtimeDifference<=15?
      'plausible-review':'title-exact-review'
    }
    if(/(?:\blive\s*[-: ]|\bkonzert\b|\btour\s*20\d\d\b|\bsaga\s*teil\s*\d)/i.test(title)&&
        (row.status==='plausible-review'||row.status==='title-exact-review'))
     row.status='content-type-review'
   }catch(err){
    if(String(err?.message||'').includes('call cap'))throw err
    row.status='tmdb-request-error'
    row.tmdbId=null
   }
  }
  rows.push(row)
 }
 const statuses={}
 for(const r of rows)statuses[r.status]=(statuses[r.status]||0)+1
 const duplicates=collected.filter(r=>r.sources.length>1)
 const lines=[
  '# G1 – Identity and type review of 47 observed YouTube movie VIDEO IDs','',
  '- Generated: '+at(),
  '- Sources: 2026-10-21 original YouTube/TMDB research reports + the original public-upload workflow artifact.',
  '- Raw observations: '+obs.length+'; unique video IDs: '+rows.length+
    '; IDs observed in multiple research samples: '+duplicates.length+'.',
  '- Exact duplicate video IDs: '+duplicates.map(x=>x.videoId+' ('+x.sources.join(', ')+')').join('; ')+'.',
  '- Fresh official YouTube videos.list calls: '+apiStats.youtubeCalls+'/'+MAX_YOUTUBE_CALLS+
   '; TMDB GETs: '+apiStats.tmdbCalls+'/'+MAX_TMDB_CALLS+'.',
  '- This is YouTube-first research: a missing TMDB YouTube-provider listing cannot suppress candidate discovery.',
  '- TMDB search/multi matches are provisional; series, concerts, edits, shared titles, wrong runtimes and editions require manual scrutiny.',
  '- No check of private MovieHub catalog membership was performed; number of truly NEW MovieHub works is UNKNOWN.',
  '- NO confirmed movie identities, DE shop rights, prices, paid/free flags, Fire TV playback, provider badges or auto-imports.',
  '- Region restrictions/allowed metadata do not prove current actual Germany playback.',
  '- One YouTube Movies displayed channel name may represent many distinct actual channel IDs.',
  '- Never turn no search match into no YouTube availability. Review statuses below are diagnostic only.',
  '- No changes to MovieHub app, Firestore/Firebase, provider, badges, Nightly, APK or Android/TV code. G2–G4 not authorized.','',
  '## Counts by provisional review state','',
  '| Status | Count |','| --- | ---: |',
  ...Object.entries(statuses).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>'| '+key+' | '+value+' |'),
  '',
  '## Individual evidence rows – all 47 VIDEO IDs, no auto-accepted films','',
  '| Video title (latest API) | Video ID | Observed via | Minutes | DE metadata | Provisional TMDB movie ID | Work review |',
  '| --- | --- | --- | ---: | --- | --- | --- |',
  ...rows.map(r=>'| '+text(r.title)+' | ['+r.videoId+']('+url(r.videoId)+') | '+
     r.sources.join(', ')+' | '+(r.durationMinutes?.toFixed(1)??'?')+
     ' | '+r.regionSignal+' | '+(r.tmdbId??'?')+' | '+r.status+' |'),
  '',
  '## Next research gate','',
  '- Manual content-type / movie edition / identity review. Confirm MovieHub catalog membership with its canonical current title index before calculating new works.',
  '- In a separate bounded TMDB-first sample, compare exact Video IDs discovered for known film works and preserve both discovery directions.',
  '- Confirm YouTube API policy on multi-owner aggregation and country-specific provider attribution before any production rollout.',
  '- G1 research-only; no publication or claim that 47 equals 47 confirmed film works.',
  ''
 ]
 return {rows,stats:{...apiStats,observations:obs.length,uniqueVideoIds:rows.length,
  duplicatedVideoIds:duplicates.length,videoDetailsResolved:details.size,statuses},
  report:lines.join('\n')}
}

async function tmdbGet(path,params,token){
 const uri=new URL('https://api.themoviedb.org/3'+path)
 for(const [key,value] of Object.entries(params||{}))uri.searchParams.set(key,String(value))
 let response
 try{response=await fetch(uri,{headers:{accept:'application/json',Authorization:'Bearer '+token},
   signal:AbortSignal.timeout(15000)})}
 catch{throw Error('TMDB network/timeout')}
 if(!response.ok)throw Error('TMDB HTTP '+response.status)
 return response.json()
}
async function main(){
 const manifest=JSON.parse(await readFile(INPUT,'utf8'))
 const key=getSecret(),token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB read token missing')
 const result=await audit({manifest,youtubeApi:(endpoint,params)=>youtubeGet(endpoint,params,key),
  tmdbGet:(path,params)=>tmdbGet(path,params,token)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile(OUTPUT,result.report+'\n',{mode:0o600})
 console.log('G1 47-video-id research complete: '+result.stats.uniqueVideoIds+
   ' IDs; '+result.stats.videoDetailsResolved+' live YouTube video records; '+
   result.stats.youtubeCalls+' YouTube and '+result.stats.tmdbCalls+
   ' TMDB read requests; all matches provisional, no publication.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('G1 identity audit failed: '+
  String(e?.message||'unknown').slice(0,150));process.exitCode=1})
