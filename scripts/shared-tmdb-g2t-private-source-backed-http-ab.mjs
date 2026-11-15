/**
 * G2t: two exactly shared original demand keys, verified against the published
 * browse catalog and broader public search index. Uses G2p's bounded private checkpoint census and G2o's
 * original clients, exact egress boundary and six-start maximum.
 * This is a source-backed narrow transport/decision test, NOT the original
 * adapters' actual matcher workload or measured production savings.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runG2pPrivateOriginalSourceCensus, safeG2pFailureCode } from './shared-tmdb-g2p-private-source-demand-census.mjs'
import {
  G2T_CONFIRMATION, G2O_MAX_HTTP_STARTS,
  inspectG2oCatalogSamples, compareG2oBoundedOriginalClients,
} from './shared-tmdb-g2o-bounded-real-http-ab.mjs'
import { fetchExistingMovieHubTmdbCatalog } from './xmltv-g2m-live-catalog-match-preview.mjs'

const SAFE_CODES=Object.freeze([
  'G2T_APPROVAL_REJECTED','G2T_SOURCE_PROOF_REJECTED','G2T_CATALOG_READ_REJECTED',
  'G2T_CATALOG_TIMEOUT','G2T_CATALOG_SIZE_REJECTED','G2T_CATALOG_CONTRACT_REJECTED',
  'G2T_CATALOG_UNAVAILABLE','G2T_SEARCH_INDEX_READ_REJECTED','G2T_SEARCH_INDEX_CONTRACT_REJECTED',
  'G2T_CATALOG_SELECTION_REJECTED','G2T_SAMPLE_NOT_READY','G2T_TOKEN_MISSING',
  'G2T_HTTP_COMPARISON_REJECTED','G2T_PARITY_REJECTED',
])
export function safeG2tFailureCode(error) {
  if (SAFE_CODES.includes(error?.message)) return error.message
  const source=safeG2pFailureCode(error)
  return source==='G2P_UNCLASSIFIED_FAILURE'?'G2T_UNCLASSIFIED_FAILURE':source
}
async function classified(code,work) {
  try { return await work() } catch (error) {
    const safe=safeG2tFailureCode(error)
    throw new Error(safe==='G2T_UNCLASSIFIED_FAILURE'?code:safe)
  }
}
export function safeG2tCatalogReadFailureCode(error) {
  if (error?.name==='TimeoutError' || error?.name==='AbortError' ||
      ['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']
        .includes(error?.cause?.code)) return 'G2T_CATALOG_TIMEOUT'
  if (error?.message==='Private TMDB catalog size cap exceeded') return 'G2T_CATALOG_SIZE_REJECTED'
  if (error?.message==='Untrusted, oversized or stale MovieHub TMDB catalog') return 'G2T_CATALOG_CONTRACT_REJECTED'
  if (error?.message==='Verified live MovieHub TMDB catalog unavailable') return 'G2T_CATALOG_UNAVAILABLE'
  if (error?.name==='SyntaxError') return 'G2T_CATALOG_CONTRACT_REJECTED'
  return 'G2T_CATALOG_READ_REJECTED'
}
async function readCatalog(now) {
  // A public read can time out independently of the source proof. One retry
  // only for a classified transient timeout; never retry bad data or bounds.
  try { return await fetchExistingMovieHubTmdbCatalog({now}) }
  catch(error) {
    const code=safeG2tCatalogReadFailureCode(error)
    if (code!=='G2T_CATALOG_TIMEOUT') throw new Error(code)
    try { return await fetchExistingMovieHubTmdbCatalog({now}) }
    catch(next) { throw new Error(safeG2tCatalogReadFailureCode(next)) }
  }
}
const SEARCH_INDEX_URL='https://movie-hub-62459.web.app/search-index.json'
const MAX_SEARCH_INDEX_BYTES=96*1024*1024
const MAX_PUBLIC_TITLES=150000
const MAX_INDEX_AGE=14*86400000
const validIndexTitle = x => x?.scope==='public' && x?.source==='tmdb' &&
  ['movie','series'].includes(x?.type) &&
  Number.isSafeInteger(x.tmdbId) && x.tmdbId>0 && x.tmdbId<100000000 &&
  x.id===`tmdb-${x.type}-${x.tmdbId}` &&
  typeof x.title==='string' && x.title.trim().length>0 && x.title.length<=400 &&
  (x.originalTitle==null || (typeof x.originalTitle==='string' && x.originalTitle.length<=400))

/** Supplement the browse projection with the already-published discovery index.
 * Identity/alias collisions still go through the original catalog resolver.
 * Nothing is published, fetched from TMDB, or inferred from a title alone.
 */
