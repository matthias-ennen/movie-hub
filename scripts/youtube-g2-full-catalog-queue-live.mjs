/**
 * One bounded research batch across ACTUAL MovieHub canonical Firestore
 * inventory. No collection reading is duplicated: the existing #256 builder
 * produces artifacts/title-candidate-inventory.json before this runner.
 *
 * This file may read official YouTube/TMDB APIs but never writes MovieHub
 * catalogs, Firestore, user data, offers or player routes.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getSecret, youtubeGet } from './youtube-api-smoke.mjs'
import { createYoutubeFullCatalogResearchPlan } from './youtube-g2-full-catalog-queue.mjs'
import {
  loadPublicMovieHubIndex, runTmdbFirstLinkPilot,
} from './youtube-g2-tmdb-first-link-pilot.mjs'

export const OUTPUT = 'artifacts/youtube-g2/full-catalog-queue'
export const INVENTORY = 'artifacts/title-candidate-inventory.json'
export const DEFAULT_SAFE_BATCH = 10
async function tmdbRead(path, params, token) {
  if (!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path)) {
    throw Error('TMDB_FULL_CATALOG_PATH_NOT_APPROVED')
  }
  const u=new URL('https://api.themoviedb.org/3'+path)
  for(const [k,v] of Object.entries(params||{})) u.searchParams.set(k,String(v))
  const response=await fetch(u,{
    headers:{accept:'application/json',authorization:'Bearer '+token},
    signal:AbortSignal.timeout(20000),
  })
  if(!response.ok)throw Error('TMDB_FULL_CATALOG_HTTP_'+response.status)
  return response.json()
}
export function fullCatalogBatchReport(plan, pilot) {
  const l=[
    '# YouTube G2 – complete canonical inventory / existing badges – research only',
    '',
    '- Canonical MovieHub identity references (includes browse/personal/profile/sharedMedia/Waipu/Joyn): '+plan.basis.completeCanonicalTitleReferences,
    '- Canonical movies: '+plan.basis.completeCanonicalMovies,
    '- Canonical series: '+plan.basis.completeCanonicalSeries,
    '- Exact YouTube-badged PUBLIC film IDs: '+plan.basis.publicYoutubeBadgedMovies,
    '- Exact YouTube-badged PUBLIC series deferred: '+plan.basis.publicYoutubeBadgedSeriesDeferred,
    '- Publicly badged canonical film identities: '+plan.basis.canonicalAndPublicBadgedTitles,
    '- Public YouTube-badged films outside complete canonical inventory: '+plan.basis.publicSearchOnlyBadgedTitles,
    '- Private/profile-only YouTube provider coverage: UNKNOWN (inventory records identities, not private badge offers).',
    '- Next cursor after this batch: '+(plan.batch.nextOffset ?? 'DONE'),
    '- Selected batch: '+plan.batch.selectedCount+' / '+plan.batch.total,
    '- YouTube search API calls: '+pilot.summary.calls.youtubeSearches,
    '- YouTube video detail lookups: '+pilot.summary.calls.youtubeVideoLookups,
    '- TMDB detail/offer reads: '+pilot.summary.calls.tmdbGetRequests,
    '- Results: '+JSON.stringify(pilot.summary.statusCounts),
    '- Video-ID link candidates for independent review: '+pilot.summary.candidateLinksForReview,
    '- Verified direct links: 0, verified DE offers: 0, personal titles disclosed publicly: 0.',
    '- Production imports, source envelopes, Firestore, badges and player writes: ALL ZERO.',
    '',
    '| Film (public TMDB ID) | Public canonical membership | Source review status | Proposed video IDs (NOT VERIFIED) |',
    '| --- | --- | --- | --- |',
  ]
  const byId=new Map(plan.plan.map(x=>[x.tmdbId,x]))
  for(const row of pilot.rows){
    const seed=byId.get(row.tmdbId)
    l.push('| movie:'+row.tmdbId+' | '+(seed?.catalogMembership||'unknown')
      +' | '+row.status+' | '
      +(row.videoCandidates||[]).slice(0,3).map(x=>x.videoId).join(', ')+' |')
  }
  return l.join('\n')+'\n'
}
async function main(){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('FULL_CATALOG_READ_ONLY_REQUIRED')
  const limit=Number(process.env.YOUTUBE_G2_RESEARCH_BATCH_SIZE||DEFAULT_SAFE_BATCH)
  const offset=Number(process.env.YOUTUBE_G2_RESEARCH_OFFSET||0)
  const token=process.env.TMDB_API_READ_TOKEN
  if(!token||token.length<15)throw Error('TMDB_READ_ONLY_TOKEN_REQUIRED')
  const inventory=JSON.parse(await readFile(INVENTORY,'utf8'))
  const index=await loadPublicMovieHubIndex()
  const plan=createYoutubeFullCatalogResearchPlan({
    inventory,publicIndex:index,offset,limit,
  })
  if(plan.batch.selectedCount===0)throw Error('FULL_CATALOG_EMPTY_RESEARCH_BATCH')
  const key=getSecret()
  const pilot=await runTmdbFirstLinkPilot({
    publicIndex:index,seedRefs:plan.plan.map(p=>({mediaType:'movie',tmdbId:p.tmdbId})),
    limit:plan.batch.selectedCount,
    tmdbGet:(p,q)=>tmdbRead(p,q,token),
    youtubeApi:(p,q)=>youtubeGet(p,q,key),
  })
  if(pilot.summary.processedMovies!==plan.batch.selectedCount
    || pilot.summary.calls.youtubeSearches>plan.batch.youtubeSearchCallsPlanned
    || pilot.summary.publicationPermitted!==false
    || pilot.summary.verifiedDirectLinks!==0
    || pilot.summary.catalogWrites!==0||pilot.summary.firestoreWrites!==0
    || pilot.summary.providerWrites!==0||pilot.summary.badgeWrites!==0){
    throw Error('FULL_CATALOG_BATCH_REVIEW_GATES_FAILED')
  }
  const report=fullCatalogBatchReport(plan,pilot)
  await mkdir(OUTPUT,{recursive:true})
  await writeFile(OUTPUT+'/qa.json',JSON.stringify({plan,pilot},null,2)+'\n',{mode:0o600})
  await writeFile(OUTPUT+'/report.md',report,{mode:0o600})
  console.log(JSON.stringify({
    kind:plan.mode,canonicalTitles:plan.basis.completeCanonicalTitleReferences,
    publicYoutubeMovies:plan.basis.publicYoutubeBadgedMovies,
    publicYoutubeSeriesDeferred:plan.basis.publicYoutubeBadgedSeriesDeferred,
    selected:plan.batch.selectedCount,nextOffset:plan.batch.nextOffset,
    sourceStatus:pilot.summary.statusCounts,
    videoReviewCandidates:pilot.summary.candidateLinksForReview,
    youtubeSearches:pilot.summary.calls.youtubeSearches,
    verifiedDirectLinks:0,productionWrites:0,
  }))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error('YouTube full-inventory research failed closed: '+e.message);process.exitCode=1})
}
