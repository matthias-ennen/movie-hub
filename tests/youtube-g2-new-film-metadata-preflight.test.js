import {describe,it,expect,vi} from 'vitest'
import {
  selectYoutubeNewFilmMetadataCandidates,inspectYoutubeNewFilmMetadata,
  assessFetchedYoutubeFilmMetadata,youtubeNewFilmMetadataReport,
} from '../scripts/youtube-g2-new-film-metadata-preflight.mjs'
const AT='2026-10-23T13:00:00.000Z'
const source=()=>({
  intake:{
    mode:'YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY',
    generatedAt:AT,uniqueVideoIds:2,
    items:[
      {videoId:'xlRAr36rWo0',sourceTitle:'Wishmaster 2',sourceRuntimeMinutes:92.7,
        durationMinutes:92.7,regionSignal:'unknown',
        suggestedFilmRef:{mediaType:'movie',tmdbId:12594}},
      {videoId:'3csAkKfa6Vs',sourceTitle:'Deep Star Six',sourceRuntimeMinutes:99,
        durationMinutes:99,regionSignal:'unknown',
        suggestedFilmRef:{mediaType:'movie',tmdbId:11607}},
    ],
  },
  reconciliation:{
    kind:'moviehub-youtube-full-catalog-reconciliation',schemaVersion:1,
    generatedAt:AT,sourceObservedAt:AT,inventoryGeneratedAt:AT,
    privateArtifact:true,publicationPermitted:false,
    totalVideoIds:2,processedVideoIds:2,unaccountedForVideoIds:0,
    newMoviesImported:0,verifiedDEOffers:0,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,nightlyWrites:0,
    entries:[
      {videoId:'xlRAr36rWo0',suggestedFilmKey:'movie:12594',
        decision:'new-tmdb-metadata-review',
        strongMetadataCandidate:true,
        completeCatalogMembership:'not-in-canonical-inventory',
        filmIdentityApproved:false,newMovieImported:false,verifiedOffer:false,
        playlistClass:'FREE',originalStage:'not-in-public-index-check-complete-catalog'},
      {videoId:'3csAkKfa6Vs',suggestedFilmKey:'movie:11607',
        decision:'already-linked-editorial',
        playlistClass:'R&B',originalStage:'linked-existing-editorial',
        filmIdentityApproved:false,newMovieImported:false,verifiedOffer:false},
    ],
  },
})
const metadata={
  id:'tmdb-movie-12594',tmdbId:12594,type:'movie',source:'tmdb',
  title:'Wishmaster 2: Evil Never Dies',description:'Feature-length sequel film.',
  runtimeMinutes:96,posterPath:'/test-poster.jpg',
  metadataComplete:true,metadataVersion:3,
}
describe('YouTube full-catalog first new-title TMDB metadata preflight',()=>{
  it('selects only strict truly absent TMDB film candidates, never existing Deep Star Six',()=>{
    const data=source()
    const candidates=selectYoutubeNewFilmMetadataCandidates(data.reconciliation,data.intake,{now:AT})
    expect(candidates).toEqual([{
      videoId:'xlRAr36rWo0',tmdbId:12594,key:'movie:12594',
      sourceRuntimeMinutes:92.7,sourceTitle:'Wishmaster 2',
      playlistClass:'FREE',sourceStage:'not-in-public-index-check-complete-catalog',
    }])
  })
  it('reuses canonical TMDB client output and records metadata, but never falsely publishes offer or film',async()=>{
    const data=source()
    const loader=vi.fn(async()=>structuredClone(metadata))
    const result=await inspectYoutubeNewFilmMetadata(data.reconciliation,data.intake,{
      now:AT,loadTitle:loader,
    })
    expect(loader).toHaveBeenCalledWith({type:'movie',tmdbId:12594},AT)
    expect(result).toMatchObject({
      accountedSourceVideoIds:2,tmdbCandidateCount:1,
      inspectedCandidates:1,metadataReadyForWorkReview:1,
      counts:{'tmdb-metadata-ready-for-work-review':1},
      approvedFilmIdentities:0,newMoviesImported:0,verifiedDEOffers:0,
      catalogWrites:0,firestoreWrites:0,privateArtifact:true,
      rows:[{filmIdentityApproved:false,playlistPlaybackVerified:false,
        newMovieImported:false,independentlyVerifiedDEOffer:false}],
    })
    expect(youtubeNewFilmMetadataReport(result)).toContain('TMDB canonical movie metadata')
  })
  it('fails closed if TMDB returns a different movie, too-short film, missing poster or 404',async()=>{
    const c=selectYoutubeNewFilmMetadataCandidates(source().reconciliation,source().intake,{now:AT})[0]
    expect(assessFetchedYoutubeFilmMetadata(c,{...metadata,tmdbId:12595}).outcome)
      .toBe('metadata-identity-mismatch')
    expect(assessFetchedYoutubeFilmMetadata(c,{...metadata,runtimeMinutes:48}).outcome)
      .toBe('film-runtime-mismatch')
    expect(assessFetchedYoutubeFilmMetadata(c,{...metadata,posterPath:null}).outcome)
      .toBe('tmdb-metadata-incomplete')
    const data=source()
    const result=await inspectYoutubeNewFilmMetadata(data.reconciliation,data.intake,{
      now:AT,loadTitle:()=>Promise.reject(Object.assign(new Error('not found'),{code:'TMDB_METADATA_NOT_FOUND'})),
    })
    expect(result.counts).toEqual({'tmdb-metadata-fetch-error':1})
    expect(result.metadataReadyForWorkReview).toBe(0)
  })
  it('refuses unapproved badges, stale evidence, 100% coverage gaps and over-capacity',()=>{
    for(const change of [
      d=>{d.reconciliation.publicationPermitted=true},
      d=>{d.reconciliation.catalogWrites=1},
      d=>{d.reconciliation.unaccountedForVideoIds=1},
      d=>{d.reconciliation.entries[0].filmIdentityApproved=true},
      d=>{d.reconciliation.entries[0].suggestedFilmKey='movie:0'},
      d=>{d.reconciliation.entries[0].newMovieImported=true},
    ]){
      const data=source()
      change(data)
      expect(()=>selectYoutubeNewFilmMetadataCandidates(data.reconciliation,data.intake,{now:AT}))
        .toThrow()
    }
    const data=source()
    expect(()=>selectYoutubeNewFilmMetadataCandidates(data.reconciliation,data.intake,{
      now:'2026-10-25T13:00:00.000Z',
    })).toThrow('YOUTUBE_NEW_FILM_PREFLIGHT_INVALID_SOURCE')
  })
})
