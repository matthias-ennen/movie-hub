import {describe,it,expect,vi} from 'vitest'
import {
  planYoutubeNewFilmMetadataReview,
  inspectYoutubeNewFilmMetadata,
  youtubeMetadataReviewMarkdown,
} from '../scripts/youtube-g2-canonical-metadata-review.mjs'
const NOW='2026-10-23T16:00:00.000Z'
const make=()=>{
  const ids=['ucRKSNwzM_w','3csAkKfa6Vs','1uf2AMrQMk0']
  const stages=['new-tmdb-metadata-review','exists-in-complete-catalog-review','already-linked-editorial']
  const tmdbIds=[9730,11607,10586]
  const classes=['FREE','R&B','FREE']
  const entries=ids.map((videoId,i)=>({
    videoId,playlistClass:classes[i],
    filmIdentityApproved:false,newMovieImported:false,verifiedOffer:false,
    decision:stages[i],suggestedFilmKey:'movie:'+tmdbIds[i],
    completeCatalogMembership:i===0?'not-in-canonical-inventory':'canonical-existing',
    strongMetadataCandidate:true,
  }))
  const sources=ids.map((videoId,i)=>({
    videoId,playlistClass:classes[i],sourceScreened:true,
    sourceTitle:['Freitag der 13. – Das letzte Kapitel','Deep Star Six','Der Geist und die Dunkelheit'][i],
    durationMinutes:[91,100,110][i],regionSignal:'unknown',
    identityResearchStatus:'review-leading-film-hypothesis',
  }))
  const rows=ids.map((videoId,i)=>({
    videoId,editorialOfferHint:classes[i]==='FREE'?'free':'rent-buy',
    matchStatus:'review-leading-film-hypothesis',
    identityRisk:null,errors:[],alternativeTvIds:[],
    topCandidates:[{tmdbId:tmdbIds[i],score:42,titleLevel:4,
      runtimeDelta:1,yearMismatch:false,sequelConflict:false}],
  }))
  const full={
    kind:'moviehub-youtube-full-catalog-reconciliation',
    schemaVersion:1,privateArtifact:true,publicationPermitted:false,
    generatedAt:NOW,totalVideoIds:3,processedVideoIds:3,unaccountedForVideoIds:0,
    newMoviesImported:0,verifiedDEOffers:0,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,nightlyWrites:0,
    sourceObservedAt:NOW,metadataReviewCandidateCount:1,entries,
  }
  const intake={
    mode:'YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY',
    uniqueVideoIds:3,items:sources,
  }
  const research={summary:{
    mode:'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY',
    sourceVideoIds:3,processedRows:3,sourceQAObservedAt:NOW,
  },rows}
  return {full,intake,research}
}
const load=vi.fn(async entry=>({
  id:'tmdb-movie-'+entry.tmdbId,tmdbId:entry.tmdbId,type:'movie',source:'tmdb',
  title:'Synthetic movie title',originalTitle:'Original',
  runtimeMinutes:91,posterUrl:'https://image.tmdb.org/t/p/w500/mock.jpg',
  year:1984,metadataVersion:4,metadataChecks:{details:'present'},
}))
describe('YouTube G2 TMDB new-film metadata review (not a catalog import)',()=>{
  it('selects only unique, strong and entirely not-yet-canonical candidate films',()=>{
    const {full,intake,research}=make()
    const plan=planYoutubeNewFilmMetadataReview(full,intake,research,{now:NOW})
    expect(plan.candidateCount).toBe(1)
    expect(plan.candidates[0]).toMatchObject({
      videoId:'ucRKSNwzM_w',tmdbId:9730,
      playlistClass:'FREE',independentWorkIdentityApproved:false,
    })
    expect(load).not.toHaveBeenCalled()
  })
  it('reuses dominant-film safeguard for new-film TMDB metadata, but not a remake tie',()=>{
    const {full,intake,research}=make()
    research.rows[0].topCandidates.push(
      {tmdbId:4488,score:8,titleLevel:2,runtimeDelta:32},
      {tmdbId:13207,score:-4,titleLevel:0,runtimeDelta:42},
    )
    const plan=planYoutubeNewFilmMetadataReview(full,intake,research,{now:NOW})
    expect(plan.candidates).toHaveLength(1)
    expect(plan.candidates[0].independentWorkIdentityApproved).toBe(false)

    research.rows[0].topCandidates[1]={
      tmdbId:4488,score:38,titleLevel:4,runtimeDelta:3,
    }
    expect(()=>planYoutubeNewFilmMetadataReview(full,intake,research,{now:NOW}))
      .toThrow('YOUTUBE_METADATA_REVIEW_CANDIDATE_NOT_UNIQUE')
  })
  it('fetches existing canonical TMDB metadata format but approves nothing',async()=>{
    const {full,intake,research}=make()
    const plan=planYoutubeNewFilmMetadataReview(full,intake,research,{now:NOW})
    const out=await inspectYoutubeNewFilmMetadata(plan,{loadTitle:load,now:NOW})
    expect(out).toMatchObject({candidatesSelected:1,metadataReviewed:1,
      metadataPreviewReady:1,newMoviesImported:0,verifiedDEOffers:0,
      publicationPermitted:false,firestoreWrites:0,catalogWrites:0,
      privateArtifact:true})
    expect(out.items[0].tmdb).toMatchObject({
      id:'tmdb-movie-9730',source:'tmdb',tmdbId:9730,runtimeMinutes:91,
    })
    expect(out.items[0]).toMatchObject({workIdentityApproved:false,
      newMovieImported:false,offerPublished:false})
    expect(youtubeMetadataReviewMarkdown(out)).toContain('1')
  })
  it('holds back a conflicting TMDB work/runtime or invalid ID',async()=>{
    const {full,intake,research}=make()
    const plan=planYoutubeNewFilmMetadataReview(full,intake,research,{now:NOW})
    for(const title of [{id:'tmdb-movie-77',tmdbId:77,type:'movie',source:'tmdb',
      title:'Wrong movie',runtimeMinutes:91},
    {id:'tmdb-movie-9730',tmdbId:9730,type:'movie',source:'tmdb',
      title:'Wrong cut',runtimeMinutes:180}]){
      const out=await inspectYoutubeNewFilmMetadata(plan,{
        loadTitle:async()=>title,now:NOW})
      expect(out.metadataPreviewReady).toBe(0)
      expect(out.items[0].status).toBe('identity-or-duration-review')
    }
  })
  it('does not auto-approve on lookup failure',async()=>{
    const {full,intake,research}=make()
    const plan=planYoutubeNewFilmMetadataReview(full,intake,research,{now:NOW})
    const out=await inspectYoutubeNewFilmMetadata(plan,{
      loadTitle:async()=>{throw Object.assign(new Error('Not found'),{code:'TMDB_METADATA_NOT_FOUND'})},
      now:NOW})
    expect(out.items[0]).toMatchObject({
      status:'tmdb-request-review',reason:'TMDB_METADATA_NOT_FOUND',
      tmdb:null,newMovieImported:false,
    })
  })
  it('fails closed on changed verification, tampered identity or nonprivate source',()=>{
    const baseline=make()
    for(const alter of [
      f=>{f.metadataReviewCandidateCount=2},
      f=>{f.entries[0].newMovieImported=true},
      f=>{f.privateArtifact=false},
      f=>{f.entries[0].suggestedFilmKey='movie:2'},
    ]){
      const data=structuredClone(baseline)
      alter(data.full)
      expect(()=>planYoutubeNewFilmMetadataReview(data.full,data.intake,
        data.research,{now:NOW})).toThrow()
    }
  })
})
