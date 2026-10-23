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

export const OUTPUT='artifacts/youtube-g2/curated-production-sync'
export const APPROVAL_INPUT='artifacts/youtube-g2-independent-approvals.json'
// A reviewed, versioned manifest is an optional durable source. Never ship a placeholder.
export const REVIEWED_APPROVAL_INPUT='.github/youtube-g2/independent-approvals.json'
export const VERIFIED_ENVELOPE_OUTPUT='artifacts/youtube-verified-source-envelope.json'
export const PUBLIC_SUMMARY='public/youtube-curated-source-status.json'

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
  youtubeApi,approvals=undefined,
  now=()=>new Date().toISOString(),
  output=OUTPUT,approvalInput=APPROVAL_INPUT,
  reviewedApprovalInput=REVIEWED_APPROVAL_INPUT,
  verifiedEnvelopeOutput=VERIFIED_ENVELOPE_OUTPUT,
  publicSummaryOutput=PUBLIC_SUMMARY,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_CURATED_CANONICAL_NO_PRODUCT_WRITES')
  const verifiedApprovals=approvals===undefined
    ?await loadApprovals(approvalInput,reviewedApprovalInput):approvals
  const result=await runCuratedYoutubeSourceSync({
    youtubeApi,approvals:verifiedApprovals,now,
  })
  if(!result.audit.fullyScanned
    ||result.audit.calls.search!==0||result.audit.calls.tmdb!==0
    ||result.catalogWrites!==0||result.firestoreWrites!==0||result.tmdbBadgeWrites!==0
    ||result.sourceEnvelope?.records?.length!==result.publishedVerifiedAvailabilities){
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
    approvedDEOfferRoutes:result.publishedVerifiedAvailabilities,
    playlistOverlapConflicts:result.audit.crossPlaylistConflicts,
    fullyScanned:true,
    providerBadgeAuthority:'tmdb-preserved',
    unmatchedTitleBehavior:'original-youtube-search-link',
  }
  // Data-pipeline local files, not Firestore writes or a parallel film catalog.
  await mkdir(output,{recursive:true})
  await mkdir('artifacts',{recursive:true})
  await mkdir('public',{recursive:true})
  await writeFile(output+'/qa.json',JSON.stringify({
    ...result,sourceEnvelope:undefined,
  },null,2)+'\n',{mode:0o600})
  await writeFile(verifiedEnvelopeOutput,JSON.stringify(result.sourceEnvelope)+'\n',{mode:0o600})
  await writeFile(publicSummaryOutput,JSON.stringify(status)+'\n','utf8')
  console.log(JSON.stringify({
    twoPlaylistsScanned:true,uniqueVideoIds:status.inventoryVideoIds,
    resolvedVideoDetails:status.videoDetailsResolved,
    verifiedDEOfferRoutes:status.approvedDEOfferRoutes,
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
