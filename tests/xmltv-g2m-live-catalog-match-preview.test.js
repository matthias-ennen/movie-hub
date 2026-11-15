import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { FEEDS } from '../scripts/probe-xmltv-feeds.mjs'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from
  '../src/sources/xmltv/xmltvStationMappings.js'
import { runXmltvG2PrivateStaging } from '../scripts/xmltv-g2-private-staging.mjs'
import {
  createXmltvG2mVerifiedLocalResolver,
  fetchExistingMovieHubTmdbCatalog, runXmltvG2mPrivateLiveCatalogPreview,
  isSafeXmltvG2mPrivateReport,
} from '../scripts/xmltv-g2m-live-catalog-match-preview.mjs'

import { createG2wXmltvCandidateResolver, runG2wXmltvSharedCachePreview, readG2wExistingRuntimeSources } from '../scripts/xmltv-g2w-shared-cache-preview.mjs'
import { createG2nXmltvCachedResponseResolver } from '../scripts/shared-tmdb-g2n-private-response-replay.mjs'
import { SharedTmdbResponseStore, saveOptionalSharedTmdbResponses, SHARED_TMDB_RESPONSE_STORE_TTL_MS } from '../scripts/shared-tmdb-response-store.mjs'
import { SHARED_TMDB_SEARCH_NAMESPACE } from '../scripts/shared-tmdb-search-response-cache.mjs'

const NOW = Date.parse('2026-11-14T10:30:00Z')
const DAY = 86_400_000
const TITLE = 'RESTRICTED_XMLTV_ORIGINAL_PROGRAMME_NO_OUTPUT'
const dirs = []
const iso = n => new Date(n).toISOString()
const tvTime = n => iso(n).replace(/[-:T]/g,'').slice(0,14) + ' +0000'
const channel = sourceId => Object.entries(XMLTV_REVIEWED_STATION_MAPPINGS[sourceId])
  .find(([, item]) => item.stationId === 'zdf')[0]

function catalog(titles = [{
  source: 'tmdb', type: 'movie', tmdbId: 234567,
  title: TITLE, originalTitle: 'Another original title', productionYear: 2020,
}], generatedAt = iso(NOW)) {
  return {
    source: 'tmdb', generatedAt, titles,
    rowDefinitions: [{ id: 'trending', ids: [] }],
  }
}
const row = (tmdbId, title = TITLE, type = 'movie', originalTitle = null) =>
  ({ source: 'tmdb', tmdbId, type, title, originalTitle })
const resolverInput = title => ({ title })

async function fixture(daysBySource) {
  const root = await mkdtemp(join(tmpdir(), 'moviehub-xmltv-g2m-'))
  dirs.push(root)
  const privateRoot = join(root, 'private')
  const stagingReportPath = join(root, 'report.json')
  const list = FEEDS.filter(item => Object.hasOwn(daysBySource, item.id))
  const report = await runXmltvG2PrivateStaging({
    now: NOW, feedList: list, privateRoot,
    downloader: async url => {
      const source = FEEDS.find(feed => feed.url === url).id
      const stationId = channel(source)
      const lines = ['<?xml version="1.0" encoding="UTF-8"?><tv>',
        '<channel id="' + stationId + '"><display-name>ZDF</display-name></channel>']
      for (let day = 0; day < daysBySource[source]; day++) {
        lines.push('<programme channel="' + stationId +
          '" start="' + tvTime(NOW + day * DAY) +
          '" stop="' + tvTime(NOW + (day + 1) * DAY) +
          '"><title>' + TITLE + '</title>' +
          '<category>Film</category></programme>')
      }
      return { xml: lines.concat('</tv>').join('') }
    },
  })
  await writeFile(stagingReportPath, JSON.stringify(report), {
    flag: 'wx', mode: 0o600,
  })
  return { privateRoot, stagingReportPath }
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir =>
    rm(dir, { recursive: true, force: true })))
})

