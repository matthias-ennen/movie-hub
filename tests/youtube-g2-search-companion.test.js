import {describe,it,expect} from 'vitest'
import {buildSearchCatalog,mergeYoutubeCuratedSearchTitles} from '../src/search/searchCatalog.js'
import {searchIndex} from '../src/search/searchIndex.js'
import {getTitleStateKey} from '../src/library/libraryState.js'
import {buildYoutubeCuratedSearchTitleFeed} from '../scripts/youtube-g2-publish-search-title-companion.mjs'
import {validateYoutubeCuratedSearchTitleFeed} from '../src/catalog/youtubeCuratedSearchTitles.js'

const AT='2026-10-24T08:40:00.000Z'
const BASIC={
  id:'tmdb-movie-10782',tmdbId:10782,type:'movie',source:'tmdb',
  title:'Basic',description:'A canonical TMDB thriller film.',
  posterUrl:'https://image.tmdb.org/t/p/w500/basic.jpg',
  metadataComplete:true,providerIds:['youtube'],
  providerOffers:[],runtimeMinutes:98,
}
const makeFeed=()=>({
  kind:'moviehub-youtube-curated-new-film-metadata',
  schemaVersion:1,providerId:'youtube',generatedAt:AT,
  sourceType:'user-curated-playlists-with-tmdb-metadata',
  offerVerification:'editorial-only-not-independent',
  sourceVideoIds:85,count:1,entries:[{
    videoId:'yszdWjYOtLU',tmdbId:10782,playlistClass:'FREE',
    film:{...BASIC},
  }],
})
const index={kind:'search-index',version:1,country:'DE',
  generatedAt:AT,entries:[
    {id:'tmdb-movie-1266',type:'movie',tmdbId:1266,
      title:'Street Kings',providerIds:['youtube'],scope:'public'},
  ]}
const publishedHintIndex=()=>({
  kind:'moviehub-youtube-curated-editorial-title-hints',
  schemaVersion:1,providerId:'youtube',
  publicationAuthority:'editorial-playlist-only',
  verifiedDEOffers:0,verifiedPlaybackRoutes:0,
  sourceVideoIds:87,count:1,entries:[{
    key:'movie:10782',mediaType:'movie',tmdbId:10782,
    videoId:'yszdWjYOtLU',
    watchUrl:'https://www.youtube.com/watch?v=yszdWjYOtLU',
    playlistMode:'free',verificationStatus:'not-independently-verified',
  }],
})
const durable=()=>buildYoutubeCuratedSearchTitleFeed(
  publishedHintIndex(),[BASIC],{now:AT})

