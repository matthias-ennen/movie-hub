/**
 * Live two-playlist YouTube adapter -> canonical SourceEnvelope.
 *
 * Playlists supply public VIDEO INVENTORY ONLY, never verification of
 * a particular movie/edition, tariff, DE playback or right to publish.
 * A separate explicitly human-approved evidence bundle is needed before a
 * Video ID can join the verified Availability / PlaybackRoute stream.
 *
 * This connects to the established YouTube adapter contract, not a parallel
 * provider or badge source. All TMDB provider badges remain untouched.
 */
import {
  YOUTUBE_VIDEO_ID,
  mapVerifiedYoutubeVideoToAvailability,
  buildYoutubeSourceEnvelope,
} from '../src/sources/adapters/youtubeContractMapper.js'
import {
  runTwoCuratedPlaylistAudit,
  validateTwoCuratedPlaylists,
  preferredCuratedPlaylistMode,
} from './youtube-g2-curated-two-playlists.mjs'

export const CURATED_FREE_PLAYLIST='PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
export const CURATED_RENT_BUY_PLAYLIST='PLJWJS8p_IeEo'
export const CURATED_INPUTS=Object.freeze({
  free:CURATED_FREE_PLAYLIST, rentBuy:CURATED_RENT_BUY_PLAYLIST,
})
export const APPROVAL_BUNDLE_KIND='youtube-g2-independent-verification-bundle'
export const APPROVAL_BUNDLE_VERSION=1
const MAX_VERIFICATION_AGE_DAYS=30
const validTmdb=ref=>(ref?.mediaType==='movie'||ref?.mediaType==='series')
  &&Number.isInteger(Number(ref.tmdbId))&&Number(ref.tmdbId)>0
const validIso=s=>Number.isFinite(Date.parse(s))
const sourceIdForMode=mode=>mode==='free'
  ?CURATED_FREE_PLAYLIST:mode==='rent-buy'?CURATED_RENT_BUY_PLAYLIST:null
// Editorial FREE and R&B may never publish an availability with the opposite tariff.
const accessMatchesMode=(mode,accessType)=>mode==='free'
  ?accessType==='free'||accessType==='ads'
  :mode==='rent-buy'&&(accessType==='rent'||accessType==='buy')

export function validateCuratedSyncAudit(audit,{
  now=new Date().toISOString(),
}={}){
  const t=Date.parse(now),source=validateTwoCuratedPlaylists(CURATED_INPUTS)
  if(!validIso(now)||audit?.mode!=='CURATED_TWO_PLAYLISTS_READ_ONLY'
    ||audit?.fullyScanned!==true||audit?.publicationPermitted!==false
    ||audit?.catalogWrites!==0||audit?.firestoreWrites!==0
    ||audit?.providerWrites!==0||audit?.badgeWrites!==0
    ||audit?.nightlyWrites!==0||!Array.isArray(audit.candidates)
    ||audit.candidates.length>500 ||!Array.isArray(audit.playlistSummaries)
    ||audit.playlistSummaries.length!==2
    ||audit.uniqueVideoIds!==audit.candidates.length
    ||!validIso(audit.observedAt)
    ||Date.parse(audit.observedAt)>t+60000
    ||t-Date.parse(audit.observedAt)>86400000
    ||new Set(audit.candidates.map(c=>c.videoId)).size!==audit.candidates.length
    ||source.some(({mode,playlistId})=>!audit.playlistSummaries.some(p=>
      p.mode===mode&&p.playlistId===playlistId&&p.fullyScanned===true))
    ||audit.candidates.some(c=>!YOUTUBE_VIDEO_ID.test(String(c.videoId||''))
      ||c.accepted!==false||c.toImport!==false
      ||c.verifiedOfferType!==null||c.playbackRoute!==null
      ||!Array.isArray(c.playlistModes)||c.playlistModes.length<1
      ||c.playlistModes.some(mode=>!sourceIdForMode(mode))
      ||!Array.isArray(c.playlistIds)
      ||c.playlistModes.some(mode=>!c.playlistIds.includes(sourceIdForMode(mode)))
      ||c.editorialOfferHint!==preferredCuratedPlaylistMode(c.playlistModes))) {
    throw Error('YOUTUBE_CURATED_SOURCE_INCOMPLETE_OR_UNTRUSTED')
  }
  return audit
}

