import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, chmod, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JoynLookupCache } from '../scripts/joyn-match-cache.mjs'
import { JoynTmdbSearchClient } from '../scripts/joyn-tmdb-matcher.mjs'
import { WaipuTmdbSearchClient } from '../scripts/waipu-tmdb-matcher.mjs'
import {
  SharedTmdbResponseStore, loadOptionalSharedTmdbResponses,
  saveOptionalSharedTmdbResponses, SHARED_TMDB_RESPONSE_STORE_TTL_MS,
} from '../scripts/shared-tmdb-response-store.mjs'
import {
  SHARED_TMDB_SEARCH_NAMESPACE, createSharedTmdbSearchResponseCache,
} from '../scripts/shared-tmdb-search-response-cache.mjs'
import {
  openG2nPrivateSharedTmdbRead,
  createG2nXmltvCachedResponseResolver,
  runG2nSyntheticOfflineTransportComparison,
  isSafeG2nSyntheticAbReport,
} from '../scripts/shared-tmdb-g2n-private-response-replay.mjs'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from '../src/sources/xmltv/xmltvStationMappings.js'
import { matchXmltvLocalCandidates } from '../scripts/xmltv-g1b-match-preview.mjs'

const NOW = Date.parse('2026-11-14T12:00:00.000Z')
const TITLE = 'PRIVATE SYNTHETIC SCENE TITLE'
const MOVIE = { id: 12347, title: TITLE, release_date: '2020-03-06' }
const KEY = JSON.stringify(['/search/movie', {
  language:'de-DE',query:TITLE,include_adult:'false',
}])
const YEAR_KEY = JSON.stringify(['/search/movie', {
  language:'de-DE',query:TITLE,include_adult:'false',year:'2020',
}])
const TV_KEY = JSON.stringify(['/search/tv', {
  language:'de-DE',query:TITLE,include_adult:'false',
}])
const movieReply = () => ({
  ok:true,status:200,headers:new Headers(),
  json:async()=>({page:1,total_pages:1,results:[MOVIE]}),
  text:async()=>'', 
})
const roots = []
const root = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moviehub-g2n-unit-'))
  roots.push(dir)
  return dir
}
const storeFile = dir => join(dir,'shared-tmdb-response-cache.json')
afterEach(async()=>{
  await Promise.all(roots.splice(0).map(dir =>
    rm(dir,{recursive:true,force:true})))
})
async function seeded(file, key = KEY) {
  const store = new SharedTmdbResponseStore({now:NOW})
  expect(store.set(SHARED_TMDB_SEARCH_NAMESPACE,key,{
    results:[MOVIE],page:1,total_pages:1,
  })).toBe(true)
  expect(await saveOptionalSharedTmdbResponses(file,store))
    .toMatchObject({status:'saved',entries:1})
  return store
}

