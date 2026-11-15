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
      deviceReadyRows:0,runtimeReadyRows:0,deduplicatedRuntimeAirings:0})
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
    expect(isSafePrivateXmltvRuntimeReadiness(result,4)).toBe(true)
    for(const bad of [{...result,rawTitle:'x'},{...result,missingCatalogRows:2},
      {...result,deviceReadyRows:5},{...result,runtimeReadyRows:1},{...result,missingCatalogUniqueTitles:4}])
      expect(isSafePrivateXmltvRuntimeReadiness(bad,4)).toBe(false)
  })
  it('reports valid empty results without inventing device or metadata coverage',()=>{
    expect(summarizePrivateXmltvRuntimeReadiness([], {titles:[]},{now})).toEqual({
      matchedRows:0,catalogReadyRows:0,missingCatalogRows:0,missingCatalogUniqueTitles:0,
      deviceReadyRows:0,runtimeReadyRows:0,deduplicatedRuntimeAirings:0})
  })
})
