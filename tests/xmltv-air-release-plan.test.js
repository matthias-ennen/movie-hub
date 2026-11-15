import { describe, expect, it } from 'vitest'
import { planXmltvAirSourceFiles } from '../scripts/xmltv-air-release-plan.mjs'
import { APPROVED_XMLTV_AIR_PROVIDERS } from '../src/sources/xmltv/xmltvAirRoutes.js'

const now=Date.parse('2026-11-16T00:00:00Z')
const event={kind:'broadcast',titleRef:{mediaType:'movie',tmdbId:42},channelId:'zdf',channelName:'ZDF',
  startAt:'2026-11-16T19:00:00Z',endAt:'2026-11-16T21:00:00Z',
  sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ZDF.de|test'}],
  extensions:{xmltv:{sourceStationId:'ZDF.de',timestampsExplicitlyZoned:true,rawTitle:'PRIVATE RAW'}}}
const movie={source:'tmdb',type:'movie',mediaType:'movie',tmdbId:42,title:'Testfilm',
  metadataVersion:3,metadataComplete:true,collectionChecked:true,
  metadataChecks:{details:'present',artwork:'present',ageRating:'absent',credits:'present',keywords:'absent',videos:'absent',providers:'absent',collection:'absent'},
  tmdbProviderIds:[],providerIds:['air-zdf']}

describe('XMLTV AIR source file plan',()=>{
  it('uses complete canonical metadata and exact approved station, deduplicates and strips feed fields',()=>{
    const plan=planXmltvAirSourceFiles({confirmedEvents:[event,event],catalog:{titles:[movie]},now})
    expect(plan.counts).toEqual({received:2,eligible:2,completeUniqueTitles:1,pendingUniqueTitles:0,projected:2,unresolved:0,deduplicated:1})
    expect(plan.files[0].directory).toBe('air-zdf-live')
    expect(plan.files[0].titles.entries[0].airings).toHaveLength(1)
    expect(plan.files[0].titles.entries[0].title).toBe('Testfilm')
    expect(plan.files[0].titles.entries[0].tmdbProviderIds).toEqual([])
    expect(JSON.stringify(plan.files)).not.toContain('PRIVATE RAW')
    expect(JSON.stringify(plan.files)).not.toContain('sourceRefs')
    expect(APPROVED_XMLTV_AIR_PROVIDERS).toEqual([])
  })
  it('leaves partial metadata, wrong media types, and unmatched titles pending',()=>{
    const plan=planXmltvAirSourceFiles({confirmedEvents:[event,{...event,titleRef:{mediaType:'series',tmdbId:42}}],
      catalog:{titles:[{...movie,metadataComplete:false}]},now})
    expect(plan.files).toEqual([])
    expect(plan.counts.pendingUniqueTitles).toBe(2)
    expect(plan.counts.unresolved).toBe(2)
  })
  it('keeps episode number evidence but never feed episode titles or injected TMDB episode metadata',()=>{
    const series={...movie,type:'series',mediaType:'tv',metadataChecks:{...movie.metadataChecks,seasons:'present'}}
    const plan=planXmltvAirSourceFiles({confirmedEvents:[{...event,titleRef:{mediaType:'series',tmdbId:42},
      episode:{seasonNumber:2,episodeNumber:4,title:'PRIVATE EPISODE',catalog:{tmdbId:987,seasonNumber:2,episodeNumber:4,title:'UNVERIFIED'}}}],
      catalog:{titles:[series]},now})
    const airing=plan.files[0].titles.entries[0].airings[0]
    expect(airing.episode).toEqual({seasonNumber:2,episodeNumber:4,title:''})
    expect(JSON.stringify(plan.files)).not.toContain('PRIVATE EPISODE')
    expect(JSON.stringify(plan.files)).not.toContain('UNVERIFIED')
  })
  it('rejects invalid station mapping, expired events and events outside preview horizon',()=>{
    const plan=planXmltvAirSourceFiles({confirmedEvents:[{...event,channelId:'ard'},
      {...event,startAt:'2026-11-15T18:00:00Z',endAt:'2026-11-15T20:00:00Z'},
      {...event,startAt:'2026-12-01T18:00:00Z',endAt:'2026-12-01T20:00:00Z'}],catalog:{titles:[movie]},now})
    expect(plan.counts.eligible).toBe(0)
    expect(plan.files).toEqual([])
  })
  it('refuses duplicate canonical identities instead of letting input order choose metadata',()=>{
    expect(()=>planXmltvAirSourceFiles({confirmedEvents:[event],catalog:{titles:[movie,{...movie,title:'Other'}]},now})).toThrow(/Duplicate/)
  })
})
