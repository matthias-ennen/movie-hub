/**
 * G2t: two exactly shared original demand keys, verified against the full
 * existing catalog. Uses G2p's bounded private checkpoint census and G2o's
 * original clients, exact egress boundary and six-start maximum.
 * This is a source-backed narrow transport/decision test, NOT the original
 * adapters' actual matcher workload or measured production savings.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runG2pPrivateOriginalSourceCensus } from './shared-tmdb-g2p-private-source-demand-census.mjs'
import {
  G2T_CONFIRMATION, G2O_MAX_HTTP_STARTS,
  selectG2oCatalogSamples, compareG2oBoundedOriginalClients,
} from './shared-tmdb-g2o-bounded-real-http-ab.mjs'
import { fetchExistingMovieHubTmdbCatalog } from './xmltv-g2m-live-catalog-match-preview.mjs'

async function main() {
  const prepare = process.env.G2T_CONFIRMATION === 'PRIVATE_G2T_SOURCE_BACKED_PREPARE_NO_TMDB'
  if (process.argv.length !== 2 ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      (!prepare && process.env.G2T_CONFIRMATION !== G2T_CONFIRMATION)) {
    throw new TypeError('G2t requires separate manual approval')
  }
  const now = Date.now()
  let requiredSharedKeys = null
  const census = await runG2pPrivateOriginalSourceCensus({
    now, onVerifiedWaipuJoynOverlap(keys) { requiredSharedKeys = keys },
  })
  if (!(requiredSharedKeys instanceof Set) ||
      census.waipuJoynOverlapKeys !== requiredSharedKeys.size) {
    throw new TypeError('G2t source proof not available')
  }
  const catalog = await fetchExistingMovieHubTmdbCatalog({now})
  // No year/type/language approximation. Never substitute unrelated titles.
  const inputs = selectG2oCatalogSamples(catalog,{now,requiredSharedKeys})
  console.log(JSON.stringify({
    kind:'g2t-source-backed-private-readiness-counts',
    waipuJoynExactDemandOverlap:requiredSharedKeys.size,
    eligibleSelectedWorkTypes:inputs.length,
    newTmdbHttpStarted:0,productiveWrites:0,
    measuredProductionSavings:null,publishApproved:false,
  }))
  if (prepare) return
  const token = String(process.env.TMDB_API_READ_TOKEN || '').trim()
  if (!token) throw new TypeError('G2t TMDB token missing')
  const report = await compareG2oBoundedOriginalClients({
    catalog,now,token,fetchImpl:fetch,requiredSharedKeys,
    mode:'manual-private-real-http',
  })
  console.log(JSON.stringify(report))
  if (report.totalTransportStarts !== G2O_MAX_HTTP_STARTS ||
      report.sharedExactResponseHits !== 2 ||
      !report.responsesIdenticalAcrossArms ||
      !report.matcherDecisionsEquivalent ||
      report.expectedCatalogTmdbIdsPresent !== 2 ||
      report.matchedBaselineDecisions === 0) {
    throw new TypeError('G2t bounded source-backed parity gates failed')
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error('G2t private source-backed A/B failed closed; no private inputs emitted')
    process.exitCode=1
  })
}
