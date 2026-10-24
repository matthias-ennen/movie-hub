import {describe,it,expect} from 'vitest'
import {buildSearchCatalog,mergeYoutubeCuratedSearchTitles} from '../src/search/searchCatalog.js'
import {searchIndex} from '../src/search/searchIndex.js'
import {getTitleStateKey} from '../src/library/libraryState.js'

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
  it('does not expose personal-only titles from the public companion',()=>{
    const bad=makeFeed()
    bad.entries[0].film.curatedPlaylistTitleOffer={playlistMode:'free'}
    expect(mergeYoutubeCuratedSearchTitles([],bad,{now:Date.parse(AT)})).toEqual([])
  })
})
