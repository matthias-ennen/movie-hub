import { describe, expect, it, vi } from 'vitest'
import {
  G2O_CONFIRMATION, G2O_MAX_HTTP_STARTS, G2T_CONFIRMATION,
  selectG2oCatalogSamples, createG2oTmdbNetworkBoundary,
  compareG2oBoundedOriginalClients, isSafeG2oAbReport,
} from '../scripts/shared-tmdb-g2o-bounded-real-http-ab.mjs'

const NOW = Date.parse('2026-11-14T14:00:00.000Z')
const FILM = 'Unverwechselbarer privater Testfilm'
const SERIES = 'Unverwechselbare private Testserie'
const movie = { id: 20033, title: FILM, release_date: '2020-05-05' }
const tv = { id: 20034, name: SERIES, first_air_date: '2021-07-01' }
function catalog(titles = [
  { source: 'tmdb', type: 'movie', tmdbId: movie.id, title: FILM },
  { source: 'tmdb', type: 'series', tmdbId: tv.id, title: SERIES },
], generatedAt = new Date(NOW).toISOString()) {
  return {
    source: 'tmdb', generatedAt,
    titles, rowDefinitions: [{ id: 'movies', title: 'Filme', ids: [] }],
  }
}
function responder({ movieResults = [movie], tvResults = [tv],
  fail = false } = {}) {
  const requests = []
  const fetchImpl = vi.fn(async (url, init) => {
    const u = new URL(String(url))
    requests.push(u)
    expect(u.host).toBe('api.themoviedb.org')
    expect(init.redirect).toBe('error')
    expect(u.searchParams.get('year')).toBeNull()
    expect(u.searchParams.get('first_air_date_year')).toBeNull()
    if (fail) return new Response('synthetic upstream unavailable', {
      status: 503, headers: {'content-type':'text/plain'},
    })
    const results = u.pathname.endsWith('/search/movie')
      ? movieResults : tvResults
    return new Response(JSON.stringify({
      results, page: 1, total_pages: 1,
    }), { status: 200, headers: {'content-type':'application/json'} })
  })
  return { requests, fetchImpl }
}