export function combineG2tPublishedTitles(catalog,index,now=Date.now()) {
  const at=Date.parse(index?.generatedAt)
  if (index?.kind!=='search-index' || index.version!==1 || index.source!=='tmdb' ||
      index.language!=='de-DE' || index.country!=='DE' ||
      !Number.isFinite(at) || at>now || now-at>MAX_INDEX_AGE ||
      !Array.isArray(index.entries) || index.entries.length===0 ||
      index.count!==index.entries.length || index.entries.length>MAX_PUBLIC_TITLES ||
      !Array.isArray(catalog?.titles) || catalog.titles.length===0 ||
      catalog.titles.length>MAX_PUBLIC_TITLES) throw new Error('G2T_SEARCH_INDEX_CONTRACT_REJECTED')
  const titleRows=[...catalog.titles]
  const seen=new Set(titleRows.map(x=>JSON.stringify([x.type,x.tmdbId,x.title,x.originalTitle??null])))
  let indexVerified=0
  for (const x of index.entries) {
    if (!validIndexTitle(x)) continue
    indexVerified++
    const k=JSON.stringify([x.type,x.tmdbId,x.title,x.originalTitle??null])
    if (seen.has(k)) continue
    seen.add(k)
    // Keep only public identity evidence, not unrelated search-index metadata.
    titleRows.push({source:'tmdb',type:x.type,tmdbId:x.tmdbId,title:x.title,
      originalTitle:x.originalTitle??null})
    if (titleRows.length>MAX_PUBLIC_TITLES) throw new Error('G2T_SEARCH_INDEX_CONTRACT_REJECTED')
  }
  if (!indexVerified) throw new Error('G2T_SEARCH_INDEX_CONTRACT_REJECTED')
  return {
    catalog:{...catalog,titles:titleRows},
    counts:{browseTitleRows:catalog.titles.length,publicSearchIndexEntries:index.entries.length,
      verifiedPublicSearchIndexEntries:indexVerified,combinedTitleRows:titleRows.length},
  }
}

