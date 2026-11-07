import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import {
  buildSeasonalDiscovery, refreshSeasonalDiscovery, seasonalDiscoverParams,
  seasonalDiscoveryRows, readSeasonalDiscovery, validateSeasonalDiscovery,
  SEASONAL_PAGE_BUDGET,
} from '../scripts/tmdb-seasonal-discovery.mjs'
import { buildThemedBrowseRows } from '../src/catalog/seasonalContent.js'
import { restoreLiveSeasonalDiscovery } from '../scripts/restore-live-seasonal-discovery.mjs'

const keywords={ halloween:11, christmas:22, easter:33, pentecost:44, 'new year':55, 'film festival':66, hollywood:77, summer:88 }
const request=vi.fn(async(path,params)=>{
  if(path==='/search/keyword')return {results:[{id:keywords[params.query],name:params.query}]}
  const mediaType=path==='/discover/movie'?'movie':'tv'
  const id=Number(params.with_keywords||5)
  const offset=mediaType==='movie'?0:500000
  const base=id*10000+offset+params.page*100
  return {total_pages:3,results:Array.from({length:5},(_,i)=>({
    id:base+i,adult:false,vote_count:600,vote_average:8.2,
  }))}
})
describe('#728 bounded weekly seasonal TMDB discovery',()=>{
  it('uses the documented TMDB discover filters without fabricating availability',()=>{
    const movie=seasonalDiscoverParams({id:'christmas',mediaType:'movie',keywordId:22},1)
    expect(movie).toMatchObject({with_keywords:22,watch_region:'DE',page:1,
      with_watch_monetization_types:'flatrate|free|ads|rent|buy',include_adult:false})
    expect(movie).not.toHaveProperty('with_watch_providers')
    const quality=seasonalDiscoverParams({id:'quality',mediaType:'tv'},2)
    expect(quality).toMatchObject({sort_by:'vote_average.desc',
      'vote_average.gte':7.5,'vote_count.gte':150})
    expect(quality).not.toHaveProperty('with_keywords')
  })
  it('runs no more than 36 discover pages plus 8 verified keyword lookups',async()=>{
    request.mockClear()
    const snapshot=await buildSeasonalDiscovery({request,generatedAt:'2026-11-07T06:00:00Z'})
    expect(validateSeasonalDiscovery(snapshot)).toBe(true)
    expect(snapshot.strategies).toHaveLength(18)
    expect(snapshot.pagesFetched).toBe(36)
    expect(snapshot.pagesFetched).toBeLessThanOrEqual(SEASONAL_PAGE_BUDGET)
    expect(request).toHaveBeenCalledTimes(44)
    const rows=seasonalDiscoveryRows(snapshot)
    expect(rows).toHaveLength(18)
    expect(rows.find(r=>r.seasonId==='christmas')).toMatchObject({
      discoveryKind:'seasonal',limit:20,
    })
    expect(rows.find(r=>r.discoveryKind==='quality')).toMatchObject({
      seasonId:null,mediaType:'movie',
    })
  })
  it('uses only exact verified keyword identities and never general horror for Halloween',async()=>{
    const get=vi.fn(async(path,params)=>{
      if(path==='/search/keyword')return {results:[{id:3333,name:params.query+' film'}]}
      throw Error('Should not query discover if seasonal keyword was not verified')
    })
    // Quality discovery still operates independently of seasonal keywords.
    const full=vi.fn(async(path,params)=>path==='/search/keyword'
      ? await get(path,params) : {total_pages:1,results:[]})
    const result=await buildSeasonalDiscovery({request:full})
    expect(result.strategies.filter(s=>s.status==='no-keyword')).toHaveLength(6)
    expect(result.strategies.filter(s=>s.id==='quality'&&s.status==='complete')).toHaveLength(2)
    expect(result.pagesFetched).toBe(12)
  })
  it('reuses a valid weekly snapshot without any TMDB API requests',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'moviehub-themes-'))
    const path=join(dir,'seasonal.json')
    try{
      request.mockClear()
      const first=await refreshSeasonalDiscovery({request,path,now:new Date('2026-11-07T07:00:00Z')})
      expect(first.uniqueCandidates).toBeGreaterThan(0)
      expect(request).toHaveBeenCalledTimes(44)
      request.mockClear()
      const cached=await refreshSeasonalDiscovery({request,path,now:new Date('2026-11-12T07:00:00Z')})
      expect(cached.generatedAt).toBe(first.generatedAt)
      expect(request).not.toHaveBeenCalled()
      expect(await readSeasonalDiscovery(path)).toEqual(first)
      const written=JSON.parse(await readFile(path,'utf8'))
      expect(written).toEqual(first)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('accepts published v1 snapshot during safe restore but upgrades it on the next real discovery',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'moviehub-themes-legacy-'))
    const path=join(dir,'seasonal.json')
    try{
      const v2=await buildSeasonalDiscovery({request,generatedAt:'2026-11-07T06:00:00Z'})
      const strategies=v2.strategies.filter(s=>['halloween','christmas','easter','pentecost','quality'].includes(s.id))
      const legacy={...v2,version:1,keywordLookups:4,strategies,
        pagesFetched:strategies.reduce((n,s)=>n+s.pagesFetched,0),
        uniqueCandidates:new Set(strategies.flatMap(s=>s.candidates.map(c=>c.mediaType+':'+c.id))).size}
      expect(validateSeasonalDiscovery(legacy)).toBe(true)
      await writeFile(path,JSON.stringify(legacy))
      expect((await readSeasonalDiscovery(path)).version).toBe(1)
      request.mockClear()
      const upgraded=await refreshSeasonalDiscovery({request,path,now:new Date('2026-11-08T07:00:00Z')})
      expect(upgraded.version).toBe(3)
      expect(upgraded.strategies).toHaveLength(18)
      expect(request).toHaveBeenCalledTimes(44)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('keeps a bounded festival editorial search even with an exact festival keyword',async()=>{
    const calls=[]
    const festivalSearch=vi.fn(async(path,params)=>{
      if(path==='/search/keyword'){
        return {results:params.query==='film festival'?[{id:66,name:'film festival'}]:[]}
      }
      calls.push({path,...params})
      const isFestivalKeyword=params.with_keywords===66
      const base=isFestivalKeyword?6000:9000
      return {total_pages:2,results:Array.from({length:12},(_,i)=>({
        id:base+i+(path.endsWith('/tv')?50000:0),
        adult:false,vote_average:8.1,vote_count:600,
      }))}
    })
    const snapshot=await buildSeasonalDiscovery({request:festivalSearch})
    const festival=snapshot.strategies.find(s=>s.id==='filmfestival'&&s.mediaType==='movie')
    expect(festival.status).toBe('complete')
    expect(festival.keywordId).toBe(66)
    expect(festival.candidates).toHaveLength(20)
    expect(festival.candidates.some(c=>c.id>=6000 && c.id<9000)).toBe(true)
    expect(festival.candidates.some(c=>c.id>=9000 && c.id<10000)).toBe(true)
    const festivalCalls=calls.filter(c=>c.path==='/discover/movie'
      && (c.with_keywords===66 || c['vote_average.gte']===7.2))
    expect(festivalCalls.some(c=>c.with_keywords===66)).toBe(true)
    expect(festivalCalls.some(c=>c['vote_average.gte']===7.2
      && c['vote_count.gte']===250)).toBe(true)
    const row=seasonalDiscoveryRows(snapshot).find(r=>r.id==='themed-filmfestival-movies')
    expect(row.title).toBe('Internationale Kino-Entdeckungen · Filme')
    expect(snapshot.pagesFetched).toBeLessThanOrEqual(SEASONAL_PAGE_BUDGET)
  })
  it('does not imply award wins or festival participation from generic fallback discovery',async()=>{
    const noKeywords=vi.fn(async(path)=>path==='/search/keyword'
      ? {results:[]} : {total_pages:1,results:Array.from({length:8},(_,i)=>({
        id:1000+i,adult:false,vote_average:8.6,vote_count:700,
      }))})
    const snapshot=await buildSeasonalDiscovery({request:noKeywords})
    const hollywood=snapshot.strategies.find(s=>s.id==='hollywood'&&s.mediaType==='movie')
    expect(hollywood.status).toBe('fallback')
    expect(hollywood.keywordId).toBeNull()
    const row=seasonalDiscoveryRows(snapshot).find(r=>r.id==='themed-hollywood-movies')
    expect(row.title).toMatch(/^Großes Kino/)
    expect(row).not.toHaveProperty('awardWinner')
    expect(snapshot.pagesFetched).toBeLessThanOrEqual(SEASONAL_PAGE_BUDGET)
  })
  it('keeps the prior verified snapshot when the source temporarily fails',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'moviehub-themes-'))
    const path=join(dir,'seasonal.json')
    try{
      const first=await refreshSeasonalDiscovery({request,path,now:new Date('2026-11-07T07:00:00Z')})
      const no=vi.fn(async()=>{throw Error('TMDB 503')})
      const fallback=await refreshSeasonalDiscovery({
        request:no,path,now:new Date('2026-11-16T07:00:00Z'),
      })
      expect(fallback).toEqual(first)
      expect(await readSeasonalDiscovery(path)).toEqual(first)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('reuses canonical title identities and filters unavailable providers',()=>{
    const ids=['tmdb-movie-100','tmdb-movie-200','tmdb-movie-300',
      'tmdb-movie-400','tmdb-movie-500','tmdb-movie-600','tmdb-movie-700']
    const map=new Map(ids.map((id,i)=>[id,{id,providerIds:i===0?[]:['netflix'],type:'movie'}]))
    const rows=[{id:'themed-christmas-movies',title:'Weihnachten · Filme',
      seasonId:'christmas',discoveryKind:'seasonal',mediaType:'movie',ids},
      {id:'themed-quality-movies',title:'Besonders gut bewertete Filme',
        discoveryKind:'quality',mediaType:'movie',ids}]
    const visible=buildThemedBrowseRows(rows,map,'christmas','movie',
      item=>item.providerIds.includes('netflix'))
    expect(visible.map(r=>r.id)).toEqual(['themed-christmas-movies','themed-quality-movies'])
    expect(visible[0].items).toHaveLength(6)
    expect(buildThemedBrowseRows(rows,map,'classic','movie',
      item=>item.providerIds.includes('netflix')).map(r=>r.id))
      .toEqual(['themed-quality-movies'])
    expect(buildThemedBrowseRows(rows,map,'halloween','series')).toEqual([])
  })
  it('nightly pipeline restores snapshot before canonical catalog and preserves others on code-only',()=>{
    const workflow=readFileSync(new URL('../.github/workflows/deploy-firebase.yml',import.meta.url),'utf8')
    expect(workflow).toContain('Restore last published seasonal TMDB discovery snapshot')
    expect(workflow).toContain('node scripts/restore-live-seasonal-discovery.mjs')
    expect(workflow.indexOf('Restore last published seasonal TMDB discovery snapshot'))
      .toBeLessThan(workflow.indexOf('Generate TMDB catalog for strict refresh'))
  })
})


