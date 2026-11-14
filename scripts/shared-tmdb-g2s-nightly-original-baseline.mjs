/**
 * #336 G2s – observe existing ORIGINAL adapter search transport, not a
 * hypothetical /search overlap or a new/shared cache experiment.
 *
 * Only reads the fresh, locally completed Waipu/Joyn index plus the existing
 * Joyn diagnostic in the same private Nightly runner. No source API / TMDB
 * HTTP, no source titles or raw request keys in the result, no adapter writes.
 *
 * The counters come from each ORIGINAL search client's requestsStarted:
 * they are NOT total MovieHub TMDB traffic, do NOT include TMDB metadata and
 * DO NOT prove shared-cache savings. Future runs may compare these baseline
 * counts only with equivalent source generations and enabled cache telemetry.
 */
import { lstat, readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)))
const MAX_SOURCE_BYTES=8*1024*1024
const MAX_SOURCE_AGE_MS=18*60*60*1000
const MAX_SKEW_MS=12*60*60*1000
const MAX_REQUESTS=100_000
const MAX_CACHE_HITS=1_000_000
const FIELDS=[
  'kind','schemaVersion','mode','observedUtcDate','sourcePairVerified',
  'waipuSourceAgeMinutes','joynSourceAgeMinutes','sourceClockSkewMinutes',
  'waipuSearchTransportStarts','joynSearchTransportStarts',
  'combinedAdapterSearchTransportStarts',
  'waipuSearchCacheHits','joynMatchCacheHits','joynLookupCacheHits',
  'waipuTmdbMetadataTransportStarts','joynTmdbMetadataTransportStarts',
  'joynTmdbDetailTransportStarts',
  'originalAdapterSearchCountersVerified','wholeMovieHubTmdbTrafficIncluded',
  'newTmdbHttpStartedByObserver','matcherDecisionsChanged',
  'sharedResponseCacheWrites','productiveSourceWrites',
  'measuredProductionSavings','sharedTmdbReadEnabledByObserver',
  'publishApproved','playbackRoutesApproved',
]
const isObject=x=>x!==null && typeof x==='object' && !Array.isArray(x)
const count=(x,max=MAX_REQUESTS)=>Number.isSafeInteger(x)&&x>=0&&x<=max
const exactKeys=(x,keys)=>isObject(x) &&
  Object.keys(x).sort().join('|')===[...keys].sort().join('|')
const timestamp=x=>{
  if(typeof x!=='string'||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x))return null
  const n=Date.parse(x)
  return Number.isFinite(n)&&new Date(n).toISOString()===x?n:null
}

/**
 * Pure testable read-only projection. Reject restored/stale/shadow inputs.
 * Joyn's independent diagnostic must agree with the atomically published
 * Joyn index for the SAME completed source generation.
 */
