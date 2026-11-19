/** #885: real approved feed A/B through production's private matcher path.
 * Hosted catalogs are read-only; originals remain in a temporary 0700 root.
 * No TMDB API, secrets, cache writes, Firebase writes or production activation.
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AIR_HOST } from './xmltv-air-publication.mjs'
import { loadTvRuntimeIndex } from '../src/tv/tvRuntimeClient.js'
import { fetchExistingMovieHubTmdbCatalog } from './xmltv-g2m-live-catalog-match-preview.mjs'
import { runXmltvG2PrivateStaging } from './xmltv-g2-private-staging.mjs'
import { runG2wXmltvSharedCachePreview } from './xmltv-g2w-shared-cache-preview.mjs'
import { readConfirmedAiringHandoff } from './xmltv-confirmed-airing-handoff.mjs'
import { buildTitleCandidateInventory, canonicalTitleIdentity } from './build-title-candidate-inventory.mjs'
import { buildTitlePriorityPreview } from './build-title-priority-preview.mjs'
import { buildCanonicalFanoutPlan, canonicalXmltvMetadata, collectCanonicalCandidateValues,
  executeTitlePriorityQueue, selectReusableCanonical, validateXmltvCanonicalHandoff } from './execute-title-priority-queue.mjs'
import { planXmltvAirSourceFiles } from './xmltv-air-release-plan.mjs'
import { buildTvRuntimeSnapshot } from '../src/tv/tvRuntimePublication.js'

const MAX_BYTES=96*1024*1024
const PEERS=['waipu','joyn']
async function readPublicPeer(id) {
  if (!PEERS.includes(id)) throw new Error('Unapproved peer')
  const response=await fetch(`${AIR_HOST}/${id}-live/titles.json`,{redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(40_000),headers:{accept:'application/json'}})
  if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('application/json')||
    Number(response.headers.get('content-length'))>MAX_BYTES) throw new Error('Peer catalog unavailable')
  const chunks=[];let bytes=0
  const reader=response.body.getReader()
  try{while(true){const {done,value}=await reader.read();if(done)break
    bytes+=value.byteLength;if(bytes>MAX_BYTES)throw new Error('Peer catalog too large');chunks.push(Buffer.from(value))}}
  finally{reader.releaseLock()}
  const value=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'))
  if(value.kind!==`${id}-live-titles`||!Array.isArray(value.entries)||!value.entries.length||value.entries.length>100000||
    value.entries.some(e=>!['movie','series','tv'].includes(e?.type)||!Number.isSafeInteger(e.tmdbId)||e.tmdbId<=0||
      typeof e.title!=='string'||!e.title.trim()||!Array.isArray(e.airings))||
    value.entries.reduce((n,e)=>n+e.airings.length,0)>250000)throw new Error('Invalid published peer catalog')
  return value
}

export function comparePeerRehearsal(before,after){
  const peer=after.peerReconciliation
  if(!peer||before.selectedCandidates!==after.selectedCandidates||before.validatedSources!==after.validatedSources||
    before.combinedMatched+peer.peerAcceptedMovie+peer.peerAcceptedSeries!==after.combinedMatched||
    before.newTmdbApiRequests!==0||after.newTmdbApiRequests!==0||before.cacheWrites!==0||after.cacheWrites!==0||
    before.productiveWrites!==0||after.productiveWrites!==0||
    before.runtimeReadiness.deduplicatedRuntimeAirings>after.runtimeReadiness.deduplicatedRuntimeAirings)
    throw new Error('Peer A/B parity violation')
  const summarize=r=>({selectedCandidates:r.selectedCandidates,matched:r.combinedMatched,
    rawRowMatchPercent:Math.round(1000*r.combinedMatched/Math.max(1,r.selectedCandidates))/10,
    runtimeReadiness:r.runtimeReadiness,stationDiagnostics:r.stationDiagnostics})
  return {baseline:summarize(before),withPeers:summarize(after),additionalConfirmedRows:after.combinedMatched-before.combinedMatched,
    additionalUniqueAirings:after.runtimeReadiness.deduplicatedRuntimeAirings-before.runtimeReadiness.deduplicatedRuntimeAirings,
    peerReconciliation:peer,newTmdbApiRequests:0,cacheWrites:0,productiveWrites:0}
}

// Exercise actual canonical validation, executor and publication planning in
// memory. Missing or stale metadata is deferred, never fetched or fabricated.
export async function rehearseCanonicalRelease(handoff,catalog,peers,now){
  const {events,titleRefs}=readConfirmedAiringHandoff(handoff,{now})
  const key=v=>canonicalTitleIdentity(v)?.key
  const available=new Set(catalog.titles.filter(v=>v?.source==='tmdb'&&typeof v.title==='string'&&v.title.trim()).map(key))
  const missing=titleRefs.filter(v=>!available.has(key(v)))
  const missingKeys=new Set(missing.map(key))
  const relevant=id=>({entries:peers[id].entries.filter(v=>v?.source==='tmdb'&&missingKeys.has(key(v)))})
  const generatedAt=new Date(now).toISOString()
  const inventory=buildTitleCandidateInventory({xmltvApprovedTitles:missing,
    waipuTitles:relevant('waipu'),joynTitles:relevant('joyn'),generatedAt})
  const preview=buildTitlePriorityPreview({inventory,capacity:missing.length,generatedAt})
  if(preview.queue.length!==missing.length||preview.selectedKeys.length!==missing.length)throw new Error('Canonical demand parity')
  const approvedKeys=validateXmltvCanonicalHandoff(missing,inventory,preview.queue)
  const candidateValues=collectCanonicalCandidateValues({catalog,waipuTitles:peers.waipu,joynTitles:peers.joyn})
  const reusable=preview.queue.filter(entry=>{
    const canReuse=entry.action==='reuse-canonical'||(entry.action==='fetch-tmdb'&&entry.metadata?.canonicalPublicationPending===true&&!entry.reasons?.includes('tmdb-changed'))
    return canReuse&&selectReusableCanonical((candidateValues.get(entry.key)||[])
      .map(v=>canonicalXmltvMetadata(v,entry)).filter(Boolean),{now,requireFacets:Number(entry.metadata?.facetGapReferences)>0})
  }).map(entry=>entry.key)
  const execution=await executeTitlePriorityQueue({preview:{...preview,selectedKeys:reusable},candidateValues,now,
    loadTitle:()=>{throw new Error('Unexpected TMDB request in read-only rehearsal')}})
  const counts=execution.summary.counts
  const fanout=buildCanonicalFanoutPlan({updates:execution.updates,catalog,waipuTitles:peers.waipu,joynTitles:peers.joyn,
    xmltvApprovedKeys:approvedKeys,generatedAt})
  if(counts.fetched!==0||counts.reused!==reusable.length||counts.canonicalReady!==reusable.length||
    (fanout.counts.xmltvCatalogAdded??0)!==reusable.length||fanout.firestoreWrites.length)throw new Error('Canonical execution parity')
  const summarize=(plan,currentCatalog)=>{
    const sourceCatalogs=[...PEERS.map(id=>({providerId:id,entries:peers[id].entries})),
      ...plan.files.map(file=>({providerId:file.providerId,entries:file.titles.entries}))]
    const runtime=buildTvRuntimeSnapshot({sourceCatalogs,catalog:currentCatalog,now})
    const result={stations:plan.files.length,...plan.counts,uniqueAirings:plan.counts.projected-plan.counts.deduplicated,
      totalRuntimeAirings:runtime.index.airingCount,xmltvOnly:0,xmltvWithPeer:0,xmltvWithBothPeers:0,
      currentOrNext3Hours:{movie:0,series:0,xmltvWithPeer:0}}
    for(const day of runtime.days)for(const entry of day.entries)for(const airing of entry.airings){
      const ids=airing.providerIds
      if(!ids.some(id=>id.startsWith('air-')))continue
      const n=PEERS.filter(id=>ids.includes(id)).length
      if(n)result.xmltvWithPeer++;else result.xmltvOnly++
      if(n===2)result.xmltvWithBothPeers++
      if(Date.parse(airing.stopTime)>now&&Date.parse(airing.startTime)<now+3*3600000){
        result.currentOrNext3Hours[entry.type]++
        if(n)result.currentOrNext3Hours.xmltvWithPeer++
      }
    }
    return result
  }
  const before=planXmltvAirSourceFiles({confirmedEvents:events,catalog,now})
  const after=planXmltvAirSourceFiles({confirmedEvents:events,catalog:fanout.catalog,now})
  if(after.counts.completeUniqueTitles<before.counts.completeUniqueTitles||after.counts.projected<before.counts.projected)
    throw new Error('Canonical AIR readiness regression')
  return {approvedUniqueTitles:titleRefs.length,missingUniqueTitles:missing.length,
    actualCanonicalReuses:counts.reused,deferredWithoutFetch:missing.length-counts.reused,
    before:summarize(before,catalog),after:summarize(after,fanout.catalog),newTmdbApiRequests:0,productiveWrites:0}
}

export async function runXmltvPeerLiveRehearsal(){
  const now=Date.now(),root=await mkdtemp(join(tmpdir(),'moviehub-peer-ab-'))
  const fetchImpl=(path,options)=>fetch(new URL(path,AIR_HOST),{...options,redirect:'error',cache:'no-store'})
  try{
    const index=await loadTvRuntimeIndex({fetchImpl})
    if(!index.generatedAt)throw new Error('Missing runtime generation')
    const publicRoot=join(root,'public')
    await mkdir(publicRoot,{mode:0o700})
    const catalog=await fetchExistingMovieHubTmdbCatalog({now})
    await writeFile(join(publicRoot,'catalog.json'),JSON.stringify(catalog),{mode:0o600,flag:'wx'})
    const peerCounts={},peers={}
    for(const id of PEERS){
      const value=await readPublicPeer(id)
      const dir=join(publicRoot,`${id}-live`)
      await mkdir(dir,{mode:0o700})
      await writeFile(join(dir,'titles.json'),JSON.stringify(value),{mode:0o600,flag:'wx'})
      peerCounts[id]=value.entries.length
      peers[id]=value
    }
    const privateRoot=join(root,'private'),stagingReportPath=join(root,'report.json')
    const staging=await runXmltvG2PrivateStaging({now,privateRoot})
    if(!staging.stagedSourceCount)throw new Error('No validated staged sources')
    await writeFile(stagingReportPath,JSON.stringify(staging),{mode:0o600,flag:'wx'})
    const options={root,now,coordinatorOptions:{privateRoot,stagingReportPath}}
    const before=await runG2wXmltvSharedCachePreview(options)
    let handoff
    const after=await runG2wXmltvSharedCachePreview({...options,peerReconciliation:true,captureHandoff:value=>{handoff=value}})
    const canonicalRelease=await rehearseCanonicalRelease(handoff,catalog,peers,now)
    if((await loadTvRuntimeIndex({fetchImpl})).generatedAt!==index.generatedAt)throw new Error('Hosted generation changed during A/B')
    return {kind:'xmltv-peer-live-rehearsal',observedAt:new Date(now).toISOString(),hostedGeneration:index.generatedAt,
      sourceCount:staging.stagedSourceCount,peerTitleCounts:peerCounts,
      denominator:'same staged raw XMLTV source rows; duplicate rows across feeds; no shared TMDB cache, no HTTP search',
      ...comparePeerRehearsal(before,after),canonicalRelease}
  }finally{await rm(root,{recursive:true,force:true})}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runXmltvPeerLiveRehearsal().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{
    console.error('Private XMLTV peer rehearsal failed; no production changes');process.exitCode=1
  })
}
