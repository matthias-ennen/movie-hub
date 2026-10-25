/**
 * Independently verify the EXACT, short-lived link-only JSON actually served
 * by Firebase Hosting. One HTTP read, no YouTube/TMDB API calls or data writes.
 * Checks rollback too: a missing prepared file must not leave old links live.
 */
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {isDeepStrictEqual} from 'node:util'
import {
  BEST_EFFORT_YOUTUBE_KIND,BEST_EFFORT_YOUTUBE_VERSION,
  selectYoutubeBestEffortTitleRoute,
} from '../src/providers/youtubeBestEffortRouteIndex.js'

export const LIVE_BEST_EFFORT_URL=
  'https://movie-hub-62459.web.app/youtube-best-effort-title-links.json'
const LOCAL='public/youtube-best-effort-title-links.json'

async function optionalPrepared(path){
  try{return JSON.parse(await readFile(path,'utf8'))}
  catch(e){if(e.code==='ENOENT')return null;throw e}
}

export async function verifyLiveBestEffortLinkPublication({
  expected,request=fetch,now=Date.now(),url=LIVE_BEST_EFFORT_URL,
}={}){
  if(typeof request!=='function'||!Number.isFinite(Number(now)))
    throw Error('YOUTUBE_BEST_EFFORT_LIVE_VERIFY_INPUT_INVALID')
  const target=new URL(url)
  if(target.protocol!=='https:'
    ||target.origin!==new URL(LIVE_BEST_EFFORT_URL).origin
    ||target.pathname!=='/youtube-best-effort-title-links.json')
    throw Error('YOUTUBE_BEST_EFFORT_LIVE_VERIFY_HOST_FORBIDDEN')
  target.searchParams.set('watchdog',String(Number(now)))
  const response=await request(target,{
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000),
  })
  const type=String(response?.headers?.get?.('content-type')||'').toLowerCase()
  const caching=String(response?.headers?.get?.('cache-control')||'').toLowerCase()
  if(!expected){
    // Firebase's SPA rewrite legitimately returns index.html with HTTP 200
    // for a missing JSON; JSON must NOT remain available after rollback.
    if(response?.status===404)return {published:false,count:0,revoked:true}
    if(!response?.ok||type.includes('json'))
      throw Error('YOUTUBE_BEST_EFFORT_STALE_LINKS_NOT_REVOKED')
    return {published:false,count:0,revoked:true}
  }
  if(expected.kind!==BEST_EFFORT_YOUTUBE_KIND
    ||expected.schemaVersion!==BEST_EFFORT_YOUTUBE_VERSION
    ||expected.providerId!=='youtube'||!Array.isArray(expected.entries)
    ||expected.count!==expected.entries.length
    ||expected.count<1||expected.count>100
    ||expected.verifiedDEOffers!==0||expected.verifiedPlaybackRoutes!==0
    ||expected.providerBadgeWrites!==0
    ||!Array.isArray(expected.claimedOfferTypes)
    ||expected.claimedOfferTypes.length!==0
    ||expected.entries.some(e=>!selectYoutubeBestEffortTitleRoute(expected,{
      type:'movie',tmdbId:e.tmdbId,
    },{now:Number(now),hasYoutubeBadge:true})))
    throw Error('YOUTUBE_BEST_EFFORT_PREPARED_LINKS_UNSAFE')
  if(!response?.ok||!type.includes('json')||!caching.includes('no-store'))
    throw Error('YOUTUBE_BEST_EFFORT_LIVE_RESPONSE_INVALID')
  const observed=await response.json()
  if(!isDeepStrictEqual(observed,expected))
    throw Error('YOUTUBE_BEST_EFFORT_LIVE_GENERATION_MISMATCH')
  return {published:true,count:expected.count,revoked:false}
}

export async function checkHostedBestEffortLinks({
  output=LOCAL,request=fetch,now=Date.now(),
}={}){
  const expected=await optionalPrepared(resolve(output))
  return verifyLiveBestEffortLinkPublication({expected,request,now})
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let error
  for(let attempt=0;attempt<3;attempt++){
    try{
      const result=await checkHostedBestEffortLinks()
      console.log(JSON.stringify({
        kind:'youtube-best-effort-hosted-readback',...result,
        verifiedDEOffers:0,searchCalls:0,originalPrivateQaPublished:false,
      }))
      error=null
      break
    }catch(e){
      error=e
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,2000))
    }
  }
  if(error){console.error(error.message);process.exitCode=1}
}
