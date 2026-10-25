/**
 * Optional, link-only enhancement for EXISTING TMDB YouTube badges.
 *
 * Source: private canonical global cached VIDEO-ID recheck (videos.list only).
 * This is an estimate of the best external YouTube watch destination, NOT a
 * provider offer, verified film/cut, DE tariff, or canonical SourceEnvelope.
 * A 404/invalid/expired feed MUST retain existing YouTube title search.
 */
export const BEST_EFFORT_YOUTUBE_KIND='moviehub-youtube-best-effort-title-links'
export const BEST_EFFORT_YOUTUBE_VERSION=1
export const BEST_EFFORT_MAX_AGE_MS=7*86400000
const SOURCE_KIND='moviehub-youtube-g2-global-known-video-no-search-recheck'
const VIDEO=/^[A-Za-z0-9_-]{11}$/
const MOVIE=/^movie:[1-9]\d*$/
export const BEST_EFFORT_MAX_LINKS=250
const MAX_RESULTS=10
const MIN_SCORE=36
const MIN_MARGIN=8
const url=id=>'https://www.youtube.com/watch?v='+id
const goodDate=value=>Number.isFinite(Date.parse(value))
const key=id=>Number.isSafeInteger(Number(id))&&Number(id)>0
  ?'movie:'+Number(id):null

function empty(now,observedAt){
  return {
    kind:BEST_EFFORT_YOUTUBE_KIND,schemaVersion:BEST_EFFORT_YOUTUBE_VERSION,
    providerId:'youtube',generatedAt:new Date(now).toISOString(),sourceObservedAt:observedAt,
    sourceMode:'cached-known-video-ids-only',
    verifiedDEOffers:0,verifiedPlaybackRoutes:0,providerBadgeWrites:0,
    claimedOfferTypes:[],count:0,entries:[],
  }
}

function candidateAllowed(c){
  return c&&VIDEO.test(String(c.videoId||''))
    &&Number.isFinite(c.score)&&c.score>=MIN_SCORE
    &&c.strong===true&&c.titleLevel===4
    &&Number.isFinite(c.runtimeDelta)&&c.runtimeDelta>=0&&c.runtimeDelta<=15
    &&c.yearMismatch!==true&&c.sequelConflict!==true
    &&c.sourceTypeRisk!==true
    &&c.regionSignal!=='excluded'
}
export function buildYoutubeBestEffortLinkIndex(review,{
  now=new Date().toISOString(),
}={}){
  const time=Date.parse(now),s=review?.summary
  if(!Number.isFinite(time)||!goodDate(s?.generatedAt)
    ||time-Date.parse(s.generatedAt)<-60000
    ||time-Date.parse(s.generatedAt)>BEST_EFFORT_MAX_AGE_MS
    ||s?.kind!==SOURCE_KIND||s.publicationPermitted!==false
    ||s.privateReviewArtifact!==true||s.searchCalls!==0
    ||s.independentlyVerifiedDeOffers!==0||s.publishedDirectRoutes!==0
    ||s.firebaseWrites!==0||s.providerWrites!==0||s.catalogWrites!==0
    ||s.badgeWrites!==0
    ||!Array.isArray(review?.rows)||review.rows.length>BEST_EFFORT_MAX_LINKS
    ||s.rowsChecked!==review.rows.length
    ||new Set(review.rows.map(r=>r.tmdbId)).size!==review.rows.length
    ||review.rows.some(r=>!key(r?.tmdbId)
      ||r.publicationPermitted!==false||r.directPlaybackRoute!==null
      ||r.reviewedVideoId!==null||!Array.isArray(r.videoCandidates)
      ||r.videoCandidates.length>MAX_RESULTS
      ||!Array.isArray(r.tmdbDeOfferTypes)
      ||r.tmdbDeOfferTypes.some(t=>!['free','ads','flatrate','rent','buy'].includes(t))
      ||r.candidateDiscoveryMode!=='trusted-previous-candidate-ids'))
    throw Error('YOUTUBE_BEST_EFFORT_PRIVATE_QA_INVALID_OR_STALE')
  const index=empty(now,s.generatedAt)
  for(const row of review.rows){
    // This lane enriches a badge only when the currently rechecked TMDB
    // provider snapshot still advertises YouTube, not a general film import.
    if(row.status!=='review-single-video-candidate'
      ||row.tmdbDeOfferTypes.length===0
      ||row.videoCandidates.length<1)continue
    const [first,second]=row.videoCandidates
    if(!candidateAllowed(first)
      ||row.videoCandidates.some((v,i)=>i>0&&v.videoId===first.videoId)
      ||(second&&(!Number.isFinite(second.score)
        ||first.score-second.score<MIN_MARGIN)))continue
    const movieKey=key(row.tmdbId)
    index.entries.push({
      key:movieKey,mediaType:'movie',tmdbId:Number(row.tmdbId),
      videoId:first.videoId,target:url(first.videoId),
      score:first.score,rankMargin:second?first.score-second.score:null,
      observedAt:s.generatedAt,validUntil:new Date(
        Date.parse(s.generatedAt)+BEST_EFFORT_MAX_AGE_MS).toISOString(),
      provenance:'global-known-video-metadata-review',
      quality:'probable-video-not-verified',
    })
  }
  // A single YouTube video may superficially match two different TMDB
  // films. Neither match is safe as an exact route: quarantine both while
  // retaining every independent, strong link in the published index.
  const videoFrequency=new Map()
  for(const entry of index.entries){
    videoFrequency.set(entry.videoId,(videoFrequency.get(entry.videoId)||0)+1)
  }
  index.entries=index.entries.filter(e=>videoFrequency.get(e.videoId)===1)
  index.entries.sort((a,b)=>a.key.localeCompare(b.key))
  index.count=index.entries.length
  return index
}

