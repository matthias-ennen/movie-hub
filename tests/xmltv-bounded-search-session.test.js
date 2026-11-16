import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openXmltvBoundedSearchSession } from '../scripts/xmltv-bounded-search-session.mjs'
import { openOptionalSharedTmdbCapture } from '../scripts/shared-tmdb-adapter-capture-stage.mjs'
import { xmltvExactTmdbSearchKey } from '../scripts/shared-tmdb-g2n-private-response-replay.mjs'

const N=Date.parse('2026-11-16T00:00:00Z')
const roots=[]
const root=async()=>{const r=await mkdtemp(join(tmpdir(),'mh-xmltv-exact-'));roots.push(r);return r}
afterEach(async()=>Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true}))))
const row=(title,productionYearEvidence)=>({title,productionYearEvidence})
const movie={results:[{id:101,title:'Synthetic film',release_date:'2001-01-01'}]}
const series={results:[{id:202,name:'Synthetic series',first_air_date:'2010-01-01'}]}
const reply=data=>({ok:true,status:200,headers:new Headers(),json:async()=>data,text:async()=>''})
const peer=(projectRoot,sourceId,now)=>openOptionalSharedTmdbCapture({projectRoot,sourceId,enabled:true,persistent:true,reuse:true,now,runStartedAt:N})
const open=(projectRoot,fetchImpl,options={})=>openXmltvBoundedSearchSession({projectRoot,token:'SYNTHETIC',fetchImpl,now:N+2000,runStartedAt:N,sleep:async()=>{},...options})

it('reads peer responses and writes literal XMLTV HTTP results for later Waipu/Joyn use, deduplicates simultaneous starts',async()=>{
  const r=await root(),w=await peer(r,'waipu',N+1000)
  const prior=row('Synthetic film',2001)
  w.responseCache.set(xmltvExactTmdbSearchKey(prior,'movie'),movie)
  await w.complete({sourceGenerationComplete:true})
  const fetcher=vi.fn(async url=>{
    expect(url.origin).toBe('https://api.themoviedb.org')
    expect(url.pathname).toBe('/3/search/tv')
    expect(url.searchParams.get('query')).toBe('Synthetic series')
    expect(url.searchParams.has('first_air_date_year')).toBe(false)
    return reply(series)
  })
  const x=await open(r,fetcher)
  expect(await x.lookup(prior,'movie')).toEqual(movie)
  const candidate=row('Synthetic series',2010)
  const pair=await Promise.all([x.lookup(candidate,'series'),x.lookup(candidate,'series')])
  expect(pair).toEqual([series,series])
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(x.counts()).toMatchObject({requestsStarted:1,repeatedKeys:1,sharedResponseHits:1,capturedResponses:1})
  expect(await x.complete({sourceGenerationComplete:true})).toMatchObject({sourceId:'xmltv',saveStatus:'saved',actualSearchStarts:1})
  const j=await peer(r,'joyn',N+3000)
  expect(j.responseCache.get(xmltvExactTmdbSearchKey(candidate,'series'))).toEqual(series)
})

it('does not perform year fallback and caches genuine empty responses but never budget misses',async()=>{
  const r=await root(),fetcher=vi.fn(async url=>{
    expect(url.searchParams.get('year')).toBe('2001')
    return reply({results:[]})
  })
  const x=await open(r,fetcher,{maxStarts:1})
  const a=row('Empty',2001),b=row('Unqueried')
  expect(await x.lookup(a,'movie')).toEqual({results:[]})
  expect(await x.lookup(a,'movie')).toEqual({results:[]})
  expect(await x.lookup(b,'movie')).toBeNull()
  expect(await x.lookup(row('bad\nquery'),'movie')).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(x.counts()).toMatchObject({budgetMisses:1,invalidKeys:1,requestsStarted:1})
  await x.complete({sourceGenerationComplete:true})
  const w=await peer(r,'waipu',N+3000)
  expect(w.responseCache.get(xmltvExactTmdbSearchKey(a,'movie'))).toEqual({results:[]})
  expect(w.responseCache.get(xmltvExactTmdbSearchKey(b,'movie'))).toBeNull()
})

it('stops unsuccessful transport, never stores failure as empty, and declines incomplete generations',async()=>{
  const r=await root(),fetcher=vi.fn(async()=>reply(movie))
  const x=await open(r,fetcher)
  expect(await x.lookup(row('Incomplete'),'movie')).toEqual(movie)
  expect(await x.complete({sourceGenerationComplete:false})).toMatchObject({saveStatus:'not_complete'})
  const j=await peer(r,'joyn',N+3000)
  expect(j.responseCache.get(xmltvExactTmdbSearchKey(row('Incomplete'),'movie'))).toBeNull()
  const failing=vi.fn(async()=>({ok:false,status:429,headers:new Headers(),text:async()=>''}))
  const next=await open(r,failing)
  expect(await next.lookup(row('Failed'),'movie')).toBeNull()
  expect(await next.lookup(row('Another'),'movie')).toBeNull()
  expect(failing).toHaveBeenCalledTimes(1)
  expect(next.counts()).toMatchObject({failedRequests:1,stoppedMisses:1,requestsStarted:1,capturedResponses:0})
  expect(await next.complete({sourceGenerationComplete:true})).toMatchObject({saveStatus:'no_new_responses'})
  await expect(open(r,failing,{maxStarts:101})).rejects.toThrow(/Invalid bounded/)
})
