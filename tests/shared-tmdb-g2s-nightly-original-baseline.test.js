import {afterEach,describe,expect,it} from 'vitest'
import {mkdtemp,mkdir,readFile,writeFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname,join} from 'node:path'
import {
  inspectG2sOriginalNightlyTransport,isSafeG2sOriginalNightlyTransport,
  runG2sOriginalNightlyBaseline,
} from '../scripts/shared-tmdb-g2s-nightly-original-baseline.mjs'

const NOW=Date.parse('2026-11-15T05:30:00.000Z')
const at=(delta=0)=>new Date(NOW+delta).toISOString()
const HOUR=3600_000
const PRIVATE_TITLE='PRIVATE_ONLY_SHOULD_NEVER_LEAK'
const waipu=()=>({
  kind:'waipu-live-index',schemaVersion:1,status:'complete',
  generatedAt:at(-2*HOUR),releaseChannel:'production',
  counts:{broadcasts:18913},
  runtime:{
    tmdbRequests:81,tmdbSearchCacheHits:4,tmdbMetadataRequests:129,
  },
  privateTitle:PRIVATE_TITLE,
})
const joyn=()=>({
  kind:'joyn-live-index',schemaVersion:1,status:'complete',
  generatedAt:at(-HOUR),
  sourceGenerationId:'joyn-catalog:'+at(-HOUR),
  airingCount:12131,
  runtime:{
    tmdbSearchRequests:67,matchCacheHits:189,
    lookupCacheHits:457,tmdbMetadataRequests:12,
    tmdbDetailRequests:5,
  },
  privateTitle:PRIVATE_TITLE,
})
const diagnostic=()=>({
  kind:'joyn-adapter-diagnostic',schemaVersion:1,
  generatedAt:at(-HOUR),matching:{
    tmdbRequests:67,matchCacheHits:189,
    tmdbMetadataRequests:12,tmdbDetailRequests:5,
  },
  privateTitle:PRIVATE_TITLE,
})
const input=()=>({waipuIndex:waipu(),joynIndex:joyn(),
  joynDiagnostic:diagnostic(),now:NOW})
const dirs=[]
async function privateRoot(){
  const root=await mkdtemp(join(tmpdir(),'moviehub-g2s-fixture-'))
  dirs.push(root)
  return root
}
async function put(root,name,value){
  const path=join(root,name)
  await mkdir(dirname(path),{recursive:true})
  await writeFile(path,JSON.stringify(value)+'\n','utf8')
  return path
}
afterEach(async()=>{
  await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))
})

