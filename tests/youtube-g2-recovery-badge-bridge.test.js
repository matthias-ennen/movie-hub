import { describe, it, expect, vi } from 'vitest'
import {
  runCuratedMissingVideoRecovery, buildExistingYoutubeBadgeLinkReview,
} from '../scripts/youtube-g2-recovery-badge-bridge.mjs'
const free='PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
const rent='PLJWJS8p_IeEo'
const ids=['Abc12345678','Zbc12345678','Cbc12345678']
const missing=id => ({
  videoId:id, playlistModes:['free'], editorialOfferHint:'free',
  status:'review-video-missing-or-private', videoTitle:null,minutes:null,
  screened:false, accepted:false,toImport:false,playbackRoute:null,verifiedOfferType:null,
})
const ready=id => ({
  ...missing(id),status:'review-tmdb-work-identity', videoTitle:'Known Film',
  minutes:100,screened:true, deRegionSignal:'allowed',
})
const conflict={...ready(ids[2]),playlistModes:['free','rent-buy'],
  editorialOfferHint:'ambiguous',status:'review-conflicting-curation'}
const audit = (candidates=[missing(ids[0]),ready(ids[1]),conflict])=>({
  mode:'CURATED_TWO_PLAYLISTS_READ_ONLY', observedAt:'2026-10-22T16:47:34.710Z',
  playlistSummaries:[{mode:'free',playlistId:free,fullyScanned:true},
    {mode:'rent-buy',playlistId:rent,fullyScanned:true}],
  uniqueVideoIds:candidates.length,fullyScanned:true,publicationPermitted:false,
  candidates,catalogWrites:0,firestoreWrites:0,providerWrites:0,
  badgeWrites:0,nightlyWrites:0,
})
const video=id=>({
  id, snippet:{channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',channelTitle:'Provider',
    title:'Recovered Full Film',categoryId:'30'},
  contentDetails:{duration:'PT1H40M',regionRestriction:{allowed:['DE']}},
  status:{privacyStatus:'public'},
})
const index=(e=[])=>({
  kind:'search-index',version:1,country:'DE',source:'published',
  entries:e,count:e.length,
})
const tmdbRows=[
  {videoId:ids[0],matchStatus:'review-leading-film-hypothesis',
    topCandidates:[{tmdbId:15,titleLevel:4,runtimeDelta:2,yearMismatch:false,sequelConflict:false}]},
  {videoId:ids[1],matchStatus:'review-leading-film-hypothesis',
    topCandidates:[{tmdbId:20,titleLevel:4,runtimeDelta:1,yearMismatch:false,sequelConflict:false}]},
  {videoId:ids[2],matchStatus:'review-leading-film-hypothesis',
    topCandidates:[{tmdbId:25,titleLevel:4,runtimeDelta:1,yearMismatch:false,sequelConflict:false}]},
]
describe('G2 source video recovery then shared-provider badge candidate bridge',()=>{
  it('only retries missing IDs and preserves the original source inventory and zeros',async()=>{
    const api=vi.fn(async (endpoint,params)=>{
      expect(endpoint).toBe('videos')
      expect(params.id).toBe(ids[0])
      return {items:[video(ids[0])]}
    })
    const out=await runCuratedMissingVideoRecovery({
      audit:audit(),youtubeApi:api,at:()=> '2026-10-22T20:00:00.000Z',
    })
    expect(api).toHaveBeenCalledTimes(1)
    expect(out.metadataRecovery).toMatchObject({
      attempted:1,recovered:1,recoveredEligible:1,stillMissing:0,
      youtubeVideoLookupCalls:1,deletedVideoIdsConfirmed:0,sourceInventoryChanged:false,
    })
    expect(out.candidates[0]).toMatchObject({
      status:'review-tmdb-work-identity',videoTitle:'Recovered Full Film',
      verifiedOfferType:null,accepted:false,toImport:false,playbackRoute:null,
    })
    expect(out.candidates.slice(1)).toEqual(audit().candidates.slice(1))
    expect(out.candidates.map(c=>c.videoId)).toEqual(ids)
    expect(out).toMatchObject({
      publicationPermitted:false,catalogWrites:0,firestoreWrites:0,
      providerWrites:0,badgeWrites:0,nightlyWrites:0,
    })
  })
  it('does not infer deletion or set availability when API omits video details',async()=>{
    const out=await runCuratedMissingVideoRecovery({
      audit:audit(),youtubeApi:async()=>({items:[]}),
      at:()=> '2026-10-22T20:00:00.000Z',
    })
    expect(out.metadataRecovery).toMatchObject({
      attempted:1,recovered:0,stillMissing:1,deletedVideoIdsConfirmed:0,
    })
    expect(out.candidates[0]).toMatchObject({
      status:'review-video-missing-or-private',deletionConfirmed:false,
      playbackRoute:null,verifiedOfferType:null,
    })
  })
  it('does not call API when all videos were already present',async()=>{
    const api=vi.fn()
    const out=await runCuratedMissingVideoRecovery({
      audit:audit([ready(ids[0]),ready(ids[1]),conflict]),
      youtubeApi:api,at:()=> '2026-10-22T20:00:00.000Z',
    })
    expect(api).not.toHaveBeenCalled()
    expect(out.metadataRecovery.youtubeVideoLookupCalls).toBe(0)
  })
  it('bridges only exact existing YouTube badges to REVIEW link candidates',()=>{
    const a=audit([ready(ids[0]),ready(ids[1]),conflict])
    const b=buildExistingYoutubeBadgeLinkReview({
      audit:a,tmdbRows,publicIndex:index([
        {type:'movie',tmdbId:15,providerIds:['youtube']},
        {type:'movie',tmdbId:20,providerIds:['google_tv']},
        {type:'movie',tmdbId:25,providerOffers:[{id:'youtube'}]},
      ]),
    })
    expect(b).toMatchObject({
      sourceVideoIds:3,knownPublicYoutubeBadges:2,
      candidateExistingBadgeRoutes:1,verifiedDEOffers:0,
      independentlyVerifiedWorks:0,publicationPermitted:false,
      firestoreWrites:0,providerWrites:0,badgeWrites:0,
    })
    expect(b.records[0]).toMatchObject({
      proposedTitleRef:{mediaType:'movie',tmdbId:15},
      existingExactYoutubeBadge:true,
      reviewCandidateWatchUrl:'https://www.youtube.com/watch?v='+ids[0],
      productionPlaybackRoute:null,productionAvailability:null,
      verifiedOfferType:null,publicationPermitted:false,
    })
    expect(b.records[1].existingExactYoutubeBadge).toBe(false)
    expect(b.records[1].reviewCandidateWatchUrl).toBeNull()
    expect(b.records[2].reviewStatus).toBe('review-overlapping-editorial-offer')
    expect(b.records[2].reviewCandidateWatchUrl).toBeNull()
  })
  it('never promotes missing runtime or weak identities',()=>{
    const a=audit([ready(ids[0])])
    const rows=[{...tmdbRows[0],topCandidates:[
      {tmdbId:15,titleLevel:4,runtimeDelta:null,yearMismatch:false,sequelConflict:false}]}]
    const b=buildExistingYoutubeBadgeLinkReview({
      audit:a,tmdbRows:rows,publicIndex:index([{type:'movie',tmdbId:15,providerIds:['youtube']}]),
    })
    expect(b.records[0].reviewCandidateWatchUrl).toBeNull()
    expect(b.records[0].productionPlaybackRoute).toBeNull()
  })
  it('rejects untrusted QA and mismatched video IDs before any processing',async()=>{
    await expect(runCuratedMissingVideoRecovery({
      audit:{...audit(),firestoreWrites:1},youtubeApi:vi.fn(),
    })).rejects.toThrow('RECOVERY_SOURCE_QA_INVALID_OR_WRITABLE')
    expect(()=>buildExistingYoutubeBadgeLinkReview({
      audit:audit(),tmdbRows:tmdbRows.slice(1),publicIndex:index(),
    })).toThrow('BRIDGE_INPUTS_INVALID')
  })
})