export function inspectG2sOriginalNightlyTransport({
  waipuIndex,joynIndex,joynDiagnostic,now=Date.now(),
}={}){
  if(!Number.isFinite(now)||!Number.isFinite(new Date(now).getTime())||
    waipuIndex?.kind!=='waipu-live-index'||
    waipuIndex?.status!=='complete'||
    waipuIndex?.releaseChannel!=='production'||
    joynIndex?.kind!=='joyn-live-index'||
    joynIndex?.status!=='complete'||
    joynDiagnostic?.kind!=='joyn-adapter-diagnostic'||
    joynDiagnostic?.schemaVersion!==1||
    joynDiagnostic.generatedAt!==joynIndex.generatedAt||
    joynIndex.sourceGenerationId!=='joyn-catalog:'+joynIndex.generatedAt){
    throw new TypeError('G2S_SOURCE_PROVENANCE_REJECTED')
  }
  const w=timestamp(waipuIndex.generatedAt)
  const j=timestamp(joynIndex.generatedAt)
  if(w===null||j===null||w>now||j>now||
    now-w>MAX_SOURCE_AGE_MS||now-j>MAX_SOURCE_AGE_MS||
    Math.abs(w-j)>MAX_SKEW_MS||
    !count(waipuIndex.counts?.broadcasts,1_000_000)||
    waipuIndex.counts.broadcasts<1||
    !count(joynIndex.airingCount,1_000_000)||
    joynIndex.airingCount<1){
    throw new TypeError('G2S_SOURCE_FRESHNESS_REJECTED')
  }
  const waipu=waipuIndex.runtime
  const joyn=joynIndex.runtime
  const matching=joynDiagnostic.matching
  if(!isObject(waipu)||!isObject(joyn)||!isObject(matching)||
    !count(waipu.tmdbRequests)||
    !count(waipu.tmdbSearchCacheHits,MAX_CACHE_HITS)||
    !count(waipu.tmdbMetadataRequests)||
    !count(joyn.tmdbSearchRequests)||
    !count(joyn.matchCacheHits,MAX_CACHE_HITS)||
    !count(joyn.lookupCacheHits,MAX_CACHE_HITS)||
    !count(joyn.tmdbMetadataRequests)||
    !count(joyn.tmdbDetailRequests)||
    !count(matching.tmdbRequests)||
    !count(matching.tmdbMetadataRequests)||
    !count(matching.tmdbDetailRequests)||
    !count(matching.matchCacheHits,MAX_CACHE_HITS)||
    matching.tmdbRequests!==joyn.tmdbSearchRequests||
    matching.tmdbMetadataRequests!==joyn.tmdbMetadataRequests||
    matching.tmdbDetailRequests!==joyn.tmdbDetailRequests||
    matching.matchCacheHits!==joyn.matchCacheHits||
    waipu.tmdbRequests+joyn.tmdbSearchRequests>2*MAX_REQUESTS){
    throw new TypeError('G2S_ORIGINAL_TRANSPORT_COUNTERS_REJECTED')
  }
  const report={
    kind:'g2s-original-nightly-tmdb-search-transport-baseline',
    schemaVersion:1,
    mode:'read-only-original-clients-no-shared-cache',
    observedUtcDate:new Date(now).toISOString().slice(0,10),
    sourcePairVerified:true,
    waipuSourceAgeMinutes:Math.floor((now-w)/60_000),
    joynSourceAgeMinutes:Math.floor((now-j)/60_000),
    sourceClockSkewMinutes:Math.floor(Math.abs(w-j)/60_000),
    waipuSearchTransportStarts:waipu.tmdbRequests,
    joynSearchTransportStarts:joyn.tmdbSearchRequests,
    combinedAdapterSearchTransportStarts:
      waipu.tmdbRequests+joyn.tmdbSearchRequests,
    waipuSearchCacheHits:waipu.tmdbSearchCacheHits,
    joynMatchCacheHits:joyn.matchCacheHits,
    joynLookupCacheHits:joyn.lookupCacheHits,
    waipuTmdbMetadataTransportStarts:waipu.tmdbMetadataRequests,
    joynTmdbMetadataTransportStarts:joyn.tmdbMetadataRequests,
    joynTmdbDetailTransportStarts:joyn.tmdbDetailRequests,
    originalAdapterSearchCountersVerified:true,
    wholeMovieHubTmdbTrafficIncluded:false,
    newTmdbHttpStartedByObserver:0,
    matcherDecisionsChanged:false,
    sharedResponseCacheWrites:0,
    productiveSourceWrites:0,
    measuredProductionSavings:null,
    sharedTmdbReadEnabledByObserver:false,
    publishApproved:false,
    playbackRoutesApproved:false,
  }
  if(!isSafeG2sOriginalNightlyTransport(report)){
    throw new TypeError('G2S_AGGREGATE_REJECTED')
  }
  return report
}

