// G1 only: compare exactly three read-only official YouTube "movie" search orderings.
// No MovieHub catalog, provider, badges, player, Firebase/Firestore or production changes.
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet,isVideoId,safeTitle,getRegionSignal} from './youtube-api-smoke.mjs'
import {storeChannelLabel,minutes,deAssessment,assessTmdb} from './youtube-movies-fifty-g1.mjs'

export const ORDERS=Object.freeze(['viewCount','date','rating'])
export const MAX_RESULTS_PER_ORDER=50
export const MAX_SEARCH_CALLS=3
export const MAX_VIDEO_CALLS=3
export const MAX_TMDB_CALLS=80
export const MAX_MATCH_SEEDS=35
const clean=x=>safeTitle(x).trim()
const url=id=>'https://www.youtube.com/watch?v='+id
const num=x=>Number.isFinite(Number(x))&&Number(x)>=0?Number(x):null
export async function compare({youtubeApi,tmdbGet,at=()=>new Date().toISOString()}={}){
 if(typeof youtubeApi!=='function'||typeof tmdbGet!=='function')throw Error('Both read-only APIs required')
 let searches=0,videos=0,tmdbCalls=0
 const runs=[]
 for(const order of ORDERS){
  if(searches>=MAX_SEARCH_CALLS)throw Error('Search call cap')
  searches++
  const record={order,status:'ok',hits:[],searchCount:0,nextPage:false,error:''}
  try{
   // Deliberately NO q and NO channelId: YouTube Movies channel DISPLAY LABEL is not one stable channel ID.
   const data=await youtubeApi('search',{part:'snippet',type:'video',videoType:'movie',
     regionCode:'DE',order,maxResults:MAX_RESULTS_PER_ORDER})
   record.nextPage=Boolean(data.nextPageToken)
   const seen=new Set()
   for(const item of (data.items||[]).slice(0,MAX_RESULTS_PER_ORDER)){
    const id=item?.id?.videoId
    if(!isVideoId(id)||seen.has(id))continue
    seen.add(id)
    record.hits.push({id,rank:record.hits.length+1,
     searchTitle:clean(item.snippet?.title),searchChannel:clean(item.snippet?.channelTitle)})
   }
   record.searchCount=record.hits.length
  }catch(error){
   record.status='api-error'
   record.error=String(error?.message||'API request failed').slice(0,110)
  }
  runs.push(record)
 }
 const ids=[...new Set(runs.flatMap(r=>r.hits.map(h=>h.id)))]
 const details=new Map()
 for(let i=0;i<ids.length;i+=50){
  if(videos>=MAX_VIDEO_CALLS)throw Error('videos.list call cap')
  videos++
  const data=await youtubeApi('videos',{part:'snippet,contentDetails,status,statistics',
   id:ids.slice(i,i+50).join(',')})
  for(const v of data.items||[])if(isVideoId(v?.id))details.set(v.id,v)
 }
 const hitRows=runs.map(r=>({...r,hits:r.hits.map(hit=>{
  const v=details.get(hit.id)
  const label=v?clean(v.snippet?.channelTitle):hit.searchChannel
  const long=minutes(v?.contentDetails?.duration)
  const de=deAssessment(v?.contentDetails?.regionRestriction)
  const channelMatch=storeChannelLabel(label)
  const publicVideo=v?.status?.privacyStatus==='public'
  const candidate=Boolean(v&&channelMatch&&publicVideo&&long!==null&&long>=60&&de!=='excluded')
  return {...hit,title:v?clean(v.snippet?.title):hit.searchTitle,
   channel:label,channelId:String(v?.snippet?.channelId||''),
   minutes:long,views:num(v?.statistics?.viewCount),
   publishedAt:String(v?.snippet?.publishedAt||''),
   privacy:String(v?.status?.privacyStatus||'unknown'),
   de,deSignal:getRegionSignal(v?.contentDetails?.regionRestriction),
   channelMatch,qualified:candidate,
   note:!v?'not resolved':!channelMatch?'not-YouTube-Movies-label':
     !publicVideo?'not public':!(long>=60)?'too short/unknown duration':
     de==='excluded'?'DE excluded':'G1 candidate only'}
  })}))
 const qualified=new Map()
 for(const r of hitRows)for(const hit of r.hits)if(hit.qualified){
  if(!qualified.has(hit.id))qualified.set(hit.id,{...hit,orders:[],ranks:{}})
  const c=qualified.get(hit.id)
  c.orders.push(r.order);c.ranks[r.order]=hit.rank
 }
 const candidates=[...qualified.values()]
 // Low-cost, limited and conservative TMDB title hints, never accepted as identity.
 const matches=new Map()
 for(const item of candidates.slice(0,MAX_MATCH_SEEDS)){
  if(tmdbCalls>=MAX_TMDB_CALLS)throw Error('TMDB request hard cap')
  let match
  try{
   tmdbCalls++
   const results=await tmdbGet('/search/movie',{query:item.title,
    language:'de-DE',include_adult:'false'})
   match=assessTmdb(item.title,results.results)
   if(match.tmdbId){
    if(tmdbCalls>=MAX_TMDB_CALLS)throw Error('TMDB request hard cap')
    tmdbCalls++
    const detail=await tmdbGet('/movie/'+match.tmdbId,{language:'de-DE'})
    const target=Number(detail?.runtime)
    const delta=Number.isFinite(target)&&target>0?Math.round(Math.abs(item.minutes-target)*10)/10:null
    match={...match,runtimeDelta:delta,
     status:delta!==null&&delta<=15?'plausible-review':'title-exact-review'}
   }
  }catch(error){
   if(String(error?.message||'').includes('hard cap'))throw error
   match={status:'tmdb-api-error',tmdbId:null,year:null}
  }
  matches.set(item.id,match)
 }
 const stats={searches,videos,tmdbCalls,uniqueSearchIds:ids.length,
  videoDetails:details.size,uniqueYoutubeMovieCandidates:candidates.length,
  matchedAcrossOrders:candidates.filter(x=>x.orders.length>1).length,
  tmdbInvestigated:matches.size}
 const lines=[
  '# G1 YouTube movieType DE – 3 sort modes: most viewed / latest / highest rated','',
  '- Generated: '+at(),
  '- Official YouTube Data API search.list, exact same filters in all three runs: part=snippet, type=video, videoType=movie, regionCode=DE, maxResults=50, no q, no channelId.',
  '- Orders: viewCount, date, rating. NO first-page pagination and NO unapproved fallback. API can return fewer than 50 or error.',
  '- The YouTube displayed channel label YouTube Movies is NOT a single stable channelId: compare actual returned channel titles and IDs before interpretation.',
  '- No claim of worldwide top ranking or complete YouTube movie store; rank is the returned first-page search rank for an order, not DE rental/sales popularity.',
  '- Candidate filter: literal valid YouTube Movies channel LABEL, public video, duration at least 60 min, DE not explicitly excluded. Region unknown is not proof of playback.',
  '- YouTube views are video-views, not movie rentals, purchases or TMDB popularity. YouTube algorithm rating is not a like count.',
  '- TMDB hints are title-exact and optionally runtime-checked only, NOT verified film IDs, provider rights, prices or DE playback.',
  '- Strict read-only: no app, TV, data store, provider, badges, notifications, catalog or deploy changes. G2 not approved.',
  '',
  '## Actual result counts','','| Sort | Search status | Returned video IDs | Label matches | G1 full-film candidates | Other channels | Next page exists |',
  '| --- | --- | ---: | ---: | ---: | ---: | --- |',
  ...hitRows.map(r=>'| '+r.order+' | '+r.status+(r.error?(' ('+clean(r.error)+')'):'')+
   ' | '+r.searchCount+' | '+r.hits.filter(x=>x.channelMatch).length+
   ' | '+r.hits.filter(x=>x.qualified).length+
   ' | '+r.hits.filter(x=>!x.channelMatch).length+
   ' | '+(r.nextPage?'yes':'no/unknown')+' |'),
  '',
  '## Cross-order overlap (exact same video ID)','',
  '- Unique search IDs across all three lists: '+stats.uniqueSearchIds,
  '- videos.list entries resolved: '+stats.videoDetails,
  '- Unique G1 YouTube-Movies candidate video IDs: '+stats.uniqueYoutubeMovieCandidates,
  '- Unique G1 candidates present in at least two of the three rankings: '+stats.matchedAcrossOrders,
  '- TMDB provisional identity hints investigated: '+stats.tmdbInvestigated,
  '- API calls: search.list '+searches+'; videos.list '+videos+'; TMDB '+tmdbCalls+'.',
  '',
  '| YouTube movie video | video ID | Orders (rank) | Video views | Runtime | DE signal | TMDB ID hint | TMDB status |',
  '| --- | --- | --- | ---: | ---: | --- | --- | --- |',
  ...candidates.map(item=>{
   const match=matches.get(item.id)
   return '| '+clean(item.title)+' | ['+item.id+']('+url(item.id)+') | '+
    item.orders.map(order=>order+' (#'+item.ranks[order]+')').join(', ')+
    ' | '+(item.views??'?')+' | '+(item.minutes?.toFixed(1)??'?')+
    ' | '+item.deSignal+' | '+(match?.tmdbId??'?')+
    ' | '+(match?.status||'not-screened')+' |'
  }),
  '',
  '## Ranking details: first page, raw IDs (filter outcomes explicit)','',
  ...hitRows.flatMap(r=>[
   '### '+r.order+' ('+r.status+', '+r.hits.length+' unique hits)','',
   '| Rank | YouTube title | Video ID | Label | Views | Public full-movie candidate | Reason |',
   '| ---: | --- | --- | --- | ---: | --- | --- |',
   ...r.hits.map(h=>'| '+h.rank+' | '+clean(h.title)+' | '+h.id+' | '+clean(h.channel)+
    ' | '+(h.views??'?')+' | '+(h.qualified?'yes':'no')+' | '+h.note+' |'),''
  ]),
  '## Decision','',
  '- Never assume the first fifty API movie results are YouTube Movies owned; compare filtered yield by order.',
  '- Avoid treating no search result as proof a title/movie is unavailable: indexes and sort orders can yield incomplete results.',
  '- If yield low, G1 next authorized option is TMDB-DE-YouTube-provider work seeds plus targeted title searches, not unbounded extra global searches or undocumented APIs.',
  ''
 ]
 return {runs:hitRows,candidates,matches,stats,report:lines.join('\n')}
}
async function tmdbGet(path,params,token){
 const url=new URL('https://api.themoviedb.org/3'+path)
 for(const [k,v] of Object.entries(params||{}))url.searchParams.set(k,String(v))
 let response
 try{
  response=await fetch(url,{headers:{accept:'application/json',Authorization:'Bearer '+token},
   signal:AbortSignal.timeout(12000)})
 }catch{throw Error('TMDB network/timeout')}
 if(!response.ok)throw Error('TMDB HTTP '+response.status)
 return response.json()
}
async function main(){
 const key=getSecret(),token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB read token missing')
 const result=await compare({youtubeApi:(e,p)=>youtubeGet(e,p,key),
  tmdbGet:(p,q)=>tmdbGet(p,q,token)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile('artifacts/youtube-movies-g1/three-sort-compare.md',
  result.report+'\n',{mode:0o600})
 console.log('G1 three YouTube sort modes complete: '+
  result.runs.map(r=>r.order+'='+r.hits.filter(x=>x.qualified).length+'/'+r.searchCount+
   ' ('+r.status+')').join(', ')+
  '; unique YouTube Movies full-film candidate IDs='+result.stats.uniqueYoutubeMovieCandidates+
  '; overlap='+result.stats.matchedAcrossOrders+
  '; search calls='+result.stats.searches+'; video calls='+result.stats.videos+
  '; tmdb calls='+result.stats.tmdbCalls)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(err=>{console.error('G1 three-sort audit failed: '+
  String(err?.message||'unknown').slice(0,130));process.exitCode=1})
