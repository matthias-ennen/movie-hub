import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import {
  runManualDataMode, selectNewThematicCandidates,
  projectManualThematicCatalog, mergeManualSearchIndex, MAX_TARGETED_NEW_TITLE_DETAILS,
} from '../scripts/run-manual-data-mode.mjs'
import { buildSeasonalDiscovery } from '../scripts/tmdb-seasonal-discovery.mjs'
import { buildSearchIndexArtifact } from '../src/search/searchIndex.js'

const now = new Date('2026-11-07T14:00:00.000Z')
const baseTitle = {
  id:'tmdb-movie-987',tmdbId:987,type:'movie',source:'tmdb',
  title:'Bekannter Film',year:2020,providerIds:['netflix'],
  providerOffers:[{id:'netflix',offerTypes:['flatrate']}],
}
const baseCatalog = {
  source:'tmdb',generatedAt:'2026-11-06T00:00:00.000Z',
  language:'de-DE',country:'DE',titles:[baseTitle],
  rowDefinitions:[{id:'trending',title:'Jetzt beliebt',ids:[baseTitle.id]}],
  providerCatalogs:{},smartFilterOptions:{},
}
const validCandidateTitle = candidate => ({
  id:`tmdb-${candidate.mediaType==='tv'?'series':'movie'}-${candidate.id}`,
  tmdbId:candidate.id,type:candidate.mediaType==='tv'?'series':'movie',
  title:`Entdeckung ${candidate.id}`,year:2026,source:'tmdb',
  providerIds:['netflix'], providerOffers:[{id:'netflix',offerTypes:['flatrate']}],
  metadataVersion:3,metadataComplete:true,cast:[],genres:['Drama'],
})
const themeMockRequest = vi.fn(async(path,params)=>{
  if(path==='/search/keyword')return {results:[{
    name:params.query,id:{halloween:1,christmas:2,easter:3,pentecost:4}[params.query],
  }]}
  const kind=path.endsWith('movie')?'movie':'tv'
  const base=Number(params.with_keywords||5)*100000+(kind==='movie'?0:50000)
  return {
    total_pages:3,
    results:Array.from({length:20},(_,i)=>({
      id:base+i+params.page*100,adult:false,vote_count:900,vote_average:8.4,
    })),
  }
})
async function fixture(run, { catalog=baseCatalog, snapshot=null }={}) {
  const dir=await mkdtemp(join(tmpdir(),'moviehub-manual-mode-'))
  const pub=join(dir,'public')
  const details=join(pub,'search-details')
  await mkdir(details,{recursive:true})
  await writeFile(join(pub,'catalog.json'),JSON.stringify(catalog))
  const index=buildSearchIndexArtifact(catalog)
  await writeFile(join(pub,'search-index.json'),JSON.stringify(index))
  const shards=[]
  for(let i=0;i<64;i++){
    const bucket=i.toString(16).padStart(2,'0')
    const entries=[]
    shards.push({bucket,path:`/search-details/${bucket}.json`,count:0})
    await writeFile(join(details,bucket+'.json'),JSON.stringify({
      kind:'search-detail-shard',version:1,bucket,entries,count:0,
      generatedAt:'2026-11-06T00:00:00.000Z',
    }))
  }
  await writeFile(join(details,'manifest.json'),JSON.stringify({
    kind:'search-detail-manifest',version:1,bucketCount:64,count:0,
    generatedAt:'2026-11-06T00:00:00.000Z',shards,
  }))
  if(snapshot)await writeFile(join(pub,'seasonal-discovery.json'),JSON.stringify(snapshot))
  try{await run({root:pub,reportPath:join(dir,'report.json'),details})}
  finally{await rm(dir,{recursive:true,force:true})}
}

