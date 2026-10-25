/**
 * Narrow, reversible private QA -> public LINK-ONLY projection.
 * Never copy the original private qa.json, report.md or unknown fields.
 * The website already has a fail-safe 404 -> TMDB YouTube search fallback.
 */
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {
  BEST_EFFORT_YOUTUBE_KIND,BEST_EFFORT_YOUTUBE_VERSION,
  BEST_EFFORT_MAX_AGE_MS,selectYoutubeBestEffortTitleRoute,
} from '../src/providers/youtubeBestEffortRouteIndex.js'
import {SOURCE_METADATA} from './youtube-g2-best-effort-source-provenance.mjs'

export const PUBLIC_LINK_FILE='public/youtube-best-effort-title-links.json'
export const DOWNLOADED_LINK_FILE=
  'artifacts/youtube-g2/best-effort-downloaded/best-effort-links.private.json'
const VID=/^[A-Za-z0-9_-]{11}$/
const SHA=/^[a-f0-9]{40}$/i
const date=x=>Number.isFinite(Date.parse(x))
const okTime=(t,now)=>date(t)&&Date.parse(t)<=Date.parse(now)+60000
const fields=e=>({
  key:e.key,mediaType:e.mediaType,tmdbId:e.tmdbId,
  videoId:e.videoId,target:e.target,
  score:e.score,rankMargin:e.rankMargin,
  observedAt:e.observedAt,validUntil:e.validUntil,
  provenance:e.provenance,quality:e.quality,
})

export function safePublicBestEffortProjection(preview,source,{
  now=new Date().toISOString(),repository,
}={}){
  const t=Date.parse(now)
  if(!Number.isFinite(t)||!source||source.provenanceVerified!==true
    ||source.repository!==repository||!SHA.test(String(source.sourceSha||''))
    ||!Number.isSafeInteger(source.sourceRunId)||source.sourceRunId<1
    ||!Number.isSafeInteger(source.artifactId)||source.artifactId<1
    ||source.artifactName!=='youtube-g2-global-known-no-search-'+source.sourceRunId
    ||!okTime(source.sourceStartedAt,now)||!okTime(source.sourceCompletedAt,now)
    ||Date.parse(source.sourceStartedAt)>Date.parse(source.sourceCompletedAt)
    ||t-Date.parse(source.sourceCompletedAt)>6*86400000
    ||preview?.kind!==BEST_EFFORT_YOUTUBE_KIND
    ||preview.schemaVersion!==BEST_EFFORT_YOUTUBE_VERSION
    ||preview.providerId!=='youtube'
    ||preview.sourceMode!=='cached-known-video-ids-only'
    ||preview.verifiedDEOffers!==0||preview.verifiedPlaybackRoutes!==0
    ||preview.providerBadgeWrites!==0
    ||!Array.isArray(preview.claimedOfferTypes)||preview.claimedOfferTypes.length!==0
    ||!okTime(preview.generatedAt,now)||!okTime(preview.sourceObservedAt,now)
    ||Date.parse(preview.sourceObservedAt)<Date.parse(source.sourceStartedAt)-60000
    ||Date.parse(preview.generatedAt)>Date.parse(source.sourceCompletedAt)+60000
    ||Date.parse(preview.generatedAt)<Date.parse(preview.sourceObservedAt)
    ||t-Date.parse(preview.sourceObservedAt)>=6*86400000
    ||!Array.isArray(preview.entries)
    ||!Number.isSafeInteger(preview.count)
    ||preview.count!==preview.entries.length
    ||preview.entries.length>100)
    throw Error('BEST_EFFORT_PROMOTION_SOURCE_OR_PREVIEW_UNTRUSTED')

  const seenMovies=new Set(),seenVideos=new Set()
  const entries=[]
  for(const original of preview.entries){
    const e=fields(original||{})
    if(!Number.isSafeInteger(e.tmdbId)||e.tmdbId<1
      ||e.key!=='movie:'+e.tmdbId||e.mediaType!=='movie'
      ||!VID.test(String(e.videoId||''))
      ||e.target!=='https://www.youtube.com/watch?v='+e.videoId
      ||!Number.isFinite(e.score)||e.score<36||e.score>10000
      ||e.rankMargin!==null&&(!Number.isFinite(e.rankMargin)||e.rankMargin<8)
      ||e.quality!=='probable-video-not-verified'
      ||e.provenance!=='global-known-video-metadata-review'
      ||e.observedAt!==preview.sourceObservedAt
      ||!okTime(e.validUntil,now)
      ||Date.parse(e.validUntil)<=t
      ||Date.parse(e.validUntil)>Date.parse(e.observedAt)+BEST_EFFORT_MAX_AGE_MS
      ||seenMovies.has(e.key)||seenVideos.has(e.videoId))
      throw Error('BEST_EFFORT_PROMOTION_UNSAFE_ENTRY')
    seenMovies.add(e.key)
    seenVideos.add(e.videoId)
    entries.push(e)
  }
  const publicIndex={
    kind:BEST_EFFORT_YOUTUBE_KIND,
    schemaVersion:BEST_EFFORT_YOUTUBE_VERSION,
    providerId:'youtube',generatedAt:preview.generatedAt,
    sourceObservedAt:preview.sourceObservedAt,
    sourceMode:'cached-known-video-ids-only',
    verifiedDEOffers:0,verifiedPlaybackRoutes:0,providerBadgeWrites:0,
    claimedOfferTypes:[],count:entries.length,entries,
  }
  if(entries.some(e=>!selectYoutubeBestEffortTitleRoute(publicIndex,{
    type:'movie',tmdbId:e.tmdbId,
  },{now:t,hasYoutubeBadge:true})))
    throw Error('BEST_EFFORT_PROMOTION_CLIENT_ROUTE_REJECTED')
  return publicIndex
}

export async function promoteBestEffortLinks({
  sourceFile=SOURCE_METADATA,privatePreview=DOWNLOADED_LINK_FILE,
  output=PUBLIC_LINK_FILE,now=new Date().toISOString(),
  repository=process.env.GITHUB_REPOSITORY,
}={}){
  // Remove any stale JSON from a previous build before checking a new source.
  // Missing/stale/untrusted feed -> no public file, same old search fallback.
  await unlink(output).catch(e=>{if(e.code!=='ENOENT')throw e})
  const source=JSON.parse(await readFile(sourceFile,'utf8'))
  if(!source)return null
  const preview=JSON.parse(await readFile(privatePreview,'utf8'))
  const safe=safePublicBestEffortProjection(preview,source,{now,repository})
  if(safe.count===0)return null
  await mkdir(dirname(output),{recursive:true})
  await writeFile(output,JSON.stringify(safe)+'\n',{mode:0o644})
  console.log(JSON.stringify({
    kind:safe.kind,publicLinkShortcuts:safe.count,
    reviewRunId:source.sourceRunId,originalPrivateQaPublished:false,
    badgeWrites:0,verifiedDEOffers:0,searchCallsPerformed:0,
  }))
  return safe
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  promoteBestEffortLinks().catch(e=>{
    console.log('::warning::Best-effort YouTube link projection not available: '+e.message)
    // An optional shortcut must never block or corrupt the main catalog
    // deployment. No file remains after this failure.
  })
}
