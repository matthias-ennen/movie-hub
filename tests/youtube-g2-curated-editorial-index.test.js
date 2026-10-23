import {beforeEach,describe,expect,it,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
  buildCuratedEditorialTitleIndex,selectCuratedEditorialTitleHint,
} from '../src/providers/youtubeCuratedEditorialIndex.js'
import {withVerifiedYoutubeTitleOffer} from '../src/providers/youtubeVerifiedTitlePresentation.js'
import {resolveProviderPresentation} from '../src/providers/providerPresentation.js'
import {resolvePosterProviderModel} from '../src/providers/posterProviderModel.js'
import {providerOfferLabel} from '../src/providers/providerOfferLabels.js'
import {buildDetailStreamingProviderIds} from '../src/components/detailProviderPresentation.js'
import {ProviderBadge} from '../src/components/ProviderBadges.jsx'
import {launchProviderPlaybackRoute} from '../src/providers/providerPlaybackLaunch.js'
import {providers,getProviderDestination} from '../src/data/catalog.js'
import {resetProviderSelectionSnapshot} from '../src/settings/providerSelectionRuntime.js'
const AT='2026-10-23T11:00:00.000Z'
const FREE='PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
const RB='PLJWJS8p_IeEo'
const TITLE='Der Geist und die Dunkelheit'
const VID='1uf2AMrQMk0'
const SECOND='3csAkKfa6Vs'
const make=()=>{
  const candidates=[
    {videoId:VID,videoTitle:TITLE,channelTitle:'YouTube Movies',channelId:'UCfilm',
      playlistModes:['free'],playlistIds:[FREE],editorialOfferHint:'free',
      status:'review-tmdb-work-identity',screened:true,deRegionSignal:'allowed',
      accepted:false,toImport:false,playbackRoute:null,verifiedOfferType:null},
    {videoId:SECOND,videoTitle:'Deep Star Six',channelTitle:'YouTube Movies',channelId:'UCfilm',
      playlistModes:['rent-buy'],playlistIds:[RB],editorialOfferHint:'rent-buy',
      status:'review-tmdb-work-identity',screened:true,deRegionSignal:'unknown',
      accepted:false,toImport:false,playbackRoute:null,verifiedOfferType:null},
  ]
  const audit={mode:'CURATED_TWO_PLAYLISTS_READ_ONLY',observedAt:AT,fullyScanned:true,
    publicationPermitted:false,uniqueVideoIds:candidates.length,candidates,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0}
  const research={summary:{
    mode:'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY',
    generatedAt:'2026-10-23T11:01:00.000Z',
    sourceQAObservedAt:AT,sourceVideoIds:candidates.length,processedRows:candidates.length,
    publicIndexOnly:true,publicationPermitted:false,
    verifiedFilms:0,verifiedDEOffers:0,newMovieImports:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  },rows:candidates.map((c,i)=>({
    videoId:c.videoId,editorialOfferHint:c.editorialOfferHint,sourceStatus:c.status,
    playlistModes:c.playlistModes,hasPlaylistOfferConflict:false,hasPlaylistOverlap:false,
    identityRisk:null,publicIndexMembership:'public-present',
    matchStatus:'review-leading-film-hypothesis',alternativeTvIds:[],errors:[],
    topCandidates:[{tmdbId:i===0?10586:11607,titleLevel:4,score:40,
      runtimeDelta:1,yearMismatch:false,sequelConflict:false}],
    publicationPermitted:false,verifiedTmdbId:null,verifiedOfferType:null,
    playbackRoute:null,
  }))}
  return {audit,research}
}
const item=(id=10586)=>({type:'movie',tmdbId:id,title:TITLE,
  tmdbProviderIds:[],tmdbProviderOffers:[],providerIds:[]})
beforeEach(()=>resetProviderSelectionSnapshot({loading:false}))