describe('#336 G2o bounded REAL TMDB pilot with original clients (offline CI)',()=>{
  it('uses both work types in a fresh existing app catalog and never invents a title',()=>{
    const selected = selectG2oCatalogSamples(catalog(),{now:NOW})
    expect(selected).toEqual([
      {type:'movie',title:FILM,expectedTmdbId:20033},
      {type:'series',title:SERIES,expectedTmdbId:20034},
    ])
    expect(G2O_CONFIRMATION).toBe('PRIVATE_G2O_HTTP_AB_MAX_6')
    expect(G2O_MAX_HTTP_STARTS).toBe(6)
  })

  it('rejects stale, missing type and ambiguous TMDB IDs rather than guessing',()=>{
    const stale=catalog(undefined,
      new Date(NOW-15*86_400_000).toISOString())
    expect(()=>selectG2oCatalogSamples(stale,{now:NOW})).toThrow()
    expect(()=>selectG2oCatalogSamples(catalog([
      {source:'tmdb',type:'movie',tmdbId:1,title:FILM},
    ]),{now:NOW})).toThrow(/two unique/)
    expect(()=>selectG2oCatalogSamples(catalog([
      {source:'tmdb',type:'movie',tmdbId:2,title:FILM},
      {source:'tmdb',type:'movie',tmdbId:3,title:FILM},
      {source:'tmdb',type:'series',tmdbId:4,title:SERIES},
    ]),{now:NOW})).toThrow(/two unique/)
  })

  it('executes 4 baseline vs 2 shared original starts; match identities and raw results identical',async()=>{
    const fake = responder()
    const report = await compareG2oBoundedOriginalClients({
      catalog:catalog(),now:NOW,token:'PRIVATE_FAKE_NO_REAL_KEY',
      fetchImpl:fake.fetchImpl,
    })
    expect(fake.requests).toHaveLength(6)
    expect(report).toMatchObject({
      kind:'g2o-original-client-real-http-ab-aggregate',
      mode:'fixture-only',
      catalogTypesCompared:2,
      baselineTransportStarts:4,
      sharedTransportStarts:2,
      totalTransportStarts:6,
      sharedExactResponseHits:2,
      expectedCatalogTmdbIdsPresent:2,
      responsesIdenticalAcrossArms:true,
      matcherDecisionsEquivalent:true,
      sharedSnapshotEntries:2,
      liveTmdbHttpStarted:0,
      savingsWithinPrivatePilot:2,
      measuredProductionSavings:null,
      productiveWrites:0,
      originalEpgUsed:false,
      publishApproved:false,
      nightlyEnabled:false,
    })
    expect(report.matchedBaselineDecisions).toBeGreaterThan(0)
    expect(isSafeG2oAbReport(report)).toBe(true)
    const printed=JSON.stringify(report)
    expect(printed).not.toContain(FILM)
    expect(printed).not.toContain(SERIES)
    expect(printed).not.toContain('PRIVATE_FAKE_NO_REAL_KEY')
    expect(isSafeG2oAbReport({...report,originalTitle:FILM})).toBe(false)
    expect(isSafeG2oAbReport({...report,measuredProductionSavings:2}))
      .toBe(false)
  })

  it('rejects unrelated hosts, paths, languages, changed titles, changed years and seventh request',async()=>{
    const inputs=selectG2oCatalogSamples(catalog(),{now:NOW})
    const fake = responder()
    const token='PRIVATE_NOT_A_REAL_KEY'
    const boundary=createG2oTmdbNetworkBoundary({
      fetchImpl:fake.fetchImpl,token,inputs,maxStarts:6,
    })
    const opts={headers:{Authorization:'Bearer '+token}}
    const permitted='https://api.themoviedb.org/3/search/movie?language=de-DE&query='+
      encodeURIComponent(FILM)+'&include_adult=false'
    const invalid=[
      permitted.replace('api.themoviedb.org','attacker.example'),
      permitted.replace('/3/search/movie','/3/movie/123'),
      permitted.replace('de-DE','en-US'),
      permitted.replace('include_adult=false','include_adult=true'),
      permitted.replace('include_adult=false','include_adult=false&year=2020'),
      permitted.replace(encodeURIComponent(FILM),'Falscher%20Titel'),
    ]
    for(const url of invalid) await expect(boundary.fetch(url,opts)).rejects.toThrow()
    expect(boundary.starts()).toBe(0)
    for(let k=0;k<6;k++) await boundary.fetch(permitted,opts)
    expect(boundary.starts()).toBe(6)
    await expect(boundary.fetch(permitted,opts)).rejects.toThrow(/cap/)
    expect(fake.requests).toHaveLength(6)
  })

  it('keeps the source HTTP errors from becoming false successful A/B results',async()=>{
    const fake=responder({fail:true})
    await expect(compareG2oBoundedOriginalClients({
      catalog:catalog(),now:NOW,token:'PRIVATE_FAKE_NO_REAL_KEY',
      fetchImpl:fake.fetchImpl,
    })).rejects.toThrow(/TMDB search failed/)
    expect(fake.requests).toHaveLength(1)
  })

  it('detects response changes across arms without falsely claiming parity',async()=>{
    let calls=0
    const fake = vi.fn(async url=>{
      calls++
      const u=new URL(String(url))
      const result=u.pathname.endsWith('/movie')
        ? {...movie, id: calls<3? movie.id : 90000} : tv
      return new Response(JSON.stringify({results:[result],page:1,total_pages:1}),{
        status:200,headers:{'content-type':'application/json'},
      })
    })
    const report=await compareG2oBoundedOriginalClients({
      catalog:catalog(),now:NOW,token:'PRIVATE_FAKE_NO_REAL_KEY',
      fetchImpl:fake,
    })
    expect(report.responsesIdenticalAcrossArms).toBe(false)
    expect(report.expectedCatalogTmdbIdsPresent).toBeLessThan(2)
    expect(report.measuredProductionSavings).toBeNull()
    expect(isSafeG2oAbReport(report)).toBe(true)
  })

  it('will not set manual real-HTTP mode without the GitHub human authorization',async()=>{
    const fake=responder()
    await expect(compareG2oBoundedOriginalClients({
      catalog:catalog(),token:'PRIVATE_FAKE_NO_REAL_KEY',
      fetchImpl:fake.fetchImpl,now:NOW,
      mode:'manual-private-real-http',
    })).rejects.toThrow(/manual private approval/)
    expect(fake.requests).toHaveLength(0)
  })
})