describe('YouTube G2 new TMDB films are immediately searchable',()=>{
  it('finds Basic from the separate published YouTube film companion, without personal TMDB sync',()=>{
    const cat=buildSearchCatalog({
      remoteIndex:index,metadataTitles:[],personalTitles:[],
      statesByKey:{},curatedYoutubeFeed:makeFeed(),now:Date.parse(AT),
    })
    const r=searchIndex(cat.entries,'Basic',{enabledProviderIds:['youtube']})
    expect(r.total).toBe(1)
    expect(r.results[0]).toMatchObject({
      id:'tmdb-movie-10782',tmdbId:10782,title:'Basic',
      scope:'public',providerIds:['youtube'],
    })
    expect(searchIndex(cat.entries,'Street Kings',{enabledProviderIds:['youtube']}).total).toBe(1)
  })
  it('retains full film metadata for opening the detail page rather than a search placeholder',()=>{
    const merged=mergeYoutubeCuratedSearchTitles([],makeFeed(),{now:Date.parse(AT)})
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id:'tmdb-movie-10782',title:'Basic',metadataComplete:true,
      description:BASIC.description,
    })
  })
  it('never duplicates the same canonical movie after personal TMDB sync',()=>{
    const personal={...BASIC,title:'Basic',providerIds:['youtube','prime']}
    const merged=mergeYoutubeCuratedSearchTitles([personal],makeFeed(),{now:Date.parse(AT)})
    expect(merged).toHaveLength(1)
    expect(merged[0]).toBe(personal)
    expect(new Set(merged.map(getTitleStateKey)).size).toBe(1)
    const cat=buildSearchCatalog({
      remoteIndex:index,metadataTitles:[personal],
      personalTitles:[personal],curatedYoutubeFeed:makeFeed(),
      now:Date.parse(AT),
    })
    expect(searchIndex(cat.entries,'Basic',{enabledProviderIds:[]}).results)
      .toHaveLength(1)
    expect(searchIndex(cat.entries,'Basic',{enabledProviderIds:[]}).results[0].scope)
      .toBe('personal')
  })
  it('does not accept stale, forged or badge-verified companion data',()=>{
    for(const mutation of [
      f=>{f.generatedAt='2026-09-01T00:00:00Z'},
      f=>{f.entries[0].film.verifiedTitleOffers=[{id:'youtube'}]},
      f=>{f.offerVerification='verified'},
      f=>{f.entries[0].videoId='bad'},
    ]){
      const bad=makeFeed();mutation(bad)
      expect(mergeYoutubeCuratedSearchTitles([],bad,{now:Date.parse(AT)})).toEqual([])
      expect(buildSearchCatalog({remoteIndex:index,metadataTitles:[],
        curatedYoutubeFeed:bad,now:Date.parse(AT)}).entries.map(x=>x.title))
        .not.toContain('Basic')
    }
  })
  it('keeps Basic searchable after it stops being new because of a personal favorite',()=>{
    // The current live case: Basic was in the NEW feed on 85/85, then absent
    // from it on 87/87 after becoming canonical-existing in the account.
    const newFeed=makeFeed()
    newFeed.entries=[];newFeed.count=0
    expect(validateYoutubeCuratedSearchTitleFeed(durable(),{now:Date.parse(AT)}))
      .toBe(true)
    const catalog=buildSearchCatalog({
      remoteIndex:index,metadataTitles:[],personalTitles:[],
      curatedYoutubeFeed:newFeed,
      curatedYoutubeSearchTitleFeed:durable(),
      now:Date.parse(AT),
    })
    const result=searchIndex(catalog.entries,'Basic',{enabledProviderIds:['youtube']})
    expect(result.total).toBe(1)
    expect(result.results[0]).toMatchObject({
      id:'tmdb-movie-10782',tmdbId:10782,title:'Basic',
      scope:'public',providerIds:['youtube'],
    })
    const full=mergeYoutubeCuratedSearchTitles([],durable(),{now:Date.parse(AT)})
    expect(full[0]).toMatchObject({metadataComplete:true,description:BASIC.description})
  })
  it('publishes a complete TMDB-only search companion without account data',()=>{
    const result=durable()
    expect(result).toMatchObject({
      count:1,sourceVideoIds:87,
      offerVerification:'editorial-only-not-independent',
    })
    expect(result.entries[0].film.verifiedTitleOffers).toBeUndefined()
    expect(result.entries[0].film.curatedPlaylistTitleOffer).toBeUndefined()
    expect(result.entries[0].film.titleSnapshot).toBeUndefined()
    expect(result.entries[0].film.providerIds).toContain('youtube')
  })
  it('rejects unsafe, tampered and expired stable search companions',()=>{
    for(const mutate of [
      f=>{f.generatedAt='2026-08-01T00:00:00Z'},
      f=>{f.entries[0].tmdbId=9},
      f=>{f.entries[0].film.favorite=true},
      f=>{f.entries[0].film.verifiedTitleOffers=[{id:'youtube'}]},
      f=>{f.entries[0].film.providerIds=[]},
    ]){
      const bad=durable();mutate(bad)
      expect(validateYoutubeCuratedSearchTitleFeed(bad,{now:Date.parse(AT)}))
        .toBe(false)
      expect(mergeYoutubeCuratedSearchTitles([],bad,{now:Date.parse(AT)}))
        .toEqual([])
    }
  })
  it('does not duplicate a canonical personal Basic even when both supplements list it',()=>{
    const base={...BASIC,providerIds:['youtube','prime']}
    const once=mergeYoutubeCuratedSearchTitles([base],makeFeed(),{now:Date.parse(AT)})
    const twice=mergeYoutubeCuratedSearchTitles(once,durable(),{now:Date.parse(AT)})
    expect(twice).toHaveLength(1)
    expect(twice[0]).toBe(base)
  })
  it('does not expose personal-only titles from the public companion',()=>{
    const bad=makeFeed()
    bad.entries[0].film.curatedPlaylistTitleOffer={playlistMode:'free'}
    expect(mergeYoutubeCuratedSearchTitles([],bad,{now:Date.parse(AT)})).toEqual([])
  })
})