describe('#336 G2n actual original TMDB client response store private replay',()=>{
  it('measures separately instrumented simulated requests, preserving matcher identities',async()=>{
    const result = await runG2nSyntheticOfflineTransportComparison({now:NOW})
    expect(result).toMatchObject({
      baselineOriginalClientRequestsStarted:2,
      sharedOriginalClientRequestsStarted:1,
      baselineMockHttpCalls:2,
      sharedMockHttpCalls:1,
      sharedWaipuCacheHits:1,
      identitiesPreserved:true,
      liveTmdbRequestsStarted:0,
      measuredProductionRequestsAvoided:null,
      originalSourcesPublished:false,
      sharedSnapshotWrites:1,
    })
    expect(isSafeG2nSyntheticAbReport(result)).toBe(true)
    const serialized=JSON.stringify(result)
    expect(serialized).not.toContain(TITLE)
    expect(serialized).not.toContain('token')
    expect(isSafeG2nSyntheticAbReport({...result,title:TITLE})).toBe(false)
    expect(isSafeG2nSyntheticAbReport({
      ...result,measuredProductionRequestsAvoided:1,
    })).toBe(false)
  })

  it('restores a verified entry to a new Waipu client without HTTP or shared-snapshot writes',async()=>{
    const file=storeFile(await root())
    await seeded(file)
    const content=await readFile(file,'utf8')
    const replay=await openG2nPrivateSharedTmdbRead({
      file,sourceId:'waipu',enabled:true,now:NOW+1000,
    })
    expect(replay.loadStatus).toBe('loaded')
    const fetchImpl=vi.fn(async()=>{throw new Error('No HTTP after exact cache hit')})
    const waipu=new WaipuTmdbSearchClient({
      token:'TEST',fetchImpl,responseCache:replay.responseCache,
      paceMs:0,maxRetries:0,
    })
    const result=await waipu.search({type:'movie',title:TITLE})
    expect(result[0].id).toBe(MOVIE.id)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(waipu.requestsStarted).toBe(0)
    expect(replay.summary()).toMatchObject({
      loadStatus:'loaded',restoredExactSearchResponses:1,
      sharedResponseHits:1,sharedSnapshotWrites:0,
      matcherIdentityApproved:false,
    })
    expect(await readFile(file,'utf8')).toBe(content)
    expect((await stat(file)).mode&0o777).toBe(0o600)
  })

  it('keeps Joyn original lookup HIT ahead of shared response and preserves original writes',async()=>{
    const file=storeFile(await root())
    await seeded(file)
    const original=new JoynLookupCache({},NOW+1000)
    original.set(SHARED_TMDB_SEARCH_NAMESPACE,KEY,{
      results:[{id:9999,title:TITLE,release_date:'2020-03-06'}],
    })
    const replay=await openG2nPrivateSharedTmdbRead({
      file,sourceId:'joyn',enabled:true,now:NOW+1000,
      originalJoynCache:original,
    })
    const fetchImpl=vi.fn(async()=>{throw new Error('No fallback needed')})
    const joyn=new JoynTmdbSearchClient({
      token:'TEST',fetchImpl,responseCache:replay.responseCache,
      paceMs:0,maxRetries:0,
    })
    const candidates=await joyn.search({type:'movie',title:TITLE})
    expect(candidates[0].id).toBe(9999)
    expect(joyn.requestsStarted).toBe(0)
    expect(replay.summary()).toMatchObject({
      sourceOriginalCacheHits:1,sharedResponseHits:0,
    })
    expect(replay.responseCache.set(KEY,{
      results:[{id:456,title:TITLE}],
    })).toBeUndefined()
    expect(original.get(SHARED_TMDB_SEARCH_NAMESPACE,KEY).results[0].id)
      .toBe(456)
    expect(replay.summary().sourceOriginalCacheWrites).toBe(1)
    expect((await readFile(file,'utf8')).includes('9999')).toBe(false)
  })

  it('recovers with original HTTP on missing, stale, invalid-mode or corrupt shared cache',async()=>{
    const dir=await root()
    const file=storeFile(dir)
    const options={
      token:'TEST',fetchImpl:vi.fn(async()=>movieReply()),
      paceMs:0,maxRetries:0,
    }
    const miss=await openG2nPrivateSharedTmdbRead({
      file,sourceId:'waipu',enabled:true,now:NOW,
    })
    expect(miss.loadStatus).toBe('missing')
    await new WaipuTmdbSearchClient({
      ...options,responseCache:miss.responseCache,
    }).search({type:'movie',title:TITLE})
    expect(options.fetchImpl).toHaveBeenCalledOnce()

    await seeded(file)
    const stale=await openG2nPrivateSharedTmdbRead({
      file,sourceId:'waipu',enabled:true,
      now:NOW+SHARED_TMDB_RESPONSE_STORE_TTL_MS+1,
    })
    expect(stale.summary().restoredExactSearchResponses).toBe(0)
    const staleClient=new WaipuTmdbSearchClient({
      ...options,responseCache:stale.responseCache,
    })
    await staleClient.search({type:'movie',title:TITLE})
    expect(staleClient.requestsStarted).toBe(1)

    await chmod(file,0o644)
    const insecure=await openG2nPrivateSharedTmdbRead({
      file,sourceId:'waipu',enabled:true,now:NOW+1000,
    })
    expect(insecure.loadStatus).toBe('unavailable')
    expect(insecure.responseCache.get(KEY)).toBeNull()
    expect(await readFile(file,'utf8')).toContain(TITLE)

    await chmod(file,0o600)
    await writeFile(file,'{CORRUPT', {mode:0o600})
    const corrupt=await openG2nPrivateSharedTmdbRead({
      file,sourceId:'waipu',enabled:true,now:NOW+1000,
    })
    expect(corrupt.loadStatus).toBe('unavailable')
    expect(corrupt.responseCache.get(KEY)).toBeNull()
    expect(await readFile(file,'utf8')).toBe('{CORRUPT')
  })

  it('does not enable shared reads without exact private opt-in',async()=>{
    const file=storeFile(await root())
    await seeded(file)
    expect(await openG2nPrivateSharedTmdbRead({
      file,sourceId:'waipu',enabled:false,now:NOW,
    })).toBeNull()
    await expect(openG2nPrivateSharedTmdbRead({
      file,sourceId:'xmltv',enabled:true,
    })).rejects.toThrow(/Unknown/)
    await expect(openG2nPrivateSharedTmdbRead({
      file,sourceId:'waipu',enabled:true,
      originalJoynCache:new JoynLookupCache({},NOW),
    })).rejects.toThrow(/Invalid/)
  })

  it('resolves XMLTV candidates from precisely identical cached movie searches only',async()=>{
    const store=new SharedTmdbResponseStore({now:NOW})
    store.set(SHARED_TMDB_SEARCH_NAMESPACE,KEY,{results:[MOVIE]})
    const resolver=createG2nXmltvCachedResponseResolver(store)
    expect(resolver.localCandidatesFor({
      title:TITLE,productionYearEvidence:null,
    },'movie').map(x=>x.id)).toEqual([MOVIE.id])
    expect(resolver.localCandidatesFor({
      title:TITLE,productionYearEvidence:2020,
    },'movie')).toEqual([])
    expect(resolver.localCandidatesFor({
      title:TITLE,productionYearEvidence:null,
    },'series')).toEqual([])
    expect(resolver.localCandidatesFor({title:TITLE+' (HD)'},'movie')).toEqual([])
    expect(resolver.localCandidatesFor({title:' '+TITLE},'movie')).toEqual([])
    expect(resolver.counts()).toMatchObject({hits:1,misses:3,writes:0})
  })

  it('passes stored RAW response through the existing G1b/XMLTV Joyn matcher, not an approved identity',async()=>{
    const store=new SharedTmdbResponseStore({now:NOW})
    store.set(SHARED_TMDB_SEARCH_NAMESPACE,KEY,{
      results:[MOVIE],page:1,
    })
    const resolver=createG2nXmltvCachedResponseResolver(store)
    const channelId=Object.entries(XMLTV_REVIEWED_STATION_MAPPINGS.epgshare01)
      .find(([,x])=>x.stationId==='zdf')[0]
    const xml='<tv><channel id="'+channelId+'"><display-name>ZDF</display-name></channel>'+
      '<programme channel="'+channelId+'" start="20261114120000 +0000" '+
      'stop="20261114130000 +0000"><title>'+TITLE+'</title>'+
      '<category>Film</category></programme></tv>'
    const parsed=parseXmltvCandidates(xml,{
      sourceId:'epgshare01',stationMappings:XMLTV_REVIEWED_STATION_MAPPINGS,
      observedAt:new Date(NOW).toISOString(),mappedOnly:true,
    })
    expect(parsed.candidates).toHaveLength(1)
    const result=await matchXmltvLocalCandidates(parsed.candidates,{
      localCandidatesFor:resolver.localCandidatesFor,
    })
    expect(result.counts).toMatchObject({received:1,accepted:1,rejected:0})
    expect(result.confirmedEvents).toHaveLength(1)
    expect(result.confirmedEvents[0].titleRef.tmdbId).toBe(MOVIE.id)
    expect(result.confirmedEvents[0].playbackRoutes).toEqual([])
    expect(resolver.counts().writes).toBe(0)
  })

  it('preserves the exact year parameter: a different year or TV namespace must not hit',()=>{
    const store=new SharedTmdbResponseStore({now:NOW})
    store.set(SHARED_TMDB_SEARCH_NAMESPACE,YEAR_KEY,{results:[MOVIE]})
    store.set(SHARED_TMDB_SEARCH_NAMESPACE,TV_KEY,{
      results:[{id:456,name:TITLE}],
    })
    const resolver=createG2nXmltvCachedResponseResolver(store)
    expect(resolver.localCandidatesFor({
      title:TITLE,productionYearEvidence:2020,
    },'movie').map(x=>x.id)).toEqual([MOVIE.id])
    expect(resolver.localCandidatesFor({
      title:TITLE,productionYearEvidence:2019,
    },'movie')).toEqual([])
    expect(resolver.localCandidatesFor({title:TITLE},'movie')).toEqual([])
    expect(resolver.localCandidatesFor({title:TITLE},'series')
      .map(x=>x.id)).toEqual([456])
  })
})
