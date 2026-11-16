import { describe, expect, it } from 'vitest'
import { buildTv14DaySummary } from '../scripts/tv-14-day-summary.mjs'
import { XMLTV_AIR_ROUTE_CANDIDATES } from '../src/sources/xmltv/xmltvAirRoutes.js'

const generatedAt='2026-11-16T00:00:00Z'
const route=XMLTV_AIR_ROUTE_CANDIDATES.find(row=>row.stationId==='zdf')
const airing={type:'movie',tmdbId:42,stationId:'zdf',canonicalStationId:'zdf',stationName:'ZDF',
  startTime:'2026-11-16T19:00:00Z',stopTime:'2026-11-16T21:00:00Z',
  providerIds:['air-zdf'],playbackRoutes:[{providerId:'air-zdf',mode:'WEB_LINK',scope:'channel',target:route.target}]}
const catalog={titles:[{source:'tmdb',type:'movie',tmdbId:42,title:'Canonical film',tmdbProviderIds:['netflix','air-zdf']}]}
const airSource=airings=>({providerId:'air-zdf',entries:[{type:'movie',tmdbId:42,title:'Canonical film',airings}]})
describe('XMLTV AIR in the common 14-day TV summary',()=>{
  it('combines the existing provider airing with the exact AIR link and preserves VOD identity',()=>{
    const waipuTitles={entries:[{type:'movie',tmdbId:42,title:'Canonical film',airings:[{...airing,stationId:'waipu-zdf',
      providerIds:['waipu'],programId:'example',playbackRoutes:[]}]}]}
    const result=buildTv14DaySummary({waipuTitles,catalog,additionalSources:[airSource([airing])],generatedAt})
    expect(result.entries).toHaveLength(1)
    const title=result.entries[0]
    expect(title.providerIds).toEqual(['air-zdf','waipu'])
    expect(title.tmdbProviderIds).toEqual(['netflix'])
    expect(title.airingCount).toBe(1)
    expect(title.nextAiring.playbackRoutes.map(r=>r.providerId).sort()).toEqual(['air-zdf','waipu'])
  })
  it('retains a later direct station broadcast when the earlier option is Waipu-only',()=>{
    const earlier={...airing,startTime:'2026-11-16T17:00:00Z',stopTime:'2026-11-16T18:30:00Z',
      stationId:'waipu-zdf',providerIds:['waipu'],programId:'example',playbackRoutes:[]}
    const waipuTitles={entries:[{type:'movie',tmdbId:42,title:'Canonical film',airings:[earlier]}]}
    const result=buildTv14DaySummary({waipuTitles,catalog,additionalSources:[airSource([airing])],generatedAt})
    expect(result.entries[0].airingOptions.map(a=>a.providerIds)).toEqual([['waipu'],['air-zdf']])
  })
  it('ignores unverified and expired XMLTV airings and unknown AIR provider IDs',()=>{
    const invalid={...airing,playbackRoutes:[{...airing.playbackRoutes[0],target:'https://wrong.example'}]}
    const expired={...airing,startTime:'2026-11-15T19:00:00Z',stopTime:'2026-11-15T21:00:00Z'}
    const result=buildTv14DaySummary({catalog,additionalSources:[airSource([invalid,expired]),
      {...airSource([airing]),providerId:'air-unknown'}],generatedAt})
    expect(result.entries).toEqual([])
  })
})