function approvedRows(bundle,now){
  if(bundle==null)return []
  if(bundle?.kind!==APPROVAL_BUNDLE_KIND
    ||bundle?.schemaVersion!==APPROVAL_BUNDLE_VERSION
    ||!Array.isArray(bundle.approvals)
    ||bundle.approvals.length>500||!validIso(bundle.generatedAt)
    ||Date.parse(bundle.generatedAt)>Date.parse(now)+60000
    ||Date.parse(now)-Date.parse(bundle.generatedAt)>MAX_VERIFICATION_AGE_DAYS*86400000)
    throw Error('YOUTUBE_APPROVAL_BUNDLE_INVALID_OR_STALE')
  const seen=new Set()
  for(const a of bundle.approvals){
    if(!YOUTUBE_VIDEO_ID.test(String(a?.videoId||''))
      ||seen.has(a.videoId)||!validTmdb(a.titleRef)
      ||a.approvalSource!=='independent-manual-review'
      ||a.approvalStatus!=='approved'
      ||!sourceIdForMode(a.playlistMode)
      ||!validIso(a.verifiedAt)
      ||Date.parse(a.verifiedAt)>Date.parse(now)+60000
      ||Date.parse(now)-Date.parse(a.verifiedAt)>MAX_VERIFICATION_AGE_DAYS*86400000
      ||!a.workEvidence||!a.offerEvidence
      ||a.workIdentityVerified!==true||a.fullWorkOrValidCutVerified!==true
      ||a.dePlaybackVerified!==true||a.offerTypeVerified!==true
      ||a.sourceUseAuthorized!==true
      ||!accessMatchesMode(a.playlistMode,a.accessType)){
      throw Error('YOUTUBE_APPROVAL_MISSING_INDEPENDENT_EVIDENCE')
    }
    seen.add(a.videoId)
  }
  return bundle.approvals
}

/** Reconcile independently authorized offers with FREE > Rent/Buy precedence
 * for IDs in both configured playlists. Revocation or API absence suppresses a route;
 * never remove an existing TMDB YouTube badge.
 */
export function reconcileCuratedYoutubeSource({
  audit, approvals=null, now=new Date().toISOString(),
}={}){
  validateCuratedSyncAudit(audit,{now})
  const signedOff=approvedRows(approvals,now)
  const videos=new Map(audit.candidates.map(c=>[c.videoId,c]))
  const availabilities=[]
  const blocked=[]
  for(const review of signedOff){
    const c=videos.get(review.videoId)
    if(!c||c.editorialOfferHint!==review.playlistMode
      ||!c.playlistModes.includes(review.playlistMode)
      ||c.screened!==true||!c.videoTitle||!c.channelId
      ||c.deRegionSignal==='excluded'){
      blocked.push({videoId:review.videoId,reason:'missing-conflicting-or-ineligible-current-video'})
      continue
    }
    const verified=mapVerifiedYoutubeVideoToAvailability({
      videoId:c.videoId,
      channelId:c.channelId,
      screening:{eligible:true},
    },review.titleRef,{
      verifiedVideoId:review.videoId,
      workIdentityVerified:review.workIdentityVerified,
      fullWorkOrValidCutVerified:review.fullWorkOrValidCutVerified,
      dePlaybackVerified:review.dePlaybackVerified,
      offerTypeVerified:review.offerTypeVerified,
      sourceUseAuthorized:review.sourceUseAuthorized,
      accessType:review.accessType,
      verifiedAt:review.verifiedAt,
      workEvidence:review.workEvidence,
      offerEvidence:review.offerEvidence,
    },{observedAt:audit.observedAt})
    if(verified)availabilities.push(verified)
    else blocked.push({videoId:review.videoId,reason:'verified-source-contract-rejected'})
  }
  const envelope=buildYoutubeSourceEnvelope(availabilities,{
    generatedAt:now,fetchedAt:audit.observedAt,
    sourceGenerationId:'youtube:curated:'+audit.observedAt,
    sourceCoverage:{
      playlistIds:validateTwoCuratedPlaylists(CURATED_INPUTS).map(x=>x.playlistId),
      playlistInventoryVideoIds:audit.uniqueVideoIds,
      playlistFullyScanned:audit.fullyScanned,
      // Metadata-only candidates are not a confirmed availability.
      independentlyApprovedVideoOffers:availabilities.length,
      pendingIndependentApprovals:audit.uniqueVideoIds-availabilities.length,
    },
  })
  return {
    mode:'YOUTUBE_G2_CANONICAL_CURATED_SYNC',
    observedAt:audit.observedAt,
    playlistSources:2,
    inventoryVideoIds:audit.uniqueVideoIds,
    approvedInputRows:signedOff.length,
    publishedVerifiedAvailabilities:availabilities.length,
    reviewOnlyCandidates:audit.uniqueVideoIds-availabilities.length,
    approvalCandidatesBlocked:blocked,
    sourceEnvelope:envelope,
    catalogWrites:0,firestoreWrites:0,tmdbBadgeWrites:0,
  }
}

export async function runCuratedYoutubeSourceSync({
  youtubeApi, now=()=>new Date().toISOString(),approvals=null,
}={}){
  const audit=await runTwoCuratedPlaylistAudit({
    playlists:CURATED_INPUTS,youtubeApi,at:now,
  })
  return {audit,...reconcileCuratedYoutubeSource({audit,approvals,now:audit.observedAt})}
}