describe('#336 G2m: existing live MovieHub TMDB catalog as local XMLTV candidates', () => {
  it('keeps only exact unique typed identities; uses localized and original titles', () => {
    const r = createXmltvG2mVerifiedLocalResolver(catalog([
      row(20, 'Das Original', 'movie', 'The Original'),
      row(21, 'Das Original', 'series'),
      row(22, 'Einzigartiger Film', 'movie', 'One of a Kind'),
      { ...row(24, TITLE), source: 'external-curated' },
    ]), { now: NOW })
    expect(r.localCandidatesFor(resolverInput('The Original'), 'movie')
      .map(x => x.tmdbId)).toEqual([20])
    expect(r.localCandidatesFor(resolverInput('Das Original'), 'series')
      .map(x => x.tmdbId)).toEqual([21])
    expect(r.localCandidatesFor(resolverInput('einzigartiger film'), 'movie')
      .map(x => x.tmdbId)).toEqual([22])
    expect(r.localCandidatesFor(resolverInput(TITLE), 'movie')).toEqual([])
    expect(r.localCandidatesFor(resolverInput('Einzigartiger Film'), null)).toEqual([])
    expect(r.summary).toMatchObject({
      catalogTitles: 4, eligibleTitles: 3, skippedTitles: 1,
    })
    expect(JSON.stringify(r.summary)).not.toContain('The Original')
  })

  it('rejects different TMDB works sharing the same typed title instead of guessing', () => {
    const r = createXmltvG2mVerifiedLocalResolver(catalog([
      row(10,'Der gleiche Film'), row(11, 'Der gleiche Film'),
      row(12,'Der gleiche Film', 'series'),
    ]), { now: NOW })
    expect(r.localCandidatesFor(resolverInput('Der gleiche Film'),'movie')).toEqual([])
    expect(r.localCandidatesFor(resolverInput('Der gleiche Film'),'series')
      .map(x=>x.tmdbId)).toEqual([12])
    expect(r.summary.ambiguousAliases).toBe(1)
  })

  it('rejects stale, future or invalid trusted TMDB catalog input', () => {
    expect(()=>createXmltvG2mVerifiedLocalResolver(
      catalog([row(1, TITLE)], iso(NOW - 15 * DAY)),{now:NOW})).toThrow(/Stale/)
    expect(()=>createXmltvG2mVerifiedLocalResolver(
      catalog([row(1, TITLE)], iso(NOW + DAY)),{now:NOW})).toThrow(/Stale/)
    expect(()=>createXmltvG2mVerifiedLocalResolver(
      catalog([{ ...row(1, TITLE), source:'unverified' }]), {now:NOW}))
      .toThrow(/eligible/)
    expect(()=>createXmltvG2mVerifiedLocalResolver(
      { ...catalog(), source:'unknown' },{now:NOW})).toThrow()
  })

  it('fetches the exact app catalog URL once, not any TMDB API endpoint', async () => {
    const request = vi.fn(async (url, options) => {
      expect(url).toBe('https://movie-hub-62459.web.app/catalog.json')
      expect(options.method).toBe('GET')
      expect(options.redirect).toBe('error')
      return new Response(JSON.stringify(catalog()), {
        status:200, headers:{'content-type':'application/json'},
      })
    })
    const r = await fetchExistingMovieHubTmdbCatalog({
      fetchImpl:request, now:NOW,
    })
    expect(r.titles).toHaveLength(1)
    expect(request).toHaveBeenCalledOnce()
  })

  it('fails closed when live catalog is malformed, unbounded or not JSON', async () => {
    await expect(fetchExistingMovieHubTmdbCatalog({
      fetchImpl: async()=>new Response('not JSON', {
        status:200, headers:{'content-type':'text/plain'},
      }),now:NOW,
    })).rejects.toThrow(/unavailable/)
    await expect(fetchExistingMovieHubTmdbCatalog({
      fetchImpl:async()=>new Response(JSON.stringify(catalog()),{
        status:200, headers:{
          'content-type':'application/json','content-length':'999999999',
        },
      }),now:NOW,
    })).rejects.toThrow(/size cap/)
  })

  it('uses existing G2c/G2d/G2j matcher and deduplicates REAL parser-shaped XMLTV rows', async () => {
    const files = await fixture({ epgshare01: 2, freeepg: 1 })
    const result = await runXmltvG2mPrivateLiveCatalogPreview({
      catalog:catalog(),now:NOW,coordinatorOptions:files,
    })
    expect(result).toMatchObject({
      validatedXmltvSources:2,
      selectedOriginalCandidates:3, exactLocalMatches:3,
      locallyUnmatched:0, mergedAiringsWithXmltvPreview:2,
      availableIndependentFamilies:2,
      realTmdbApiRequestsMade:0, productiveWrites:0,
      publishApproved:false, tmdbIdentityApproved:false,
      playbackRoutesApproved:false,
    })
    expect(isSafeXmltvG2mPrivateReport(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(TITLE)
    expect(JSON.stringify(result)).not.toContain('sourceRef')
    expect(JSON.stringify(result)).not.toContain('Another original title')
  })

  it('leaves an ambiguous exact-title catalog item unmatched in full pipeline', async () => {
    const files = await fixture({ epgshare01: 2 })
    const result = await runXmltvG2mPrivateLiveCatalogPreview({
      catalog:catalog([row(10,TITLE),row(11,TITLE)]),now:NOW,
      coordinatorOptions:files,
    })
    expect(result).toMatchObject({
      validatedXmltvSources:1,selectedOriginalCandidates:2,
      exactLocalMatches:0,locallyUnmatched:2,mergedAiringsWithXmltvPreview:0,
      ambiguousCatalogAliases:1,realTmdbApiRequestsMade:0,
    })
  })

  it('does not let caller bypass private-source matching with a substitute resolver', async () => {
    const files = await fixture({ epgshare01: 1 })
    await expect(runXmltvG2mPrivateLiveCatalogPreview({
      catalog:catalog(),now:NOW,
      coordinatorOptions:{...files,localCandidatesFor:async()=>[
        {tmdbId:999999,type:'movie',title:TITLE},
      ]},
    })).rejects.toThrow(/Unsafe/)
    expect(isSafeXmltvG2mPrivateReport({
      kind:'xmltv-g2m-private-live-catalog-match-aggregate',
      tmdbIdentityApproved:true,
    })).toBe(false)
  })
})

const cacheKey=(title,type='movie')=>JSON.stringify([type==='movie'?'/search/movie':'/search/tv',{language:'de-DE',query:title,include_adult:'false'}])
function storeWith(title,results,type='movie',now=NOW){
  const store=new SharedTmdbResponseStore({now})
  expect(store.set(SHARED_TMDB_SEARCH_NAMESPACE,cacheKey(title,type),{results})).toBe(true)
  return store
}
const movie=(id,title=TITLE)=>({id,title,release_date:'2020-01-01'})
describe('#336 G2w: private XMLTV reads the same-run shared Waipu/Joyn cache',()=>{
  it('preserves catalog precedence and never bypasses catalog ambiguity',()=>{
    const local=createXmltvG2mVerifiedLocalResolver(catalog([row(5,TITLE),row(6,'conflict'),row(7,'conflict')]),{now:NOW})
    const cache=createG2nXmltvCachedResponseResolver(storeWith(TITLE,[movie(99)]))
    const spy=vi.spyOn({read:cache.localCandidatesFor},'read')
    const r=createG2wXmltvCandidateResolver(local,{localCandidatesFor:spy})
    expect(r.localCandidatesFor({title:TITLE},'movie').map(x=>x.tmdbId)).toEqual([5])
    expect(r.localCandidatesFor({title:'conflict'},'movie')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
    expect(r.counts()).toMatchObject({localHits:1,localConflicts:1,cacheLookups:0})
  })
  it('looks up the literal key, rejects ambiguity, type mismatch and fuzzy-only results',()=>{
    const local=createXmltvG2mVerifiedLocalResolver(catalog([row(5,'unrelated')]),{now:NOW})
    const store=storeWith(TITLE,[movie(99),movie(100)])
    store.set(SHARED_TMDB_SEARCH_NAMESPACE,cacheKey('fuzzy'),{results:[movie(4,'fuzzy other')]})
    store.set(SHARED_TMDB_SEARCH_NAMESPACE,cacheKey('series','series'),{results:[{id:8,name:'series',first_air_date:'2020-01-01'}]})
    const cache=createG2nXmltvCachedResponseResolver(store)
    const r=createG2wXmltvCandidateResolver(local,cache)
    expect(r.localCandidatesFor({title:TITLE},'movie')).toEqual([])
    expect(r.localCandidatesFor({title:TITLE.toLowerCase()},'movie')).toEqual([])
    expect(r.localCandidatesFor({title:'fuzzy'},'movie')).toEqual([])
    expect(r.localCandidatesFor({title:'series'},'movie')).toEqual([])
    expect(r.localCandidatesFor({title:'series'},'series')).toMatchObject([{tmdbId:8,type:'series'}])
    expect(r.counts()).toMatchObject({cacheLookups:5,cacheAmbiguousRows:1,cacheUniqueCandidateRows:1,cacheNoExactCandidateRows:3})
    expect(cache.counts().writes).toBe(0)
  })
  it('joins real parser-staged synthetic programmes through the existing matcher and merge, with no writes or renewed TTL',async()=>{
    const files=await fixture({epgshare01:2,freeepg:2,'iptv-epg-org':2})
    const root=dirname(files.privateRoot),privateDir=join(root,'artifacts/shared-tmdb/private')
    await mkdir(join(root,'public'),{recursive:true})
    await writeFile(join(root,'public/catalog.json'),JSON.stringify(catalog([row(55,'Unrelated')])))
    for(const providerId of ['waipu','joyn']){
      const dir=join(root,'public',providerId+'-live')
      await mkdir(dir)
      await writeFile(join(dir,'titles.json'),JSON.stringify({entries:[{type:'movie',tmdbId:55,title:'Unrelated',
        airings:[{stationId:'zdf',canonicalStationId:'zdf',startTime:iso(NOW),stopTime:iso(NOW+DAY)}]}]}))
    }
    const file=join(privateDir,'shared-tmdb-response-cache.json')
    const store=storeWith(TITLE,[movie(99)])
    expect((await saveOptionalSharedTmdbResponses(file,store)).status).toBe('saved')
    const bytes=await readFile(file)
    const result=await runG2wXmltvSharedCachePreview({root,now:NOW,coordinatorOptions:files})
    expect(result).toMatchObject({loadStatus:'loaded',restoredResponses:1,validatedSources:3,selectedCandidates:6,
      baselineMatched:0,combinedMatched:6,additionalMatched:6,combinedMergedAirings:2,
      cacheResponseHits:6,cacheUniqueCandidateRows:6,newTmdbApiRequests:0,cacheWrites:0,productiveWrites:0,publishApproved:false})
    expect(result.runtimeReadiness).toEqual({matchedRows:6,catalogReadyRows:0,missingCatalogRows:6,
      missingCatalogUniqueTitles:1,androidReadyRows:0,fireTvConfirmedRows:0,runtimeReadyRows:0,deduplicatedRuntimeAirings:0,
      runtimeOverlap:{existingSourceCount:2,combinedRuntimeAirings:1,xmltvOnlyRuntimeAirings:0,sharedRuntimeAirings:0,existingOnlyRuntimeAirings:1},
      metadataDemand:{approvedUniqueTitles:0,missingApprovedUniqueTitles:0,reusableFromCurrentSources:0,fetchNeededFromCurrentSources:0}})
    expect(JSON.stringify(result)).not.toContain(TITLE)
    expect(await readFile(file)).toEqual(bytes)
    await writeFile(file,'corrupt',{mode:0o600})
    const fallback=await runG2wXmltvSharedCachePreview({root,now:NOW,coordinatorOptions:files})
    expect(fallback).toMatchObject({loadStatus:'unavailable',baselineMatched:0,combinedMatched:0,additionalMatched:0})
    await writeFile(join(root,'public/waipu-live/titles.json'),JSON.stringify({entries:[]}))
    await expect(readG2wExistingRuntimeSources(root)).rejects.toThrow(/SOURCE_CATALOG_REJECTED/)
  })
  it('never consumes expired responses',()=>{
    const store=new SharedTmdbResponseStore({now:NOW+SHARED_TMDB_RESPONSE_STORE_TTL_MS,entries:[
      {requestKey:cacheKey(TITLE),checkedAt:iso(NOW),value:{results:[movie(99)]}},
    ]})
    const local=createXmltvG2mVerifiedLocalResolver(catalog([row(55,'Unrelated')]),{now:NOW})
    const r=createG2wXmltvCandidateResolver(local,createG2nXmltvCachedResponseResolver(store))
    expect(r.localCandidatesFor({title:TITLE},'movie')).toEqual([])
  })
  it('uses the manual full Nightly flag and never uploads raw XMLTV or shared responses',async()=>{
    const central=await readFile('.github/workflows/moviehub-nightly-pipeline.yml','utf8')
    const deploy=await readFile('.github/workflows/deploy-firebase.yml','utf8')
    expect(central).toContain("inputs.run_mode == 'full' && inputs.shared_tmdb_cache == 'private-persistent' && inputs.xmltv_private_preview == true")
    expect(deploy).toContain("inputs.xmltv_private_preview == true && steps.g2v_save.outcome == 'success'")
    expect(deploy).not.toContain('path: artifacts/xmltv-g2/private')
    expect(deploy).not.toContain('path: artifacts/shared-tmdb/private')
  })
})

