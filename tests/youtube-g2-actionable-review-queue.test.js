import {describe,it,expect} from 'vitest'
import {
  buildYoutubeActionableReviewQueue,renderYoutubeActionableReviewQueue,
} from '../scripts/youtube-g2-actionable-review-queue.mjs'

const now='2026-10-24T00:10:00.000Z'
const sourceAt='2026-10-24T00:00:00.000Z'
const ids=['1uf2AMrQMk0','3csAkKfa6Vs','po_2YIkVroA','xWkLYgaorAI']
const tmdb=[10586,11607,10685,null]
const classes=['FREE','R&B','FREE','FREE']
const match=['review-leading-film-hypothesis','review-leading-film-hypothesis',
  'review-leading-movie-with-TV-alternatives','review-no-eligible-video-details']
function fixture(){
  const intake={
    mode:'YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY',generatedAt:sourceAt,
    sourceQAObservedAt:sourceAt,researchObservedAt:sourceAt,
    fullScan:true,uniqueVideoIds:4,processedVideoIds:4,unaccountedForVideoIds:0,
    independentlyVerifiedDEOffers:0,publicationPermitted:false,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,nightlyWrites:0,
    items:ids.map((id,i)=>({
      videoId:id,playlistClass:classes[i],
      sourceTitle:i===3?null:['Der Geist und die Dunkelheit','Deep Star Six','The Watcher'][i],
      channelTitle:'Synthetic only',sourceScreened:i!==3,
      suggestedFilmRef:tmdb[i]===null?null:{tmdbId:tmdb[i],mediaType:'movie'},
      publicCatalogMembership:i===1?'public-not-present':'public-present',
      identityResearchStatus:match[i],
    })),
  }
  const research={
    summary:{mode:'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY',
      generatedAt:sourceAt,sourceQAObservedAt:sourceAt,sourceVideoIds:4,
      processedRows:4,publicationPermitted:false,
      catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,nightlyWrites:0,
    },
    rows:ids.map((id,i)=>({
      videoId:id,editorialOfferHint:classes[i]==='FREE'?'free':'rent-buy',
      matchStatus:match[i],topCandidates:tmdb[i]?[{
        tmdbId:tmdb[i],score:45,titleLevel:4,runtimeDelta:2,
      }]:[],
    })),
  }
  const reconciliation={
    kind:'moviehub-youtube-full-catalog-reconciliation',
    privateArtifact:true,publicationPermitted:false,generatedAt:sourceAt,
    sourceObservedAt:sourceAt,processedVideoIds:4,totalVideoIds:4,unaccountedForVideoIds:0,
    verifiedDEOffers:0,newMoviesImported:0,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,nightlyWrites:0,
    entries:ids.map((id,i)=>({
      videoId:id,playlistClass:classes[i],
      suggestedFilmKey:tmdb[i]?'movie:'+tmdb[i]:null,
      completeCatalogMembership:i===1?'not-in-canonical-inventory':'canonical-existing',
    })),
  }
  const hints={
    kind:'moviehub-youtube-curated-editorial-title-hints',providerId:'youtube',
    publicationAuthority:'editorial-playlist-only',generatedAt:now,
    sourceVideoIds:4,count:2,verifiedDEOffers:0,verifiedPlaybackRoutes:0,
    entries:[0,1].map(i=>({
      videoId:ids[i],key:'movie:'+tmdb[i],
      playlistMode:classes[i]==='FREE'?'free':'rent-buy',
      watchUrl:'https://www.youtube.com/watch?v='+ids[i],
    })),
  }
  const filmFeed={
    kind:'moviehub-youtube-curated-new-film-metadata',providerId:'youtube',
    offerVerification:'editorial-only-not-independent',generatedAt:now,
    sourceVideoIds:4,count:1,
    entries:[{videoId:ids[1],tmdbId:tmdb[1],playlistClass:classes[1],
      film:{type:'movie',source:'tmdb',tmdbId:tmdb[1]}}],
  }
  return {intake,research,reconciliation,hints,filmFeed}
}
describe('G2: private lossless risk-prioritized review queue',()=>{
  it('accounts for every video and keeps linked films separate from review',()=>{
    const out=buildYoutubeActionableReviewQueue({...fixture(),now})
    expect(out).toMatchObject({
      kind:'moviehub-youtube-g2-actionable-review-queue',
      sourceVideoIds:4,accountedForVideos:4,missingVideos:0,
      publishedPlaylistLinks:2,newCanonicalMovies:1,pendingReview:2,
      declaredClasses:{FREE:3,'R&B':1},
      lanes:{'missing-video-metadata':1,'movie-versus-series':1},
      independentVerifiedDEOffers:0,newUnverifiedDatabaseWrites:0,
      publicationPermitted:false,privateArtifact:true,
    })
    expect(out.prioritizedReview.map(x=>x.videoId)).toEqual(
      expect.arrayContaining([ids[2],ids[3]]))
    expect(out.prioritizedReview[0].url).toContain('youtube.com/watch?v=')
    expect(out.items.find(x=>x.videoId===ids[1])).toMatchObject({
      publicationStatus:'playlist-link-published',lane:'new-movie-published',
      sourceVerifiedDEOffer:false,
    })
    expect(renderYoutubeActionableReviewQueue(out))
      .toContain('MovieHub YouTube G2')
  })
  it('separates release uncertainty from the defined playlist class',()=>{
    const x=fixture()
    x.research.rows[2].matchStatus='review-current-release-needs-content-check'
    x.intake.items[2].identityResearchStatus=x.research.rows[2].matchStatus
    const out=buildYoutubeActionableReviewQueue({...x,now})
    expect(out.items[2].lane).toBe('new-release-content-check')
    expect(out.items[2].playlistClass).toBe('FREE')
  })
  it('rejects omitted, drifted, forged, duplicate and expired sources',()=>{
    const mutations=[
      x=>x.intake.processedVideoIds=3,
      x=>x.intake.items[0].videoId=x.intake.items[1].videoId,
      x=>x.reconciliation.entries[2].suggestedFilmKey='movie:999',
      x=>x.hints.entries[0].watchUrl='https://www.youtube.com/watch?v=abc',
      x=>x.hints.verifiedDEOffers=1,
      x=>x.filmFeed.entries[0].film.tmdbId=1,
      x=>x.filmFeed.count=3,
      x=>x.intake.firestoreWrites=1,
      x=>x.research.summary.sourceQAObservedAt='2026-10-20T00:00:00Z',
    ]
    for(const change of mutations){
      const x=fixture();change(x)
      expect(()=>buildYoutubeActionableReviewQueue({...x,now})).toThrow()
    }
    expect(()=>buildYoutubeActionableReviewQueue({
      ...fixture(),now:'2026-10-26T00:00:00.000Z',
    })).toThrow('YOUTUBE_REVIEW_QUEUE_INPUT_NOT_CURRENT_OR_NOT_TRUSTED')
  })
})
