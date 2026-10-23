/**
 * Public editorial TMDB movie metadata for new YouTube playlist film matches.
 *
 * Existing MovieHub title identity is ALWAYS movie:tmdbId. Playback availability
 * is NOT asserted; playlist offer classes are editorial, not verified DE offers.
 * No personal/account-scoped references may be published in this feed.
 */
import {canonicalForIdentity} from './execute-title-priority-queue.mjs'

export const CURATED_NEW_FILMS_KIND='moviehub-youtube-curated-new-film-metadata'
const VID=/^[A-Za-z0-9_-]{11}$/
const CLASS=new Set(['FREE','R&B'])
const keyOf=t=>t?.type==='movie'&&Number.isInteger(Number(t?.tmdbId))&&Number(t.tmdbId)>0
  ?'movie:'+Number(t.tmdbId):null
const idKey=k=>/^movie:[1-9]\d*$/.test(String(k))
const videoUrl=id=>'https://www.youtube.com/watch?v='+id
function sourceReady(review,reconciliation,intake,editorial){
  if(review?.kind!=='moviehub-youtube-canonical-new-film-metadata-review'
    ||review.schemaVersion!==1||review.publicationPermitted!==false
    ||!review.privateArtifact||review.newMoviesImported!==0
    ||review.verifiedDEOffers!==0||review.catalogWrites!==0
    ||!Array.isArray(review.items)||review.items.length!==review.candidatesSelected
    ||review.totalVideoIds!==reconciliation?.totalVideoIds
    ||review.metadataReviewed!==review.candidatesSelected
    ||review.metadataPreviewReady!==review.candidatesSelected
    ||review.items.some(x=>x.status!=='tmdb-metadata-review'
      ||!x.tmdb||x.workIdentityApproved!==false
      ||x.newMovieImported!==false||x.offerPublished!==false)
    ||reconciliation?.kind!=='moviehub-youtube-full-catalog-reconciliation'
    ||reconciliation.privateArtifact!==true
    ||reconciliation.publicationPermitted!==false
    ||reconciliation.totalVideoIds!==intake?.uniqueVideoIds
    ||reconciliation.unaccountedForVideoIds!==0
    ||!Array.isArray(reconciliation.entries)
    ||reconciliation.entries.length!==reconciliation.totalVideoIds
    ||!Array.isArray(intake.items)
    ||intake.items.length!==reconciliation.totalVideoIds
    ||editorial?.kind!=='moviehub-youtube-curated-editorial-title-hints'
    ||editorial.schemaVersion!==1||editorial.providerId!=='youtube'
    ||editorial.publicationAuthority!=='editorial-playlist-only'
    ||editorial.verifiedDEOffers!==0||editorial.verifiedPlaybackRoutes!==0
    ||!Array.isArray(editorial.entries)||editorial.count!==editorial.entries.length
    ||editorial.sourceVideoIds!==review.totalVideoIds){
    throw Error('YOUTUBE_NEW_FILM_PUBLICATION_SOURCE_NOT_READY')
  }
}
export function buildYoutubeNewFilmCatalogProjection({
  metadataReview,reconciliation,intake,editorialIndex,
  canonicalTitles,now=new Date().toISOString(),
}={}){
  sourceReady(metadataReview,reconciliation,intake,editorialIndex)
  if(!Array.isArray(canonicalTitles)
    ||canonicalTitles.length!==metadataReview.candidatesSelected
    ||!Number.isFinite(Date.parse(now)))throw Error('YOUTUBE_NEW_FILM_PUBLISHER_CANONICAL_MISSING')
  const byVideo=new Map(intake.items.map(x=>[x.videoId,x]))
  const byDecision=new Map(reconciliation.entries.map(x=>[x.videoId,x]))
  const byFilm=new Map(canonicalTitles.map(x=>[keyOf(x),x]))
  const hints=[...editorialIndex.entries]
  const entries=[]
  const allIds=new Set(hints.map(x=>x.videoId))
  const allKeys=new Set(hints.map(x=>x.key))
  // Existing films in the COMPLETE canonical account inventory were already
  // deduplicated by movie:TMDB ID. Only uniquely strong source-work matches
  // are eligible for an editorial YouTube link; ambiguous/cut-risk matches stay
  // in manual review and no new film or independently verified offer is minted.
  let linkedAdditionalExisting=0
  for(const rec of reconciliation.entries){
    if(rec?.decision!=='exists-in-complete-catalog-review'
      ||rec.strongMetadataCandidate!==true)continue
    const src=byVideo.get(rec.videoId)
    const filmKey=rec.suggestedFilmKey
    const tmdbId=Number(/^movie:([1-9]\d*)$/.exec(String(filmKey||''))?.[1])
    if(!Number.isInteger(tmdbId)||tmdbId<=0||!src
      ||!VID.test(String(rec.videoId||''))
      ||rec.completeCatalogMembership!=='canonical-existing'
      ||!Array.isArray(rec.canonicalSources)||rec.canonicalSources.length<1
      ||!src.suggestedFilmRef||src.suggestedFilmRef.mediaType!=='movie'
      ||src.suggestedFilmRef.tmdbId!==tmdbId
      ||src.sourceScreened!==true||src.regionSignal==='excluded'
      ||!Number.isFinite(Number(src.durationMinutes))
      ||Number(src.durationMinutes)<30
      ||!src.sourceTitle||!Array.isArray(src.playlistIds)
      ||src.playlistIds.length<1||!CLASS.has(src.playlistClass)
      ||src.playlistClass!==rec.playlistClass
      ||rec.filmIdentityApproved!==false||rec.newMovieImported!==false
      ||rec.verifiedOffer!==false
      ||allIds.has(rec.videoId)||allKeys.has(filmKey)) {
      throw Error('YOUTUBE_EXISTING_FILM_EDITORIAL_LINK_UNSAFE')
    }
    // Another video proposing the same TMDB identity is a collision even if
    // that video is currently held in the manual review lane.
    if(reconciliation.entries.filter(x=>x.suggestedFilmKey===filmKey).length!==1){
      throw Error('YOUTUBE_EXISTING_FILM_VIDEO_COLLISION')
    }
    allIds.add(rec.videoId);allKeys.add(filmKey)
    hints.push({
      key:filmKey,mediaType:'movie',tmdbId,videoId:rec.videoId,
      watchUrl:videoUrl(rec.videoId),
      playlistMode:src.playlistClass==='FREE'?'free':'rent-buy',
      playlistIds:[...src.playlistIds],sourceTitle:src.sourceTitle,
      channelTitle:src.channelTitle||'',deRegionSignal:src.regionSignal,
      evidence:'playlist-declared-plus-review-matcher',
      verificationStatus:'not-independently-verified',
    })
    linkedAdditionalExisting++
  }
  for(const approvedMetadata of metadataReview.items){
    const videoId=approvedMetadata.videoId
    const src=byVideo.get(videoId)
    const rec=byDecision.get(videoId)
    const filmKey='movie:'+approvedMetadata.tmdbId
    const metadata=byFilm.get(filmKey)
    const m=approvedMetadata.tmdb
    if(!VID.test(String(videoId||''))
      ||rec?.decision!=='new-tmdb-metadata-review'
      ||rec.strongMetadataCandidate!==true
      ||rec.suggestedFilmKey!==filmKey
      ||rec.completeCatalogMembership!=='not-in-canonical-inventory'
      ||src?.suggestedFilmRef?.tmdbId!==approvedMetadata.tmdbId
      ||src.sourceScreened!==true||src.regionSignal==='excluded'
      ||!CLASS.has(src.playlistClass)
      ||src.playlistClass!==approvedMetadata.playlistClass
      ||src.videoId!==videoId||!Array.isArray(src.playlistIds)
      ||src.playlistIds.length===0
      ||!metadata||!idKey(filmKey)
      ||metadata.type!=='movie'||metadata.source!=='tmdb'
      ||metadata.id!=='tmdb-movie-'+approvedMetadata.tmdbId
      ||metadata.title!==m?.title
      ||Number(metadata.runtimeMinutes)!==Number(m?.runtimeMinutes)
      ||Math.abs(Number(metadata.runtimeMinutes)-Number(src.durationMinutes))>10
      ||metadata.metadataComplete!==true
      ||!metadata.description||!metadata.posterUrl
      ||allIds.has(videoId)||allKeys.has(filmKey)){
      throw Error('YOUTUBE_NEW_FILM_PUBLISHER_IDENTITY_OR_METADATA_UNSAFE')
    }
    allIds.add(videoId);allKeys.add(filmKey)
    const movie=canonicalForIdentity(metadata,{type:'movie',tmdbId:approvedMetadata.tmdbId})
    const playlistMode=approvedMetadata.playlistClass==='FREE'?'free':'rent-buy'
    entries.push({
      videoId,tmdbId:approvedMetadata.tmdbId,
      playlistClass:approvedMetadata.playlistClass,
      film:movie,
    })
    hints.push({
      key:filmKey,mediaType:'movie',tmdbId:approvedMetadata.tmdbId,
      videoId,watchUrl:videoUrl(videoId),playlistMode,
      playlistIds:[...src.playlistIds],sourceTitle:src.sourceTitle,
      channelTitle:src.channelTitle||'',
      deRegionSignal:src.regionSignal,
      evidence:'playlist-declared-plus-review-matcher',
      verificationStatus:'not-independently-verified',
    })
  }
  entries.sort((a,b)=>a.tmdbId-b.tmdbId)
  hints.sort((a,b)=>a.key.localeCompare(b.key))
  return {
    filmFeed:{
      kind:CURATED_NEW_FILMS_KIND,schemaVersion:1,
      providerId:'youtube',generatedAt:now,sourceVideoIds:metadataReview.totalVideoIds,
      sourceType:'user-curated-playlists-with-tmdb-metadata',
      offerVerification:'editorial-only-not-independent',
      count:entries.length,entries,
    },
    editorialIndex:{
      ...editorialIndex,generatedAt:now,count:hints.length,entries:hints,
    },
    summary:{sourceVideos:metadataReview.totalVideoIds,newTmdbFilms:entries.length,
      editorialLinks:hints.length,additionalExistingCanonicalLinks:linkedAdditionalExisting,
      firestoreWrites:0,badgeDatabaseWrites:0,
      independentlyVerifiedDEOffers:0},
  }
}
