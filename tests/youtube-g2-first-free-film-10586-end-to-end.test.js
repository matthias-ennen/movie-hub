import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reconcileCuratedYoutubeSource, CURATED_FREE_PLAYLIST,
  CURATED_RENT_BUY_PLAYLIST, APPROVAL_BUNDLE_KIND,
} from '../scripts/youtube-g2-curated-source-sync.mjs'
import { buildYoutubeVerifiedRouteIndex, selectYoutubeVerifiedTitleRoute } from '../src/providers/youtubeVerifiedRouteIndex.js'
import { withVerifiedYoutubeTitleOffer } from '../src/providers/youtubeVerifiedTitlePresentation.js'
import { resolveProviderPresentation } from '../src/providers/providerPresentation.js'
import { resolvePosterProviderModel } from '../src/providers/posterProviderModel.js'
import { providerOfferLabel } from '../src/providers/providerOfferLabels.js'
import { buildDetailStreamingProviderIds } from '../src/components/detailProviderPresentation.js'
import { launchProviderPlaybackRoute } from '../src/providers/providerPlaybackLaunch.js'
import { getProviderDestination, providers } from '../src/data/catalog.js'
import { resetProviderSelectionSnapshot } from '../src/settings/providerSelectionRuntime.js'

// All verification evidence in this file is SYNTHETIC TEST DATA, not a claim
// about the user's report, real Android/Fire-TV playback, actual rights, or
// independently confirmed full-length cuts. Do not publish this as an approval.
const NOW = '2026-10-23T12:30:00.000Z'
const ID = '1uf2AMrQMk0'
const WATCH = 'https://www.youtube.com/watch?v=' + ID
const TITLE = 'Der Geist und die Dunkelheit'
const MOVIE = {type:'movie', tmdbId:10586, title:TITLE,
  providerIds:[],tmdbProviderIds:[],tmdbProviderOffers:[]}

function syntheticCurrentAudit(){
  return {
    mode:'CURATED_TWO_PLAYLISTS_READ_ONLY',observedAt:NOW,fullyScanned:true,
    publicationPermitted:false,uniqueVideoIds:1,
    playlistSummaries:[
      {mode:'free',playlistId:CURATED_FREE_PLAYLIST,fullyScanned:true},
      {mode:'rent-buy',playlistId:CURATED_RENT_BUY_PLAYLIST,fullyScanned:true},
    ],
    candidates:[{
      videoId:ID,videoTitle:TITLE,channelId:'UC_SYNTHETIC_ONLY',
      playlistModes:['free'],playlistIds:[CURATED_FREE_PLAYLIST],
      editorialOfferHint:'free',screened:true,deRegionSignal:'unknown',
      accepted:false,toImport:false,playbackRoute:null,verifiedOfferType:null,
    }],
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  }
}
function simulatedApproval(overrides={}){
  return {
    videoId:ID,playlistMode:'free',titleRef:{mediaType:'movie',tmdbId:10586},
    approvalSource:'independent-manual-review',approvalStatus:'approved',
    verifiedAt:NOW,
    workEvidence:'SYNTHETIC TEST DATA: movie and cut checked',
    offerEvidence:'SYNTHETIC TEST DATA: German playback and tariff checked',
    workIdentityVerified:true,fullWorkOrValidCutVerified:true,
    dePlaybackVerified:true,offerTypeVerified:true,sourceUseAuthorized:true,
    accessType:'free',...overrides,
  }
}
function simulatedBundle(overrides={}){
  return {kind:APPROVAL_BUNDLE_KIND,schemaVersion:1,generatedAt:NOW,
    approvals:[simulatedApproval(overrides)]}
}
beforeEach(()=>resetProviderSelectionSnapshot({loading:false}))

