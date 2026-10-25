import {describe,it,expect,vi} from 'vitest'
import {
  planPendingCuratedVideoRefresh,refreshPendingCuratedMetadata,
  pendingRefreshMarkdown,
} from '../scripts/youtube-g2-pending-video-refresh.mjs'
const TIME='2026-10-24T17:00:00.000Z'
const watch=id=>'https://www.youtube.com/watch?v='+id
function qa(){
  const a={videoId:'Abc12345678',playlistClass:'FREE',title:'Original film',
    url:watch('Abc12345678'),sourceVerifiedDEOffer:false,
    publicationStatus:'review-only',
    lane:'existing-movie-needs-identity-proof',priority:1,suggestedTmdbId:111,
    tmdbAlternatives:[{tmdbId:111,score:38,titleLevel:4,runtimeDelta:3}]}
  const b={videoId:'Def12345678',playlistClass:'R&B',title:null,
    url:watch('Def12345678'),sourceVerifiedDEOffer:false,
    publicationStatus:'review-only',
    lane:'missing-video-metadata',priority:2,suggestedTmdbId:null,tmdbAlternatives:[]}
  const pub={videoId:'Ghi12345678',playlistClass:'FREE',
    url:watch('Ghi12345678'),sourceVerifiedDEOffer:false,
    publicationStatus:'playlist-link-published',lane:'existing-movie-linked'}
  return {kind:'moviehub-youtube-g2-actionable-review-queue',
    schemaVersion:1,generatedAt:TIME,sourceVideoIds:3,accountedForVideos:3,
    missingVideos:0,publishedPlaylistLinks:1,pendingReview:2,
    independentVerifiedDEOffers:0,newUnverifiedDatabaseWrites:0,
    privateArtifact:true,publicationPermitted:false,
    lanes:{'existing-movie-needs-identity-proof':1,'missing-video-metadata':1},
    items:[a,b,pub],prioritizedReview:[a,b]}
}
const video=(id,title)=>({id,status:{privacyStatus:'public'},
  snippet:{title},contentDetails:{duration:'PT1H36M',
    regionRestriction:{allowed:['DE','AT']}}})
describe('Pending 55 curated playlist video refresh uses 0 search.list',()=>{
  it('preserves exact pending vs published split and 50-ID videos.list chunking',()=>{
    const p=planPendingCuratedVideoRefresh(qa(),{now:TIME})
    expect(p).toMatchObject({sourceVideoIds:3,published:1,pending:2})
    expect(p.chunks).toEqual([['Abc12345678','Def12345678']])
  })
  it('one official videos.list request refreshes missing metadata but never approves movie',async()=>{
    const api=vi.fn(async(endpoint,params)=>{
      expect(endpoint).toBe('videos')
      expect(params.part).toBe('snippet,contentDetails,status')
      return {items:[video('Abc12345678','Known Film'),
        video('Def12345678','Previously Missing')]}
    })
    const out=await refreshPendingCuratedMetadata({
      qa:qa(),youtubeApi:api,now:TIME})
    expect(api).toHaveBeenCalledTimes(1)
    expect(out.summary).toMatchObject({sourceVideoIds:3,
      publishedEditorialLinks:1,pendingVideoIds:2,
      videosListCalls:1,searchListCalls:0,
      previouslyMissingMetadata:1,recoveredMissingMetadata:1,
      readyForIndividualIdentityReview:1,
      verifiedGermanOffers:0,approvedDirectRoutes:0,
      firestoreWrites:0,publicationPermitted:false})
    expect(out.reviewPriority.map(r=>r.videoId)).toEqual(['Abc12345678'])
    expect(out.rows.every(x=>x.approvedWorkIdentity===false
      &&x.verifiedGermanOffer===false&&x.approvedPlaybackRoute===null)).toBe(true)
    expect(pendingRefreshMarkdown(out)).toContain('movie:111')
  })
  it('retains hidden/missing/regional/excerpt videos only as unsafe review',async()=>{
    const api=vi.fn(async()=>({items:[{
      ...video('Abc12345678','Original film'),
      contentDetails:{duration:'PT1M30S',regionRestriction:{blocked:['DE']}},
    }]}))
    const out=await refreshPendingCuratedMetadata({
      qa:qa(),youtubeApi:api,now:TIME})
    expect(out.summary.videoStatusCounts).toEqual({
      'DE-excluded-metadata':1,'metadata-not-returned':1})
    expect(out.summary.readyForIndividualIdentityReview).toBe(0)
    expect(out.summary.recoveredMissingMetadata).toBe(0)
    expect(api).toHaveBeenCalledTimes(1)
  })
  it('refuses missing or forged source, undeclared video IDs and duplicate response IDs',async()=>{
    const fixture=qa()
    for(const mutation of [
      x=>{x.publicationPermitted=true},
      x=>{x.pendingReview=1},
      x=>{x.items[0].sourceVerifiedDEOffer=true},
      x=>{x.prioritizedReview[1].suggestedTmdbId=999},
      x=>{x.prioritizedReview[0].tmdbAlternatives[0].tmdbId=555},
      x=>{x.items[1].videoId='wrong'},
    ]){
      const bad=structuredClone(fixture);mutation(bad)
      expect(()=>planPendingCuratedVideoRefresh(bad,{now:TIME})).toThrow()
    }
    const api=vi.fn(async()=>({items:[video('Unknown1234','Injected')]}))
    await expect(refreshPendingCuratedMetadata({
      qa:qa(),youtubeApi:api,now:TIME})).rejects.toThrow('YOUTUBE_PENDING_VIDEO_ID_MISMATCH')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('keeps the protected identity evidence checklist review-only and refuses forged approval',async()=>{
    const out=await refreshPendingCuratedMetadata({
      qa:qa(),youtubeApi:async()=>({items:[video('Abc12345678','Known Film')]}),
      now:TIME,
    })
    const report=pendingRefreshMarkdown(out)
    expect(report).toContain('### 1. movie:111')
    expect(report).toContain('https://www.youtube.com/watch?v=Abc12345678')
    expect(report).toContain('Android:')
    expect(report).toContain('Fire TV:')
    expect(report).toContain('keine automatische Angebots-/Routenfreigabe')
    expect(report).not.toContain('### 2. movie:')
    const forged=structuredClone(out)
    forged.reviewPriority[0].approvedWorkIdentity=true
    expect(()=>pendingRefreshMarkdown(forged)).toThrow(
      'YOUTUBE_PENDING_REPORT_REVIEW_NOT_TRUSTED')
    forged.reviewPriority[0].approvedWorkIdentity=false
    forged.summary.verifiedGermanOffers=1
    expect(()=>pendingRefreshMarkdown(forged)).toThrow('YOUTUBE_PENDING_REPORT_INVALID')
  })
})