describe('#336 G2t source-backed private A/B subset',()=>{
  const key=(type,title,extra={})=>JSON.stringify([
    type==='movie'?'/search/movie':'/search/tv',
    {language:'de-DE',query:title,include_adult:'false',...extra},
  ])
  const sourceKeys=()=>new Set([key('movie',FILM),key('series',SERIES)])
  it('uses ONLY literal type/title/no-year matches present in both original sources',()=>{
    const c=catalog([
      {source:'tmdb',type:'movie',tmdbId:30001,title:'Earlier unrelated film'},
      {source:'tmdb',type:'series',tmdbId:30002,title:'Earlier unrelated series'},
      ...catalog().titles,
    ])
    expect(selectG2oCatalogSamples(c,{now:NOW,requiredSharedKeys:sourceKeys()}))
      .toEqual(selectG2oCatalogSamples(catalog(),{now:NOW}))
    expect(()=>selectG2oCatalogSamples(c,{now:NOW,requiredSharedKeys:new Set([
      key('movie',FILM,{year:'2020'}),key('series',SERIES),
    ])})).toThrow(/two unique/)
    expect(()=>selectG2oCatalogSamples(c,{now:NOW,requiredSharedKeys:new Set([
      key('movie',FILM.toLowerCase()),key('series',SERIES),
    ])})).toThrow(/two unique/)
    expect(()=>selectG2oCatalogSamples(c,{now:NOW,requiredSharedKeys:new Set()}))
      .toThrow(/two unique/)
    expect(()=>selectG2oCatalogSamples(c,{now:NOW,requiredSharedKeys:[]}))
      .toThrow(/source-key/)
  })
  it('rejects ambiguous original catalog identities even with exact shared demand',()=>{
    const c=catalog([...catalog().titles,
      {source:'tmdb',type:'movie',tmdbId:90001,title:FILM}])
    expect(()=>selectG2oCatalogSamples(c,{now:NOW,requiredSharedKeys:sourceKeys()}))
      .toThrow(/two unique/)
  })
  it('runs only selected keys, preserves count-only report and separate authorization',async()=>{
    const fake=responder()
    const report=await compareG2oBoundedOriginalClients({
      catalog:catalog(),now:NOW,token:'PRIVATE_FAKE_NO_REAL_KEY',
      fetchImpl:fake.fetchImpl,requiredSharedKeys:sourceKeys(),
    })
    expect(report).toMatchObject({
      kind:'g2t-source-backed-original-client-http-ab-aggregate',
      originalEpgUsed:true,baselineTransportStarts:4,sharedTransportStarts:2,
      responsesIdenticalAcrossArms:true,matcherDecisionsEquivalent:true,
      liveTmdbHttpStarted:0,measuredProductionSavings:null,
    })
    expect(isSafeG2oAbReport(report)).toBe(true)
    expect(isSafeG2oAbReport({...report,originalEpgUsed:false})).toBe(false)
    expect(JSON.stringify(report)).not.toContain(FILM)
    expect(G2T_CONFIRMATION).toBe('PRIVATE_G2T_SOURCE_BACKED_HTTP_AB_MAX_6')
    const blocked=responder()
    await expect(compareG2oBoundedOriginalClients({
      catalog:catalog(),now:NOW,token:'FAKE',fetchImpl:blocked.fetchImpl,
      requiredSharedKeys:new Set(),mode:'manual-private-real-http',
    })).rejects.toThrow(/manual private approval/)
    expect(blocked.requests).toHaveLength(0)
  })
})
