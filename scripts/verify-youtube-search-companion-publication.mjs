/**
 * One independent readback of the entire current editorial YouTube search
 * companion. Unlike a source QA snapshot, this verifies the exact public
 * SEARCH presentation that users receive after a Firebase deployment.
 * No YouTube/TMDB calls, credentials, personal data or product writes.
 */
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {isDeepStrictEqual} from 'node:util'
import {validateYoutubeCuratedSearchTitleFeed}
  from '../src/catalog/youtubeCuratedSearchTitles.js'
import {verifyPublicationWithBoundedConvergence}
  from './verify-published-data.mjs'

export const YOUTUBE_SEARCH_PUBLIC_PATHS=Object.freeze([
  'youtube-curated-title-hints.json',
  'youtube-curated-new-films.json',
  'youtube-curated-search-titles.json',
])
const ORIGIN='https://movie-hub-62459.web.app'
const VALID_VIDEO=/^[A-Za-z0-9_-]{11}$/
async function optionalJson(dir,file){
  try {return JSON.parse(await readFile(resolve(dir,file),'utf8'))}
  catch(e){if(e.code==='ENOENT')return null;throw e}
}
async function readHosted({request,url,now}){
  const target=new URL('/'+url,ORIGIN)
  target.searchParams.set('watchdog',String(now))
  return request(target,{cache:'no-store',redirect:'error',
    signal:AbortSignal.timeout(20000)})
}
const header=(res,key)=>String(res?.headers?.get?.(key)||'').toLowerCase()

export async function verifyYoutubeSearchCompanionPublication({
  directory='public',request=fetch,prepared=false,now=Date.now(),
}={}){
  if(typeof request!=='function'||!Number.isFinite(Number(now)))
    throw Error('YOUTUBE_SEARCH_PUBLICATION_VERIFY_INPUT_INVALID')
  const [hints,films,search]=await Promise.all(
    YOUTUBE_SEARCH_PUBLIC_PATHS.map(p=>optionalJson(directory,p)))
  if(!hints&&!films&&!search){
    if(!prepared){
      // Firebase Hosting rewrites missing JSON to index.html with HTTP 200.
      // Any lingering old JSON would keep removed films searchable.
      const r=await readHosted({request,url:YOUTUBE_SEARCH_PUBLIC_PATHS[2],now})
      if(r?.status!==404&&!(r?.ok&&header(r,'content-type').includes('text/html')))
        throw Error('YOUTUBE_SEARCH_COMPANION_STALE_PUBLIC_FILE_NOT_REVOKED')
    }
    return {published:false,count:0,revoked:true}
  }
  if(!hints||!films||!search
    ||hints.kind!=='moviehub-youtube-curated-editorial-title-hints'
    ||hints.providerId!=='youtube'||hints.publicationAuthority!=='editorial-playlist-only'
    ||hints.verifiedDEOffers!==0||hints.verifiedPlaybackRoutes!==0
    ||!Array.isArray(hints.entries)||hints.entries.length!==hints.count
    ||films.kind!=='moviehub-youtube-curated-new-film-metadata'
    ||films.providerId!=='youtube'
    ||films.offerVerification!=='editorial-only-not-independent'
    ||films.sourceVideoIds!==hints.sourceVideoIds
    ||films.generatedAt!==hints.generatedAt
    ||!Array.isArray(films.entries)||films.count!==films.entries.length
    ||search.generatedAt!==hints.generatedAt
    ||search.sourceVideoIds!==hints.sourceVideoIds
    ||search.count!==hints.count
    ||!validateYoutubeCuratedSearchTitleFeed(search,{now:Number(now)}))
    throw Error('YOUTUBE_SEARCH_COMPANION_BUILD_OR_GENERATION_INVALID')

  const byId=new Map(search.entries.map(e=>[e.tmdbId,e]))
  const seenMovieIds=new Set(),seenVideoIds=new Set()
  for(const hint of hints.entries){
    const id=hint?.tmdbId
    const canonical=byId.get(id)
    if(!Number.isInteger(id)||id<1
      ||hint.key!=='movie:'+id||hint.mediaType!=='movie'
      ||!VALID_VIDEO.test(String(hint.videoId||''))
      ||hint.watchUrl!=='https://www.youtube.com/watch?v='+hint.videoId
      ||!['free','rent-buy'].includes(hint.playlistMode)
      ||hint.verificationStatus!=='not-independently-verified'
      ||!canonical||canonical.film?.tmdbId!==id
      ||seenMovieIds.has(id)||seenVideoIds.has(hint.videoId)){
      throw Error('YOUTUBE_SEARCH_COMPANION_FILM_LINK_COVERAGE_INVALID')
    }
    seenMovieIds.add(id);seenVideoIds.add(hint.videoId)
  }
  if(byId.size!==hints.count)
    throw Error('YOUTUBE_SEARCH_COMPANION_FILM_LINK_COVERAGE_INVALID')
  if(!prepared){
    for(let i=0;i<YOUTUBE_SEARCH_PUBLIC_PATHS.length;i++){
      const path=YOUTUBE_SEARCH_PUBLIC_PATHS[i]
      const expected=[hints,films,search][i]
      const response=await readHosted({request,url:path,now})
      if(!response?.ok||!header(response,'content-type').includes('json')
        ||!/(?:^|[,\s])no-store(?:[,\s]|$)/.test(header(response,'cache-control')))
        throw Error('YOUTUBE_SEARCH_COMPANION_HOSTING_RESPONSE_INVALID: '+path)
      if(!isDeepStrictEqual(await response.json(),expected))
        throw Error('Published generation differs from build: '+path)
    }
  }
  return {published:true,count:search.count,revoked:false}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const prepared=process.argv.includes('--prepared')
  verifyPublicationWithBoundedConvergence({
    verify:()=>verifyYoutubeSearchCompanionPublication({prepared}),
    maxAttempts:prepared?3:12,
  }).then(result=>console.log(JSON.stringify({
    kind:'youtube-search-companion-hosted-readback',...result,
  }))).catch(e=>{console.error(e.message);process.exitCode=1})
}
