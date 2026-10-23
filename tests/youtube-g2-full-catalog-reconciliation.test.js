import {describe,it,expect} from 'vitest'
import {
  reconcileYoutubeWithCompleteCatalog,completeCatalogReport,
} from '../scripts/youtube-g2-full-catalog-reconciliation.mjs'

const NOW='2026-10-23T12:15:00.000Z'
const OBSERVED='2026-10-23T12:00:00.000Z'
const RESEARCH_AT='2026-10-23T12:02:00.000Z'
const vide=(videoId,tmdbId,stage,playlistClass='FREE')=>({
  videoId,playlistClass,sourceTitle:'A synthetic full movie',
  sourceScreened:true,regionSignal:'unknown',
  suggestedFilmRef:{mediaType:'movie',tmdbId},
  matchConfidence:'hypothesis-not-verified',
  identityResearchStatus:'review-leading-film-hypothesis',
  publicCatalogMembership:stage==='not-in-public-index-check-complete-catalog'
    ?'public-not-present':'public-present',
  stage,approvedFilmIdentity:false,automatedCatalogImport:false,
  newCatalogTitleCreated:false,independentlyVerifiedDEOffer:false,
  productionAvailability:null,verifiedPlaybackRoute:null,
})
const row=i=>({
  videoId:i.videoId,editorialOfferHint:i.playlistClass==='FREE'?'free':'rent-buy',
  matchStatus:i.identityResearchStatus,
  publicIndexMembership:i.publicCatalogMembership,
  identityRisk:null,errors:[],alternativeTvIds:[],
  topCandidates:[{tmdbId:i.suggestedFilmRef.tmdbId,
    score:42,titleLevel:4,runtimeDelta:1,
    yearMismatch:false,sequelConflict:false}],
})
const sourceData=()=>{
  const items=[
    vide('1uf2AMrQMk0',10586,'linked-existing-editorial'),
    vide('xlRAr36rWo0',12594,'not-in-public-index-check-complete-catalog'),
    vide('DEIg0qB3HF8',338912,'not-in-public-index-check-complete-catalog','R&B'),
    vide('WWaDDo2DAmM',8922,'existing-film-match-review'),
  ]
  const intake={
    mode:'YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY',
    generatedAt:'2026-10-23T12:04:00.000Z',
    sourceQAObservedAt:OBSERVED,researchObservedAt:RESEARCH_AT,
    fullScan:true,twoUserDefinedPlaylists:true,publicationPermitted:false,
    uniqueVideoIds:items.length,processedVideoIds:items.length,
    unaccountedForVideoIds:0,
    newCatalogTitlesImported:0,independentlyVerifiedDEOffers:0,
    productionAvailabilityRecords:0,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,nightlyWrites:0,
    items,
  }
  const research={summary:{
    mode:'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY',
    sourceQAObservedAt:OBSERVED,generatedAt:RESEARCH_AT,
    sourceVideoIds:items.length,processedRows:items.length,
    verifiedFilms:0,verifiedDEOffers:0,publicationPermitted:false,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,nightlyWrites:0,
  },rows:items.map(row)}
  const inventory={kind:'title-candidate-inventory',schemaVersion:2,
    identity:'media-type+tmdb-id',generatedAt:RESEARCH_AT,
    policy:{searchIndexRole:'classification-only'},
    counts:{canonicalCandidates:3},
    candidates:[
      {key:'movie:10586',sources:['browse']},
      {key:'movie:12594',sources:['personal-tmdb','profile-state']},
      {key:'movie:8922',sources:['waipu']},
    ],
    searchOnly:{count:0,keys:[]},
  }
  return {intake,research,inventory}
}
describe('YouTube: all playlist IDs reconciled with complete MovieHub catalog',()=>{
  it('detects existing personal titles that PUBLIC search incorrectly called absent',()=>{
    const {intake,research,inventory}=sourceData()
    const result=reconcileYoutubeWithCompleteCatalog(intake,inventory,research,{now:NOW})
    expect(result).toMatchObject({
      kind:'moviehub-youtube-full-catalog-reconciliation',schemaVersion:1,
      processedVideoIds:4,totalVideoIds:4,unaccountedForVideoIds:0,
      privateArtifact:true,newMoviesImported:0,verifiedDEOffers:0,
      catalogWrites:0,firestoreWrites:0,badgeWrites:0,
      decisionsSummary:{
        'already-linked-editorial':1,
        'exists-in-complete-catalog-review':2,
        'new-tmdb-metadata-review':1,
      },
    })
    const personal=result.entries.find(x=>x.videoId==='xlRAr36rWo0')
    expect(personal).toMatchObject({
      completeCatalogMembership:'canonical-existing',
      canonicalSources:['personal-tmdb','profile-state'],
      decision:'exists-in-complete-catalog-review',newMovieImported:false,
      verifiedOffer:false,
    })
    const newCandidate=result.entries.find(x=>x.videoId==='DEIg0qB3HF8')
    expect(newCandidate).toMatchObject({
      suggestedFilmKey:'movie:338912',
      completeCatalogMembership:'not-in-canonical-inventory',
      decision:'new-tmdb-metadata-review',
      strongMetadataCandidate:true,filmIdentityApproved:false,
      newMovieImported:false,
    })
    expect(completeCatalogReport(result)).toContain('4/4')
  })
  it('does not mistake public SEARCH-only metadata for an existing canonical title',()=>{
    const {intake,research,inventory}=sourceData()
    inventory.searchOnly={keys:['movie:338912'],count:1}
    const result=reconcileYoutubeWithCompleteCatalog(intake,inventory,research,{now:NOW})
    const candidate=result.entries.find(x=>x.videoId==='DEIg0qB3HF8')
    expect(candidate.decision).toBe('search-index-only-review')
    expect(candidate.completeCatalogMembership).toBe('search-index-only')
  })
  it('guards multiple videos proposing same film: no newly imported movie',()=>{
    const {intake,research,inventory}=sourceData()
    intake.items[3].suggestedFilmRef.tmdbId=338912
    research.rows[3].topCandidates[0].tmdbId=338912
    const result=reconcileYoutubeWithCompleteCatalog(intake,inventory,research,{now:NOW})
    expect(result.entries.find(x=>x.videoId==='DEIg0qB3HF8').decision)
      .toBe('multi-video-one-film-review')
    expect(result.entries.find(x=>x.videoId==='WWaDDo2DAmM').decision)
      .toBe('multi-video-one-film-review')
    expect(result.newMoviesImported).toBe(0)
  })
  it('keeps questionable or ambiguous works in identity review',()=>{
    const {intake,research,inventory}=sourceData()
    research.rows[2].topCandidates.push({tmdbId:12,score:35,titleLevel:4,runtimeDelta:2})
    const result=reconcileYoutubeWithCompleteCatalog(intake,inventory,research,{now:NOW})
    expect(result.entries[2].decision).toBe('work-identity-review')
    expect(result.entries[2].strongMetadataCandidate).toBe(false)
  })
  it.each([
    ['Braven',459910,'3_K8jkv-5xg',52,0.3,[
      {tmdbId:487941,score:-1,titleLevel:2,runtimeDelta:13.7},
      {tmdbId:495621,score:-13,titleLevel:2,runtimeDelta:33.7},
    ]],
    ['American Evil',49429,'S5w40y_CIxM',50,4.3,[
      {tmdbId:28936,score:-12,titleLevel:0,runtimeDelta:2.7},
      {tmdbId:1191077,score:-29,titleLevel:0,runtimeDelta:40.7},
    ]],
  ])('prepares dominant new TMDB film %s for canonical metadata review only',
    (title,tmdbId,videoId,score,delta,side)=>{
      const {intake,research,inventory}=sourceData()
      intake.items[2].videoId=videoId
      intake.items[2].sourceTitle=title
      intake.items[2].suggestedFilmRef.tmdbId=tmdbId
      research.rows[2].videoId=videoId
      research.rows[2].topCandidates=[
        {tmdbId,score,titleLevel:4,runtimeDelta:delta,
          yearMismatch:false,sequelConflict:false},...side,
      ]
      const result=reconcileYoutubeWithCompleteCatalog(intake,inventory,research,{now:NOW})
      expect(result.entries[2]).toMatchObject({
        videoId,decision:'new-tmdb-metadata-review',
        strongMetadataCandidate:true,filmIdentityApproved:false,newMovieImported:false,
      })
      expect(result.metadataReviewCandidateCount).toBe(1)
      expect(result.catalogWrites).toBe(0)
    })

  it('never promotes close second films, extra candidates or TV alternates',()=>{
    for(const mutation of [
      r=>{r.topCandidates[1].titleLevel=4},
      r=>{r.topCandidates[1].score=30},
      r=>{r.topCandidates.push({tmdbId:4,score:0,titleLevel:0,runtimeDelta:34})},
      r=>{r.alternativeTvIds=[11]},
      r=>{r.identityRisk='explicit-unverified-cut-or-source'},
      r=>{r.topCandidates[0].runtimeDelta=17},
    ]){
      const {intake,research,inventory}=sourceData()
      research.rows[2].topCandidates.push({
        tmdbId:12,score:5,titleLevel:2,runtimeDelta:20,
      })
      mutation(research.rows[2])
      const result=reconcileYoutubeWithCompleteCatalog(intake,inventory,research,{now:NOW})
      expect(result.entries[2].decision).toBe('work-identity-review')
      expect(result.entries[2].strongMetadataCandidate).toBe(false)
    }
  })
  it('rejects incomplete intake, non-canonical inventory and forged approvals',()=>{
    const baseline=sourceData()
    for(const change of [
      data=>{data.intake.processedVideoIds=3},
      data=>{data.intake.items[0].approvedFilmIdentity=true},
      data=>{data.intake.items[0].productionAvailability={source:'youtube'}},
      data=>{data.intake.items[0].videoId='invalid'},
      data=>{data.inventory.identity='title-name'},
      data=>{data.research.summary.verifiedFilms=1},
      data=>{data.research.rows[2].editorialOfferHint='free'},
      data=>{data.inventory.candidates.push(data.inventory.candidates[0]);data.inventory.counts.canonicalCandidates=4},
      data=>{data.inventory.searchOnly={keys:['movie:10586'],count:1}},
    ]){
      const data=structuredClone(baseline)
      change(data)
      expect(()=>reconcileYoutubeWithCompleteCatalog(data.intake,data.inventory,data.research,{now:NOW}))
        .toThrow()
    }
  })
  it('rejects stale source or account inventory',()=>{
    const {intake,research,inventory}=sourceData()
    expect(()=>reconcileYoutubeWithCompleteCatalog(intake,inventory,research,{
      now:'2026-10-26T12:00:00.000Z',
    })).toThrow('YOUTUBE_FULL_CATALOG_RECONCILIATION_INPUT_INVALID')
  })
})
