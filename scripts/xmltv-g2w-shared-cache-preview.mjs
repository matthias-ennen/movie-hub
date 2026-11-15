/**
 * #336 G2w: first real adapter integration boundary for the third shared
 * TMDB search-response consumer. This is a private read-only Nightly preview,
 * not publication or an identity-index enablement. No extra TMDB HTTP starts.
 */
import { lstat, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createXmltvG2mVerifiedLocalResolver } from './xmltv-g2m-live-catalog-match-preview.mjs'
import { createG2nXmltvCachedResponseResolver } from './shared-tmdb-g2n-private-response-replay.mjs'
import { loadOptionalSharedTmdbResponses } from './shared-tmdb-response-store.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { normalizeTmdbMatchCandidate } from './waipu-tmdb-matcher.mjs'
import { runXmltvG2lPrivateAdapterCoordinator, isSafeXmltvG2lPrivateAdapterReport } from './xmltv-g2l-private-adapter-coordinator.mjs'

import { isSafePrivateXmltvRuntimeReadiness } from './xmltv-g3-private-runtime-readiness.mjs'

const ROOT = resolve(fileURLToPath(new URL('..',import.meta.url)))
const SNAPSHOT = 'artifacts/shared-tmdb/private/shared-tmdb-response-cache.json'
const CATALOG = 'public/catalog.json'
const MAX_CATALOG_BYTES=96*1024*1024

/** G2m local candidates remain authoritative, including its ambiguity block.
 * Only a genuine local miss looks up a literal, typed G2n request. Do not turn
 * any ambiguous cached result into an artificially unique candidate. */
export function createG2wXmltvCandidateResolver(local, shared) {
  if(typeof local?.lookup!=='function'||typeof shared?.localCandidatesFor!=='function')
    throw new TypeError('Invalid private XMLTV cache resolver')
  const counts={localHits:0,localConflicts:0,invalidLocal:0,cacheLookups:0,
    cacheUniqueCandidateRows:0,cacheAmbiguousRows:0,cacheNoExactCandidateRows:0}
  return Object.freeze({
    localCandidatesFor(row,type){
      const result=local.lookup(row,type)
      if(result.status==='hit'){counts.localHits++;return result.candidates}
      if(result.status==='ambiguous'){counts.localConflicts++;return []}
      if(result.status!=='missing'){counts.invalidLocal++;return []}
      counts.cacheLookups++
      const alias=normalizeWaipuText(row.title)
      const exact=new Map()
      // The G2n cache uses EXACT original request parameters. The *returned*
      // candidates still need the unchanged original G1b/Joyn matcher checks.
      for(const item of shared.localCandidatesFor(row,type)){
        const normalized=normalizeTmdbMatchCandidate(item,'tmdb-shared-search-response')
        if(normalized?.type!==type||!Number.isSafeInteger(normalized.tmdbId)) continue
        if(![normalized.title,normalized.originalTitle].map(normalizeWaipuText).includes(alias))continue
        // A duplicate response identity with conflicting evidence is not a
        // license to collapse it to an apparently unique choice.
        if(exact.has(normalized.tmdbId)){
          counts.cacheAmbiguousRows++;return []
        }
        exact.set(normalized.tmdbId,normalized)
      }
      if(exact.size>1){counts.cacheAmbiguousRows++;return []}
      if(!exact.size){counts.cacheNoExactCandidateRows++;return []}
      counts.cacheUniqueCandidateRows++
      return [...exact.values()]
    },
    counts(){return {...counts}},
  })
}

export async function runG2wXmltvSharedCachePreview({root=ROOT,now=Date.now(),coordinatorOptions={}}={}){
  // Fixed runner-local paths: no arbitrary source URLs, cloud reads or writes.
  const file=join(root,CATALOG)
  const info=await lstat(file)
  if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>MAX_CATALOG_BYTES)
    throw new Error('G2W_CATALOG_REJECTED')
  const catalog=JSON.parse(await readFile(file,'utf8'))
  const local=createXmltvG2mVerifiedLocalResolver(catalog,{now})
  const loaded=await loadOptionalSharedTmdbResponses(join(root,SNAPSHOT),{now})
  const shared=createG2nXmltvCachedResponseResolver(loaded.store)
  const enhanced=createG2wXmltvCandidateResolver(local,shared)
  if(!coordinatorOptions||typeof coordinatorOptions!=='object'||Array.isArray(coordinatorOptions)||
    Object.keys(coordinatorOptions).some(k=>!['stagingReportPath','privateRoot','maxCandidates'].includes(k)))
    throw new Error('G2W_COORDINATOR_OPTIONS_REJECTED')
  const options={stagingReportPath:join(root,'artifacts/xmltv-g2/report.json'),privateRoot:join(root,'artifacts/xmltv-g2/private'),...coordinatorOptions,now}
  const baseline=await runXmltvG2lPrivateAdapterCoordinator({...options,localCandidatesFor:local.localCandidatesFor})
  const combined=await runXmltvG2lPrivateAdapterCoordinator({...options,localCandidatesFor:enhanced.localCandidatesFor,runtimeCatalog:catalog})
  if(!isSafeXmltvG2lPrivateAdapterReport(baseline)||!isSafeXmltvG2lPrivateAdapterReport(combined)||
    !isSafePrivateXmltvRuntimeReadiness(combined.runtimeReadiness,combined.locallyMatchedCount)||
    baseline.selectedCandidateCount!==combined.selectedCandidateCount||
    baseline.selectedSources!==combined.selectedSources||
    baseline.locallyMatchedCount>combined.locallyMatchedCount||
    baseline.mergedAiringsWithXmltvPreview>combined.mergedAiringsWithXmltvPreview)
    throw new Error('G2W_BASELINE_PARITY_REJECTED')
  const c=enhanced.counts(),hits=shared.counts(),extra=combined.locallyMatchedCount-baseline.locallyMatchedCount
  if(c.cacheLookups!==c.cacheUniqueCandidateRows+c.cacheAmbiguousRows+c.cacheNoExactCandidateRows||
    extra>c.cacheUniqueCandidateRows||hits.hits>c.cacheLookups||
    c.localHits+c.localConflicts+c.invalidLocal+c.cacheLookups>combined.selectedCandidateCount)
    throw new Error('G2W_COUNTS_REJECTED')
  return {
    kind:'xmltv-g2w-private-shared-cache-preview',schemaVersion:1,
    loadStatus:loaded.status,restoredResponses:loaded.entries,
    validatedSources:combined.selectedSources,selectedCandidates:combined.selectedCandidateCount,
    baselineMatched:baseline.locallyMatchedCount,combinedMatched:combined.locallyMatchedCount,
    additionalMatched:extra,baselineMergedAirings:baseline.mergedAiringsWithXmltvPreview,
    combinedMergedAirings:combined.mergedAiringsWithXmltvPreview,
    ...c,cacheResponseHits:hits.hits,cacheResponseMisses:hits.misses,
    runtimeReadiness:combined.runtimeReadiness,
    newTmdbApiRequests:0,cacheWrites:0,productiveWrites:0,publishApproved:false,
  }
}

async function main(){
  if(process.argv.length!==2||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     process.env.GITHUB_REF!=='refs/heads/main'||process.env.MOVIEHUB_XMLTV_PRIVATE_PREVIEW!=='enabled')
    throw new Error('G2W_APPROVAL_REJECTED')
  const result=await runG2wXmltvSharedCachePreview()
  console.log(JSON.stringify(result))
  if(!result.validatedSources) process.exitCode=1
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(()=>{console.error('G2w private XMLTV preview unavailable; Waipu/Joyn and published data unchanged');process.exitCode=1})