describe('#336 G2s real original Nightly search transport baseline – count-only',()=>{
  it('projects actual original client counters, not hypothetical overlap or app-wide TMDB traffic',()=>{
    const x=inspectG2sOriginalNightlyTransport(input())
    expect(x).toMatchObject({
      kind:'g2s-original-nightly-tmdb-search-transport-baseline',
      schemaVersion:1,mode:'read-only-original-clients-no-shared-cache',
      observedUtcDate:'2026-11-15',sourcePairVerified:true,
      waipuSourceAgeMinutes:120,joynSourceAgeMinutes:60,
      sourceClockSkewMinutes:60,
      waipuSearchTransportStarts:81,joynSearchTransportStarts:67,
      combinedAdapterSearchTransportStarts:148,
      waipuSearchCacheHits:4,
      joynMatchCacheHits:189,joynLookupCacheHits:457,
      waipuTmdbMetadataTransportStarts:129,
      joynTmdbMetadataTransportStarts:12,
      joynTmdbDetailTransportStarts:5,
      originalAdapterSearchCountersVerified:true,
      wholeMovieHubTmdbTrafficIncluded:false,
      newTmdbHttpStartedByObserver:0,
      matcherDecisionsChanged:false,sharedResponseCacheWrites:0,
      productiveSourceWrites:0,measuredProductionSavings:null,
      sharedTmdbReadEnabledByObserver:false,
      publishApproved:false,playbackRoutesApproved:false,
    })
    expect(isSafeG2sOriginalNightlyTransport(x)).toBe(true)
    const out=JSON.stringify(x)
    for(const term of [PRIVATE_TITLE,'tmdbId','token','Authorization',
      'requestKey','sourceGenerationId']){
      expect(out).not.toContain(term)
    }
  })

  it('requires both newly generated COMPLETE original indexes and same Joyn diagnostic',()=>{
    const mutations=[
      x=>{x.waipuIndex.status='partial'},
      x=>{x.waipuIndex.releaseChannel='test'},
      x=>{x.waipuIndex.kind='fake'},
      x=>{x.joynIndex.status='failed'},
      x=>{x.joynIndex.sourceGenerationId='joyn-catalog:old'},
      x=>{x.joynDiagnostic.generatedAt=at(-2*HOUR)},
      x=>{x.joynDiagnostic.kind='fake'},
      x=>{x.joynDiagnostic.schemaVersion=2},
    ]
    for(const mutate of mutations){
      const x=input();mutate(x)
      expect(()=>inspectG2sOriginalNightlyTransport(x)).toThrow('G2S_SOURCE_PROVENANCE_REJECTED')
    }
  })

  it('does not compare restored, future, stale or unrelated source generations',()=>{
    const mutations=[
      x=>{x.waipuIndex.generatedAt=at(-19*HOUR)},
      x=>{x.waipuIndex.generatedAt=at(HOUR)},
      x=>{x.waipuIndex.generatedAt='not-a-date'},
      x=>{x.waipuIndex.generatedAt=at(-17*HOUR);x.joynIndex.generatedAt=at(-HOUR);
        x.joynIndex.sourceGenerationId='joyn-catalog:'+at(-HOUR)},
      x=>{x.joynIndex.airingCount=0},
      x=>{x.waipuIndex.counts.broadcasts=0},
    ]
    for(const mutate of mutations){
      const x=input();mutate(x)
      expect(()=>inspectG2sOriginalNightlyTransport(x)).toThrow('G2S_SOURCE_FRESHNESS_REJECTED')
    }
  })

  it('fails closed on missing or contradictory true original transport measurements',()=>{
    const mutations=[
      x=>{delete x.waipuIndex.runtime.tmdbRequests},
      x=>{x.waipuIndex.runtime.tmdbRequests=-1},
      x=>{x.waipuIndex.runtime.tmdbSearchCacheHits=1.4},
      x=>{x.joynIndex.runtime.tmdbSearchRequests='67'},
      x=>{x.joynIndex.runtime.tmdbSearchRequests=100001},
      x=>{x.joynIndex.runtime.lookupCacheHits=-1},
      x=>{x.joynDiagnostic.matching.tmdbRequests=68},
      x=>{x.joynDiagnostic.matching.tmdbDetailRequests=6},
      x=>{x.joynDiagnostic.matching.matchCacheHits=188},
    ]
    for(const mutate of mutations){
      const x=input();mutate(x)
      expect(()=>inspectG2sOriginalNightlyTransport(x)).toThrow('G2S_ORIGINAL_TRANSPORT_COUNTERS_REJECTED')
    }
  })

  it('accepts a true zero-query run without inventing a saving',()=>{
    const x=input()
    x.waipuIndex.runtime.tmdbRequests=0
    x.joynIndex.runtime.tmdbSearchRequests=0
    x.joynDiagnostic.matching.tmdbRequests=0
    const out=inspectG2sOriginalNightlyTransport(x)
    expect(out.combinedAdapterSearchTransportStarts).toBe(0)
    expect(out.measuredProductionSavings).toBeNull()
    expect(isSafeG2sOriginalNightlyTransport(out)).toBe(true)
  })

  it('loads only three local fixed source files and returns only a safe aggregate',async()=>{
    const root=await privateRoot()
    const x=input()
    const files=[
      'public/waipu-live/index.json','public/joyn-live/index.json',
      'artifacts/joyn-adapter/diagnostic.json',
    ]
    for(const [i,v] of [x.waipuIndex,x.joynIndex,x.joynDiagnostic].entries()){
      await put(root,files[i],v)
    }
    const before=await Promise.all(files.map(n=>readFile(join(root,n),'utf8')))
    const out=await runG2sOriginalNightlyBaseline({root,now:NOW})
    const after=await Promise.all(files.map(n=>readFile(join(root,n),'utf8')))
    expect(after).toEqual(before)
    expect(out.combinedAdapterSearchTransportStarts).toBe(148)
    expect(JSON.stringify(out)).not.toContain(PRIVATE_TITLE)
    const corrupt=join(root,files[0])
    await rm(corrupt)
    await symlink(join(root,files[1]),corrupt)
    await expect(runG2sOriginalNightlyBaseline({root,now:NOW})).rejects
      .toThrow('G2S_PRIVATE_SOURCE_FILE_REJECTED')
  })

  it('rejects tampered count-only public reports and unreviewed approvals',()=>{
    const report=inspectG2sOriginalNightlyTransport(input())
    const invalid=[
      {...report,privateTitle:PRIVATE_TITLE},
      {...report,observedUtcDate:'tomorrow'},
      {...report,sourcePairVerified:false},
      {...report,combinedAdapterSearchTransportStarts:147},
      {...report,newTmdbHttpStartedByObserver:1},
      {...report,measuredProductionSavings:4},
      {...report,matcherDecisionsChanged:true},
      {...report,sharedResponseCacheWrites:1},
      {...report,sharedTmdbReadEnabledByObserver:true},
      {...report,wholeMovieHubTmdbTrafficIncluded:true},
      {...report,publishApproved:true},
    ]
    for(const row of invalid){
      expect(isSafeG2sOriginalNightlyTransport(row)).toBe(false)
    }
  })
})
