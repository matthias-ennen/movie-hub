/**
 * Independently verify the EXACT, short-lived link-only JSON actually served
 * by Firebase Hosting. One HTTP read, no YouTube/TMDB API calls or data writes.
 * Checks rollback too: a missing prepared file must not leave old links live.
 */
import {readFile,appendFile} from 'node:fs/promises'
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
    if(!response?.ok||!type.includes('text/html'))
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

/**
 * Pick up to three REAL device-test targets from two ALREADY PUBLIC files.
 * A link is eligible only if this exact canonical film still has a public
 * YouTube badge. Never read private Actions QA, profile records or secrets.
 * Titles and watch URLs are hints for manual testing, NOT verified DE offers.
 */
export function selectPublishedYoutubeDeviceTestCases(links,publicIndex,{
  now=Date.now(),limit=3,
}={}){
  if(links?.kind!==BEST_EFFORT_YOUTUBE_KIND
    ||links?.schemaVersion!==BEST_EFFORT_YOUTUBE_VERSION
    ||!Array.isArray(links.entries)||links.count!==links.entries.length
    ||publicIndex?.kind!=='search-index'||publicIndex.version!==1
    ||publicIndex.country!=='DE'||publicIndex.source==='fallback'
    ||!Array.isArray(publicIndex.entries)
    ||publicIndex.count!==publicIndex.entries.length
    ||!Number.isInteger(limit)||limit<1||limit>5)return []
  const badgeMovies=new Map()
  for(const entry of publicIndex.entries){
    if(entry?.type!=='movie'||!Number.isSafeInteger(Number(entry.tmdbId))
      ||Number(entry.tmdbId)<1)continue
    const badge=(Array.isArray(entry.providerIds)&&entry.providerIds.includes('youtube'))
      ||(Array.isArray(entry.providerOffers)
        &&entry.providerOffers.some(p=>p?.id==='youtube'))
    if(!badge)continue
    const key=Number(entry.tmdbId)
    // Conflicting public film identities cannot supply a test title.
    if(badgeMovies.has(key)){badgeMovies.set(key,null);continue}
    const title=String(entry.title||'').split('')
      .map(ch=>'<>|*()[]{}\r\n'.includes(ch)?' ':ch)
      .join('').trim().split(/\s+/).join(' ').slice(0,120)
    badgeMovies.set(key,title?{title,year:Number.isInteger(Number(entry.year))
      &&Number(entry.year)>=1880&&Number(entry.year)<=2100?Number(entry.year):null}:null)
  }
  return links.entries.map(entry=>{
    const movie=badgeMovies.get(Number(entry.tmdbId))
    if(!movie||!selectYoutubeBestEffortTitleRoute(links,{
      type:'movie',tmdbId:entry.tmdbId,
    },{now,hasYoutubeBadge:true}))return null
    return {
      tmdbId:entry.tmdbId,title:movie.title,year:movie.year,
      videoId:entry.videoId,url:entry.target,
      score:entry.score,
    }
  }).filter(Boolean)
    .sort((a,b)=>b.score-a.score||a.tmdbId-b.tmdbId)
    .slice(0,limit)
    .map(({score,...testCase})=>testCase)
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
      // The hosted response was read back first. List only public, still-
      // badge-linked titles that users can actually locate in MovieHub.
      // An unavailable title mapping never affects the successful deploy.
      if(result.published){
        try{
          const [links,publicIndex]=await Promise.all([
            readFile(LOCAL,'utf8').then(JSON.parse),
            readFile('public/search-index.json','utf8').then(JSON.parse),
          ])
          const cases=selectPublishedYoutubeDeviceTestCases(links,publicIndex)
          console.log(JSON.stringify({
            kind:'youtube-public-device-test-cases',count:cases.length,
            independentlyVerifiedDEOffers:0,devicePlaybackVerified:false,
            cases,
          }))
          if(cases.length&&process.env.GITHUB_STEP_SUMMARY){
            const lines=[
              '',
              '### YouTube: drei konkrete Geräte-Testfilme (nur Best-Effort-Links)',
              '',
              'Die Film-/Video-Zuordnung, deutscher Tarif und echte Wiedergabe sind **nicht** unabhängig bestätigt.',
              'In MovieHub den Titel suchen und das vorhandene YouTube-Anbieterbadge öffnen.',
              '',
              '| Film | TMDB-ID | Exakter möglicher YouTube-Link |',
              '| --- | ---: | --- |',
              ...cases.map(x=>'| '+x.title+(x.year?' ('+x.year+')':'')
                +' | '+x.tmdbId+' | [Watch-URL]('+x.url+') |'),
              '',
              'Android- und Fire-TV-Ergebnis erst nach realem Nutzertest als geprüft markieren.',
              '',
            ]
            await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\\n'))
          }
        }catch(e){
          console.log('::warning::Public YouTube device-test selection unavailable: '+e.message)
        }
      }
      error=null
      break
    }catch(e){
      error=e
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,2000))
    }
  }
  if(error){console.error(error.message);process.exitCode=1}
}
