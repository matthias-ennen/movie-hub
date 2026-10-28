/**
 * Read-only recheck of the nine exact video IDs still present in the 27 Oct
 * curated FREE inventory but omitted by videos.list. This is provenance QA,
 * NEVER film identity, a verified German offer, or a publication input.
 */
import {mkdir, writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret, youtubeGet} from './youtube-api-smoke.mjs'
import {CURATED_FREE_PLAYLIST} from './youtube-g2-curated-source-sync.mjs'

export const TARGETS=Object.freeze([
  ['xWkLYgaorAI',42], ['qOyaKLGLVTM',43], ['YsJu3W7zNSU',44],
  ['eOWc9NNvBjU',45], ['8HVSET2vIU4',46], ['o1dYrexR3-A',47],
  ['iSH8ck3VfZM',48], ['7nIkx9bCbkk',49], ['oxuSEVhqd1Q',50],
].map(([videoId,oldPosition])=>Object.freeze({videoId,oldPosition})))
export const OUTPUT='artifacts/youtube-g2/nine-missing-source-probe/qa.json'
const VIDEO=/^[A-Za-z0-9_-]{11}$/
const allowedLabels=new Set(['private video','deleted video'])

function labelClass(value){
  const valueLower=String(value??'').trim().toLowerCase()
  return allowedLabels.has(valueLower)
    ? (valueLower==='private video'?'private-placeholder':'deleted-placeholder')
    : 'other-or-not-supplied'
}

/** At most 3 playlistItems.list calls + 1 videos.list call, zero search. */
export async function recheckNineMissingVideos({youtubeApi,now=()=>new Date().toISOString()}={}){
  if(typeof youtubeApi!=='function')throw Error('READ_ONLY_YOUTUBE_CALLBACK_REQUIRED')
  const observedAt=new Date(now()).toISOString()
  const expected=new Set(TARGETS.map(x=>x.videoId))
  const listed=new Map()
  const visitedTokens=new Set()
  let pageToken=null, pages=0, fullyScanned=false
  do{
    if(pages>=3)throw Error('YOUTUBE_NINE_PLAYLIST_PAGINATION_LIMIT')
    const params={part:'snippet,contentDetails,status',playlistId:CURATED_FREE_PLAYLIST,maxResults:50}
    if(pageToken)params.pageToken=pageToken
    const res=await youtubeApi('playlistItems',params)
    if(!res||!Array.isArray(res.items))throw Error('YOUTUBE_NINE_INVALID_PLAYLIST_RESPONSE')
    pages++
    for(const item of res.items){
      const id=item?.contentDetails?.videoId??item?.snippet?.resourceId?.videoId
      if(!expected.has(id))continue
      if(listed.has(id))throw Error('YOUTUBE_NINE_DUPLICATE_PLAYLIST_ID')
      listed.set(id,{
        position:Number.isInteger(item?.snippet?.position)?item.snippet.position:null,
        itemLabelClass:labelClass(item?.snippet?.title),
        playlistItemPrivacy:['public','private','unlisted'].includes(item?.status?.privacyStatus)
          ?item.status.privacyStatus:'unknown',
      })
    }
    const next=typeof res.nextPageToken==='string'?res.nextPageToken:null
    if(next){
      if(visitedTokens.has(next))throw Error('YOUTUBE_NINE_REPEATED_PAGE_TOKEN')
      visitedTokens.add(next)
    }
    pageToken=next
    fullyScanned=!next
  }while(pageToken)
  const detailResult=await youtubeApi('videos',{
    part:'snippet,contentDetails,status',id:TARGETS.map(x=>x.videoId).join(','),
  })
  if(!detailResult||!Array.isArray(detailResult.items))
    throw Error('YOUTUBE_NINE_INVALID_VIDEO_RESPONSE')
  const resolved=new Set()
  for(const item of detailResult.items){
    if(!VIDEO.test(String(item?.id??''))||!expected.has(item.id)
      ||resolved.has(item.id))throw Error('YOUTUBE_NINE_UNEXPECTED_VIDEO_RESPONSE')
    resolved.add(item.id)
  }
  const items=TARGETS.map(({videoId,oldPosition})=>{
    const current=listed.get(videoId)??null
    const status=!current?'no-longer-in-free-playlist'
      :resolved.has(videoId)?'listed-and-details-resolved'
        :'listed-but-video-details-absent'
    return {videoId,previousPlaylistPosition:oldPosition,
      currentPlaylistPosition:current?.position??null,
      moved:current!==null&&current.position!==oldPosition,
      playlistItemLabelClass:current?.itemLabelClass??null,
      playlistItemPrivacy:current?.playlistItemPrivacy??null,
      videosListReturned:resolved.has(videoId),status}
  })
  const counts=Object.fromEntries([
    'listed-but-video-details-absent','listed-and-details-resolved',
    'no-longer-in-free-playlist',
  ].map(key=>[key,items.filter(x=>x.status===key).length]))
  return {
    kind:'moviehub-youtube-g2-nine-missing-readonly-probe',schemaVersion:1,
    observedAt,source:'free-curated-playlist',sourcePlaylistId:CURATED_FREE_PLAYLIST,
    baseline:'2026-10-27T17:59:54.916Z',baselineMissingVideoIds:9,
    fullyScanned,pages,apiCalls:{playlistItems:pages,videos:1,search:0},
    totalTargetIds:9,counts,items,
    independentVerifiedDEOffers:0,approvedWorkIdentities:0,
    inferredDeletionOrPrivacy:false,publicationPermitted:false,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,
  }
}
async function main(){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_NINE_NO_WRITE_MODE')
  const key=getSecret()
  const result=await recheckNineMissingVideos({
    youtubeApi:(endpoint,params)=>youtubeGet(endpoint,params,key),
  })
  await mkdir('artifacts/youtube-g2/nine-missing-source-probe',{recursive:true})
  await writeFile(OUTPUT,JSON.stringify(result,null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify({
    observedAt:result.observedAt,
    pages:result.pages,calls:result.apiCalls,
    counts:result.counts,publicationPermitted:false,
    note:'An omitted videos.list item cannot distinguish private, deleted or other inaccessible video.',
  }))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    console.error('Read-only nine-video recheck failed closed: '+error.message)
    process.exitCode=1
  })
}
