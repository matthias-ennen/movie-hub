/**
 * One production data-pipeline read of BOTH user-selected YouTube playlists.
 * Uses existing Secret Manager YouTube key, never YouTube search.list.
 * It produces source provenance, candidate QA and the independently-verified
 * canonical YouTube SourceEnvelope consumed by the already built route index.
 *
 * Independent approved offers are optional; missing approval means ZERO
 * direct offers, while the old TMDB YouTube badge/search link stays intact.
 */
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet} from './youtube-api-smoke.mjs'
import {runCuratedYoutubeSourceSync} from './youtube-g2-curated-source-sync.mjs'
import {buildYoutubeSourceEnvelope} from '../src/sources/adapters/youtubeContractMapper.js'
import {collectVerifiedTmdbFirstYoutubeAvailabilities} from './youtube-g2-tmdb-first-approved-source.mjs'

export const OUTPUT='artifacts/youtube-g2/curated-production-sync'
export const APPROVAL_INPUT='artifacts/youtube-g2-independent-approvals.json'
// A reviewed, versioned manifest is an optional durable source. Never ship a placeholder.
export const REVIEWED_APPROVAL_INPUT='.github/youtube-g2/independent-approvals.json'
export const VERIFIED_ENVELOPE_OUTPUT='artifacts/youtube-verified-source-envelope.json'
// Optional separately reviewed TMDB-first approvals; no placeholder is shipped.
export const TMDB_FIRST_APPROVAL_INPUT='.github/youtube-g2/tmdb-first-independent-approvals.json'
export const PUBLIC_SUMMARY='public/youtube-curated-source-status.json'

// This is a hard, per-Firebase-deploy API envelope, shared by BOTH approved
// source paths. It is not a reservation of Google's project-wide daily quota.
// The curated reader has 1 playlists + 10 playlistItems + 10 videos calls;
// at most 500 independently reviewed TMDB-first rows add 10 videos batches.
// No YouTube search.list or other endpoints are permitted by production.
export const YOUTUBE_DEPLOY_API_LIMITS=Object.freeze({
  playlists:1,playlistItems:10,videos:20,total:31,
})
export function createBudgetedYoutubeDeployApi(youtubeApi){
  if(typeof youtubeApi!=='function')
    throw Error('YOUTUBE_DEPLOY_API_CALLBACK_REQUIRED')
  const calls={playlists:0,playlistItems:0,videos:0}
  const snapshot=()=>({
    ...calls,total:calls.playlists+calls.playlistItems+calls.videos,
  })
  const api=async(endpoint,params)=>{
    if(!Object.hasOwn(calls,endpoint))
      throw Error('YOUTUBE_DEPLOY_ENDPOINT_NOT_ALLOWED')
    const current=snapshot()
    if(current[endpoint]>=YOUTUBE_DEPLOY_API_LIMITS[endpoint]
      ||current.total>=YOUTUBE_DEPLOY_API_LIMITS.total)
      throw Error('YOUTUBE_DEPLOY_SHARED_API_BUDGET_EXCEEDED')
    // Reserve BEFORE the attempted request; failures must never be refunded
    // and no transport-level retry is performed by this wrapper.
    calls[endpoint]++
    return youtubeApi(endpoint,params)
  }
  return {api,snapshot}
}

async function readApprovalFile(path){
  try {return {present:true,body:JSON.parse(await readFile(path,'utf8'))}}
  catch(error){if(error?.code==='ENOENT')return {present:false,body:null};throw error}
}
/** Both runtime artifacts and reviewed GitHub manifests are supported; never
 * let one silently override the other. Missing files mean no approvals.
 */