/** Strict allowlist: only bounded count/boolean output, no raw source text. */
export function isSafeG2sOriginalNightlyTransport(x){
  return exactKeys(x,FIELDS)&&
    x.kind==='g2s-original-nightly-tmdb-search-transport-baseline'&&
    x.schemaVersion===1&&
    x.mode==='read-only-original-clients-no-shared-cache'&&
    typeof x.observedUtcDate==='string'&&
    /^\d{4}-\d\d-\d\d$/.test(x.observedUtcDate)&&
    x.sourcePairVerified===true&&
    count(x.waipuSourceAgeMinutes,18*60)&&
    count(x.joynSourceAgeMinutes,18*60)&&
    count(x.sourceClockSkewMinutes,12*60)&&
    count(x.waipuSearchTransportStarts)&&
    count(x.joynSearchTransportStarts)&&
    count(x.combinedAdapterSearchTransportStarts,2*MAX_REQUESTS)&&
    x.combinedAdapterSearchTransportStarts===
      x.waipuSearchTransportStarts+x.joynSearchTransportStarts&&
    count(x.waipuSearchCacheHits,MAX_CACHE_HITS)&&
    count(x.joynMatchCacheHits,MAX_CACHE_HITS)&&
    count(x.joynLookupCacheHits,MAX_CACHE_HITS)&&
    count(x.waipuTmdbMetadataTransportStarts)&&
    count(x.joynTmdbMetadataTransportStarts)&&
    count(x.joynTmdbDetailTransportStarts)&&
    x.originalAdapterSearchCountersVerified===true&&
    x.wholeMovieHubTmdbTrafficIncluded===false&&
    x.newTmdbHttpStartedByObserver===0&&
    x.matcherDecisionsChanged===false&&
    x.sharedResponseCacheWrites===0&&
    x.productiveSourceWrites===0&&
    x.measuredProductionSavings===null&&
    x.sharedTmdbReadEnabledByObserver===false&&
    x.publishApproved===false&&x.playbackRoutesApproved===false&&
    JSON.stringify(x).length<1300
}

async function boundedJson(path) {
  const stats=await lstat(path)
  if(!stats.isFile()||stats.isSymbolicLink()||
    stats.size<1||stats.size>MAX_SOURCE_BYTES){
    throw new TypeError('G2S_PRIVATE_SOURCE_FILE_REJECTED')
  }
  return JSON.parse(await readFile(path,'utf8'))
}

/** Fixed paths only, no arbitrary input path or private source emission. */
export async function runG2sOriginalNightlyBaseline({
  root=ROOT,now=Date.now(),
}={}){
  if(typeof root!=='string'||!root.trim()){
    throw new TypeError('G2S_CONTEXT_REJECTED')
  }
  const [waipuIndex,joynIndex,joynDiagnostic]=await Promise.all([
    boundedJson(join(root,'public/waipu-live/index.json')),
    boundedJson(join(root,'public/joyn-live/index.json')),
    boundedJson(join(root,'artifacts/joyn-adapter/diagnostic.json')),
  ])
  return inspectG2sOriginalNightlyTransport({
    waipuIndex,joynIndex,joynDiagnostic,now,
  })
}

async function main(){
  if(process.argv.length!==2 ||
     !['schedule','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)||
     process.env.GITHUB_REF!=='refs/heads/main'||
     process.env.G2S_ORIGINAL_BASELINE_READONLY!=='1'||
     process.env.MOVIEHUB_SHARED_TMDB_CAPTURE){
    throw new TypeError('G2S_ONLY_ORIGINAL_MAIN_NIGHTLY_ALLOWED')
  }
  const result=await runG2sOriginalNightlyBaseline()
  // One count-only artifact per ephemeral workflow runner. No append,
  // no overwrite, no raw source/cache or credential bytes.
  const output=join(ROOT,'artifacts/shared-tmdb/g2s-nightly-baseline/aggregate.json')
  await mkdir(dirname(output),{recursive:true,mode:0o700})
  await writeFile(output,JSON.stringify(result)+'\n',{mode:0o600,flag:'wx'})
  process.stdout.write(JSON.stringify(result)+'\n')
}
if(process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(()=>{
    console.error('G2S read-only original nightly baseline rejected; private sources not logged')
    process.exitCode=1
  })
}