describe('#728 Firebase first-publish seasonal snapshot bootstrap',()=>{
  async function fixture(rows,run){
    const dir=await mkdtemp(join(tmpdir(),'moviehub-seasonal-bootstrap-'))
    const catalogPath=join(dir,'catalog.json')
    try {
      if(rows!==undefined)
        await writeFile(catalogPath,JSON.stringify({ rowDefinitions: rows }))
      await run({catalogPath,path:join(dir,'seasonal.json')})
    } finally {await rm(dir,{recursive:true,force:true})}
  }
  const spaFallback=vi.fn(async()=>({
    ok:true,status:200,headers:{get: key=>key==='content-type'?'text/html; charset=utf-8':null},
  }))
  const notFound=vi.fn(async()=>({
    ok:false,status:404,headers:{get:()=> 'text/html'},
  }))
  it('recognizes Firebase SPA HTML as missing only during first canonical publication',async()=>{
    await fixture([{id:'provider-prime'}],async files=>{
      await expect(restoreLiveSeasonalDiscovery({
        ...files,request:spaFallback,
      })).resolves.toBeNull()
      await expect(restoreLiveSeasonalDiscovery({
        ...files,request:notFound,
      })).resolves.toBeNull()
    })
  })
  it('fails closed if a previous catalog already published themed or quality rows',async()=>{
    await fixture([{id:'themed-christmas-movies',seasonId:'christmas'}],async files=>{
      await expect(restoreLiveSeasonalDiscovery({
        ...files,request:spaFallback,
      })).rejects.toThrow('SEASONAL_SNAPSHOT_MISSING_FOR_PUBLISHED_THEME_ROWS')
    })
    await fixture([{id:'themed-quality-series',discoveryKind:'quality'}],async files=>{
      await expect(restoreLiveSeasonalDiscovery({
        ...files,request:notFound,
      })).rejects.toThrow('SEASONAL_SNAPSHOT_MISSING_FOR_PUBLISHED_THEME_ROWS')
    })
  })
  it('never allows bootstrap without proof from a valid canonical catalog',async()=>{
    await fixture(undefined,async files=>{
      await expect(restoreLiveSeasonalDiscovery({
        ...files,request:spaFallback,
      })).rejects.toThrow()
    })
  })
  it('fails on real HTTP/server errors, not treating them as bootstrap',async()=>{
    await fixture([],async files=>{
      await expect(restoreLiveSeasonalDiscovery({
        ...files,request:vi.fn(async()=>({
          ok:false,status:503,headers:{get:()=> 'text/html'},
        })),
      })).rejects.toThrow('SEASONAL_SNAPSHOT_FETCH_FAILED_CLOSED')
    })
  })
})
