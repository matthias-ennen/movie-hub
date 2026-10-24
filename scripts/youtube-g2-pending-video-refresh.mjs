/**
 * Exact known video ID refresh for ALL still unresolved editorial playlist
 * entries.  No search.list, TMDB search, user profile writes or offering
 * publication. Public videos.list metadata is NOT playback/DE offer proof.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {youtubeGet,getSecret} from './youtube-api-smoke.mjs'
export const OPEN55_KIND='moviehub-youtube-g2-pending-playlist-video-metadata-refresh'
export const OPEN55_OUTPUT='artifacts/youtube-g2/pending-video-metadata-refresh'
export const OPEN55_INPUT='artifacts/youtube-g2/source-reviewed/artifacts/youtube-g2/actionable-review-queue/qa.json'
const VIDEO=/^[A-Za-z0-9_-]{11}$/
const FAST_REVIEW_LANES=new Set([
  'existing-movie-needs-identity-proof',
  'search-only-needs-identity-proof',
  'matcher-needs-review',
])
const COUNT_FIELDS=['catalogWrites','firestoreWrites','badgeWrites','providerWrites','nightlyWrites']
function counts(rows,kind){
  return Object.fromEntries([...new Set(rows.map(kind))].sort().map(x=>
    [x,rows.filter(row=>kind(row)===x).length]))
}
function parseDuration(value){
  const match=/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(value??''))
  if(!match)return null
  const total=Number(match[1]||0)*1440+Number(match[2]||0)*60
    +Number(match[3]||0)+Number(match[4]||0)/60
  return Number.isFinite(total)&&total>0?Math.round(total*10)/10:null
}
export function planPendingCuratedVideoRefresh(qa,{now=new Date().toISOString()}={}){
  const at=Date.parse(now),then=Date.parse(qa?.generatedAt)
  if(qa?.kind!=='moviehub-youtube-g2-actionable-review-queue'
    ||qa.schemaVersion!==1||qa.privateArtifact!==true
    ||qa.publicationPermitted!==false||qa.independentVerifiedDEOffers!==0
    ||qa.newUnverifiedDatabaseWrites!==0
    ||!Number.isFinite(at)||!Number.isFinite(then)
    ||at-then< -60000||at-then>7*86400000
    ||!Number.isInteger(qa.sourceVideoIds)||qa.sourceVideoIds<1
    ||!Number.isInteger(qa.publishedPlaylistLinks)
    ||!Number.isInteger(qa.pendingReview)||qa.pendingReview<1
    ||qa.accountedForVideos!==qa.sourceVideoIds||qa.missingVideos!==0
    ||qa.publishedPlaylistLinks+qa.pendingReview!==qa.sourceVideoIds
    ||!Array.isArray(qa.items)||qa.items.length!==qa.sourceVideoIds
    ||!Array.isArray(qa.prioritizedReview)
    ||qa.prioritizedReview.length!==qa.pendingReview
    ||new Set(qa.items.map(x=>x.videoId)).size!==qa.sourceVideoIds
    ||!qa.lanes||Object.values(qa.lanes).reduce((n,v)=>n+v,0)!==qa.pendingReview)
    throw Error('YOUTUBE_PENDING_SOURCE_QA_NOT_TRUSTED')
  const all=new Map()
  for(const item of qa.items){
    if(!VIDEO.test(String(item?.videoId||''))
      ||!['FREE','R&B'].includes(item.playlistClass)
      ||item.url!=='https://www.youtube.com/watch?v='+item.videoId
      ||item.sourceVerifiedDEOffer!==false
      ||!['review-only','playlist-link-published'].includes(item.publicationStatus))
      throw Error('YOUTUBE_PENDING_SOURCE_VIDEO_INVALID')
    all.set(item.videoId,item)
  }
  const open=[]
  for(const row of qa.prioritizedReview){
    const source=all.get(row?.videoId)
    if(!source||source.publicationStatus!=='review-only'
      ||row.publicationStatus!=='review-only'
      ||!VIDEO.test(String(row.videoId||''))
      ||row.lane!==source.lane||row.playlistClass!==source.playlistClass
      ||row.sourceVerifiedDEOffer!==false
      ||!Array.isArray(row.tmdbAlternatives)
      ||row.tmdbAlternatives.length>3
      ||row.tmdbAlternatives.some(c=>!Number.isInteger(c?.tmdbId)||c.tmdbId<=0)
      ||(row.suggestedTmdbId!==null
        &&(!Number.isInteger(row.suggestedTmdbId)||row.suggestedTmdbId<=0))
      ||(row.suggestedTmdbId!==null
        &&row.tmdbAlternatives[0]?.tmdbId!==row.suggestedTmdbId))
      throw Error('YOUTUBE_PENDING_REVIEW_ROW_INVALID')
    open.push(row)
  }
  if(new Set(open.map(r=>r.videoId)).size!==qa.pendingReview
    ||qa.items.some(x=>x.publicationStatus==='review-only'
      &&!open.some(r=>r.videoId===x.videoId))
    ||JSON.stringify(counts(open,r=>r.lane))!==JSON.stringify(qa.lanes))
    throw Error('YOUTUBE_PENDING_REVIEW_COVERAGE_MISMATCH')
  // Each YouTube videos.list request may contain at most 50 video IDs.
  const chunks=[]
  for(let n=0;n<open.length;n+=50)chunks.push(open.slice(n,n+50).map(x=>x.videoId))
  if(chunks.length>4)throw Error('YOUTUBE_PENDING_VIDEOS_LIST_BUDGET')
  return {now,sourceVideoIds:qa.sourceVideoIds,published:qa.publishedPlaylistLinks,
    pending:open.length,open,chunks}
}
export async function refreshPendingCuratedMetadata({qa,youtubeApi,now=new Date().toISOString()}={}){
  const plan=planPendingCuratedVideoRefresh(qa,{now})
  if(typeof youtubeApi!=='function')throw Error('YOUTUBE_PENDING_READ_ONLY_API_REQUIRED')
  const videoById=new Map()
  let calls=0
  const requested=new Set(plan.open.map(x=>x.videoId))
  for(const ids of plan.chunks){
    if(++calls>4)throw Error('YOUTUBE_PENDING_VIDEO_LOOKUP_BUDGET_EXCEEDED')
    const result=await youtubeApi('videos',{part:'snippet,contentDetails,status',id:ids.join(',')})
    if(!Array.isArray(result?.items)||result.items.length>ids.length)
      throw Error('YOUTUBE_PENDING_VIDEO_API_RESPONSE_INVALID')
    for(const v of result.items){
      if(!requested.has(v?.id)||videoById.has(v.id))throw Error('YOUTUBE_PENDING_VIDEO_ID_MISMATCH')
      videoById.set(v.id,v)
    }
  }
  const rows=plan.open.map(row=>{
    const video=videoById.get(row.videoId)
    let videoStatus='metadata-not-returned'
    let minutes=null,regionSignal='unknown'
    if(video){
      const v=video.contentDetails?.regionRestriction
      regionSignal=v?.blocked?.includes('DE')?'DE-blocked-metadata'
        :Array.isArray(v?.allowed)&&!v.allowed.includes('DE')?'DE-not-allowed-metadata'
        :Array.isArray(v?.allowed)?'DE-allowed-metadata':'not-stated'
      minutes=parseDuration(video.contentDetails?.duration)
      videoStatus=video.status?.privacyStatus==='public'
        &&video.snippet?.title&&minutes
        ?'video-details-current':'video-details-not-eligible'
      if(minutes!==null&&minutes<30)videoStatus='short-video-metadata'
      // DE exclusion is stricter than a duration issue: preserve this
      // explicit provider signal as the primary reason.
      if(regionSignal==='DE-blocked-metadata'||regionSignal==='DE-not-allowed-metadata')
        videoStatus='DE-excluded-metadata'
    }
    const originallyMissing=row.lane==='missing-video-metadata'
    return {
      videoId:row.videoId,playlistClass:row.playlistClass,
      existingReviewLane:row.lane,priority:row.priority,
      recordedSourceTitle:row.title,currentVideoTitle:
        videoStatus==='video-details-current'?String(video.snippet.title).slice(0,150):null,
      suggestedTmdbId:row.suggestedTmdbId,
      alternatives:row.tmdbAlternatives,
      videoStatus,regionSignal,minutes,
      previouslyMissingMetadata:originallyMissing,
      missingMetadataRecovered:originallyMissing&&videoStatus==='video-details-current',
      identityReviewReady:FAST_REVIEW_LANES.has(row.lane)
        &&videoStatus==='video-details-current'
        &&Number.isInteger(row.suggestedTmdbId)
        &&row.tmdbAlternatives[0]?.tmdbId===row.suggestedTmdbId,
      approvedWorkIdentity:false,verifiedGermanOffer:false,
      approvedPlaybackRoute:null,
    }
  })
  const summary={
    kind:OPEN55_KIND,sourceVideoIds:plan.sourceVideoIds,
    publishedEditorialLinks:plan.published,pendingVideoIds:plan.pending,
    videosListCalls:calls,searchListCalls:0,
    videoStatusCounts:counts(rows,r=>r.videoStatus),
    pendingLaneCounts:counts(rows,r=>r.existingReviewLane),
    previouslyMissingMetadata:rows.filter(x=>x.previouslyMissingMetadata).length,
    recoveredMissingMetadata:rows.filter(x=>x.missingMetadataRecovered).length,
    readyForIndividualIdentityReview:rows.filter(x=>x.identityReviewReady).length,
    verifiedGermanOffers:0,approvedDirectRoutes:0,
    firestoreWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
    generatedAt:now,privateArtifact:true,publicationPermitted:false,
  }
  if(summary.sourceVideoIds!==summary.publishedEditorialLinks+summary.pendingVideoIds
    ||summary.pendingVideoIds!==rows.length
    ||summary.videosListCalls!==plan.chunks.length
    ||summary.searchListCalls!==0)
    throw Error('YOUTUBE_PENDING_REFRESH_ACCOUNTING_FAILED')
  return {summary,rows,reviewPriority:rows.filter(x=>x.identityReviewReady)}
}
export function pendingRefreshMarkdown(data){
  const {summary:s,reviewPriority}=data
  if(s?.kind!==OPEN55_KIND||s.searchListCalls!==0||s.approvedDirectRoutes!==0
    ||!s.privateArtifact)throw Error('YOUTUBE_PENDING_REPORT_INVALID')
  const clean=x=>String(x??'').replace(/[\r\n|<>]/g,' ').slice(0,160)
  return [
    '# MovieHub YouTube – bekannte offene Playlist-Videos LIVE ohne Suche aktualisiert',
    '',
    '- Erfasste Playlist-Videos: '+s.sourceVideoIds,
    '- Redaktionell zugeordnete Filmvideos: '+s.publishedEditorialLinks,
    '- Weiterhin offene bekannte Video-IDs: '+s.pendingVideoIds,
    '- videos.list Aufrufe: '+s.videosListCalls+'; search.list Aufrufe: **0**',
    '- Noch fehlende Metadaten urspruenglich: '+s.previouslyMissingMetadata,
    '- Davon nach API-Abfrage jetzt verfügbar: '+s.recoveredMissingMetadata,
    '- Videometadaten-Status: '+JSON.stringify(s.videoStatusCounts),
    '- Manuell priorisierbare konkrete Filmhypothesen: '+s.readyForIndividualIdentityReview,
    '- **Alle Filmidentitaeten und DE-Angebote bleiben ungeprueft; 0 Direktlink-Freigaben / 0 Produktiv-Writes.**',
    '',
    '| MovieHub Filmhypothese | Video ID | Titel im letzten Deploy | Review-Klasse |',
    '| --- | --- | --- | --- |',
    ...reviewPriority.map(r=>'| movie:'+r.suggestedTmdbId+' | '+r.videoId
      +' | '+clean(r.recordedSourceTitle)+' | '+r.existingReviewLane+' |'),
    '',
  ].join('\n')
}
export async function runPendingRefresh({
  qaPath=OPEN55_INPUT,output=OPEN55_OUTPUT,
  youtubeKey=getSecret(),
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_PENDING_REFRESH_NO_WRITES')
  const qa=JSON.parse(await readFile(qaPath,'utf8'))
  const result=await refreshPendingCuratedMetadata({
    qa,youtubeApi:(path,params)=>youtubeGet(path,params,youtubeKey),
  })
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/qa.json',JSON.stringify(result,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',pendingRefreshMarkdown(result)+'\n',{mode:0o600}),
  ])
  console.log(JSON.stringify(result.summary))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runPendingRefresh().catch(e=>{
    console.error('YOUTUBE_PENDING_REFRESH_FAILED_CLOSED: '+e.message)
    process.exitCode=1
  })
}
