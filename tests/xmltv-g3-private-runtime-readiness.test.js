import { describe, expect, it } from 'vitest'
import { summarizePrivateXmltvRuntimeReadiness, isSafePrivateXmltvRuntimeReadiness } from '../scripts/xmltv-g3-private-runtime-readiness.mjs'
const now=Date.parse('2026-11-16T00:00:00Z')
const row=(id,mediaType='movie')=>({kind:'broadcast',titleRef:{tmdbId:id,mediaType},channelId:'zdf',
  startAt:'2026-11-16T19:00:00Z',endAt:'2026-11-16T21:00:00Z',
  extensions:{xmltv:{rawTitle:'PRIVATE-RAW-TITLE'}}})
describe('private runtime eligibility aggregate',()=>{
  it('distinguishes match from actual catalog metadata and counts missing identities only once',()=>{
    const result=summarizePrivateXmltvRuntimeReadiness([row(1),row(2),row(2),row(1,'series')],{
      titles:[{source:'tmdb',tmdbId:1,type:'movie',title:'PRIVATE-CATALOG-TITLE'},
        {source:'external-curated',tmdbId:2,type:'movie',title:'PRIVATE-EXTERNAL'}]}, {now})
    expect(result).toEqual({matchedRows:4,catalogReadyRows:1,missingCatalogRows:3,missingCatalogUniqueTitles:2,
      androidReadyRows:0,fireTvConfirmedRows:0,runtimeReadyRows:0,deduplicatedRuntimeAirings:0})
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
    expect(isSafePrivateXmltvRuntimeReadiness(result,4)).toBe(true)
    for(const bad of [{...result,rawTitle:'x'},{...result,missingCatalogRows:2},
      {...result,androidReadyRows:5},{...result,runtimeReadyRows:1},{...result,missingCatalogUniqueTitles:4}])
      expect(isSafePrivateXmltvRuntimeReadiness(bad,4)).toBe(false)
  })
  it('uses real Android receipts for private exact-source events but reports Fire TV unverified',()=>{
    const event={...row(1),channelName:'ZDF',sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ZDF.de|test'}],
      extensions:{xmltv:{sourceStationId:'ZDF.de',timestampsExplicitlyZoned:true}}}
    const result=summarizePrivateXmltvRuntimeReadiness([event],{
      titles:[{source:'tmdb',tmdbId:1,type:'movie',title:'Test'}]}, {now})
    expect(result).toEqual({matchedRows:1,catalogReadyRows:1,missingCatalogRows:0,missingCatalogUniqueTitles:0,
      androidReadyRows:1,fireTvConfirmedRows:0,runtimeReadyRows:1,deduplicatedRuntimeAirings:1})
  })
  it('reports valid empty results without inventing device or metadata coverage',()=>{
    expect(summarizePrivateXmltvRuntimeReadiness([], {titles:[]},{now})).toEqual({
      matchedRows:0,catalogReadyRows:0,missingCatalogRows:0,missingCatalogUniqueTitles:0,
      androidReadyRows:0,fireTvConfirmedRows:0,runtimeReadyRows:0,deduplicatedRuntimeAirings:0})
  })
  it('counts actual production-runtime overlaps without treating an added route as a new broadcast',()=>{
    const event={...row(1),channelName:'ZDF',sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ZDF.de|test'}],
      extensions:{xmltv:{sourceStationId:'ZDF.de',timestampsExplicitlyZoned:true}}}
    const airing={stationId:'zdf',canonicalStationId:'zdf',startTime:event.startAt,stopTime:event.endAt}
    const catalog={titles:[{source:'tmdb',tmdbId:1,type:'movie',title:'Test'},{source:'tmdb',tmdbId:2,type:'movie',title:'Another'}]}
    const existingSources=[{providerId:'waipu',entries:[{type:'movie',tmdbId:1,title:'Test',airings:[airing]}]},
      {providerId:'joyn',entries:[{type:'movie',tmdbId:2,title:'Another',airings:[airing]}]}]
    const result=summarizePrivateXmltvRuntimeReadiness([event,{...event,startAt:'2026-11-17T19:00:00Z',endAt:'2026-11-17T21:00:00Z'}],catalog,{now,existingSources})
    expect(result.runtimeOverlap).toEqual({existingSourceCount:2,combinedRuntimeAirings:3,xmltvOnlyRuntimeAirings:1,
      sharedRuntimeAirings:1,existingOnlyRuntimeAirings:1})
    expect(isSafePrivateXmltvRuntimeReadiness(result,2)).toBe(true)
    expect(isSafePrivateXmltvRuntimeReadiness({...result,runtimeOverlap:{...result.runtimeOverlap,sharedRuntimeAirings:5}},2)).toBe(false)
    expect(JSON.stringify(result)).not.toContain('Another')
  })
})