export function selectYoutubeBestEffortTitleRoute(index,item,{
  now=Date.now(),hasYoutubeBadge=false,
}={}){
  const time=Number(now)
  if(!hasYoutubeBadge||!Number.isFinite(time)
    ||index?.kind!==BEST_EFFORT_YOUTUBE_KIND
    ||index.schemaVersion!==BEST_EFFORT_YOUTUBE_VERSION
    ||index.providerId!=='youtube'||index.sourceMode!=='cached-known-video-ids-only'
    ||index.verifiedDEOffers!==0||index.verifiedPlaybackRoutes!==0
    ||index.providerBadgeWrites!==0
    ||!Array.isArray(index.claimedOfferTypes)||index.claimedOfferTypes.length!==0
    ||!Array.isArray(index.entries)||index.count!==index.entries.length
    ||!goodDate(index.generatedAt)||!goodDate(index.sourceObservedAt)
    ||Date.parse(index.generatedAt)>time+60000
    ||time-Date.parse(index.sourceObservedAt)>BEST_EFFORT_MAX_AGE_MS
    ||Date.parse(index.sourceObservedAt)>time+60000)return null
  const wanted=item?.type==='movie'?key(item?.tmdbId):null
  if(!wanted)return null
  const entries=index.entries.filter(e=>e?.key===wanted)
  if(entries.length!==1)return null
  const e=entries[0]
  if(e.mediaType!=='movie'||Number(e.tmdbId)!==Number(item.tmdbId)
    ||!VIDEO.test(String(e.videoId||''))||e.target!==url(e.videoId)
    ||e.provenance!=='global-known-video-metadata-review'
    ||e.quality!=='probable-video-not-verified'
    ||!Number.isFinite(e.score)||e.score<MIN_SCORE
    ||e.rankMargin!==null&&(!Number.isFinite(e.rankMargin)||e.rankMargin<MIN_MARGIN)
    ||!goodDate(e.observedAt)||!goodDate(e.validUntil)
    ||e.observedAt!==index.sourceObservedAt
    ||Date.parse(e.validUntil)>Date.parse(e.observedAt)+BEST_EFFORT_MAX_AGE_MS
    ||Date.parse(e.validUntil)<=time)return null
  return {
    providerId:'youtube',scope:'title',mode:'APP_DEEP_LINK',
    target:e.target,videoId:e.videoId,
    verificationStatus:'best-effort-not-verified',
  }
}
