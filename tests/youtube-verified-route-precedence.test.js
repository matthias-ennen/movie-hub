import {describe,it,expect,vi} from 'vitest'
import {
  buildYoutubeVerifiedRouteIndex,selectYoutubeVerifiedTitleRoute,
} from '../src/providers/youtubeVerifiedRouteIndex.js'
import { loadYoutubeVerifiedTitleRoutes } from '../src/providers/youtubeVerifiedRouteRuntime.js'
import {
  buildYoutubeSourceEnvelope,mapVerifiedYoutubeVideoToAvailability,
} from '../src/sources/adapters/youtubeContractMapper.js'
import {getProviderDestination} from '../src/data/catalog.js'
import {resolveProviderPresentation} from '../src/providers/providerPresentation.js'
import {launchProviderPlaybackRoute} from '../src/providers/providerPlaybackLaunch.js'
const NOW='2026-10-22T20:30:00.000Z'
const ID='0nBiidtN7ZU'
const ref={mediaType:'movie',tmdbId:539892}
const video={videoId:ID,channelId:'UCxxxxxxxxxxxxxxxxxxxxxx',
  screening:{eligible:true}}
const proof={verifiedVideoId:ID,workIdentityVerified:true,
  fullWorkOrValidCutVerified:true,dePlaybackVerified:true,
  offerTypeVerified:true,sourceUseAuthorized:true,
  accessType:'free',verifiedAt:NOW,
  workEvidence:'Independent work/cut proof',offerEvidence:'DE playback verified'}
function verified(now=NOW){
  const record=mapVerifiedYoutubeVideoToAvailability(video,ref,proof,{observedAt:now})
  return buildYoutubeSourceEnvelope([record],{generatedAt:now,fetchedAt:now})
}
const item={type:'movie',tmdbId:539892,title:'Freaks: Sie sehen aus wie wir',
  tmdbProviderIds:['youtube'],
  tmdbProviderOffers:[{id:'youtube',offerTypes:['free']}]}
describe('YouTube verified route enrichment leaves TMDB badges and original search intact',()=>{
  it('selects exact verified title route WITHOUT changing TMDB badge/offer evidence',()=>{
    const before=resolveProviderPresentation(item)
    const data=buildYoutubeVerifiedRouteIndex(verified(),{now:NOW})
    const route=selectYoutubeVerifiedTitleRoute(data,item,{
      now:Date.parse(NOW),hasYoutubeBadge:before.providerIds.includes('youtube')})
    expect(data.count).toBe(1)
    expect(route).toMatchObject({providerId:'youtube',scope:'title',
      mode:'APP_DEEP_LINK',target:'https://www.youtube.com/watch?v='+ID})
    expect(resolveProviderPresentation(item)).toEqual(before)
    const fallback=getProviderDestination('youtube',item.title)
    expect(fallback).toContain('youtube.com/results?search_query=')
    const bridge={openProviderRoute:vi.fn()}
    expect(launchProviderPlaybackRoute({providerId:'youtube',title:item.title,
      route,fallbackUrl:fallback,nativeBridge:bridge})).toBe(true)
    expect(bridge.openProviderRoute).toHaveBeenCalledWith(
      'youtube',item.title,'APP_DEEP_LINK','title',
      'https://www.youtube.com/watch?v='+ID,fallback)
  })
  it('never invents a route for a badge without verified source input',()=>{
    const empty=buildYoutubeVerifiedRouteIndex(null,{now:NOW})
    expect(empty.count).toBe(0)
    expect(selectYoutubeVerifiedTitleRoute(empty,item,{
      now:Date.parse(NOW),hasYoutubeBadge:true})).toBeNull()
    expect(getProviderDestination('youtube',item.title))
      .toBe('https://www.youtube.com/results?search_query='+encodeURIComponent(item.title))
  })
  it('expires unverified/stale routes while retaining the TMDB YouTube badge',()=>{
    const data=buildYoutubeVerifiedRouteIndex(verified(),{now:NOW})
    const later=Date.parse(NOW)+32*86400000
    expect(selectYoutubeVerifiedTitleRoute(data,item,{
      now:later,hasYoutubeBadge:true})).toBeNull()
    expect(resolveProviderPresentation(item).providerIds).toContain('youtube')
  })
  it('cannot replace another movie, a series, or Google TV badge',()=>{
    const data=buildYoutubeVerifiedRouteIndex(verified(),{now:NOW})
    expect(selectYoutubeVerifiedTitleRoute(data,{...item,tmdbId:1},{
      now:Date.parse(NOW),hasYoutubeBadge:true})).toBeNull()
    expect(selectYoutubeVerifiedTitleRoute(data,{...item,type:'series'},{
      now:Date.parse(NOW),hasYoutubeBadge:true})).toBeNull()
    expect(selectYoutubeVerifiedTitleRoute(data,item,{
      now:Date.parse(NOW),hasYoutubeBadge:false})).toBeNull()
  })
  it('refuses review-only candidates and fraudulent playlist hints',()=>{
    const bad=buildYoutubeSourceEnvelope([
      {...mapVerifiedYoutubeVideoToAvailability(video,ref,proof,{observedAt:NOW}),
        matchReason:'playlist-editorial-hint'},
    ],{generatedAt:NOW,fetchedAt:NOW})
    expect(buildYoutubeVerifiedRouteIndex(bad,{now:NOW}).count).toBe(0)
    expect(()=>buildYoutubeVerifiedRouteIndex({
      ...verified(),sourceId:'google_tv',
    },{now:NOW})).toThrow('YOUTUBE_VERIFIED_SOURCE_UNTRUSTED_OR_STALE')
  })
  it('handles route fetch failure as null, retaining search fallback',async()=>{
    const fetcher=vi.fn(async()=>({ok:false,status:404}))
    expect(await loadYoutubeVerifiedTitleRoutes(fetcher)).toBeNull()
    expect(getProviderDestination('youtube',item.title)).toContain('search_query')
  })
})
