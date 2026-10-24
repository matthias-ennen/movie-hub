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
import {mapFromCandidateCheckpoint} from './youtube-g2-durable-candidate-checkpoint.mjs'
import {
  loadPublicMovieHubIndex, runTmdbFirstLinkPilot,
} from './youtube-g2-tmdb-first-link-pilot.mjs'

export const OUTPUT = 'artifacts/youtube-g2/full-catalog-queue'
export const INVENTORY = 'artifacts/title-candidate-inventory.json'
export const DEFAULT_SAFE_BATCH = 10
export const PRIOR_QA='artifacts/youtube-g2/prior-full-catalog/qa.json'
export const KNOWN_ARCHIVE_QA='artifacts/youtube-g2/trusted-known-candidates/candidates.json'
export function parseResearchRunInput(env=process.env){
  const rawOffset=env.YOUTUBE_G2_RESEARCH_OFFSET
  const rawLimit=env.YOUTUBE_G2_RESEARCH_BATCH_SIZE
  const previous=env.YOUTUBE_G2_RESEARCH_PREVIOUS_RUN||''
  const numeric=/^(?:0|[1-9][0-9]*)$/
  if(!numeric.test(String(rawOffset??''))
    ||!numeric.test(String(rawLimit??''))
    ||(Number(rawOffset)>0&&!/^[1-9][0-9]*$/.test(previous))
    ||(Number(rawOffset)===0&&previous!==''))
    throw Error('G2_RESEARCH_EXPLICIT_CURSOR_AND_PRIOR_RUN_REQUIRED')
  const limit=Number(rawLimit),offset=Number(rawOffset)
  if(!Number.isSafeInteger(limit)||limit<1||limit>25
    ||!Number.isSafeInteger(offset))
    throw Error('G2_RESEARCH_BATCH_INPUT_INVALID')
  return {limit,offset,previousRun:previous||null}
}
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
    '- Immutable ordered badge queue digest: '+plan.batch.queueIdentity,
    '- Resume next batch using this exact Actions QA as prior run; if the badge queue changes, stop and rebuild a new plan.',
    '- Official default search.list bucket: '+plan.batch.defaultSearchDailyCallLimit
      +' calls/day (NOT current project quota or available balance).',
    '- This batch requests up to '+plan.batch.youtubeSearchCallsPlanned
      +' search.list calls; quota per search call: 1 search-bucket unit.',
    '- Trusted prior-film candidate IDs reused: '+plan.batch.knownCandidateReusedVideoIds
      +' across '+plan.batch.knownCandidateReuseMovies+' films; '
      +plan.batch.youtubeSearchCallsAvoided+' repeat search.list calls avoided.',
    '- Reused candidates are rescored using CURRENT videos.list and TMDB DE watch providers; they are not approved playback links.',
    '- No automatic retries on HTTP 429, no auto-scheduling, no implicit cursor reset.',
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
  const {limit,offset,previousRun}=parseResearchRunInput()
  // The workflow is responsible for verifying the exact prior successful
  // main-branch Action and downloading only its own immutable QA artifact.
  const continuation=previousRun
    ?JSON.parse(await readFile(PRIOR_QA,'utf8')):null
  const token=process.env.TMDB_API_READ_TOKEN
  if(!token||token.length<15)throw Error('TMDB_READ_ONLY_TOKEN_REQUIRED')
  const inventory=JSON.parse(await readFile(INVENTORY,'utf8'))
  const checkpoint=JSON.parse(await readFile(KNOWN_ARCHIVE_QA,'utf8'))
  const knownVideoCandidatesByTmdbId=mapFromCandidateCheckpoint(checkpoint)
  const index=await loadPublicMovieHubIndex()
  const plan=createYoutubeFullCatalogResearchPlan({
    inventory,publicIndex:index,offset,limit,continuation,
    knownVideoCandidatesByTmdbId,
  })
  if(plan.batch.selectedCount===0)throw Error('FULL_CATALOG_EMPTY_RESEARCH_BATCH')
  const key=getSecret()
  const pilot=await runTmdbFirstLinkPilot({
    publicIndex:index,seedRefs:plan.plan.map(p=>({mediaType:'movie',tmdbId:p.tmdbId})),
    limit:plan.batch.selectedCount,
    tmdbGet:(p,q)=>tmdbRead(p,q,token),
    youtubeApi:(p,q)=>youtubeGet(p,q,key),
    knownVideoCandidatesByTmdbId,
  })
  if(pilot.summary.processedMovies!==plan.batch.selectedCount
    || pilot.summary.calls.youtubeSearches>plan.batch.youtubeSearchCallsPlanned
    // Planning counts all archived-badged candidates, but a DE YouTube
    // offer may have disappeared. Those films are correctly skipped before
    // their archived video IDs need refreshing; do not invent a reuse.
    || pilot.summary.knownCandidateReuseMovies>plan.batch.knownCandidateReuseMovies
    || pilot.summary.knownCandidateReusedVideoIds>plan.batch.knownCandidateReusedVideoIds
    || pilot.summary.avoidedYoutubeSearchCalls>plan.batch.youtubeSearchCallsAvoided
    || pilot.summary.avoidedYoutubeSearchCalls!==pilot.summary.knownCandidateReuseMovies*2
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
    queueIdentity:plan.batch.queueIdentity,
    defaultDailySearchCallLimit:plan.batch.defaultSearchDailyCallLimit,
    defaultDailyLimitIsMeasured:false,
    researchPriorRun:previousRun,
    sourceStatus:pilot.summary.statusCounts,
    videoReviewCandidates:pilot.summary.candidateLinksForReview,
    reusedKnownCandidateMovies:plan.batch.knownCandidateReuseMovies,
    reusedKnownVideoIds:plan.batch.knownCandidateReusedVideoIds,
    searchRequestsAvoided:plan.batch.youtubeSearchCallsAvoided,
    youtubeSearches:pilot.summary.calls.youtubeSearches,
    verifiedDirectLinks:0,productionWrites:0,
  }))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error('YouTube full-inventory research failed closed: '+e.message);process.exitCode=1})
}
