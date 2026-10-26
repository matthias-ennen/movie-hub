import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  enrichTitleProviderRoutes,TITLE_ROUTE_EVIDENCE,
} from '../src/providers/titleProviderRouteEnrichment.js'
import {resolveProviderPresentation} from '../src/providers/providerPresentation.js'
import {buildDetailStreamingProviderIds} from '../src/components/detailProviderPresentation.js'
import {providers,getProviderDestination} from '../src/data/catalog.js'
import {buildYoutubeBestEffortLinkIndex}
  from '../src/providers/youtubeBestEffortRouteIndex.js'

const NOW='2026-10-25T12:00:00Z'
const at=Date.parse(NOW)
const TARGETS={
  verified:'https://www.youtube.com/watch?v=Z1234567890',
  editorial:'https://www.youtube.com/watch?v=X1234567890',
  best:'https://www.youtube.com/watch?v=Y1234567890',
}
const film={type:'movie',tmdbId:238,title:'The Godfather',
  tmdbProviderIds:['youtube','netflix'],
  tmdbProviderOffers:[{id:'youtube',offerTypes:['rent','buy']}],
  providerIds:['youtube','netflix'],
}
function verified(){
  return {schemaVersion:1,kind:'moviehub-youtube-verified-title-routes',
    providerId:'youtube',count:1,
    entries:[{
      key:'movie:238',mediaType:'movie',tmdbId:238,
      verifiedVideoId:'Z1234567890',target:TARGETS.verified,
      accessType:'free',verifiedAt:NOW,
      validUntil:'2026-10-27T12:00:00Z',
    }],
  }
}
function editorial(){
  return {
    kind:'moviehub-youtube-curated-editorial-title-hints',schemaVersion:1,
    providerId:'youtube',publicationAuthority:'editorial-playlist-only',
    verifiedDEOffers:0,verifiedPlaybackRoutes:0,generatedAt:NOW,
    count:1,entries:[{
      key:'movie:238',mediaType:'movie',tmdbId:238,
      videoId:'X1234567890',watchUrl:TARGETS.editorial,
      playlistMode:'rent-buy',playlistIds:['PLsample'],
      evidence:'playlist-declared-plus-review-matcher',
      verificationStatus:'not-independently-verified',
    }],
  }
}
function bestEffort(){
  return buildYoutubeBestEffortLinkIndex({
    summary:{
      kind:'moviehub-youtube-g2-global-known-video-no-search-recheck',
      generatedAt:NOW,rowsChecked:1,searchCalls:0,
      privateReviewArtifact:true,publicationPermitted:false,
      independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
      firebaseWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
    },
    rows:[{
      tmdbId:238,status:'review-single-video-candidate',
      candidateDiscoveryMode:'trusted-previous-candidate-ids',
      tmdbDeOfferTypes:['rent','buy'],reviewedVideoId:null,
      directPlaybackRoute:null,publicationPermitted:false,
      videoCandidates:[{
        videoId:'Y1234567890',score:49,titleLevel:4,runtimeDelta:1,
        strong:true,yearMismatch:false,sequelConflict:false,
        sourceTypeRisk:false,regionSignal:'unknown',
      }],
    }],
  },{now:NOW})
}
function enrich(options={},source=film){
  return enrichTitleProviderRoutes(source,{
    now:at,youtubeVerified:verified(),youtubeCurated:editorial(),
    youtubeBestEffort:bestEffort(),...options,
  })
}
describe('one canonical TMDB title view: source-specific YouTube link enrichment',()=>{
  it('chooses independently verified route first and preserves TMDB provider identity',()=>{
    const before=structuredClone(film)
    const r=enrich()
    expect(r.titleProviderRoutes.youtube).toMatchObject({
      providerId:'youtube',scope:'title',mode:'APP_DEEP_LINK',
      target:TARGETS.verified,
    })
    expect(r.titleProviderRouteEvidence.youtube).toEqual({
      source:TITLE_ROUTE_EVIDENCE.VERIFIED,
      independentlyVerified:true,altersTmdbProviderBadge:false,
    })
    expect(r.verifiedTitleOffers).toEqual([{
      id:'youtube',offerTypes:['free'],
    }])
    expect(r.tmdbProviderOffers).toEqual(before.tmdbProviderOffers)
    expect(r.tmdbProviderIds).toEqual(before.tmdbProviderIds)
    expect(film).toEqual(before)
    const presentation=resolveProviderPresentation(r,{context:'title'})
    expect(presentation.tmdbProviderIds).toContain('youtube')
    expect(presentation.liveProviderIds).toEqual([])
    expect(buildDetailStreamingProviderIds(presentation,providers,[],r))
      .toContain('youtube')
    expect(getProviderDestination('youtube',r.title)).toContain('search_query')
  })
  it('uses provisional curated route if verified is missing, without a false offer',()=>{
    const r=enrich({youtubeVerified:null})
    expect(r.titleProviderRoutes.youtube.target).toBe(TARGETS.editorial)
    expect(r.titleProviderRouteEvidence.youtube).toMatchObject({
      source:TITLE_ROUTE_EVIDENCE.EDITORIAL,independentlyVerified:false,
    })
    expect(r).not.toHaveProperty('verifiedTitleOffers')
    expect(r.curatedPlaylistTitleOffer).toMatchObject({
      provenance:'playlist-declared-not-verified',
      playlistMode:'rent-buy',
    })
    expect(r.tmdbProviderOffers).toEqual(film.tmdbProviderOffers)
    expect(r).not.toHaveProperty('liveAvailability')
  })
  it('attaches an existing badge best-effort watch link without changing offer labels',()=>{
    const r=enrich({youtubeVerified:null,youtubeCurated:null})
    expect(r.titleProviderRoutes.youtube).toMatchObject({
      target:TARGETS.best,verificationStatus:'best-effort-not-verified',
    })
    expect(r.titleProviderRouteEvidence.youtube).toMatchObject({
      source:TITLE_ROUTE_EVIDENCE.BEST_EFFORT,
      independentlyVerified:false,altersTmdbProviderBadge:false,
    })
    expect(r.tmdbProviderOffers).toEqual(film.tmdbProviderOffers)
    expect(r).not.toHaveProperty('verifiedTitleOffers')
    expect(r).not.toHaveProperty('curatedPlaylistTitleOffer')
    expect(r).not.toHaveProperty('liveAvailability')
  })
  it('keeps verified or editorial presentation even without original YouTube TMDB badge',()=>{
    const bare={...film,tmdbProviderIds:['netflix'],
      providerIds:['netflix'],tmdbProviderOffers:[]}
    expect(enrich({},bare).titleProviderRoutes.youtube.target)
      .toBe(TARGETS.verified)
    expect(enrich({youtubeVerified:null},bare)
      .titleProviderRoutes.youtube.target).toBe(TARGETS.editorial)
    const without=enrich({
      youtubeVerified:null,youtubeCurated:null,
    },bare)
    expect(without).not.toHaveProperty('titleProviderRoutes')
    expect(resolveProviderPresentation(without).providerIds)
      .not.toContain('youtube')
  })
  it('never lets an injected cached route or verified offer survive re-validation',()=>{
    const spoof={...film,titleProviderRoutes:{youtube:{
      providerId:'youtube',target:'https://evil.example/redirect',
      mode:'APP_DEEP_LINK',scope:'title',
    }},titleProviderRouteEvidence:{youtube:{
      independentlyVerified:true,source:'fake',
    }},verifiedTitleOffers:[{id:'youtube',offerTypes:['free']}]}
    const clean=enrich({
      youtubeVerified:null,youtubeCurated:null,youtubeBestEffort:null,
    },spoof)
    expect(clean).not.toHaveProperty('titleProviderRoutes')
    expect(clean).not.toHaveProperty('titleProviderRouteEvidence')
    expect(clean).not.toHaveProperty('verifiedTitleOffers')
    expect(clean.tmdbProviderOffers).toEqual(film.tmdbProviderOffers)
    expect(getProviderDestination('youtube',clean.title))
      .toContain('youtube.com/results?search_query=')
  })
  it('does not leak another film, a series, revoked or expired link into the title',()=>{
    for(const source of [
      {...film,tmdbId:239},
      {...film,type:'series'},
    ]){
      const r=enrich({},source)
      expect(r).not.toHaveProperty('titleProviderRoutes')
      expect(r).not.toHaveProperty('verifiedTitleOffers')
      expect(r).not.toHaveProperty('curatedPlaylistTitleOffer')
    }
    const future=enrichTitleProviderRoutes(film,{
      now:Date.parse('2026-11-15T12:00:00Z'),
      youtubeVerified:verified(),youtubeCurated:editorial(),
      youtubeBestEffort:bestEffort(),
    })
    expect(future).not.toHaveProperty('titleProviderRoutes')
    expect(future.tmdbProviderOffers).toEqual(film.tmdbProviderOffers)
    const tampered=bestEffort()
    tampered.entries[0].quality='verified'
    expect(enrich({
      youtubeVerified:null,youtubeCurated:null,youtubeBestEffort:tampered,
    })).not.toHaveProperty('titleProviderRoutes')
  })
  it('retains ordinary non-YouTube live and streaming provider information',()=>{
    const original={...film,liveAvailability:{
      waipu:{providerId:'waipu',playbackRoutes:[{
        providerId:'waipu',scope:'program',mode:'APP_DEEP_LINK',
        target:'https://app.waipu.tv/example',
      }]},
    }}
    const r=enrich({},original)
    expect(r.liveAvailability).toEqual(original.liveAvailability)
    expect(r.titleProviderRoutes.youtube.target).toBe(TARGETS.verified)
    expect(resolveProviderPresentation(r,{context:'airing'})
      .playbackRoutes).toEqual([])
  })
  it('routes badge label and playback from ONE title enrichment, not three click selectors',()=>{
    const file=readFileSync(new URL('../src/components/DetailModal.jsx',
      import.meta.url),'utf8')
    expect(file).toContain('enrichTitleProviderRoutes(item,')
    expect(file).toContain('titleWithVerifiedOffers.titleProviderRouteEvidence')
    expect(file).toContain('.titleProviderRoutes?.youtube')
    expect(file).not.toContain('selectYoutubeBestEffortTitleRoute(')
    expect(file).not.toContain('selectCuratedEditorialTitleHint(')
    expect(file).not.toContain('selectYoutubeVerifiedTitleRoute(')
  })
})
