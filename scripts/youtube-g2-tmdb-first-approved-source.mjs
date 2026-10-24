/**
 * YouTube G2 AP3: independently approved TMDB-first videos, routed through
 * the SAME canonical YouTube SourceEnvelope as the curated playlist adapter.
 *
 * A matcher result / TMDB provider badge cannot grant an offer. This module
 * only rechecks previously, independently approved exact video IDs via the
 * official videos.list endpoint. No search.list or publisher aggregation.
 */
import {
  YOUTUBE_VIDEO_ID,normalizeYoutubeVideoCandidate,
  mapVerifiedYoutubeVideoToAvailability,
} from '../src/sources/adapters/youtubeContractMapper.js'

export const TMDB_FIRST_APPROVAL_KIND='youtube-g2-tmdb-first-independent-verification-bundle'
export const TMDB_FIRST_APPROVAL_VERSION=1
const MAX_AGE_MS=30*86400000
const OFFER_TYPES=new Set(['free','ads','flatrate','rent','buy'])
const dateMs=x=>typeof x==='string'&&x.trim()?Date.parse(x):NaN
const safeEvidence=x=>typeof x==='string'&&x.trim().length>=12&&x.trim().length<=500
const CHANNEL=/^UC[A-Za-z0-9_-]{22}$/

export function validateTmdbFirstApprovals(bundle,{now=new Date().toISOString()}={}){
  const present=Date.parse(now)
  if(!Number.isFinite(present))throw Error('YOUTUBE_TMDB_FIRST_APPROVAL_CLOCK_INVALID')
  if(bundle==null)return []
  const created=dateMs(bundle?.generatedAt)
  if(bundle?.kind!==TMDB_FIRST_APPROVAL_KIND
    ||bundle?.schemaVersion!==TMDB_FIRST_APPROVAL_VERSION
    ||!Array.isArray(bundle?.approvals)||bundle.approvals.length>500
    ||!Number.isFinite(created)||created>present+60000
    ||present-created>MAX_AGE_MS){
    throw Error('YOUTUBE_TMDB_FIRST_APPROVAL_BUNDLE_INVALID_OR_STALE')
  }
  const videoIds=new Set(),works=new Set()
  for(const a of bundle.approvals){
    const verified=dateMs(a?.verifiedAt)
    const work='movie:'+a?.titleRef?.tmdbId
    if(!YOUTUBE_VIDEO_ID.test(String(a?.videoId||''))
      ||!CHANNEL.test(String(a?.verifiedChannelId||''))
      ||a?.titleRef?.mediaType!=='movie'
      ||!Number.isInteger(a?.titleRef?.tmdbId)||a.titleRef.tmdbId<1
      ||videoIds.has(a.videoId)||works.has(work)
      ||a.approvalSource!=='independent-manual-review'
      ||a.approvalStatus!=='approved'
      ||!OFFER_TYPES.has(a.accessType)
      ||!Number.isFinite(verified)||verified>present+60000
      ||present-verified>MAX_AGE_MS
      ||!safeEvidence(a.workEvidence)||!safeEvidence(a.offerEvidence)
      ||a.workIdentityVerified!==true
      ||a.fullWorkOrValidCutVerified!==true
      ||a.dePlaybackVerified!==true
      ||a.offerTypeVerified!==true
      ||a.sourceUseAuthorized!==true){
      throw Error('YOUTUBE_TMDB_FIRST_APPROVAL_MISSING_INDEPENDENT_EVIDENCE')
    }
    works.add(work);videoIds.add(a.videoId)
  }
  return bundle.approvals
}

/**
 * Fail closed for absent, private, stale, region-blocked or publisher-swapped
 * videos. Missing data revokes this source's route, but does not mutate the
 * original TMDB WatchProvider badge or its title-search fallback.
 */
export async function collectVerifiedTmdbFirstYoutubeAvailabilities({
  youtubeApi,approvals=null,now=new Date().toISOString(),
}={}){
  const signedOff=validateTmdbFirstApprovals(approvals,{now})
  const output={sourceMode:'tmdb-first-independent-reviewed',
    approvedInputRows:signedOff.length,videoLookupCalls:0,
    verifiedAvailabilities:[],blocked:[],youtubeSearchCalls:0,
    catalogueWrites:0,firestoreWrites:0,badgeWrites:0}
  if(!signedOff.length)return output
  if(typeof youtubeApi!=='function')throw Error('YOUTUBE_TMDB_FIRST_VIDEO_API_REQUIRED')
  const sources=new Map()
  for(let offset=0;offset<signedOff.length;offset+=50){
    const batch=signedOff.slice(offset,offset+50)
    const requestIds=new Set(batch.map(x=>x.videoId))
    const response=await youtubeApi('videos',{
      part:'snippet,contentDetails,status',id:batch.map(x=>x.videoId).join(','),
    })
    output.videoLookupCalls++
    if(!Array.isArray(response?.items)
      ||response.items.some(x=>!requestIds.has(x?.id)||sources.has(x.id))){
      throw Error('YOUTUBE_TMDB_FIRST_VIDEO_RESPONSE_UNTRUSTED')
    }
    for(const v of response.items)sources.set(v.id,v)
  }
  for(const approval of signedOff){
    const raw=sources.get(approval.videoId)
    if(!raw){
      output.blocked.push({videoId:approval.videoId,reason:'video-missing-private-or-removed'})
      continue
    }
    const video=normalizeYoutubeVideoCandidate(raw,{observedAt:now})
    if(!video?.screening?.eligible||video.channelId!==approval.verifiedChannelId){
      output.blocked.push({videoId:approval.videoId,
        reason:video?.channelId!==approval.verifiedChannelId
          ?'publisher-channel-mismatch':'video-screening-or-DE-exclusion'})
      continue
    }
    const record=mapVerifiedYoutubeVideoToAvailability(
      video,approval.titleRef,{
        verifiedVideoId:approval.videoId,
        workIdentityVerified:approval.workIdentityVerified,
        fullWorkOrValidCutVerified:approval.fullWorkOrValidCutVerified,
        dePlaybackVerified:approval.dePlaybackVerified,
        offerTypeVerified:approval.offerTypeVerified,
        sourceUseAuthorized:approval.sourceUseAuthorized,
        accessType:approval.accessType,verifiedAt:approval.verifiedAt,
        workEvidence:approval.workEvidence,offerEvidence:approval.offerEvidence,
      },{observedAt:now})
    if(!record){
      output.blocked.push({videoId:approval.videoId,reason:'canonical-verification-gate-rejected'})
      continue
    }
    output.verifiedAvailabilities.push(record)
  }
  if(output.verifiedAvailabilities.length+output.blocked.length!==signedOff.length){
    throw Error('YOUTUBE_TMDB_FIRST_APPROVAL_RECONCILIATION_INCOMPLETE')
  }
  return output
}
