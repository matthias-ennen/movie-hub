/**
 * Trusted SAME-NIGHT read-only videos.list recheck -> existing MovieHub badge
 * watch-link projection. No offer approvals, rent/buy/free inference or
 * Firestore writes. Exact-run artifact provenance is enforced by GitHub
 * Actions: reusable known-videos SUCCESS + download-artifact from this runId.
 *
 * A good, unique film match gets a YouTube watch?v= link regardless of TMDB
 * access type. If none qualifies, preserve the app's YouTube search fallback.
 */
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {
  BEST_EFFORT_YOUTUBE_KIND,BEST_EFFORT_YOUTUBE_VERSION,
  BEST_EFFORT_MAX_AGE_MS,BEST_EFFORT_MAX_LINKS,
  selectYoutubeBestEffortTitleRoute,
} from '../src/providers/youtubeBestEffortRouteIndex.js'

export const NIGHTLY_KNOWN_PREVIEW=
  'artifacts/youtube-g2/same-run-known/best-effort-links.private.json'
export const LIVE_LINKS='public/youtube-best-effort-title-links.json'
const VIDEO=/^[A-Za-z0-9_-]{11}$/
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))
const safeNum=x=>Number.isSafeInteger(x)&&x>0
const select=e=>({
  key:e.key,mediaType:e.mediaType,tmdbId:e.tmdbId,
  videoId:e.videoId,target:e.target,score:e.score,rankMargin:e.rankMargin,
  observedAt:e.observedAt,validUntil:e.validUntil,
  provenance:e.provenance,quality:e.quality,
})
export function projectSameNightKnownLinks(preview,{now=new Date().toISOString()}={}){
  const t=Date.parse(now)
  if(!Number.isFinite(t)||preview?.kind!==BEST_EFFORT_YOUTUBE_KIND
    ||preview.schemaVersion!==BEST_EFFORT_YOUTUBE_VERSION
    ||preview.providerId!=='youtube'
    ||preview.sourceMode!=='cached-known-video-ids-only'
    ||preview.verifiedDEOffers!==0||preview.verifiedPlaybackRoutes!==0
    ||preview.providerBadgeWrites!==0
    ||!Array.isArray(preview.claimedOfferTypes)
    ||preview.claimedOfferTypes.length!==0
    ||!iso(preview.generatedAt)||!iso(preview.sourceObservedAt)
    ||t-Date.parse(preview.sourceObservedAt)>6*3600000
    ||Date.parse(preview.sourceObservedAt)>t+60000
    ||Date.parse(preview.generatedAt)<Date.parse(preview.sourceObservedAt)
    ||Date.parse(preview.generatedAt)>t+60000
    ||!Number.isSafeInteger(preview.count)
    ||!Array.isArray(preview.entries)
    ||preview.entries.length!==preview.count
    ||preview.entries.length>BEST_EFFORT_MAX_LINKS)
    throw Error('SAME_NIGHT_YOUTUBE_QA_NOT_TRUSTED')
  const seenMovie=new Set(),seenVideo=new Set()
  const entries=preview.entries.map(select)
  for(const e of entries){
    if(!safeNum(e.tmdbId)||e.key!=='movie:'+e.tmdbId
      ||e.mediaType!=='movie'||!VIDEO.test(String(e.videoId||''))
      ||e.target!=='https://www.youtube.com/watch?v='+e.videoId
      ||!Number.isFinite(e.score)||e.score<36||e.score>10000
      ||e.rankMargin!==null
        &&(!Number.isFinite(e.rankMargin)||e.rankMargin<8)
      ||e.provenance!=='global-known-video-metadata-review'
      ||e.quality!=='probable-video-not-verified'
      ||e.observedAt!==preview.sourceObservedAt
      ||!iso(e.validUntil)
      ||Date.parse(e.validUntil)<=t
      ||Date.parse(e.validUntil)>
        Date.parse(e.observedAt)+BEST_EFFORT_MAX_AGE_MS
      ||seenMovie.has(e.key)||seenVideo.has(e.videoId))
      throw Error('SAME_NIGHT_YOUTUBE_LINK_UNSAFE')
    seenMovie.add(e.key);seenVideo.add(e.videoId)
  }
  const index={
    kind:BEST_EFFORT_YOUTUBE_KIND,
    schemaVersion:BEST_EFFORT_YOUTUBE_VERSION,providerId:'youtube',
    generatedAt:preview.generatedAt,sourceObservedAt:preview.sourceObservedAt,
    sourceMode:'cached-known-video-ids-only',
    verifiedDEOffers:0,verifiedPlaybackRoutes:0,providerBadgeWrites:0,
    claimedOfferTypes:[],count:entries.length,entries,
  }
  if(entries.some(e=>!selectYoutubeBestEffortTitleRoute(index,{
    type:'movie',tmdbId:e.tmdbId,
  },{now:t,hasYoutubeBadge:true})))
    throw Error('SAME_NIGHT_YOUTUBE_ROUTE_NOT_LAUNCHABLE')
  return index
}
export async function promoteSameNightKnownLinks({
  input=NIGHTLY_KNOWN_PREVIEW,output=LIVE_LINKS,
  now=new Date().toISOString(),
}={}){
  const preview=JSON.parse(await readFile(input,'utf8'))
  const index=projectSameNightKnownLinks(preview,{now})
  // Atomic replace. Never publish raw review candidates or an unvalidated file.
  if(index.count===0){
    await unlink(output).catch(e=>{if(e.code!=='ENOENT')throw e})
    return {count:0,source:'same-night-review',fallbackRetained:true}
  }
  await mkdir(dirname(output),{recursive:true})
  const stage=output+'.pending'
  await writeFile(stage,JSON.stringify(index)+'\n',{mode:0o644})
  const {rename}=await import('node:fs/promises')
  await rename(stage,output)
  console.log(JSON.stringify({kind:index.kind,count:index.count,
    source:'same-night-review',newOffersClaimed:0,
    providerBadgeWrites:0,searchCallsByPromotion:0}))
  return index
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  promoteSameNightKnownLinks().catch(e=>{
    console.error('SAME_NIGHT_YOUTUBE_LINK_PROMOTION_FAILED: '+e.message)
    process.exitCode=1
  })
}