describe('#728 selectable manual data modes',()=>{
  it('compact reprojects only the restored catalog and never calls any TMDB or video API',async()=>{
    const request=vi.fn(async()=>{throw Error('No external TMDB requests allowed')})
    const resolveTitle=vi.fn(async()=>{throw Error('No detail resolution allowed')})
    await fixture(async options=>{
      const report=await runManualDataMode({mode:'compact',now,request,resolveTitle,...options})
      expect(report).toMatchObject({
        mode:'compact',discoveryPages:0,keywordLookups:0,
        newCandidateDetailsAttempted:0,netNewTitles:0,
        finalCatalogTitles:1,noYoutubeOrAdapterDiscovery:true,
      })
      expect(request).not.toHaveBeenCalled()
      expect(resolveTitle).not.toHaveBeenCalled()
      expect((await JSON.parse(await readFile(join(options.root,'catalog.json'),'utf8'))).titles)
        .toEqual(baseCatalog.titles)
    })
  })

  it('targeted mode adds real provider-resolved titles without dropping existing catalog or search entries',async()=>{
    themeMockRequest.mockClear()
    const resolveTitle=vi.fn(async candidate=>validCandidateTitle(candidate))
    await fixture(async options=>{
      const report=await runManualDataMode({
        mode:'themes',now,request:themeMockRequest,resolveTitle,...options,
      })
      expect(report.mode).toBe('themes')
      expect(report.discoveryPages).toBe(30)
      expect(report.keywordLookups).toBe(4)
      expect(themeMockRequest).toHaveBeenCalledTimes(34)
      expect(resolveTitle.mock.calls.length).toBeLessThanOrEqual(MAX_TARGETED_NEW_TITLE_DETAILS)
      expect(report.newCandidateDetailsAttempted).toBeLessThanOrEqual(MAX_TARGETED_NEW_TITLE_DETAILS)
      expect(report.netNewTitles).toBeGreaterThan(0)
      const saved=JSON.parse(await readFile(join(options.root,'catalog.json'),'utf8'))
      const index=JSON.parse(await readFile(join(options.root,'search-index.json'),'utf8'))
      const manifest=JSON.parse(await readFile(join(options.details,'manifest.json'),'utf8'))
      expect(saved.titles.some(title=>title.id===baseTitle.id)).toBe(true)
      expect(index.entries.some(entry=>entry.id===baseTitle.id)).toBe(true)
      expect(saved.rowDefinitions.some(row=>row.id==='trending')).toBe(true)
      expect(saved.rowDefinitions.some(row=>row.id==='themed-christmas-movies')).toBe(true)
      expect(saved.rowDefinitions.some(row=>row.id==='themed-quality-series')).toBe(true)
      expect(index.entries.length).toBeGreaterThan(1)
      expect(manifest.count).toBe(report.netNewTitles)
      expect(manifest.shards.reduce((n,s)=>n+s.count,0)).toBe(manifest.count)
    })
  })
  it('requires a fresh source and keeps last published data unchanged if targeted discovery fails',async()=>{
    const request=vi.fn(async()=>{throw Error('TMDB unavailable')})
    await fixture(async options=>{
      await expect(runManualDataMode({
        mode:'themes',now,request,resolveTitle:validCandidateTitle,...options,
      })).rejects.toThrow('MANUAL_THEME_REFRESH_NOT_VERIFIED')
      const saved=JSON.parse(await readFile(join(options.root,'catalog.json'),'utf8'))
      expect(saved).toEqual(baseCatalog)
    })
  })
  it('rejects untrusted mode selection or a missing snapshot for previously published thematic rows',async()=>{
    await fixture(async options=>{
      await expect(runManualDataMode({mode:'typo',now,...options})).rejects.toThrow('MANUAL_DATA_MODE_INVALID')
      const published={...baseCatalog,rowDefinitions:[...baseCatalog.rowDefinitions,{
        id:'themed-christmas-movies',title:'Weihnachten',ids:[baseTitle.id],seasonId:'christmas',
      }]}
      expect(()=>projectManualThematicCatalog(published,null)).toThrow(
        'MANUAL_THEME_RESTORE_REQUIRED_FOR_PUBLISHED_ROWS')
    })
  })
  it('does not invent availability from candidate keywords or create duplicate TMDB identities',async()=>{
    const snapshot=await buildSeasonalDiscovery({request:themeMockRequest,generatedAt:now.toISOString()})
    const candidate=snapshot.strategies[0].candidates[0]
    const known=validCandidateTitle(candidate)
    const first=selectNewThematicCandidates(snapshot,[known])
    expect(first.some(c=>c.id===candidate.id&&c.mediaType===candidate.mediaType)).toBe(false)
    const duplicate=selectNewThematicCandidates(snapshot,[],0)
    expect(duplicate).toEqual([])
    expect(()=>selectNewThematicCandidates(snapshot,[],9999)).toThrow()
    const emptyProvider={...known,providerIds:[],providerOffers:[]}
    const result=projectManualThematicCatalog(
      baseCatalog,snapshot,[emptyProvider,known,known],now)
    expect(result.newTitles).toHaveLength(1)
    expect(result.rows.some(row=>row.ids.includes(emptyProvider.id))).toBe(false)
    const ix=mergeManualSearchIndex(buildSearchIndexArtifact(baseCatalog),[known],now)
    expect(ix.entries.map(x=>x.id)).toContain(baseTitle.id)
    expect(ix.entries.map(x=>x.id)).toContain(known.id)
  })
  it('wires three modes into central Nightly with default full and full production validation',()=>{
    const central=readFileSync(new URL('../.github/workflows/moviehub-nightly-pipeline.yml',import.meta.url),'utf8')
    const deploy=readFileSync(new URL('../.github/workflows/deploy-firebase.yml',import.meta.url),'utf8')
    expect(central).toContain('run_mode:')
    expect(central).toMatch(/run_mode:[\s\S]*?default: full[\s\S]*?- compact[\s\S]*?- themes/)
    expect(central).toContain("github.event_name == 'schedule' || inputs.run_mode == 'full'")
    expect(central).toContain("inputs.run_mode == 'compact' || inputs.run_mode == 'themes'")
    expect(deploy).toContain('MOVIEHUB_LIGHT_MODE:')
    expect(deploy).toContain('node scripts/run-manual-data-mode.mjs --mode=')
    expect(deploy).toContain('Restore validated live TMDB data for code deploy')
    expect(deploy).toContain('Restore published YouTube episode and film search projections for code-only deploy')
    expect(deploy).toContain('Validate prepared source generations and app data')
    expect(deploy).toContain('Verify actually published source generations and app data')
    expect(deploy).toContain('Deploy Hosting and Firestore Rules')
  })
})
