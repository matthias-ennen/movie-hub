import { describe, expect, it } from 'vitest'
import { JoynLookupCache } from '../scripts/joyn-match-cache.mjs'
import {
  G2P_CONFIRMATION, g2pExactPotentialRequest,
  computeG2pPrivateOverlap, isSafeG2pOverlapAggregate,
  safeG2pFailureCode, runG2pPrivateOriginalSourceCensus,
  collectG2pWaipuCensusBroadcasts,
} from '../scripts/shared-tmdb-g2p-private-source-demand-census.mjs'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { buildXmltvPrivateSourceGeneration } from '../src/sources/xmltv/xmltvPrivateStaging.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from '../src/sources/xmltv/xmltvStationMappings.js'
const NOW=Date.parse('2026-11-14T10:30:00.000Z')
const SECRET='PRIVATE_SOURCE_PROGRAMME_TITLE_NEVER_LOG'
const film='Gemeinsamer Film'
const series='Gemeinsame Serie'
const third='Titel nur bei Joyn'
const fourth='Titel nur bei Waipu'
const utc=n=>new Date(n).toISOString()
const joynSearchProof=(title,type)=>({
  type,reason:'exact_joyn_search',exactTypes:[type],exactCount:1,
  exactResults:[{title,type,joynType:type==='movie'?'Movie':'Series'}],
})
const xmltime=n=>utc(n).replace(/[-:T]/g,'').slice(0,14)+' +0000'
const station=sourceId=>Object.entries(XMLTV_REVIEWED_STATION_MAPPINGS[sourceId])
  .find(([,row])=>row.stationId==='zdf')[0]
function snapshot(sourceId,items=[
  { title:film,category:'Film' },
  { title:series,category:'Serie' },
  { title:third,category:'Film' },
]) {
  const channel=station(sourceId)
  const lines=['<tv><channel id="'+channel+'"><display-name>ZDF</display-name></channel>']
  for (let i=0;i<items.length;i++) {
    const row=items[i]
    lines.push('<programme channel="'+channel+
      '" start="'+xmltime(NOW+(i+1)*3600000)+'" stop="'+
      xmltime(NOW+(i+2)*3600000)+'"><title>'+
      row.title+'</title><category>'+row.category+
      '</category></programme>')
  }
  const parsed=parseXmltvCandidates(lines.concat('</tv>').join(''),{
    sourceId,stationMappings:XMLTV_REVIEWED_STATION_MAPPINGS,
    observedAt:utc(NOW),mappedOnly:true,
  })
  return buildXmltvPrivateSourceGeneration(parsed,{now:NOW})
}
function waipu(title,id,type) {
  return { programId:id, title,
    gridGenre:type==='movie'?'Film':'Serie',
    stationId:'zdf',startTime:utc(NOW+3600000),stopTime:utc(NOW+7200000),
  }
}
function detail(title,id,type) {
  return {id,title,
    mainGenre:type==='movie'?'Film':'Serie',
    ...(type==='series'?{seriesId:'private-series',seasonNumber:1,
      episodeNumber:1,episodeTitle:'Private Folge'}:{}),
  }
}
const joyn=(title,id,type)=>({
  livestream:{id:'private-zdf'},
  start:Math.floor((NOW+3600000)/1000),end:Math.floor((NOW+7200000)/1000),
  program:{id,title,__typename:type},
})
const details=()=>new Map([
  ['w1',detail(film,'w1','movie')],
  ['w2',detail(series,'w2','series')],
  ['w3',detail(fourth,'w3','movie')],
])
const base=()=>({
  waipuBroadcasts:[
    waipu(film,'w1','movie'),
    waipu(series,'w2','series'),
    waipu(fourth,'w3','movie'),
  ],
  waipuDetails:details(),
  joynItems:[
    joyn(film,'j1','Movie'),joyn(third,'j2','Movie'),
    joyn(SECRET,'j3','EpgEntry'),
  ],
  xmltvGenerations:[snapshot('epgshare01'),snapshot('freeepg')],
  now:NOW,
})

