/**
 * G2 YouTube LIVE source-adapter PRE-IMPORT acceptance.
 * One chosen publisher channel and max 20 of its uploads. Never combine channels.
 * Uses the frozen v1 matcher; does not execute a catalog/Firestore/provider write.
 */
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet,SOURCES} from './youtube-api-smoke.mjs'
import {prepareYouTubeMovieSearchTitle} from './youtube-g2-title-query-prep.mjs'
import {scoreCandidate,classifyVideo} from './youtube-g1-matcher-v1.mjs'
import {normalizeYoutubeVideoCandidate} from '../src/sources/adapters/youtubeContractMapper.js'
import {buildYoutubeTitleImportPreview} from '../src/sources/youtubeTitleImportPreview.js'

// Exact YouTube VIDEO-ID provenance from the successful G2 run #39737252995.
// Re-read metadata LIVE for these 20, never compare against newly uploaded videos.
export const NETZKINO_BASELINE_20_VIDEO_IDS = Object.freeze([
 'gCCgGmtEuNk','RmoK2khmyiE','wOkwIsL2p44','P2TSjraNZSM',
 'mdQNb0GWiHo','pcOGi8dpIdY','J-Cx2UexjnY','ucRKSNwzM_w',
 'm8V3_4uhtzI','2-S8M7tg1U0','mXZDKGZoVOg','uQmypOH0xE4',
 'DR0Qb7LMa5g','4IX90tdOIEg','5xjC8dfrkv4','zK7Oa9yk8GA',
 'fHoNjdSjn4Y','emcEtLS6W8c','M35e4dwrIJU','3xmyrfDhSq8',
])
export const BASELINE_G2_RUN=39737252995
export const BASELINE_MATCH_COUNTS=Object.freeze({
 'review-no-movie-candidate':13,
 'review-multiple-film-works':3,
 'review-leading-film-hypothesis':2,
 'review-explicit-year-conflict':1,
 'review-source-screened-out':1,
})
export const MAX_SOURCE_VIDEOS=20
export const MAX_YOUTUBE_CALLS=3
export const MAX_TMDB_CALLS=100
export const OUTPUT='artifacts/youtube-g2/preimport-live-report.md'
const id=/^[A-Za-z0-9_-]{11}$/
const clean=s=>String(s??'').replace(/[<>|\r\n]/g,' ').replace(/\s+/g,' ').trim().slice(0,110)
const unique=items=>[...new Set(items)]
const numId=x=>Number.isInteger(Number(x))&&Number(x)>0?Number(x):null
const mkDate=x=>{
 const t=new Date(x)
 if(!Number.isFinite(t.getTime()))throw Error('Bad live time')
 return t.toISOString()
}
function tmdbIds(body) {
 return unique((Array.isArray(body?.results)?body.results:[])
  .map(x=>numId(x?.id)).filter(Boolean)).slice(0,3)
}
export async function runYoutubeLivePreflight({
 youtube,tmdb,source=SOURCES[1],knownTitleRefs=null,limit=MAX_SOURCE_VIDEOS,
 videoIdsSnapshot=null,
 now=()=>new Date().toISOString(),
}={}) {
 if(typeof youtube!=='function'||typeof tmdb!=='function')throw Error('Need read-only API callbacks')
 if(!source?.channelId||!id.test(source.channelId.replace(/^UC/, ''))){ 
  // Channel IDs are normally 24 chars, not video IDs. Check prefix and shape separately.
  if(!/^UC[A-Za-z0-9_-]{22}$/.test(source?.channelId||''))throw Error('One valid single publisher channel required')
 }
 if(!Number.isInteger(limit)||limit<1||limit>MAX_SOURCE_VIDEOS)throw Error('Limit out of range')
 const replay=Array.isArray(videoIdsSnapshot)
 // Validate the replay manifest BEFORE any paid/limited external API request.
 if(replay && (
  videoIdsSnapshot.length!==limit
  || videoIdsSnapshot.some(x=>!id.test(String(x||'')))
  || new Set(videoIdsSnapshot).size!==videoIdsSnapshot.length
 ))throw Error('Pinned video-ID replay snapshot is missing/duplicate/invalid')
 let youtubeCalls=0,tmdbCalls=0
 const runAt=mkDate(now())
 const getYoutube=async(path,params)=>{
  if(!['channels','playlistItems','videos'].includes(path)||++youtubeCalls>MAX_YOUTUBE_CALLS)
   throw Error('Live YouTube API call cap')
  return youtube(path,params)
 }
 const getTmdb=async(path,params)=>{
  if(!/^\/(?:search\/movie|search\/tv|movie\/[1-9]\d*)$/.test(path)
    ||++tmdbCalls>MAX_TMDB_CALLS)throw Error('Live TMDB API call cap')
  return tmdb(path,params)
 }
 const ch=await getYoutube('channels',{part:'snippet,contentDetails',id:source.channelId})
 const channel=(Array.isArray(ch?.items)?ch.items:[]).find(x=>x.id===source.channelId)
 const uploads=channel?.contentDetails?.relatedPlaylists?.uploads
 if(!channel||!uploads)throw Error('Publisher channel/official uploads playlist missing')
 let videoIds
 if(replay){
  videoIds=[...videoIdsSnapshot]
 }else{
  const playlist=await getYoutube('playlistItems',{
   part:'snippet,contentDetails',playlistId:uploads,maxResults:limit,
  })
  videoIds=unique((Array.isArray(playlist?.items)?playlist.items:[])
   .map(x=>x?.contentDetails?.videoId).filter(x=>id.test(String(x||'')))).slice(0,limit)
 }
 const raw=videoIds.length?await getYoutube('videos',{
  part:'snippet,contentDetails,status',id:videoIds.join(','),
 }):{items:[]}
 const observed=videoIds.map(videoId=>(Array.isArray(raw?.items)?raw.items:[])
   .find(x=>x.id===videoId)).filter(Boolean)
 // Never aggregate unrelated channel owners, even in the preflight report.
 if(observed.some(x=>x?.snippet?.channelId!==source.channelId))
  throw Error('Cross-channel video found – abort source preflight')
 const videos=observed.map(x=>normalizeYoutubeVideoCandidate(x,{observedAt:runAt})).filter(Boolean)
 const rows=[]
 for(const video of videos){
  if(!video.screening.eligible){
   rows.push({video,verdict:{status:'review-source-screened-out',topCandidates:[],
    confirmedFilm:false,confirmedOffer:false},errors:[]})
   continue
  }
  const prepared=prepareYouTubeMovieSearchTitle(video.title)
  let filmIds=[],tvIds=[],scored=[],errors=[]
  const movieLists=[]
  try{
   for(const query of prepared.queries){
    const res=await getTmdb('/search/movie',{
     language:'de-DE',query,include_adult:'false',page:1,
    })
    movieLists.push(tmdbIds(res))
   }
   // Cover both main title and alternate short title, without a query
   // widening from one publisher to a second YouTube source.
   filmIds=unique([
    ...movieLists.flatMap(list=>list.slice(0,2)),
    ...movieLists.flat(),
   ]).slice(0,3)
   const tv=await getTmdb('/search/tv',{
    language:'de-DE',query:prepared.matchingTitle,include_adult:'false',page:1,
   })
   tvIds=tmdbIds(tv)
   for(const tmdbId of filmIds){
    const detail=await getTmdb('/movie/'+tmdbId,{
     language:'de-DE',append_to_response:'alternative_titles,credits,external_ids',
    })
    if(Number(detail?.id)!==tmdbId)throw Error('TMDB detail ID changed')
    scored.push(scoreCandidate({
     // Only the pre-processed title is compared to TMDB; original raw
     // YouTube source title remains untouched in the video provenance.
     title:prepared.matchingTitle,minutes:video.minutes,
     category:video.category,region:video.deRegionSignal,
    },detail))
   }
  }catch(e){errors.push(clean(e?.message))}
  const verdict=classifyVideo({
   title:prepared.matchingTitle,minutes:video.minutes,
   category:video.category,region:video.deRegionSignal,
  },scored,tvIds,{incomplete:errors.length>0,asOfYear:Number(runAt.slice(0,4))})
  rows.push({video,prepared,verdict,errors})
  // Reject ambiguous or failed partial match before any potential title publication.
  if(errors.some(x=>/quota|hard cap|429/i.test(x)))break
 }
 const preview=buildYoutubeTitleImportPreview(rows,{knownTitleRefs,reportGeneratedAt:runAt})
 const counts={...preview.counts, sourceVideoIds:videoIds.length,
  detailResolved:videos.length, matcherReviewed:rows.filter(x=>x.video.screening.eligible).length,
  youtubeCalls,tmdbCalls, replaySourceIds:replay}
 const lines=[
  '# MovieHub YouTube G2 – REAL single-publisher API / frozen Matcher v1 pre-import test','',
  '- Generated: '+runAt,
  '- Publisher channel ID: '+source.channelId+' ('+clean(channel.snippet?.title||source.name)+').',
  '- ONE publisher channel only; '+(replay
   ?'exact 20 original IDs from run #'+BASELINE_G2_RUN+' re-fetched live (NOT recent uploads)'
   :'latest official publisher upload playlist')+'. No other channel is combined.',
  '- YouTube API calls: '+youtubeCalls+'/'+MAX_YOUTUBE_CALLS+'; TMDB calls: '+tmdbCalls+'/'+MAX_TMDB_CALLS+'.',
  '- Query changes: SEO actor/marketing text removed before searches; frozen Matcher v1 UNCHANGED.',
  '- Fixed-baseline replay: '+replay+'; unavailable previous IDs: '+(videoIds.length-videos.length)+'.',
  ...(replay?['- Original run #'+BASELINE_G2_RUN+' statuses: '+JSON.stringify(BASELINE_MATCH_COUNTS)+'.']:[]),
  '- Live source Video-IDs '+counts.sourceVideoIds+'; resolved '+counts.detailResolved+'; eligible matcher-reviewed '+counts.matcherReviewed+'.',
  '- Existing-title comparison: '+(preview.catalogStatus==='known'?'against provided canonical catalog':'UNKNOWN – no live catalog snapshot supplied')+'.',
  '- Preview existing='+counts.matchedExisting+', new-title candidates='+counts.proposedNew+
   ', catalog-unknown='+counts.catalogUnknown+', review='+counts.review+
   ', screened-out='+counts.screenedOut+'.',
  '- IMPORTANT: Matcher output is a HYPOTHESIS, not measured true-positive accuracy. Independent human verification is still required.',
  '- NEVER import based only on a leading TMDB match, video duration, country restriction, or video title.',
  '- NO production catalog, Firestore, Nightly, app, provider badges, player, TMDB match approvals or Offer data were written.',
  '- This report does not determine movie-license rights, DE app playback, free/ads/rent/buy/subscription offers, or content owner identity.','',
  '## Per-video QA – all review-only','',
  '| YouTube Video ID / title | Search query (cleaned) | Length min | Screen | TMDB top-3 hypotheses / runtime Δ | Matcher v1 | Canonical reconciliation preview |',
  '| --- | --- | ---: | --- | --- | --- |',
  ...preview.candidates.map(c=>{
   const row=rows.find(r=>r.video.videoId===c.videoId)
   return '| ['+clean(c.title)+']('+c.youtubeWatchUrl+') '+c.videoId+
    ' | '+clean(row?.prepared?.queries?.join(' / ')||'–')+
    ' | '+(row?.video?.minutes??'?')+
    ' | '+(row?.video?.screening?.rejectionReason||'eligible')+
    ' | '+(row?.verdict?.topCandidates||[]).map(x=>x.tmdbId+' ('+(x.runtimeDelta??'?')+'min)').join('; ')+
    ' | '+c.matcherStatus+' | '+c.disposition+' |'
  }), '',
  '## Acceptance before real publication','',
  '- Confirm work identity and edition against the ACTUAL video (not only TMDB), and independently validate German playback and allowed access type.',
  '- Evaluate correctly and incorrectly identified films using independent labels. No fabricated success rate from relative matcher leading-hypothesis counts.',
  '- Catalog snapshot must be real and current before classifying matching works as “new” vs “existing”. GitHub public/catalog.json is fallback with zero titles; it is NOT the live MovieHub catalog.',
  '- Before automatic multi-channel import, resolve YouTube API Developer Policies III.E.2 Content Owner aggregation, legal basis, retention and individual DE offer evidence. Single account is NOT a policy exemption.',
  '- NEVER publish this preflight file as a public catalog, enable scheduled multi-channel discovery or create automatic source badges from it.',
  ''
 ]
 return {rows,preview,stats:counts,report:lines.join('\n')}
}
async function tmdbGet(path,params,token){
 const u=new URL('https://api.themoviedb.org/3'+path)
 for(const [key,value] of Object.entries(params))u.searchParams.set(key,String(value))
 const r=await fetch(u,{headers:{accept:'application/json',authorization:'Bearer '+token},
  signal:AbortSignal.timeout(14000)})
 if(!r.ok)throw Error('TMDB HTTP '+r.status)
 return r.json()
}
async function main(){
 const secret=process.env.TMDB_API_READ_TOKEN
 if(!secret||secret.length<15)throw Error('TMDB read token unavailable')
 // Only a single source index may be used in one preflight; no multi-owner loop.
 const source=SOURCES[1]
 const catalogFile=process.env.YOUTUBE_G2_READONLY_CATALOG_SNAPSHOT
 let knownTitleRefs=null
 if(catalogFile){
  const loaded=JSON.parse(await readFile(catalogFile,'utf8'))
  if(loaded?.source==='fallback')throw Error('Fallback catalog is not a live catalog')
  if(!Array.isArray(loaded?.titles))throw Error('Invalid canonical catalog snapshot')
  knownTitleRefs=loaded.titles.map(x=>({
   tmdbId:x.tmdbId,mediaType:x.type==='series'?'series':'movie',
  }))
 }
 const key=getSecret()
 const r=await runYoutubeLivePreflight({
  source,knownTitleRefs,limit:MAX_SOURCE_VIDEOS,
  videoIdsSnapshot:NETZKINO_BASELINE_20_VIDEO_IDS,
  youtube:(p,q)=>youtubeGet(p,q,key),
  tmdb:(p,q)=>tmdbGet(p,q,secret),
 })
 await mkdir('artifacts/youtube-g2',{recursive:true})
 await writeFile(OUTPUT,r.report+'\n',{mode:0o600})
 console.log('Single-source, read-only YouTube G2 preflight: '+r.stats.sourceVideoIds+
  ' Video IDs; '+r.stats.youtubeCalls+' YouTube / '+r.stats.tmdbCalls+
  ' TMDB GETs. No catalog/provider writes.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('YouTube G2 preflight failed: '+clean(e?.message));process.exitCode=1})
