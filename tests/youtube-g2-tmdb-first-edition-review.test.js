import {describe,it,expect} from 'vitest'
import {buildTmdbFirstEditionReview,renderTmdbFirstEditionReview}
  from '../scripts/youtube-g2-tmdb-first-edition-review.mjs'

const candidate=(videoId,channelTitle,strong=true,titleLevel=4)=>({
  videoId,channelTitle,strong,titleLevel,score:strong?40:14,
  durationMinutes:97.5,runtimeDelta:0.5,
})
const row=(tmdbId,status,videos,tmdbDeOfferTypes=['rent','buy'])=>({
  tmdbId,title:'Example TMDB Movie '+tmdbId,status,
  videoCandidates:videos,tmdbDeOfferTypes,
  reviewedVideoId:null,directPlaybackRoute:null,publicationPermitted:false,
})
const strong='review-multiple-video-editions'
describe('TMDB-first large edition/film-source conflict review, with no implicit entitlement',()=>{
  it('groups the four actual 25-pilot multi-video failure patterns into reproducible lanes',()=>{
    const input=[
      row(455839,strong,[
        candidate('QduoL3vVcgk','myMOVIE'),
        candidate('KfU4GU6Hk80','YouTube Movies'),
      ]),
      row(333385,strong,[
        candidate('gUgCFmNy4gM','YouTube Movies'),
        candidate('TevrXo61FsY','myMOVIE'),
        candidate('uaXWTyo48f4','therealshadow2020'),
      ]),
      row(184315,strong,[
        candidate('Mf_iQ4SO9yw','RBM Pictures'),
        candidate('7Q874rTHfz4','YouTube Movies'),
        candidate('qFJf9q1wRIY','YouTube Movies'),
      ]),
      row(10830,strong,[
        candidate('KGRabMHj8Ew','YouTube Movies'),
        candidate('-95ettFDC5A','MovieMadness'),
      ]),
    ]
    const r=buildTmdbFirstEditionReview(input)
    expect(r).toMatchObject({
      processedReviewRows:4,
      multiWorkVideoCollisions:0,
      reviewLanes:{
        'review-storefront-labelled-versus-other-sources':3,
        'review-multiple-storefront-labelled-editions':1,
      },
      independentlyVerifiedDEOffers:0,
      automaticDirectLinkApprovals:0,publicationPermitted:false,
      firestoreWrites:0,badgeWrites:0,
    })
    expect(r.reviews.find(x=>x.tmdbId===184315)).toMatchObject({
      strongCandidates:3,storefrontLabelledStrongCandidates:2,
      separateEditionOrCutVerificationRequired:true,
      approvedVideoId:null,youtubeMoviesLabelAuthority:'none-unverified',
    })
    expect(renderTmdbFirstEditionReview(r)).toContain('movie:455839')
    expect(renderTmdbFirstEditionReview(r)).toContain('NOT proof of rights')
  })
  it('detects one video ID proposed for distinct TMDB works even if each row looks strong',()=>{
    const shared='Abc12345678'
    const r=buildTmdbFirstEditionReview([
      row(238,'review-single-video-candidate',[candidate(shared,'YouTube Movies')]),
      row(240,'review-single-video-candidate',[candidate(shared,'YouTube Movies')]),
    ])
    expect(r.multiWorkVideoCollisions).toBe(1)
    expect(r.collisions[0]).toEqual({
      videoId:shared,tmdbIds:[238,240],
      disposition:'cross-work-video-identity-requires-review',
      automaticApproval:false,
    })
    expect(r.reviews.every(x=>x.automaticWorkAssignmentPermitted===false)).toBe(true)
  })
  it('does not equate the channel label with an approved offer even with only one strong video',()=>{
    const r=buildTmdbFirstEditionReview([
      row(9479,'review-single-video-candidate',[
        candidate('nJf67zNZhoc','YouTube Movies'),
      ]),
    ])
    expect(r.reviews[0].reviewLane)
      .toBe('review-single-strong-work-candidate-not-offer-verified')
    expect(r.reviews[0].approvedVideoId).toBeNull()
    expect(r.independentlyVerifiedDEOffers).toBe(0)
  })
  it('accounts for an absent public YouTube badge with zero candidates',()=>{
    const r=buildTmdbFirstEditionReview([
      row(515001,'no-current-public-youtube-badge',[],[]),
    ])
    expect(r.reviews[0].reviewLane).toBe('no-current-public-de-youtube-offer')
  })
  it('fails closed on forged publication, inconsistent status, duplicate work/video IDs',()=>{
    const base=()=>row(238,'review-single-video-candidate',[
      candidate('Abc12345678','YouTube Movies'),
    ])
    const published=base()
    published.directPlaybackRoute={type:'APP_DEEP_LINK'}
    expect(()=>buildTmdbFirstEditionReview([published]))
      .toThrow('TMDB_FIRST_EDITION_REVIEW_ROW_UNTRUSTED')
    const mismatch=base()
    mismatch.status='review-multiple-video-editions'
    expect(()=>buildTmdbFirstEditionReview([mismatch]))
      .toThrow('TMDB_FIRST_EDITION_REVIEW_CLASSIFICATION_MISMATCH')
    const dup=base()
    dup.videoCandidates.push(candidate('Abc12345678','YouTube Movies'))
    expect(()=>buildTmdbFirstEditionReview([dup]))
      .toThrow('TMDB_FIRST_EDITION_REVIEW_VIDEO_UNTRUSTED')
    expect(()=>buildTmdbFirstEditionReview([base(),base()]))
      .toThrow('TMDB_FIRST_EDITION_REVIEW_ROW_UNTRUSTED')
    const changed=base()
    changed.videoCandidates[0].strong=true
    changed.videoCandidates[0].titleLevel=2
    expect(()=>buildTmdbFirstEditionReview([changed]))
      .toThrow('TMDB_FIRST_EDITION_REVIEW_VIDEO_UNTRUSTED')
  })
})