describe('#336 G2p private original-source potential TMDB search demand census',()=>{
  it('reuses exact original /search requests with strict type, language and year',()=>{
    expect(G2P_CONFIRMATION).toBe('PRIVATE_G2P_SOURCE_KEY_CENSUS_NO_TMDB')
    const key=g2pExactPotentialRequest({title:film,type:'movie'})
    expect(JSON.parse(key)).toEqual(['/search/movie',{
      language:'de-DE',query:film,include_adult:'false',
    }])
    expect(JSON.parse(g2pExactPotentialRequest({
      title:film,type:'movie',productionYear:2020,
    }))[1].year).toBe('2020')
    expect(JSON.parse(g2pExactPotentialRequest({
      title:series,type:'series',productionYear:2020,
    }))[1]).not.toHaveProperty('first_air_date_year')
    expect(g2pExactPotentialRequest({title:' '+film,type:'movie'})).toBeNull()
    expect(g2pExactPotentialRequest({title:film,type:'episode'})).toBeNull()
    expect(g2pExactPotentialRequest({
      title:film,type:'movie',productionYear:0,
    })).toBeNull()
  })

  it('counts real-format source inputs by exact typed-key set and deduplicates XMLTV cloned feed',()=>{
    const result=computeG2pPrivateOverlap(base())
    expect(result).toMatchObject({
      waipuProgrammesInspected:3,joynProgrammesInspected:3,
      joynLookupCacheAvailable:false,joynTrustedCachedTypeCandidates:0,
      xmltvProgrammesInspected:6,
      waipuTypedDemandCandidates:3,joynTypedDemandCandidates:2,
      xmltvTypedDemandCandidates:6,
      waipuDistinctSearchKeys:3,joynDistinctSearchKeys:2,
      xmltvDistinctSearchKeys:3,
      waipuJoynOverlapKeys:1,waipuXmltvOverlapKeys:2,
      joynXmltvOverlapKeys:2,allThreeOverlapKeys:1,
      unionDistinctSearchKeys:4,potentialRepeatedKeysAcrossSources:4,
      xmltvFamiliesObserved:2,validatedXmltvSources:2,
      realTmdbHttpStarted:0,measuredAvoidedProductionRequests:null,
      untypedProgrammesExcluded:1,
      originalMatcherDecisionsChanged:false,productiveWrites:0,
      publishApproved:false,playbackRoutesApproved:false,
    })
    expect(isSafeG2pOverlapAggregate(result)).toBe(true)
    const out=JSON.stringify(result)
    for (const item of [film,series,third,fourth,SECRET,'sourceRef',
      'externalId','tmdbId','Bearer']) {
      expect(out).not.toContain(item)
    }
  })

  it('hands only the verified exact two-source intersection to the isolated callback, never the output',()=>{
    const received=[]
    const out=computeG2pPrivateOverlap({
      ...base(),onVerifiedWaipuJoynOverlap:keys=>received.push(keys),
    })
    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(new Set([g2pExactPotentialRequest({title:film,type:'movie'})]))
    expect(received[0].size).toBe(out.waipuJoynOverlapKeys)
    expect(JSON.stringify(out)).not.toContain(film)
    expect(JSON.stringify(out)).not.toContain('onVerifiedWaipuJoynOverlap')
    const input=base()
    input.waipuDetails.get('w1').productionYear=2020
    computeG2pPrivateOverlap({...input,onVerifiedWaipuJoynOverlap:keys=>received.push(keys)})
    expect(received[1].size).toBe(0)
    expect(()=>computeG2pPrivateOverlap({...base(),onVerifiedWaipuJoynOverlap:'invalid'}))
      .toThrow(/callback/)
  })

  it('types generic original Joyn EpgEntryV2 only from valid cached SearchQ proofs',()=>{
    const cache=new JoynLookupCache({},NOW)
    cache.set('joyn-title-v1',film,joynSearchProof(film,'movie'))
    cache.set('joyn-title-v1',series,joynSearchProof(series,'series'))
    const input=base()
    input.joynItems=[
      joyn(film,'j1','EpgEntryV2'),
      joyn(series,'j2','EpgEntryV2'),
      joyn(third,'j3','EpgEntryV2'),
    ]
    input.joynLookupCache=cache
    const out=computeG2pPrivateOverlap(input)
    expect(out.joynLookupCacheAvailable).toBe(true)
    expect(out.joynTrustedCachedTypeCandidates).toBe(2)
    expect(out.joynTypedDemandCandidates).toBe(2)
    expect(out.joynDistinctSearchKeys).toBe(2)
    expect(out.waipuJoynOverlapKeys).toBe(2)
    expect(out.joynXmltvOverlapKeys).toBe(2)
    expect(out.allThreeOverlapKeys).toBe(2)
    expect(out.measuredAvoidedProductionRequests).toBeNull()
    expect(isSafeG2pOverlapAggregate(out)).toBe(true)
    for (const privateTitle of [film,series,third,SECRET]) {
      expect(JSON.stringify(out)).not.toContain(privateTitle)
    }
  })

  it('rejects expired, mismatched and generic unverified Joyn classifications',()=>{
    const historical=new JoynLookupCache({},NOW-8*86400000)
    historical.set('joyn-title-v1',film,joynSearchProof(film,'movie'))
    const stale=new JoynLookupCache(historical.entries,NOW)
    const current=new JoynLookupCache({},NOW)
    current.set('joyn-title-v1',series,joynSearchProof(third,'series'))
    for (const [title,cache] of [[film,stale],[series,current]]) {
      const input=base()
      input.joynItems=[joyn(title,'j1','EpgEntryV2')]
      input.joynLookupCache=cache
      const out=computeG2pPrivateOverlap(input)
      expect(out.joynLookupCacheAvailable).toBe(true)
      expect(out.joynTrustedCachedTypeCandidates).toBe(0)
      expect(out.joynTypedDemandCandidates).toBe(0)
      expect(out.joynDistinctSearchKeys).toBe(0)
      expect(out.untypedProgrammesExcluded).toBe(1)
    }
    const noCache=computeG2pPrivateOverlap({
      ...base(),joynItems:[joyn(film,'j1','EpgEntryV2')],
    })
    expect(noCache.joynLookupCacheAvailable).toBe(false)
    expect(noCache.joynTypedDemandCandidates).toBe(0)
  })

  it('keeps explicit original Joyn types and rejects fake cache readers',()=>{
    const cache=new JoynLookupCache({},NOW)
    cache.set('joyn-title-v1',film,joynSearchProof(film,'series'))
    const out=computeG2pPrivateOverlap({
      ...base(),joynItems:[joyn(film,'j1','Movie')],joynLookupCache:cache,
    })
    expect(out.joynTypedDemandCandidates).toBe(1)
    expect(out.joynTrustedCachedTypeCandidates).toBe(0)
    expect(out.waipuJoynOverlapKeys).toBe(1)
    expect(()=>computeG2pPrivateOverlap({
      ...base(),joynLookupCache:{get:()=>joynSearchProof(film,'movie')},
    })).toThrow('G2P_JOYN_DEMAND_REJECTED')
  })

  it('uses the real Waipu grid broadcast shape and excludes old cached slots',()=>{
    const records=[{kind:'grid',key:'zdf|private-slot',value:[
      {id:'w1',title:film,genre:'Film',
        startTime:utc(NOW+3600000),stopTime:utc(NOW+7200000)},
      {id:'w3',title:fourth,genre:'Film',
        startTime:utc(NOW-7200000),stopTime:utc(NOW-3600000)},
    ]}]
    const stations=[{id:'zdf',displayName:'ZDF'}]
    const horizon={start:utc(NOW),endExclusive:utc(NOW+24*3600000)}
    const broadcasts=collectG2pWaipuCensusBroadcasts(records,stations,horizon)
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0]).toMatchObject({
      programId:'w1',gridGenre:'Film',stationId:'zdf',
    })
    const out=computeG2pPrivateOverlap({...base(),waipuBroadcasts:broadcasts})
    expect(out.waipuProgrammesInspected).toBe(1)
    expect(out.waipuTypedDemandCandidates).toBe(1)
    expect(out.waipuJoynOverlapKeys).toBe(1)
    expect(out.waipuXmltvOverlapKeys).toBe(1)
    expect(()=>collectG2pWaipuCensusBroadcasts(records,stations,{
      start:utc(NOW+24*3600000),endExclusive:utc(NOW),
    })).toThrow('G2P_WAIPU_HORIZON_REJECTED')
    expect(safeG2pFailureCode(new Error('G2P_WAIPU_HORIZON_REJECTED')))
      .toBe('G2P_WAIPU_HORIZON_REJECTED')
  })

  it('rejects unreviewed conflicting source provenance rather than counting forged rows',()=>{
    const input=base()
    input.xmltvGenerations[0].records[0].sourceRef.externalId='forged'
    expect(()=>computeG2pPrivateOverlap(input))
      .toThrow('G2P_XMLTV_DEMAND_REJECTED')
    expect(()=>computeG2pPrivateOverlap({...base(),xmltvGenerations:[
      snapshot('epgshare01'),snapshot('epgshare01'),
    ]})).toThrow('G2P_XMLTV_DEMAND_REJECTED')
  })

  it('only counts explicit XMLTV movie/series categories, not generic genres',()=>{
    const input=base()
    input.xmltvGenerations=[snapshot('epgshare01',[
      {title:film,category:'Krimi'},
      {title:series,category:'Serie'},
    ])]
    const out=computeG2pPrivateOverlap(input)
    expect(out.xmltvTypedDemandCandidates).toBe(1)
    expect(out.xmltvDistinctSearchKeys).toBe(1)
    expect(out.waipuXmltvOverlapKeys).toBe(1)
    expect(out.joynXmltvOverlapKeys).toBe(0)
    expect(out.xmltvFamiliesObserved).toBe(1)
  })

  it('does not silently equate movie with series, missing year and scoped movie year',()=>{
    const input=base()
    input.waipuDetails.get('w1').productionYear=2020
    const out=computeG2pPrivateOverlap(input)
    expect(out.waipuJoynOverlapKeys).toBe(0)
    expect(out.waipuXmltvOverlapKeys).toBe(1)
    expect(out.allThreeOverlapKeys).toBe(0)
  })

  it('identifies zero cross-adapter overlap honestly, without network savings claims',()=>{
    const input=base()
    input.waipuBroadcasts=[waipu(fourth,'w3','movie')]
    input.joynItems=[joyn(third,'j2','Movie')]
    input.xmltvGenerations=[snapshot('epgshare01',[
      {title:series,category:'Serie'},
    ])]
    const out=computeG2pPrivateOverlap(input)
    expect(out.waipuJoynOverlapKeys).toBe(0)
    expect(out.joynXmltvOverlapKeys).toBe(0)
    expect(out.waipuXmltvOverlapKeys).toBe(0)
    expect(out.potentialRepeatedKeysAcrossSources).toBe(0)
    expect(out.measuredAvoidedProductionRequests).toBeNull()
  })

  it('rejects injected approvals or any unreviewed key in numeric public aggregate',()=>{
    const valid=computeG2pPrivateOverlap(base())
    const invalid=[
      {...valid,title:SECRET},
      {...valid,realTmdbHttpStarted:1},
      {...valid,measuredAvoidedProductionRequests:4},
      {...valid,originalMatcherDecisionsChanged:true},
      {...valid,publishApproved:true},
      {...valid,playbackRoutesApproved:true},
      {...valid,allThreeOverlapKeys:2},
      {...valid,unionDistinctSearchKeys:5},
      {...valid,joynLookupCacheAvailable:'true'},
      {...valid,joynTrustedCachedTypeCandidates:1},
    ]
    for(const x of invalid) expect(isSafeG2pOverlapAggregate(x)).toBe(false)
  })

  it('does not count partial/unavailable/corrupt original XMLTV snapshots',()=>{
    const input=base()
    input.xmltvGenerations[0].publishApproved=true
    expect(()=>computeG2pPrivateOverlap(input))
      .toThrow('G2P_XMLTV_DEMAND_REJECTED')
  })

  it('rejects missing original source checkpoints with a fixed private-safe diagnostic code',async()=>{
    await expect(runG2pPrivateOriginalSourceCensus({
      root:'/this/path/does/not/contain/movie-hub-source-files',now:NOW,
    })).rejects.toThrow('G2P_CHECKPOINT_STATUS_REJECTED')
    expect(safeG2pFailureCode(new Error(SECRET+' external file title')))
      .toBe('G2P_UNCLASSIFIED_FAILURE')
    expect(safeG2pFailureCode(new Error('G2P_JOYN_WINDOWS_REJECTED')))
      .toBe('G2P_JOYN_WINDOWS_REJECTED')
    expect(safeG2pFailureCode(new Error('G2P_JOYN_LOOKUP_REJECTED')))
      .toBe('G2P_JOYN_LOOKUP_REJECTED')
    expect(safeG2pFailureCode({
      message:'G2P_XMLTV_DEMAND_REJECTED',extra:SECRET,
    })).toBe('G2P_XMLTV_DEMAND_REJECTED')
  })
})
