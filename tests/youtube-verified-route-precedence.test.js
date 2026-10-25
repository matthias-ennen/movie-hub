import {describe,it,expect,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {generateYoutubeVerifiedRouteIndex} from '../scripts/generate-youtube-verified-route-index.mjs'
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
  it('revokes a film with contradictory FREE/RENT offers for the SAME exact video',()=>{
    const source=verified()
    const original=source.records[0]
    const competing={...original,
      availabilityId:original.availabilityId+'-rent',
      accessType:'rent'}
    for(const records of [
      [original,competing],
      [competing,original],
      [original,competing,{...original,availabilityId:original.availabilityId+'-again'}],
    ]){
      const index=buildYoutubeVerifiedRouteIndex({...source,records},{now:NOW})
      expect(index).toMatchObject({count:0,entries:[]})
      expect(selectYoutubeVerifiedTitleRoute(index,item,{
        now:Date.parse(NOW),hasYoutubeBadge:true})).toBeNull()
      expect(getProviderDestination('youtube',item.title))
        .toContain('results?search_query=')
    }
  })
  it('keeps the same approved film and tariff if identical evidence is repeated',()=>{
    const source=verified()
    const original=source.records[0]
    const repeated={...original,availabilityId:original.availabilityId+'-repeat'}
    const index=buildYoutubeVerifiedRouteIndex({
      ...source,records:[original,repeated]},{now:NOW})
    expect(index.count).toBe(1)
    expect(index.entries[0]).toMatchObject({
      key:'movie:539892',verifiedVideoId:ID,accessType:'free',
    })
  })
  it('drops an old YouTube source observation even when a record advertises a later expiration',()=>{
    const source=verified()
    const record=source.records[0]
    const outOfDate={...record,
      sourceRefs:record.sourceRefs.map(ref=>({
        ...ref,observedAt:'2026-09-01T00:00:00Z',
      })),
    }
    expect(buildYoutubeVerifiedRouteIndex({
      ...source,records:[outOfDate]},{now:NOW}))
      .toMatchObject({count:0,entries:[]})
    expect(buildYoutubeVerifiedRouteIndex(source,{now:NOW}).count).toBe(1)
  })
  it('writes zero approved routes when the deploy has no verified YouTube envelope',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'moviehub-youtube-routes-'))
    try{
      const target=join(dir,'title-routes.json')
      const projected=await generateYoutubeVerifiedRouteIndex({
        input:join(dir,'not-provided.json'),output:target,now:NOW,
      })
      const deployed=JSON.parse(await readFile(target,'utf8'))
      expect(projected.count).toBe(0)
      expect(deployed).toMatchObject({count:0,entries:[],providerId:'youtube'})
      expect(selectYoutubeVerifiedTitleRoute(deployed,item,{
        now:Date.parse(NOW),hasYoutubeBadge:true})).toBeNull()
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('handles route fetch failure as null, retaining search fallback',async()=>{
    const fetcher=vi.fn(async()=>({ok:false,status:404}))
    expect(await loadYoutubeVerifiedTitleRoutes(fetcher)).toBeNull()
    expect(getProviderDestination('youtube',item.title)).toContain('search_query')
  })
})
