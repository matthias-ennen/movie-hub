// Read-only G1 research of the twelve user-shared YouTube movie URLs.
// No scraping, no data publication, no MovieHub catalog/badge/provider changes.
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet,isVideoId,safeTitle,getRegionSignal} from './youtube-api-smoke.mjs'
export const USER_VIDEO_IDS=Object.freeze([
 'q9Gba51rkHw','2SwHXYoQQeQ','rzIyI-OME3M','PZC6NS-IFCk',
 'KVgUc8b5gvs','tGPvABsHlu4','Etlfq9KD78Q','DxRslNY7hDw',
 'EBiseL2xAz8','Ln4NNpDD5q8','rSn7jQolX_c','h4Tv29mk4LE',
])
export const MAX_CHANNELS=12
export const MAX_PUBLIC_PLAYLISTS_PER_CHANNEL=5
export const MAX_API_CALLS=90
export const MAX_ITEMS_PER_PLAYLIST=50
const ENDPOINTS=new Set(['videos','channels','playlists','playlistItems'])
const clean=(value)=>safeTitle(value).trim()
export function durationMinutes(s){
 const match=String(s||'').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
 if(!match||!match.slice(1).some(x=>x!==undefined))return null
 return Number(match[1]||0)*1440+Number(match[2]||0)*60+Number(match[3]||0)+Number(match[4]||0)/60
}
export function deRegion(r){
 if(Array.isArray(r?.blocked)&&r.blocked.includes('DE'))return 'blocked'
 if(Array.isArray(r?.allowed))return r.allowed.includes('DE')?'allowed':'not-in-allowlist'
 return 'unknown'
}
export function references(){
 if(USER_VIDEO_IDS.length!==12||new Set(USER_VIDEO_IDS).size!==12||!USER_VIDEO_IDS.every(isVideoId))
  throw Error('Invalid or duplicate user video IDs')
 return [...USER_VIDEO_IDS]
}
export async function audit({api,at=()=>new Date().toISOString()}={}){
 if(typeof api!=='function')throw new TypeError('YouTube API callback required')
 const ids=references(),refSet=new Set(ids)
 let calls=0
 const byEndpoint={}
 async function read(endpoint,params){
  if(!ENDPOINTS.has(endpoint))throw Error('Unapproved API endpoint')
  if(calls>=MAX_API_CALLS)throw Error('G1 API hard cap')
  calls++;byEndpoint[endpoint]=(byEndpoint[endpoint]||0)+1
  return api(endpoint,params)
 }
 const v=await read('videos',{part:'snippet,contentDetails,status',id:ids.join(',')})
 const videoMap=new Map((v.items||[]).filter(x=>refSet.has(x.id)).map(x=>[x.id,x]))
 const entries=ids.map(id=>{
  const item=videoMap.get(id)
  return {id,resolved:!!item,title:item?clean(item.snippet?.title):'',
   channelId:item?String(item.snippet?.channelId||''):'',
   channel:item?clean(item.snippet?.channelTitle):'',
   runtime:item?durationMinutes(item.contentDetails?.duration):null,
   de:item?deRegion(item.contentDetails?.regionRestriction):'unknown',
   deSignal:item?getRegionSignal(item.contentDetails?.regionRestriction):'unknown',
   visibility:item?String(item.status?.privacyStatus||'unknown').slice(0,30):'unknown'}
 })
 const counts=new Map()
 for(const entry of entries){
  if(!entry.channelId)continue
  const c=counts.get(entry.channelId)||{id:entry.channelId,count:0,ids:[],name:entry.channel}
  c.count++;c.ids.push(entry.id);counts.set(c.id,c)
 }
 const selected=[...counts.values()].sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id)).slice(0,MAX_CHANNELS)
 let details=new Map()
 if(selected.length){
  const c=await read('channels',{part:'snippet,contentDetails',id:selected.map(x=>x.id).join(',')})
  details=new Map((c.items||[]).map(x=>[x.id,x]))
 }
 const channels=[],playlists=[]
 for(const observed of selected){
  const detail=details.get(observed.id),name=clean(detail?.snippet?.title||observed.name)
  const uploads=String(detail?.contentDetails?.relatedPlaylists?.uploads||'')
  const channel={id:observed.id,name,refs:observed.count,referenceIds:[...observed.ids],
   uploadId:uploads||null,publicStatus:'not-queried',listed:0,hasMore:false,inspected:0}
  let curated=[]
  try{
   const all=await read('playlists',{part:'snippet,contentDetails',channelId:observed.id,maxResults:50})
   channel.publicStatus='available';channel.listed=(all.items||[]).length
   channel.hasMore=Boolean(all.nextPageToken)
   curated=(all.items||[]).filter(x=>typeof x.id==='string').slice(0,MAX_PUBLIC_PLAYLISTS_PER_CHANNEL)
    .map(x=>({id:x.id,name:clean(x.snippet?.title),kind:'public-curated'}))
  }catch(err){
   if(String(err?.message).includes('G1 API hard cap'))throw err
   channel.publicStatus='not-accessible'
  }
  if(uploads&&!curated.some(x=>x.id===uploads))
   curated.push({id:uploads,name:'System-generated channel uploads',kind:'uploads'})
  for(const pl of curated){
   const item={channelId:observed.id,channelName:name,playlistId:pl.id,name:pl.name,
    kind:pl.kind,status:'not-checked',inspected:0,more:false,matches:[]}
   try{
    const data=await read('playlistItems',{part:'snippet,contentDetails',
     playlistId:pl.id,maxResults:MAX_ITEMS_PER_PLAYLIST})
    item.status='readable';item.inspected=(data.items||[]).length
    item.more=Boolean(data.nextPageToken)
    item.matches=[...new Set((data.items||[])
     .map(x=>x.contentDetails?.videoId||x.snippet?.resourceId?.videoId)
     .filter(x=>refSet.has(x)))]
   }catch(err){
    if(String(err?.message).includes('G1 API hard cap'))throw err
    item.status='not-accessible'
   }
   playlists.push(item);channel.inspected++
  }
  channels.push(channel)
 }
 const matches=new Map()
 for(const pl of playlists)for(const id of pl.matches){
  if(!matches.has(id))matches.set(id,[])
  matches.get(id).push({name:pl.name,id:pl.playlistId,kind:pl.kind})
 }
 const stats={refs:12,resolved:entries.filter(e=>e.resolved).length,
  channelCount:counts.size,channelsChecked:channels.length,
  playlistsListed:channels.reduce((a,c)=>a+c.listed,0),
  playlistsChecked:playlists.length,
  playlistPagesRead:playlists.filter(p=>p.status==='readable').length,
  matchedVideoIds:matches.size,apiCalls:calls,byEndpoint}
 const lines=[
  '# MovieHub G1 - Twelve user-provided YouTube video IDs and public playlist discovery','',
  '- Time: '+at(),'- Official YouTube Data API, read-only. Calls: '+calls+'/'+MAX_API_CALLS,
  '- By endpoint: '+Object.entries(byEndpoint).map(([k,n])=>k+' '+n).join(', '),
  '- None of the original share URLs contained a list= parameter; is= is NOT a playlist ID.',
  '- Curated public playlists only: first '+MAX_PUBLIC_PLAYLISTS_PER_CHANNEL+
   ' returned per source channel; only the first '+MAX_ITEMS_PER_PLAYLIST+
   ' items per playlist. Incomplete lists cannot prove non-membership.',
  '- Public channel uploads are separately identified and must not be confused with a curated movie collection.',
  '- The Data API does NOT provide a global reverse listing of all playlists containing any video ID.',
  '- Metadata and public playlist membership do not prove a German film-shop offer, rights, price, entitlement or TMDB match.',
  '- No scraping, Firebase/Firestore writes, production catalog, badges, Android/TV changes.','',
  '## Totals','','| Metric | Count |','| --- | ---: |',
  '| Distinct supplied URLs | 12 |',
  '| IDs resolved via videos.list | '+stats.resolved+' |',
  '| Distinct uploader channel IDs | '+stats.channelCount+' |',
  '| Uploader channels checked | '+stats.channelsChecked+' |',
  '| Listed public playlists | '+stats.playlistsListed+' |',
  '| Public-curated and upload playlists sampled | '+stats.playlistsChecked+' |',
  '| Accessible playlist pages read | '+stats.playlistPagesRead+' |',
  '| User video IDs directly found in sampled playlists | '+stats.matchedVideoIds+' |',
  '',
  '## Individual video metadata','','| # | URL | Title | Channel | channelId | Runtime minutes | DE region | Visibility |',
  '| ---: | --- | --- | --- | --- | ---: | --- | --- |',
  ...entries.map((x,i)=>'| '+(i+1)+' | [video]('+'https://www.youtube.com/watch?v='+x.id+') | '+
   (x.resolved?x.title:'unresolved')+' | '+(x.channel||'?')+' | '+(x.channelId||'?')+
   ' | '+(x.runtime??'?')+' | '+x.deSignal+' | '+x.visibility+' |'),
  '',
  '## Public playlists returned by those channels','','| Channel | Channel ID | Reference videos | Public playlists listed | Upload list ID | Status |',
  '| --- | --- | ---: | ---: | --- | --- |',
  ...channels.map(c=>'| '+c.name+' | '+c.id+' | '+c.refs+' | '+c.listed+' | '+(c.uploadId||'?')+' | '+c.publicStatus+(c.hasMore?' / more pages':'')+' |'),
  '',
  '## Exact playlist names and first-page membership evidence','','| Source | Playlist | Playlist ID | Category | Checked items | More pages | Shared video IDs observed |',
  '| --- | --- | --- | --- | ---: | --- | --- |',
  ...playlists.map(p=>'| '+p.channelName+' | '+p.name+' | '+p.playlistId+' | '+p.kind+
   ' | '+p.inspected+' ('+p.status+') | '+(p.more?'yes':'no/unknown')+
   ' | '+(p.matches.join(', ')||'none among sampled entries')+' |'),
  '',
  '## Video -> public playlist membership (sampled only)','',
  ...entries.map(x=>'- '+x.id+': '+
   ((matches.get(x.id)||[]).map(p=>p.name+' ['+p.id+'] ('+p.kind+')').join('; ')||
   'no membership in inspected first pages; other playlists UNKNOWN')),
  '',
  '## Conclusion','','- Only playlists demonstrably returned from the documented public API are listed.',
  '- If a named playlist contains several supplied IDs, test it as a possible broader candidate source; an upload playlist is not automatically a film-shop playlist.',
  '- If the twelve link sources do not share a public playlist, the film catalog might be a non-playlist storefront. Do not scrape or use undocumented YouTube APIs.',
  '- Continue G1 with TMDB-first provider-specific DE film seeds if needed, never auto-match by similar names alone.',
  '- Fifty-title aim and G2 deployment approval remain separate.',''
 ]
 return {entries,channels,playlists,stats,report:lines.join('\n')}
}
async function main(){
 const key=getSecret()
 const result=await audit({api:(endpoint,params)=>youtubeGet(endpoint,params,key)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile('artifacts/youtube-movies-g1/user-twelve-playlists.md',result.report+'\n',{mode:0o600})
 console.log('User twelve YouTube G1 investigation: '+result.stats.resolved+
  '/12 resolved, '+result.stats.channelCount+' channels, '+
  result.stats.matchedVideoIds+' sampled playlist memberships, '+result.stats.apiCalls+' API calls.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{console.error('G1 twelve-link probe failed: '+String(e?.message||'unknown').slice(0,160));process.exitCode=1})
}
