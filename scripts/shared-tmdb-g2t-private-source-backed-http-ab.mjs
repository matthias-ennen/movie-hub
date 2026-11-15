/**
 * G2t: two exactly shared original demand keys, verified against the full
 * existing catalog. Uses G2p's bounded private checkpoint census and G2o's
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
  'G2T_CATALOG_UNAVAILABLE','G2T_CATALOG_SELECTION_REJECTED','G2T_SAMPLE_NOT_READY','G2T_TOKEN_MISSING',
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
const readinessKeys=[
  'kind','waipuJoynExactDemandOverlap','sourceMovieKeys','sourceSeriesKeys',
  'eligibleMovieKeys','eligibleSeriesKeys','catalogTitles','eligibleSelectedWorkTypes',
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
    x.newTmdbHttpStarted===0 && x.productiveWrites===0 &&
    x.measuredProductionSavings===null && x.publishApproved===false
}
export function createG2tReadinessReport(catalog,requiredSharedKeys,now) {
  const {inputs,counts}=inspectG2oCatalogSamples(catalog,{now,requiredSharedKeys})
  const report={
    kind:'g2t-source-backed-private-readiness-counts',
    waipuJoynExactDemandOverlap:requiredSharedKeys.size,
    ...counts,eligibleSelectedWorkTypes:inputs.length,
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
  const catalog = await classified('G2T_CATALOG_READ_REJECTED',()=>readCatalog(now))
  const readiness = await classified('G2T_CATALOG_SELECTION_REJECTED',
    ()=>createG2tReadinessReport(catalog,requiredSharedKeys,now))
  console.log(JSON.stringify(readiness))
  if (readiness.eligibleSelectedWorkTypes!==2) throw new Error('G2T_SAMPLE_NOT_READY')
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