export async function fetchG2tPublishedSearchIndex({fetchImpl=fetch}={}) {
  const response=await fetchImpl(SEARCH_INDEX_URL,{
    method:'GET',redirect:'error',headers:{accept:'application/json'},
    signal:AbortSignal.timeout(45_000),
  })
  if (!response?.ok || !String(response.headers?.get('content-type')||'').toLowerCase().includes('application/json')) {
    throw new Error('G2T_SEARCH_INDEX_READ_REJECTED')
  }
  const contentLength=response.headers.get('content-length')
  if (contentLength && Number(contentLength)>MAX_SEARCH_INDEX_BYTES) throw new Error('G2T_SEARCH_INDEX_CONTRACT_REJECTED')
  const reader=response.body?.getReader?.()
  if (!reader) throw new Error('G2T_SEARCH_INDEX_READ_REJECTED')
  let size=0
  const bytes=[]
  try {
    while (true) {
      const {done,value}=await reader.read()
      if (done) break
      size+=value.byteLength
      if (size>MAX_SEARCH_INDEX_BYTES) throw new Error('G2T_SEARCH_INDEX_CONTRACT_REJECTED')
      bytes.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  try { return JSON.parse(Buffer.concat(bytes,size).toString('utf8')) }
  catch { throw new Error('G2T_SEARCH_INDEX_CONTRACT_REJECTED') }
}

const readinessKeys=[
  'kind','waipuJoynExactDemandOverlap','sourceMovieKeys','sourceSeriesKeys',
  'eligibleMovieKeys','eligibleSeriesKeys','catalogTitles','eligibleSelectedWorkTypes','eligibleSelectedQueryCount',
  'newTmdbHttpStarted','productiveWrites','measuredProductionSavings','publishApproved',
]
export function isSafeG2tReadinessReport(x) {
  const count=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max
  return x && typeof x==='object' && !Array.isArray(x) &&
    Object.keys(x).sort().join('|')===[...readinessKeys].sort().join('|') &&
    x.kind==='g2t-source-backed-private-readiness-counts' &&
    count(x.waipuJoynExactDemandOverlap,45000) &&
    count(x.sourceMovieKeys,45000) && count(x.sourceSeriesKeys,45000) &&
    x.sourceMovieKeys+x.sourceSeriesKeys<=x.waipuJoynExactDemandOverlap &&
    count(x.eligibleMovieKeys,x.sourceMovieKeys) &&
    count(x.eligibleSeriesKeys,x.sourceSeriesKeys) &&
    count(x.catalogTitles,150000) &&
    x.eligibleSelectedWorkTypes===Number(x.eligibleMovieKeys>0)+Number(x.eligibleSeriesKeys>0) &&
    x.eligibleSelectedQueryCount===Math.min(2,x.eligibleMovieKeys+x.eligibleSeriesKeys) &&
    x.newTmdbHttpStarted===0 && x.productiveWrites===0 &&
    x.measuredProductionSavings===null && x.publishApproved===false
}
export function createG2tReadinessReport(catalog,requiredSharedKeys,now) {
  const {inputs,counts}=inspectG2oCatalogSamples(catalog,{now,requiredSharedKeys})
  const report={
    kind:'g2t-source-backed-private-readiness-counts',
    waipuJoynExactDemandOverlap:requiredSharedKeys.size,
    ...counts,eligibleSelectedWorkTypes:new Set(inputs.map(x=>x.type)).size,
    eligibleSelectedQueryCount:inputs.length,
    newTmdbHttpStarted:0,productiveWrites:0,
    measuredProductionSavings:null,publishApproved:false,
  }
  if (!isSafeG2tReadinessReport(report)) throw new Error('G2T_CATALOG_SELECTION_REJECTED')
  return report
}
async function main() {
  const prepare = process.env.G2T_CONFIRMATION === 'PRIVATE_G2T_SOURCE_BACKED_PREPARE_NO_TMDB'
  if (process.argv.length !== 2 ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      (!prepare && process.env.G2T_CONFIRMATION !== G2T_CONFIRMATION)) {
    throw new Error('G2T_APPROVAL_REJECTED')
  }
  const now = Date.now()
  let requiredSharedKeys = null
  const census = await classified('G2T_SOURCE_PROOF_REJECTED',()=>runG2pPrivateOriginalSourceCensus({
    now, onVerifiedWaipuJoynOverlap(keys) { requiredSharedKeys = keys },
  }))
  if (!(requiredSharedKeys instanceof Set) ||
      census.waipuJoynOverlapKeys !== requiredSharedKeys.size) {
    throw new Error('G2T_SOURCE_PROOF_REJECTED')
  }
  // Source proof is useful even if the subsequent catalog fetch/selection fails.
  console.log(JSON.stringify({
    kind:'g2t-source-proof-counts',waipuJoynExactDemandOverlap:requiredSharedKeys.size,
    waipuDistinctSearchKeys:census.waipuDistinctSearchKeys,
    joynDistinctSearchKeys:census.joynDistinctSearchKeys,
    newTmdbHttpStarted:0,
  }))
  const browse = await classified('G2T_CATALOG_READ_REJECTED',()=>readCatalog(now))
  const index = await classified('G2T_SEARCH_INDEX_READ_REJECTED',()=>fetchG2tPublishedSearchIndex())
  const {catalog,counts} = combineG2tPublishedTitles(browse,index,now)
  console.log(JSON.stringify({kind:'g2t-published-identity-coverage-counts',...counts,newTmdbHttpStarted:0}))
  const readiness = await classified('G2T_CATALOG_SELECTION_REJECTED',
    ()=>createG2tReadinessReport(catalog,requiredSharedKeys,now))
  console.log(JSON.stringify(readiness))
  if (readiness.eligibleSelectedQueryCount!==2) throw new Error('G2T_SAMPLE_NOT_READY')
  if (prepare) return
  const token = String(process.env.TMDB_API_READ_TOKEN || '').trim()
  if (!token) throw new Error('G2T_TOKEN_MISSING')
  const report = await classified('G2T_HTTP_COMPARISON_REJECTED',()=>compareG2oBoundedOriginalClients({
    catalog,now,token,fetchImpl:fetch,requiredSharedKeys,
    mode:'manual-private-real-http',
  }))
  console.log(JSON.stringify(report))
  if (report.totalTransportStarts !== G2O_MAX_HTTP_STARTS ||
      report.sharedExactResponseHits !== 2 ||
      !report.responsesIdenticalAcrossArms ||
      !report.matcherDecisionsEquivalent ||
      report.expectedCatalogTmdbIdsPresent !== 2 ||
      report.matchedBaselineDecisions === 0) {
    throw new Error('G2T_PARITY_REJECTED')
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error('G2t private source-backed A/B failed closed; category='+safeG2tFailureCode(error))
    process.exitCode=1
  })
}