describe('YouTube G2 provisional FREE/R&B playlist classifications, NEVER verified',()=>{
  it('links exact real FREE video + R&B title as QUESTION-MARK preview badges and deep links',()=>{
    const {audit,research}=make()
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(index).toMatchObject({count:2,sourceVideoIds:2,
      classificationCounts:{free:1,'rent-buy':1},
      verifiedDEOffers:0,verifiedPlaybackRoutes:0,
      publicationAuthority:'editorial-playlist-only'})
    const g=withVerifiedYoutubeTitleOffer(item(),null,{curatedIndex:index,now:Date.parse(AT)})
    expect(g).toMatchObject({
      curatedPlaylistTitleOffer:{id:'youtube',playlistMode:'free',
        videoId:VID,provenance:'playlist-declared-not-verified'}})
    expect(g).not.toHaveProperty('verifiedTitleOffers')
    const poster=resolvePosterProviderModel(g)
    expect(poster.providerIds).toEqual(['youtube'])
    expect(poster.offerLabels.youtube).toBe('FREE?')
    const presentation=resolveProviderPresentation(g)
    expect(presentation.verifiedTitleProviderIds).toEqual([])
    expect(presentation.editorialTitleProviderIds).toEqual(['youtube'])
    expect(buildDetailStreamingProviderIds(presentation,providers,[],g)).toEqual(['youtube'])
    const markup=renderToStaticMarkup(createElement(ProviderBadge,{
      providerId:'youtube',item:g,
    }))
    expect(markup).toContain('Nur Playlist-Zuordnung')
    expect(markup).toContain('FREE?')
    expect(markup).toContain('noch nicht unabhängig geprüft')
    const hint=selectCuratedEditorialTitleHint(index,item(),{now:Date.parse(AT)})
    expect(hint).toMatchObject({target:'https://www.youtube.com/watch?v='+VID,
      playlistMode:'free',verificationStatus:'not-independently-verified'})
    const bridge={openProviderRoute:vi.fn()}
    const fallback=getProviderDestination('youtube',TITLE)
    expect(launchProviderPlaybackRoute({providerId:'youtube',title:TITLE,
      route:hint,fallbackUrl:fallback,nativeBridge:bridge})).toBe(true)
    expect(bridge.openProviderRoute).toHaveBeenCalledWith('youtube',TITLE,
      'APP_DEEP_LINK','title','https://www.youtube.com/watch?v='+VID,fallback)
    const r=withVerifiedYoutubeTitleOffer(item(11607),null,{
      curatedIndex:index,now:Date.parse(AT)})
    expect(providerOfferLabel(r,'youtube')).toBe('R&B?')
  })

  it('uses FREE priority when the SAME video ID appears in both playlists',()=>{
    const {audit,research}=make()
    audit.candidates[0].playlistModes=['free','rent-buy']
    audit.candidates[0].playlistIds=[FREE,RB]
    research.rows[0].playlistModes=['free','rent-buy']
    research.rows[0].hasPlaylistOverlap=true
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(index.entries.find(x=>x.tmdbId===10586).playlistMode).toBe('free')
  })
  it('rejects conflicting video IDs for the same movie rather than guess a playback link',()=>{
    const {audit,research}=make()
    research.rows[1].topCandidates[0].tmdbId=10586
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(index.count).toBe(0)
    expect(index.skippedAmbiguousMovieKeys).toBe(1)
  })
  it('does not surface ambiguous works, partial videos, region exclusions or non-public-index guesses',()=>{
    for(const change of [
      (a,r)=>{r.matchStatus='review-multiple-film-works'},
      (a,r)=>{r.topCandidates.push({...r.topCandidates[0],tmdbId:45})},
      (a,r)=>{r.publicIndexMembership='public-not-present'},
      (a,r)=>{r.alternativeTvIds=[1]},
      (a,r)=>{r.identityRisk='explicit-alternate-work-form'},
      (a,r)=>{r.topCandidates[0].runtimeDelta=35},
      (a,r)=>{a.screened=false},
      (a,r)=>{a.deRegionSignal='excluded'},
    ]){
      const {audit,research}=make()
      change(audit.candidates[0],research.rows[0])
      const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      expect(index.entries.find(e=>e.tmdbId===10586)).toBeUndefined()
    }
  })
  it('rejects misaligned/modified QA, never upgrades it to verified',()=>{
    const {audit,research}=make()
    audit.candidates[0].editorialOfferHint='rent-buy'
    expect(()=>buildCuratedEditorialTitleIndex(audit,research,{now:AT}))
      .toThrow('CURATED_EDITORIAL_SOURCE_OR_RESEARCH_UNTRUSTED')
    audit.candidates[0].editorialOfferHint='free'
    research.summary.sourceQAObservedAt='2026-10-22T00:00:00Z'
    expect(()=>buildCuratedEditorialTitleIndex(audit,research,{now:AT}))
      .toThrow('CURATED_EDITORIAL_SOURCE_OR_RESEARCH_UNTRUSTED')
  })
  it('drops expired, forged, wrong-title and previously injected preview fields',()=>{
    const {audit,research}=make()
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(selectCuratedEditorialTitleHint(index,item(),{
      now:Date.parse('2026-11-03T10:00:00.000Z')})).toBeNull()
    expect(selectCuratedEditorialTitleHint(index,item(17),{now:Date.parse(AT)})).toBeNull()
    expect(selectCuratedEditorialTitleHint({...index,publicationAuthority:'verified'},
      item(),{now:Date.parse(AT)})).toBeNull()
    expect(selectCuratedEditorialTitleHint({...index,verifiedDEOffers:1},
      item(),{now:Date.parse(AT)})).toBeNull()
    const forged={...item(),curatedPlaylistTitleOffer:{id:'youtube',
      playlistMode:'free',provenance:'playlist-declared-not-verified'}}
    const cleared=withVerifiedYoutubeTitleOffer(forged,null,{now:Date.parse(AT)})
    expect(cleared).not.toHaveProperty('curatedPlaylistTitleOffer')
  })
  it('gives independently VERIFIED offers higher priority and never copies a fake playlist hint',()=>{
    const {audit,research}=make()
    const curated=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    const verified={kind:'moviehub-youtube-verified-title-routes',
      schemaVersion:1,providerId:'youtube',count:1,entries:[{
        key:'movie:10586',tmdbId:10586,mediaType:'movie',
        verifiedVideoId:VID,target:'https://www.youtube.com/watch?v='+VID,
        accessType:'ads',verifiedAt:AT,validUntil:'2026-10-29T11:00:00.000Z',
      }]}
    const output=withVerifiedYoutubeTitleOffer(item(),verified,{
      curatedIndex:curated,now:Date.parse(AT)})
    expect(output).not.toHaveProperty('curatedPlaylistTitleOffer')
    expect(providerOfferLabel(output,'youtube')).toBe('ADS')
  })
})