export async function loadApprovals(input=APPROVAL_INPUT,reviewedInput=REVIEWED_APPROVAL_INPUT){
  if(input===reviewedInput)throw Error('YOUTUBE_APPROVAL_SOURCES_NOT_DISTINCT')
  const [runtime,reviewed]=await Promise.all([
    readApprovalFile(input),readApprovalFile(reviewedInput),
  ])
  if(runtime.present&&reviewed.present)throw Error('YOUTUBE_APPROVAL_SOURCES_AMBIGUOUS')
  return runtime.present?runtime.body:reviewed.body
}
export async function runProductionCuratedSync({
  youtubeApi,approvals=undefined,tmdbFirstApprovals=undefined,
  now=()=>new Date().toISOString(),
  output=OUTPUT,approvalInput=APPROVAL_INPUT,
  reviewedApprovalInput=REVIEWED_APPROVAL_INPUT,
  tmdbFirstApprovalInput=TMDB_FIRST_APPROVAL_INPUT,
  verifiedEnvelopeOutput=VERIFIED_ENVELOPE_OUTPUT,
  publicSummaryOutput=PUBLIC_SUMMARY,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_CURATED_CANONICAL_NO_PRODUCT_WRITES')
  const budget=createBudgetedYoutubeDeployApi(youtubeApi)
  const verifiedApprovals=approvals===undefined
    ?await loadApprovals(approvalInput,reviewedApprovalInput):approvals
  const result=await runCuratedYoutubeSourceSync({
    youtubeApi:budget.api,approvals:verifiedApprovals,now,
  })
  const tmdbFirstBundle=tmdbFirstApprovals===undefined
    ?(await readApprovalFile(tmdbFirstApprovalInput)).body:tmdbFirstApprovals
  const tmdbFirst=await collectVerifiedTmdbFirstYoutubeAvailabilities({
    youtubeApi:budget.api,approvals:tmdbFirstBundle,now:result.audit.observedAt,
  })
  // Both adapter directions publish through ONE existing YouTube SourceEnvelope.
  // No approved TMDB-first bundle means no extra API request or route.
  const combinedEnvelope=tmdbFirst.verifiedAvailabilities.length
    ?buildYoutubeSourceEnvelope([
      ...result.sourceEnvelope.records,...tmdbFirst.verifiedAvailabilities,
    ],{
      generatedAt:result.sourceEnvelope.generatedAt,
      fetchedAt:result.audit.observedAt,
      sourceGenerationId:result.sourceEnvelope.sourceGenerationId,
      sourceCoverage:{...result.sourceEnvelope.sourceCoverage,
        tmdbFirstApprovedInputRows:tmdbFirst.approvedInputRows,
        tmdbFirstCurrentVerifiedVideos:tmdbFirst.verifiedAvailabilities.length},
    }):result.sourceEnvelope
  const apiUsage=budget.snapshot()
  if(apiUsage.playlists!==result.audit.calls.playlists
    ||apiUsage.playlistItems!==result.audit.calls.playlistItems
    ||apiUsage.videos!==result.audit.calls.videos+tmdbFirst.videoLookupCalls
    ||apiUsage.total!==apiUsage.playlists+apiUsage.playlistItems+apiUsage.videos)
    throw Error('YOUTUBE_DEPLOY_SHARED_API_USAGE_MISMATCH')
  if(!result.audit.fullyScanned
    ||result.audit.calls.search!==0||result.audit.calls.tmdb!==0
    ||result.catalogWrites!==0||result.firestoreWrites!==0||result.tmdbBadgeWrites!==0
    ||result.sourceEnvelope?.records?.length!==result.publishedVerifiedAvailabilities
    ||combinedEnvelope.records.length!==(result.publishedVerifiedAvailabilities
      +tmdbFirst.verifiedAvailabilities.length)
    ||tmdbFirst.youtubeSearchCalls!==0||tmdbFirst.firestoreWrites!==0
    ||tmdbFirst.badgeWrites!==0){
    throw Error('YOUTUBE_CURATED_PUBLISH_RECONCILIATION_FAILED')
  }
  const status={
    kind:'moviehub-youtube-curated-source-status',
    generatedAt:result.observedAt,
    sourceId:'youtube',
    sourcePlaylistCount:2,
    playlistIds:result.audit.playlistSummaries.map(s=>s.playlistId),
    inventoryVideoIds:result.inventoryVideoIds,
    videoDetailsResolved:result.audit.candidates.filter(c=>Boolean(c.videoTitle)).length,
    reviewOnlyCandidates:result.reviewOnlyCandidates,
    approvedDEOfferRoutes:combinedEnvelope.records.length,
    tmdbFirstApprovedInputRows:tmdbFirst.approvedInputRows,
    tmdbFirstVerifiedVideoRoutes:tmdbFirst.verifiedAvailabilities.length,
    tmdbFirstBlockedVideoRoutes:tmdbFirst.blocked.length,
    playlistOverlapConflicts:result.audit.crossPlaylistConflicts,
    fullyScanned:true,
    providerBadgeAuthority:'tmdb-preserved',
    unmatchedTitleBehavior:'original-youtube-search-link',
    apiUsage,apiLimits:YOUTUBE_DEPLOY_API_LIMITS,
  }
  // Data-pipeline local files, not Firestore writes or a parallel film catalog.
  await mkdir(output,{recursive:true})
  await mkdir('artifacts',{recursive:true})
  await mkdir('public',{recursive:true})
  await writeFile(output+'/qa.json',JSON.stringify({
    ...result,tmdbFirst:{...tmdbFirst,verifiedAvailabilities:undefined},
    sourceEnvelope:undefined,
  },null,2)+'\n',{mode:0o600})
  await writeFile(verifiedEnvelopeOutput,JSON.stringify(combinedEnvelope)+'\n',{mode:0o600})
  await writeFile(publicSummaryOutput,JSON.stringify(status)+'\n','utf8')
  console.log(JSON.stringify({
    twoPlaylistsScanned:true,uniqueVideoIds:status.inventoryVideoIds,
    resolvedVideoDetails:status.videoDetailsResolved,
    verifiedDEOfferRoutes:status.approvedDEOfferRoutes,
    tmdbFirstVerifiedVideoRoutes:status.tmdbFirstVerifiedVideoRoutes,
    tmdbFirstVideoLookups:tmdbFirst.videoLookupCalls,
    youtubeApiUsage:apiUsage,youtubeApiLimits:YOUTUBE_DEPLOY_API_LIMITS,
    searchLinkFallbackPreserved:true,
    youtubeSearchApiCalls:0,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,
  }))
  return status
}
async function main(){
  const key=getSecret()
  await runProductionCuratedSync({
    youtubeApi:(endpoint,params)=>youtubeGet(endpoint,params,key),
  })
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    console.error('Live curated YouTube sync failed closed: '+error.message)
    process.exitCode=1
  })
}
