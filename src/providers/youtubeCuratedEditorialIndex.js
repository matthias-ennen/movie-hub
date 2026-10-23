/**
 * YouTube G2: user-defined FREE / Rent & Buy playlist declarations.
 *
 * This is an editorial CANDIDATE index, not canonical Availability, a verified
 * provider offer, or proof of playback/content/rights/DE tariff.
 * MovieHub may show it only as a clearly provisional playlist hint.
 */
export const CURATED_HINT_KIND='moviehub-youtube-curated-editorial-title-hints'
export const CURATED_HINT_VERSION=1
export const CURATED_HINT_MAX_AGE_MS=7*86400000
const VID=/^[A-Za-z0-9_-]{11}$/
const GOOD_STATUS='review-leading-film-hypothesis'
const ALLOWED=new Set(['free','rent-buy'])
const NO_WRITE=['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
const validDate=v=>Number.isFinite(Date.parse(v))
const key=(type,id)=>type==='movie'&&Number.isInteger(Number(id))&&Number(id)>0
  ?'movie:'+Number(id):null
const preferred=modes=>modes.includes('free')?'free':modes.includes('rent-buy')?'rent-buy':null
const watch=id=>'https://www.youtube.com/watch?v='+id
const empty=(generatedAt,sourceVideoIds=0)=>({
  kind:CURATED_HINT_KIND,schemaVersion:CURATED_HINT_VERSION,
  providerId:'youtube',generatedAt,
  sourceVideoIds,publicationAuthority:'editorial-playlist-only',
  verifiedDEOffers:0,verifiedPlaybackRoutes:0,
  count:0,entries:[],
  classificationCounts:{free:0,'rent-buy':0},
  skippedAmbiguousMovieKeys:0,
})
function validInput(audit,research,now){
  const s=research?.summary
  return Number.isFinite(Date.parse(now))&&validDate(audit?.observedAt)
    &&validDate(s?.generatedAt)&&s.sourceQAObservedAt===audit.observedAt
    &&Date.parse(s.generatedAt)>=Date.parse(audit.observedAt)
    &&Date.parse(now)>=Date.parse(s.generatedAt)-60000
    &&Date.parse(now)-Date.parse(audit.observedAt)<=CURATED_HINT_MAX_AGE_MS
    &&audit.mode==='CURATED_TWO_PLAYLISTS_READ_ONLY'
    &&audit.fullyScanned===true&&audit.publicationPermitted===false
    &&s.mode==='CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY'
    &&s.publicationPermitted===false&&s.publicIndexOnly===true
    &&s.verifiedFilms===0&&s.verifiedDEOffers===0&&s.newMovieImports===0
    &&NO_WRITE.every(k=>s[k]===0&&audit[k]===0)
    &&Array.isArray(audit.candidates)&&Array.isArray(research.rows)
    &&audit.uniqueVideoIds===audit.candidates.length
    &&s.sourceVideoIds===audit.uniqueVideoIds
    &&s.processedRows===audit.candidates.length
    &&research.rows.length===audit.candidates.length
    &&new Set(audit.candidates.map(c=>c.videoId)).size===audit.candidates.length
    &&new Set(research.rows.map(r=>r.videoId)).size===research.rows.length
    &&audit.candidates.every(c=>VID.test(String(c?.videoId||''))
      &&c.accepted===false&&c.toImport===false
      &&c.playbackRoute===null&&c.verifiedOfferType===null
      &&Array.isArray(c.playlistModes)&&c.playlistModes.length>0
      &&c.playlistModes.every(x=>ALLOWED.has(x))
      &&c.editorialOfferHint===preferred(c.playlistModes))
    &&research.rows.every(r=>r.publicationPermitted===false
      &&r.playbackRoute===null&&r.verifiedOfferType===null
      &&r.verifiedTmdbId===null)
}

export function buildCuratedEditorialTitleIndex(source,research,{
  now=new Date().toISOString(),
}={}){
  const audit=source?.audit??source
  if(!validInput(audit,research,now))throw Error('CURATED_EDITORIAL_SOURCE_OR_RESEARCH_UNTRUSTED')
  const out=empty(new Date(now).toISOString(),audit.uniqueVideoIds)
  const matches=new Map(research.rows.map(r=>[r.videoId,r]))
  const candidates=new Map()
  const conflicts=new Set()
  for(const c of audit.candidates){
    out.classificationCounts[c.editorialOfferHint]++
    const r=matches.get(c.videoId)
    if(!r||r.editorialOfferHint!==c.editorialOfferHint
      ||r.sourceStatus!==c.status
      ||!Array.isArray(r.playlistModes)
      ||r.playlistModes.join(',')!==c.playlistModes.join(',')
      ||!c.screened||!c.videoTitle||!c.channelId
      ||c.deRegionSignal==='excluded'
      ||r.matchStatus!==GOOD_STATUS
      ||r.identityRisk!==null||r.hasPlaylistOfferConflict!==false
      ||r.hasPlaylistOverlap!==(c.playlistModes.length>1)
      ||r.publicIndexMembership!=='public-present'
      ||(r.alternativeTvIds||[]).length>0
      ||(r.errors||[]).length>0
      ||!Array.isArray(r.topCandidates)||r.topCandidates.length!==1)continue
    const top=r.topCandidates[0]
    const movieKey=key('movie',top.tmdbId)
    if(!movieKey||!Number.isFinite(top.score)||top.score<28
      ||!Number.isFinite(top.titleLevel)||top.titleLevel<3
      ||!Number.isFinite(top.runtimeDelta)||top.runtimeDelta<0||top.runtimeDelta>15
      ||top.yearMismatch===true||top.sequelConflict===true)continue
    const entry={
      key:movieKey,mediaType:'movie',tmdbId:Number(top.tmdbId),
      videoId:c.videoId,watchUrl:watch(c.videoId),
      playlistMode:c.editorialOfferHint,
      playlistIds:[...c.playlistIds],
      sourceTitle:c.videoTitle,
      channelTitle:c.channelTitle||'',
      deRegionSignal:c.deRegionSignal,
      evidence:'playlist-declared-plus-review-matcher',
      verificationStatus:'not-independently-verified',
    }
    // Do not guess between two competing video IDs for the same movie.
    if(candidates.has(movieKey))conflicts.add(movieKey)
    else candidates.set(movieKey,entry)
  }
  for(const k of conflicts)candidates.delete(k)
  out.skippedAmbiguousMovieKeys=conflicts.size
  out.entries=[...candidates.values()].sort((a,b)=>a.key.localeCompare(b.key))
  out.count=out.entries.length
  return out
}

export function selectCuratedEditorialTitleHint(index,item,{
  now=Date.now(),
}={}){
  if(index?.kind!==CURATED_HINT_KIND||index.schemaVersion!==CURATED_HINT_VERSION
    ||index.providerId!=='youtube'||index.publicationAuthority!=='editorial-playlist-only'
    ||index.verifiedDEOffers!==0||index.verifiedPlaybackRoutes!==0
    ||!Array.isArray(index.entries)||index.count!==index.entries.length
    ||!Number.isFinite(Date.parse(index.generatedAt))
    ||!Number.isFinite(Number(now))
    ||Date.parse(index.generatedAt)>Number(now)+60000
    ||Number(now)-Date.parse(index.generatedAt)>CURATED_HINT_MAX_AGE_MS)return null
  const k=key(item?.type,item?.tmdbId)
  if(!k)return null
  const matched=index.entries.filter(e=>e?.key===k)
  if(matched.length!==1)return null
  const e=matched[0]
  if(e.mediaType!=='movie'||Number(e.tmdbId)!==Number(item.tmdbId)
    ||!VID.test(String(e.videoId||''))||e.watchUrl!==watch(e.videoId)
    ||!ALLOWED.has(e.playlistMode)
    ||e.verificationStatus!=='not-independently-verified'
    ||e.evidence!=='playlist-declared-plus-review-matcher'
    ||!Array.isArray(e.playlistIds)||e.playlistIds.length===0)return null
  return {providerId:'youtube',scope:'title',mode:'APP_DEEP_LINK',
    target:e.watchUrl,videoId:e.videoId,playlistMode:e.playlistMode,
    verificationStatus:'not-independently-verified'}
}
