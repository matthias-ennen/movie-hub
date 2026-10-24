/**
 * Real observed TMDB-first edition/identity regression excerpts from the
 * PRIVATE 25-film API Golden run #40086393094 (24 Oct 2026).
 * These are unverified search hypotheses, NOT approved DE offers or routes.
 * No live API calls and no copied secrets.
 */
import {describe,it,expect} from 'vitest'
import {buildTmdbFirstReviewPack,renderTmdbFirstReviewPack}
  from '../scripts/youtube-g2-tmdb-first-review-pack.mjs'

const video=(videoId,channelTitle,strong=true)=>({
  videoId,channelTitle,videoTitle:'Historical search candidate',
  durationMinutes:95,runtimeDelta:2,strong,
})
function archivedExcerpts(){
  const rows=[
    {tmdbId:238,title:'Der Pate',status:'review-single-video-candidate',
      videoCandidates:[video('xcCsnx-GRkA','YouTube Movies')]},
    {tmdbId:240,title:'Der Pate - Teil II',status:'review-weak-or-unresolved-videos',
      videoCandidates:[video('CZCUCvmX8zs','YouTube Movies',false),
        video('xcCsnx-GRkA','YouTube Movies',false)]},
    {tmdbId:455839,title:'Die Höhle - Das Tor in eine andere Zeit',
      status:'review-multiple-video-editions',
      videoCandidates:[video('QduoL3vVcgk','myMOVIE'),
        video('KfU4GU6Hk80','YouTube Movies')]},
    {tmdbId:333385,title:'Mr. Right',status:'review-multiple-video-editions',
      videoCandidates:[video('gUgCFmNy4gM','YouTube Movies'),
        video('TevrXo61FsY','myMOVIE'),video('uaXWTyo48f4','therealshadow2020')]},
    {tmdbId:184315,title:'Hercules',status:'review-multiple-video-editions',
      videoCandidates:[video('Mf_iQ4SO9yw','RBM Pictures'),
        video('7Q874rTHfz4','YouTube Movies'),
        video('qFJf9q1wRIY','YouTube Movies')]},
    {tmdbId:10830,title:'Matilda',status:'review-multiple-video-editions',
      videoCandidates:[video('KGRabMHj8Ew','YouTube Movies'),
        video('-95ettFDC5A','MovieMadness')]},
    {tmdbId:515001,title:'No current public YouTube badge',
      status:'no-current-public-youtube-badge',videoCandidates:[],
      tmdbDeOfferTypes:[]},
  ].map(r=>({
    mediaType:'movie',publicationPermitted:false,reviewedVideoId:null,
    directPlaybackRoute:null,tmdbDeOfferTypes:['rent','buy'],...r,
  }))
  return {
    summary:{
      mode:'TMDB_FIRST_LINK_RESEARCH_ONLY',
      selectedMovies:7,processedMovies:6,
      publicationPermitted:false,verifiedDirectLinks:0,verifiedSeriesEpisodes:0,
      catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,
      nightlyWrites:0,
      statusCounts:{
        'review-single-video-candidate':1,
        'review-weak-or-unresolved-videos':1,
        'review-multiple-video-editions':4,
        'no-current-public-youtube-badge':1,
      },
      calls:{youtubeSearches:48},
    },
    rows,
  }
}

describe('YouTube AP2 – exact historical real API edition review excerpts (#40086393094)',()=>{
  it('keeps the four observed multi-source film candidates separate without auto publishing',()=>{
    const review=buildTmdbFirstReviewPack(archivedExcerpts())
    expect(review.sourceSelectedFilms).toBe(7)
    expect(review.actuallyApiResearchedMovies).toBe(6)
    expect(review.editionClasses['storefront-labelled-vs-other-sources']).toBe(3)
    expect(review.editionClasses['multiple-storefront-labelled-versions']).toBe(1)
    for(const tmdbId of [455839,333385,184315,10830]){
      const film=review.items.find(x=>x.tmdbId===tmdbId)
      expect(film.editionReview.distinctCutOrVersionRequiresReview).toBe(true)
      expect(film.editionReview.independentDEOfferVerified).toBe(false)
      expect(film.playbackRoute).toBeNull()
    }
    expect(review.items.find(x=>x.tmdbId===333385).candidateVideos).toHaveLength(3)
    expect(review.items.find(x=>x.tmdbId===184315).candidateVideos).toHaveLength(3)
    expect(review.editionClasses['historical-badge-gone']).toBe(1)
    expect(review.verifiedDEOffers).toBe(0)
    expect(review.approvedDirectLinks).toBe(0)
    expect(review.publicationPermitted).toBe(false)
  })
  it('does not promote a weak Godfather-Part-II hit shared with a different strong work',()=>{
    const review=buildTmdbFirstReviewPack(archivedExcerpts())
    const godfather=review.items.find(x=>x.tmdbId===238)
    const part2=review.items.find(x=>x.tmdbId===240)
    expect(godfather.editionReview.class).toBe('single-strong-candidate-offer-unverified')
    expect(part2.editionReview.class).toBe('no-strong-work-evidence')
    expect(part2.candidateVideos.some(c=>c.videoId==='xcCsnx-GRkA'
      &&c.strongMetadataHypothesis===false)).toBe(true)
    expect(review.crossWorkStrongVideoIdCollisions).toEqual([])
    expect(review.items.every(x=>x.independentOfferApproved===false)).toBe(true)
    const report=renderTmdbFirstReviewPack(review)
    expect(report).toContain('movie:240')
    expect(report).toContain('CZCUCvmX8zs')
  })
})
