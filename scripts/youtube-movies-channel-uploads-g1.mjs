// G1 read-only: test if public uploads playlists of previously observed
// YouTube-Movies-labelled channels can provide a permitted wider title pool.
// Channel titles are NOT evidence of official licensing; this is no product feed.
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet,isVideoId,safeTitle,getRegionSignal} from './youtube-api-smoke.mjs'

export const REFERENCE_IDS=Object.freeze([
 'RY32dCRpRvE','3ivgYkh5Res','24u6ps_a_c4','cVubTPv90f4',
 'j5PHSqJ7xl0','RLsHxwsFVqY','m-hwfIKIb5w','TPSkKEl65sE',
 'IxL_x8G1_FU','WRZ0-JNo5BE','WlzWW8zfJSI','u_Sf2eOZtiQ'
])
export const MAX_CHANNELS=6,MAX_PAGES=2,MAX_UPLOAD_IDS=300,MAX_REQUESTS=22
function clean(x){return safeTitle(x).trim()}
export function durationMinutes(x){
 const m=String(x||'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
 if(!m||(!m[1]&&!m[2]&&!m[3]))return null
 return Number(m[1]||0)*60+Number(m[2]||0)+Number(m[3]||0)/60
}
export function deValue(r){
 if(Array.isArray(r?.blocked)&&r.blocked.includes('DE'))return 'excluded'
 if(Array.isArray(r?.allowed))return r.allowed.includes('DE')?'allowed':'excluded'
 return 'unknown'
}
function keyForTitle(s){return clean(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase()}
export async function audit({api,at=()=>new Date().toISOString()}={}){
 if(typeof api!=='function')throw Error('Read-only YouTube api callback required')
 let calls=0
 async function get(endpoint,params){
  if(calls>=MAX_REQUESTS)throw Error('G1 uploads request cap reached')
  calls++
  return api(endpoint,params)
 }
 // Exactly one videos.list lookup resolves the real channelId of each old candidate.
 const known=await get('videos',{part:'snippet,contentDetails,status',id:REFERENCE_IDS.join(',')})
 const hits=(known.items||[]).filter(x=>isVideoId(x?.id)&&x?.snippet?.channelId)
 const byChannel=new Map()
 for(const hit of hits){
  const id=hit.snippet.channelId
  const entry=byChannel.get(id)||{channelId:id,oldVideos:0,label:clean(hit.snippet.channelTitle)}
  entry.oldVideos++
  byChannel.set(id,entry)
 }
 const channels=[...byChannel.values()].sort((a,b)=>b.oldVideos-a.oldVideos||a.channelId.localeCompare(b.channelId))
   .slice(0,MAX_CHANNELS)
 let meta=[]
 if(channels.length){
  const c=await get('channels',{part:'snippet,contentDetails,statistics',
    id:channels.map(x=>x.channelId).join(',')})
  meta=Array.isArray(c?.items)?c.items:[]
 }
 const metaMap=new Map(meta.map(x=>[x.id,x]))
 const observed=[]
 const candidateIds=[]
 const allIds=new Set()
 for(const channel of channels){
  const info=metaMap.get(channel.channelId)
  const uploads=info?.contentDetails?.relatedPlaylists?.uploads
  const record={channelId:channel.channelId,label:clean(info?.snippet?.title||channel.label),
    referenceCount:channel.oldVideos,playlistStatus:uploads?'available':'not-present',
    videoCount:Number(info?.statistics?.videoCount)||null,listed:0,pages:0,
    detailCount:0,eligible:0}
  if(uploads){
   let token=null
   for(let page=0;page<MAX_PAGES;page++){
    if(candidateIds.length>=MAX_UPLOAD_IDS){record.playlistStatus='sample-cap';break}
    let payload
    try{
     const p={part:'snippet,contentDetails',playlistId:uploads,maxResults:50}
     if(token)p.pageToken=token
     payload=await get('playlistItems',p)
    }catch{
     record.playlistStatus='not-readable';break
    }
    record.pages++
    const items=Array.isArray(payload?.items)?payload.items:[]
    record.listed+=items.length
    for(const item of items){
     const id=item?.contentDetails?.videoId||item?.snippet?.resourceId?.videoId
     if(isVideoId(id)&&!allIds.has(id)&&candidateIds.length<MAX_UPLOAD_IDS){
      candidateIds.push(id);allIds.add(id)
     }
    }
    token=typeof payload?.nextPageToken==='string'&&payload.nextPageToken
      ?payload.nextPageToken:null
    if(!token)break
   }
  }
  observed.push(record)
 }
 const details=new Map()
 for(let i=0;i<candidateIds.length;i+=50){
  const p=await get('videos',{part:'snippet,contentDetails,status',id:candidateIds.slice(i,i+50).join(',')})
  for(const video of p.items||[])if(isVideoId(video.id))details.set(video.id,video)
 }
 const eligible=[]
 const titles=new Set()
 for(const id of candidateIds){
  const v=details.get(id)
  if(!v||!v.snippet?.channelId)continue
  const channel=observed.find(c=>c.channelId===v.snippet.channelId)
  if(channel)channel.detailCount++
  if(v.status?.privacyStatus!=='public'||durationMinutes(v.contentDetails?.duration)<60||
    deValue(v.contentDetails?.regionRestriction)==='excluded')continue
  const title=clean(v.snippet?.title),titleKey=keyForTitle(title)
  if(!titleKey||titles.has(titleKey))continue
  titles.add(titleKey)
  eligible.push({id,title,channelId:v.snippet.channelId,channel:clean(v.snippet.channelTitle),
   minutes:durationMinutes(v.contentDetails?.duration),
   deSignal:getRegionSignal(v.contentDetails?.regionRestriction)})
  if(channel)channel.eligible++
 }
 const lines=[
  '# YouTube Movies G1 – public channel-upload feed reachability audit','',
  '- Timestamp: '+at(),
  '- Read-only YouTube Data API; requests: '+calls+'/'+MAX_REQUESTS,
  '- 12 prior video references -> real channel IDs -> public uploads playlist (if present) -> batched video details.',
  '- A matching YouTube Movies channel label or a public uploads playlist **DOES NOT prove an official store catalog, licensing, paid offer, price or TMDB match**.',
  '- Channels without visible uploads or with inaccessible playlist entries are an information gap, **not** a proof that a video/film is unavailable.',
  '- No scraping, purchases, Firestore, provider badge, catalog, APK or production update.',
  '',
  '## Source reachability','',
  '- Original references resolved by videos.list: '+hits.length+'/'+REFERENCE_IDS.length,
  '- Distinct underlying channel IDs: '+byChannel.size,
  '- Channels sampled (top by references, at most '+MAX_CHANNELS+'): '+observed.length,
  '- Unique uploads video IDs examined: '+candidateIds.length+'/'+MAX_UPLOAD_IDS,
  '- videos.list upload details retrieved: '+details.size,
  '- 60+ min public, DE not explicitly excluded, distinct title candidates: **'+eligible.length+'**',
  '',
  '| Channel name (API) | channelId | Prior reference count | Public upload feed | Pages | IDs listed | Film-length candidates |',
  '| --- | --- | ---: | --- | ---: | ---: | ---: |',
  ...observed.map(x=>'| '+x.label+' | '+x.channelId+' | '+x.referenceCount+' | '+
   x.playlistStatus+' | '+x.pages+' | '+x.listed+' | '+x.eligible+' |'),
  '',
  '## Sample titles from upload listings (not yet TMDB-verified)','',
  '| # | Name | Video-ID | Runtime | DE signal | Channel |',
  '| ---: | --- | --- | ---: | --- | --- |',
  ...eligible.slice(0,60).map((v,i)=>'| '+(i+1)+' | '+v.title+' | '+v.id+
    ' | '+v.minutes.toFixed(1)+' min | '+v.deSignal+' | '+v.channel+' |'),
  '',
  '## Decision boundary','',
  '- If public channel upload playlists expose many eligible titles, use them only as G1 *candidates* after film identity, legal and DE-availability screening.',
  '- If playlists are empty/inaccessible, do not replace them with undocumented storefront APIs or misclassify publisher films. Next lawful G1 approach: precise TMDB-provider-DE-seeded title/video matching with controlled search quota.',
  '- The 50 distinct verified-film target has NOT automatically passed based on a playlist title or upload count. Actual candidate coverage/quality must be reported separately.',
  ''
 ]
 return {calls,channels:observed,eligible,report:lines.join('\n')}
}
async function main(){
 const key=getSecret()
 const result=await audit({api:(e,p)=>youtubeGet(e,p,key)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile('artifacts/youtube-movies-g1/channel-uploads.md',result.report+'\n',{mode:0o600})
 console.log('G1 channel-uploads reachability complete; '+result.calls+' API calls, '+result.eligible.length+' tentative long-film video candidates. Research artifact only.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('G1 channel-uploads probe failed: '+String(e?.message||'unknown').slice(0,130));process.exitCode=1})
