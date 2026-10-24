/**
 * TMDB-first AP2: edition/cut/source collision evidence, NOT a route selector.
 *
 * Multiple videos plausibly matching one film may be different cuts, a
 * duplicate upload, a different language edition, or another work. The
 * YouTube Movies channel label alone does not establish entitlement, even
 * when exactly one candidate bears that label. No automatic publication.
 */
export const TMDB_FIRST_EDITION_REVIEW_KIND='moviehub-youtube-g2-tmdb-first-edition-review'
const VIDEO=/^[A-Za-z0-9_-]{11}$/u
const allowedStatuses=new Set([
  'review-single-video-candidate','review-multiple-video-editions',
  'review-weak-or-unresolved-videos','no-video-candidate',
  'no-current-tmdb-de-youtube-offer','no-current-public-youtube-badge',
])
const storefrontLabel=x=>String(x?.channelTitle||'').trim().toLowerCase()==='youtube movies'
const finite=x=>Number.isFinite(Number(x))&&x!==null&&x!==''
const positiveId=x=>Number.isInteger(Number(x))&&Number(x)>0
export function buildTmdbFirstEditionReview(rows){
  if(!Array.isArray(rows)||rows.length<1||rows.length>25)
    throw Error('TMDB_FIRST_EDITION_REVIEW_INPUT_INVALID')
  const workIds=new Set()
  const reverseVideoUse=new Map()
  const reviews=[]
  const categories={}
  for(const row of rows){
    const id=Number(row?.tmdbId)
    if(!positiveId(id)||workIds.has(id)
      ||!allowedStatuses.has(row.status)
      ||!Array.isArray(row.videoCandidates)
      ||row.videoCandidates.length>10
      ||row.directPlaybackRoute!==null
      ||row.reviewedVideoId!==null
      ||row.publicationPermitted!==false)
      throw Error('TMDB_FIRST_EDITION_REVIEW_ROW_UNTRUSTED')
    workIds.add(id)
    const candidates=row.videoCandidates
    const perMovie=new Set()
    for(const c of candidates){
      if(!VIDEO.test(String(c?.videoId||''))||perMovie.has(c.videoId)
        ||typeof c.strong!=='boolean'
        ||!Number.isInteger(c.titleLevel)||c.titleLevel<0||c.titleLevel>4
        ||!finite(c.score)
        ||(c.strong&&c.titleLevel!==4)
        ||!finite(c.durationMinutes))
        throw Error('TMDB_FIRST_EDITION_REVIEW_VIDEO_UNTRUSTED')
      perMovie.add(c.videoId)
      if(!reverseVideoUse.has(c.videoId))reverseVideoUse.set(c.videoId,new Set())
      reverseVideoUse.get(c.videoId).add(id)
    }
    const strong=candidates.filter(c=>c.strong)
    const storefrontStrong=strong.filter(storefrontLabel)
    let lane='review-unresolved-no-strong-work-evidence'
    if(row.status==='no-current-public-youtube-badge'
      ||row.status==='no-current-tmdb-de-youtube-offer'){
      if(candidates.length||row.tmdbDeOfferTypes?.length)
        throw Error('TMDB_FIRST_EDITION_REVIEW_MISSING_OFFER_CANDIDATES')
      lane='no-current-public-de-youtube-offer'
    }else if(strong.length>1){
      lane=storefrontStrong.length>1
        ?'review-multiple-storefront-labelled-editions'
        :storefrontStrong.length===1
          ?'review-storefront-labelled-versus-other-sources'
          :'review-multiple-unconfirmed-source-editions'
    }else if(strong.length===1){
      lane='review-single-strong-work-candidate-not-offer-verified'
    }
    if((row.status==='review-multiple-video-editions')!==(strong.length>1))
      throw Error('TMDB_FIRST_EDITION_REVIEW_CLASSIFICATION_MISMATCH')
    if(row.status==='review-single-video-candidate'&&strong.length!==1)
      throw Error('TMDB_FIRST_EDITION_REVIEW_CLASSIFICATION_MISMATCH')
    categories[lane]=(categories[lane]||0)+1
    reviews.push({
      tmdbId:id,status:row.status,reviewLane:lane,
      strongCandidates:strong.length,
      storefrontLabelledStrongCandidates:storefrontStrong.length,
      candidateVideoIds:strong.map(c=>c.videoId),
      // No channel-title string has independent rights or offer authority.
      youtubeMoviesLabelAuthority:'none-unverified',
      separateEditionOrCutVerificationRequired:strong.length>1,
      independentlyVerifiedDEOffer:false,approvedVideoId:null,
      publicationPermitted:false,
    })
  }
  const collisions=[...reverseVideoUse.entries()]
    .filter(([,workSet])=>workSet.size>1)
    .map(([videoId,workSet])=>({
      videoId,tmdbIds:[...workSet].sort((a,b)=>a-b),
      disposition:'cross-work-video-identity-requires-review',
      automaticApproval:false,
    })).sort((a,b)=>a.videoId.localeCompare(b.videoId))
  // Global collision affects even otherwise individually strong candidates.
  for(const item of reviews){
    const c=collisions.filter(v=>v.tmdbIds.includes(item.tmdbId))
    if(c.length){
      item.crossWorkVideoIds=c.map(v=>v.videoId)
      item.automaticWorkAssignmentPermitted=false
    }
  }
  reviews.sort((a,b)=>a.tmdbId-b.tmdbId)
  return {
    kind:TMDB_FIRST_EDITION_REVIEW_KIND,schemaVersion:1,
    privateArtifact:true,publicationPermitted:false,
    processedReviewRows:reviews.length,reviewLanes:categories,
    multiWorkVideoCollisions:collisions.length,collisions,
    reviews,independentlyVerifiedDEOffers:0,automaticDirectLinkApprovals:0,
    firestoreWrites:0,providerWrites:0,badgeWrites:0,catalogWrites:0,
  }
}
export function renderTmdbFirstEditionReview(result){
  if(result?.kind!==TMDB_FIRST_EDITION_REVIEW_KIND
    ||result.privateArtifact!==true||result.publicationPermitted!==false)
    throw Error('TMDB_FIRST_EDITION_REVIEW_REPORT_UNTRUSTED')
  return [
    '# TMDB-first: candidate edition/cut/source review (private)',
    '',
    '- Films reviewed: '+result.processedReviewRows,
    '- Review-only lanes: '+JSON.stringify(result.reviewLanes),
    '- Video IDs also proposed for different TMDB film IDs: '+result.multiWorkVideoCollisions,
    '- "YouTube Movies" text is UNVERIFIED channel metadata, NOT proof of rights or a current DE storefront offer.',
    '- No candidate auto-approved as a playback URL. App-provider badge and TMDB DE offer type preserved unchanged.',
    '- 0 additional YouTube searches / 0 database writes.',
    '',
    '| TMDB film | Review lane | Strong candidate IDs | Storefront-labelled strong candidates |',
    '| --- | --- | --- | --- |',
    ...result.reviews.map(x=>'| movie:'+x.tmdbId+' | '+x.reviewLane+
      ' | '+(x.candidateVideoIds.join(', ')||'none')+
      ' | '+x.storefrontLabelledStrongCandidates+' |'),
    '',
  ].join('\n')
}