describe('G2 first FREE pilot: source -> approval gate -> badge -> exact route',()=>{
  it('simulates independent full approval and renders the SAME film 10586 as FREE across poster/detail',()=>{
    const source=reconcileCuratedYoutubeSource({
      audit:syntheticCurrentAudit(),approvals:simulatedBundle(),now:NOW,
    })
    expect(source).toMatchObject({
      inventoryVideoIds:1,publishedVerifiedAvailabilities:1,approvedInputRows:1,
      reviewOnlyCandidates:0,catalogWrites:0,firestoreWrites:0,tmdbBadgeWrites:0,
    })
    const index=buildYoutubeVerifiedRouteIndex(source.sourceEnvelope,{now:NOW})
    expect(index).toMatchObject({
      count:1,entries:[{key:'movie:10586',tmdbId:10586,
        verifiedVideoId:ID,accessType:'free',target:WATCH}],
    })
    const enriched=withVerifiedYoutubeTitleOffer(MOVIE,index,{now:Date.parse(NOW)})
    expect(resolveProviderPresentation(MOVIE).providerIds).toEqual([])
    expect(resolveProviderPresentation(enriched)).toMatchObject({
      tmdbProviderIds:[],verifiedTitleProviderIds:['youtube'],
      providerIds:['youtube'],
    })
    const poster=resolvePosterProviderModel(enriched)
    expect(poster.providerIds).toEqual(['youtube'])
    expect(poster.offerLabels.youtube).toBe('FREE')
    const detailIds=buildDetailStreamingProviderIds(
      resolveProviderPresentation(enriched),providers,[],enriched)
    expect(detailIds).toEqual(['youtube'])
    expect(providerOfferLabel(enriched,'youtube',{context:'title'})).toBe('FREE')
    const fallback=getProviderDestination('youtube',TITLE)
    expect(fallback).toContain('results?search_query=')
    const route=selectYoutubeVerifiedTitleRoute(index,MOVIE,{
      now:Date.parse(NOW),hasYoutubeBadge:detailIds.includes('youtube')})
    expect(route).toMatchObject({
      providerId:'youtube',scope:'title',mode:'APP_DEEP_LINK',target:WATCH,
      geoRegion:'DE',
    })
    const bridge={openProviderRoute:vi.fn()}
    expect(launchProviderPlaybackRoute({
      providerId:'youtube',title:TITLE,route,fallbackUrl:fallback,nativeBridge:bridge,
    })).toBe(true)
    expect(bridge.openProviderRoute).toHaveBeenCalledWith(
      'youtube',TITLE,'APP_DEEP_LINK','title',WATCH,fallback)
    // Enrichment is in-memory and cannot rewrite original TMDB provider evidence.
    expect(MOVIE).toMatchObject({tmdbProviderIds:[],tmdbProviderOffers:[]})
  })

  it('does NOT create YouTube badge from FREE playlist membership + TMDB title hypothesis alone',()=>{
    const source=reconcileCuratedYoutubeSource({
      audit:syntheticCurrentAudit(),approvals:null,now:NOW,
    })
    const index=buildYoutubeVerifiedRouteIndex(source.sourceEnvelope,{now:NOW})
    expect(index.count).toBe(0)
    expect(source.publishedVerifiedAvailabilities).toBe(0)
    const enriched=withVerifiedYoutubeTitleOffer(MOVIE,index,{now:Date.parse(NOW)})
    expect(resolvePosterProviderModel(enriched).providerIds).toEqual([])
    expect(buildDetailStreamingProviderIds(
      resolveProviderPresentation(enriched),providers,[],enriched)).toEqual([])
    expect(selectYoutubeVerifiedTitleRoute(index,MOVIE,{
      now:Date.parse(NOW),hasYoutubeBadge:true})).toBeNull()
    expect(getProviderDestination('youtube',TITLE)).toContain('results?search_query=')
  })

  it.each([
    ['unverified film identity',{workIdentityVerified:false}],
    ['unverified film edition',{fullWorkOrValidCutVerified:false}],
    ['no Germany playback verification',{dePlaybackVerified:false}],
    ['no independently verified tariff',{offerTypeVerified:false}],
    ['source use authorization still unresolved',{sourceUseAuthorized:false}],
    ['R&B tariff contradicts FREE membership',{accessType:'rent'}],
  ])('fails closed when %s, even when Android and Fire TV are reported as free',
    (_reason,changed)=>{
      expect(()=>reconcileCuratedYoutubeSource({
        audit:syntheticCurrentAudit(),approvals:simulatedBundle(changed),now:NOW,
      })).toThrow('YOUTUBE_APPROVAL_MISSING_INDEPENDENT_EVIDENCE')
    })

  it('rejects real-video route if approval points to another title/ID or the video disappears',()=>{
    const changedId='Zbc12345678'
    const other=reconcileCuratedYoutubeSource({
      audit:syntheticCurrentAudit(),approvals:simulatedBundle({videoId:changedId}),now:NOW,
    })
    expect(other.publishedVerifiedAvailabilities).toBe(0)
    expect(other.approvalCandidatesBlocked).toHaveLength(1)
    expect(buildYoutubeVerifiedRouteIndex(other.sourceEnvelope,{now:NOW}).count).toBe(0)
    const blocked=syntheticCurrentAudit()
    blocked.candidates[0].deRegionSignal='excluded'
    const absent=reconcileCuratedYoutubeSource({
      audit:blocked,approvals:simulatedBundle(),now:NOW,
    })
    expect(absent.publishedVerifiedAvailabilities).toBe(0)
    expect(absent.approvalCandidatesBlocked).toHaveLength(1)
  })
})
