import {describe,it,expect} from 'vitest'
import {
  buildYoutubeG2BidirectionalCoverage,renderYoutubeG2BidirectionalCoverage,
} from '../scripts/youtube-g2-bidirectional-coverage.mjs'

const now='2026-10-24T07:15:00.000Z'
const sources=['browse','personal-tmdb','profile-state','movie-hub','waipu','joyn']
const movie=(id,extra={})=>({
  id:'tmdb-movie-'+id,tmdbId:id,type:'movie',source:'tmdb',
  title:'Movie '+id,description:'TMDB movie details',
  posterUrl:'https://image.tmdb.org/t/p/w500/film.jpg',metadataComplete:true,
  ...extra,
})
const fixtures=()=>{
  const inventory={
    kind:'title-candidate-inventory',schemaVersion:2,identity:'media-type+tmdb-id',
    generatedAt:'2026-10-24T07:00:00Z',
    counts:{canonicalCandidates:3},
    policy:{candidateSources:sources},
    sourceStats:Object.fromEntries(sources.map(s=>[s,{eligibleReferences:1}])),
    candidates:[
      {key:'movie:10',type:'movie',tmdbId:10,sources:['browse']},
      {key:'movie:20',type:'movie',tmdbId:20,sources:['personal-tmdb']},
      {key:'series:50',type:'series',tmdbId:50,sources:['joyn']},
    ],
  }
  const publicIndex={
    kind:'search-index',version:1,country:'DE',source:'tmdb',
    generatedAt:'2026-10-24T07:04:00Z',
    entries:[
      {id:'tmdb-movie-10',type:'movie',tmdbId:10,title:'Movie 10',providerIds:['youtube']},
      {id:'tmdb-movie-20',type:'movie',tmdbId:20,title:'Movie 20',providerOffers:[{id:'youtube',offerTypes:['buy']}]},
      {id:'tmdb-movie-30',type:'movie',tmdbId:30,title:'Movie 30',providerIds:['youtube']},
      {id:'tmdb-movie-40',type:'movie',tmdbId:40,title:'Movie 40',providerIds:['google_tv']},
      {id:'tmdb-series-50',type:'series',tmdbId:50,title:'Series 50',providerIds:['youtube']},
    ],count:5,
  }
  const ids=['abcdefghijk','lmnopqrstuv','WXYZ0123456']
  const reviewQueue={
    kind:'moviehub-youtube-g2-actionable-review-queue',schemaVersion:1,
    generatedAt:'2026-10-24T07:10:00Z',
    sourceVideoIds:3,accountedForVideos:3,missingVideos:0,
    declaredClasses:{FREE:2,'R&B':1},publishedPlaylistLinks:2,
    newCanonicalMovies:1,pendingReview:1,lanes:{'movie-versus-series':1},
    independentVerifiedDEOffers:0,newUnverifiedDatabaseWrites:0,
    privateArtifact:true,publicationPermitted:false,
    items:[
      {videoId:ids[0],playlistClass:'FREE',publicationStatus:'playlist-link-published'},
      {videoId:ids[1],playlistClass:'R&B',publicationStatus:'playlist-link-published'},
      {videoId:ids[2],playlistClass:'FREE',publicationStatus:'review-only'},
    ],
  }
  const editorialIndex={
    kind:'moviehub-youtube-curated-editorial-title-hints',schemaVersion:1,
    providerId:'youtube',publicationAuthority:'editorial-playlist-only',
    generatedAt:'2026-10-24T07:10:00Z',
    sourceVideoIds:3,verifiedDEOffers:0,verifiedPlaybackRoutes:0,
    count:2,entries:[
      {key:'movie:10',tmdbId:10,mediaType:'movie',videoId:ids[0],
        watchUrl:'https://www.youtube.com/watch?v='+ids[0],
        playlistMode:'free',verificationStatus:'not-independently-verified'},
      {key:'movie:60',tmdbId:60,mediaType:'movie',videoId:ids[1],
        watchUrl:'https://www.youtube.com/watch?v='+ids[1],
        playlistMode:'rent-buy',verificationStatus:'not-independently-verified'},
    ],
  }
  const searchTitleFeed={
    kind:'moviehub-youtube-curated-search-title-metadata',schemaVersion:1,
    providerId:'youtube',sourceVideoIds:3,
    generatedAt:'2026-10-24T07:10:00Z',
    offerVerification:'editorial-only-not-independent',
    count:2,entries:[{tmdbId:10,film:movie(10)},{tmdbId:60,film:movie(60)}],
  }
  const verifiedRoutes={
    kind:'moviehub-youtube-verified-title-routes',schemaVersion:1,
    providerId:'youtube',generatedAt:'2026-10-24T07:11:00Z',
    count:1,entries:[{key:'movie:20',tmdbId:20,mediaType:'movie',
      verifiedVideoId:'12345678901'}],
  }
  return {inventory,publicIndex,reviewQueue,editorialIndex,searchTitleFeed,verifiedRoutes}
}
describe('G2 AP1: full bidirectional inventory coverage without changing providers',()=>{
  it('keeps separate YouTube-first videos, existing TMDB badges and overlapping direct links',()=>{
    const r=buildYoutubeG2BidirectionalCoverage({...fixtures(),now})
    expect(r.youtubeFirst).toMatchObject({
      sourceVideos:3,freeVideos:2,rentBuyVideos:1,editorialDirectLinks:2,
      stableSearchTitles:2,newTmdbFilmMetadata:1,reviewOnlyVideos:1,
    })
    expect(r.tmdbFirst).toMatchObject({
      publicYoutubeBadgedMovies:3,publicYoutubeBadgedSeries:1,
      canonicalAndPublicMovieBadges:2,publicSearchOnlyMovieBadges:1,
      movieBadgesWithCuratedPlaylistLinks:1,
      movieBadgesWithIndependentlyVerifiedRoutes:1,
      movieBadgesWithAnyExactRoute:2,
      movieBadgesStillUsingSearchFallback:1,
      seriesBadgesRequiringEpisodeOrSeriesReview:1,
      privateOnlyYoutubeOfferCoverage:'unknown-not-in-public-search-index',
    })
    expect(r).toMatchObject({privateArtifact:true,publicationPermitted:false,
      publicRecordsExported:0,catalogWrites:0,firestoreWrites:0,badgeWrites:0})
    const markdown=renderYoutubeG2BidirectionalCoverage(r)
    expect(markdown).toContain('TMDB-first PUBLIC movies without exact links (search fallback): 1')
    expect(markdown).not.toContain('personal-tmdb')
  })
  it('fails closed if public index is stale, incomplete or another provider',()=>{
    const a=fixtures();a.publicIndex.country='US'
    expect(()=>buildYoutubeG2BidirectionalCoverage({...a,now}))
      .toThrow('G2_CURRENT_PUBLIC_DE_SEARCH_INDEX_REQUIRED')
    const b=fixtures();b.publicIndex.generatedAt='2026-01-01T00:00:00Z'
    expect(()=>buildYoutubeG2BidirectionalCoverage({...b,now}))
      .toThrow('G2_PUBLIC_INDEX_STALE_OR_FUTURE')
    const c=fixtures();c.inventory.candidates.pop()
    expect(()=>buildYoutubeG2BidirectionalCoverage({...c,now}))
      .toThrow('G2_FULL_CANONICAL_INVENTORY_REQUIRED')
  })
  it('blocks publication mismatches and missing canonical search coverage',()=>{
    const a=fixtures();a.reviewQueue.items[1].publicationStatus='review-only'
    expect(()=>buildYoutubeG2BidirectionalCoverage({...a,now}))
      .toThrow('YOUTUBE_G2_BIDIRECTIONAL_REVIEW_PUBLICATION_MISMATCH')
    const b=fixtures();b.searchTitleFeed.entries.pop();b.searchTitleFeed.count=1
    expect(()=>buildYoutubeG2BidirectionalCoverage({...b,now}))
      .toThrow('YOUTUBE_G2_BIDIRECTIONAL_INPUTS_MISSING_OR_UNTRUSTED')
    const c=fixtures();c.searchTitleFeed.entries[1].film.tmdbId=22
    expect(()=>buildYoutubeG2BidirectionalCoverage({...c,now}))
      .toThrow('YOUTUBE_G2_BIDIRECTIONAL_SEARCH_COVERAGE_INVALID')
  })
  it('never promotes editorial FREE/R&B offers to independently verified routes',()=>{
    const a=fixtures();a.verifiedRoutes.entries=[];a.verifiedRoutes.count=0
    const r=buildYoutubeG2BidirectionalCoverage({...a,now})
    expect(r.tmdbFirst.movieBadgesWithIndependentlyVerifiedRoutes).toBe(0)
    expect(r.tmdbFirst.movieBadgesWithAnyExactRoute).toBe(1)
    expect(r.tmdbFirst.movieBadgesStillUsingSearchFallback).toBe(2)
    expect(r.totalVerifiedDETitleRoutes).toBe(0)
    const b=fixtures();b.editorialIndex.verifiedDEOffers=1
    expect(()=>buildYoutubeG2BidirectionalCoverage({...b,now}))
      .toThrow('YOUTUBE_G2_BIDIRECTIONAL_INPUTS_MISSING_OR_UNTRUSTED')
  })
  it('rejects mismatched source-video and counts instead of claiming 100% coverage',()=>{
    const a=fixtures();a.reviewQueue.pendingReview=0
    expect(()=>buildYoutubeG2BidirectionalCoverage({...a,now}))
      .toThrow('YOUTUBE_G2_BIDIRECTIONAL_INPUTS_MISSING_OR_UNTRUSTED')
    const b=fixtures();b.reviewQueue.items[2].videoId=b.reviewQueue.items[0].videoId
    expect(()=>buildYoutubeG2BidirectionalCoverage({...b,now}))
      .toThrow('YOUTUBE_G2_BIDIRECTIONAL_REVIEW_VIDEO_INVALID')
  })
})
