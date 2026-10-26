/**
 * #388: operator-approved FIVE-SEARCH capped expansion from CURRENT public
 * MovieHub/TMDB YouTube movie badges. Never import, publish or infer a DE
 * playback entitlement. This bounded opt-in does not use the conservative
 * general full-catalog admission gate; it must not be used as an unattended job.
 * Store every completed film's research privately even if the next call fails.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet} from './youtube-api-smoke.mjs'
import {loadPublicMovieHubIndex,runTmdbFirstLinkPilot}
  from './youtube-g2-tmdb-first-link-pilot.mjs'
import {selectYoutubeBadgedMovies}
  from './youtube-g2-tmdb-first-link-model.mjs'
import {mapFromCandidateCheckpoint}
  from './youtube-g2-durable-candidate-checkpoint.mjs'

export const FIVE_SEARCH_KIND='moviehub-youtube-g2-five-search-public-badge-review'
export const FIVE_SEARCH_OUTPUT='artifacts/youtube-g2/five-search-public-badge'
export const FIVE_SEARCH_CHECKPOINT='artifacts/youtube-g2/trusted-known-candidates/candidates.json'
export const FIVE_SEARCH_CAP=5
export const FIVE_SEARCH_SPACING_MS=20000
const SKIP_ALREADY_CHECKED=new Set([11])
const isId=x=>Number.isSafeInteger(x)&&x>0
const badge=e=>Array.isArray(e?.providerIds)&&e.providerIds.includes('youtube')
  ||Array.isArray(e?.providerOffers)&&e.providerOffers.some(p=>p?.id==='youtube')
const noWrites=s=>s?.publicationPermitted===false&&s.verifiedDirectLinks===0
  &&['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
    .every(k=>s[k]===0)

export function planFiveYoutubeSearches({
  publicIndex,checkpoint,excludedIds=[...SKIP_ALREADY_CHECKED],
  now=new Date().toISOString(),
}={}){
  const known=mapFromCandidateCheckpoint(checkpoint)
  const source=selectYoutubeBadgedMovies(publicIndex,{limit:1})
  const timestamp=Date.parse(now),published=Date.parse(publicIndex?.generatedAt)
  if(!Number.isFinite(timestamp)||!Number.isFinite(published)
    ||timestamp-published< -86400000||timestamp-published>30*86400000
    ||!Array.isArray(excludedIds)||excludedIds.some(id=>!isId(id)))
    throw Error('G2_FIVE_SEARCH_SOURCE_STALE_OR_UNTRUSTED')
  const excluded=new Set([...known.keys(),...excludedIds])
  const byId=new Map()
  for(const e of publicIndex.entries){
    const id=e?.tmdbId
    if(e?.type!=='movie'||!isId(id)||excluded.has(id)
      ||!badge(e)||typeof e.title!=='string'||!e.title.trim())continue
    if(byId.has(id))continue
    byId.set(id,{mediaType:'movie',tmdbId:id})
  }
  const refs=[...byId.values()].sort((a,b)=>a.tmdbId-b.tmdbId)
    .slice(0,FIVE_SEARCH_CAP)
  if(refs.length!==FIVE_SEARCH_CAP)throw Error('G2_FIVE_SEARCH_NOT_ENOUGH_NEW_BADGED_FILMS')
  return {
    tmdbRefs:refs,publicBadgedMovies:source.publicYoutubeBadgedMovies,
    cachedMovieCount:known.size,excludedSampleFilmId:11,
    maxSearchAttempts:FIVE_SEARCH_CAP,
    monitoringRemainingQuotaMeasured:false,
    publicationPermitted:false,
  }
}

export async function researchFiveYouTubeMovies({
  publicIndex,checkpoint,tmdbGet,youtubeApi,onProgress=async()=>{},
  now=new Date().toISOString(),wait=ms=>new Promise(r=>setTimeout(r,ms)),
  minIntervalMs=FIVE_SEARCH_SPACING_MS,
}={}){
  const plan=planFiveYoutubeSearches({publicIndex,checkpoint,now})
  if(typeof tmdbGet!=='function'||typeof youtubeApi!=='function'
    ||typeof onProgress!=='function'||typeof wait!=='function'
    ||!Number.isInteger(minIntervalMs)||minIntervalMs<0
    ||minIntervalMs>FIVE_SEARCH_SPACING_MS)
    throw Error('G2_FIVE_SEARCH_API_OR_SPACING_INVALID')
  const rows=[]
  let searches=0,videoLookups=0,tmdbReads=0
  const safeTotals=()=>({
    kind:FIVE_SEARCH_KIND,generatedAt:now,
    publicBadgedMovies:plan.publicBadgedMovies,
    cachedMovieCount:plan.cachedMovieCount,plannedMovies:plan.tmdbRefs.length,
    completedMovies:rows.length,
    youtubeSearchAttempts:searches,youtubeVideoLookups:videoLookups,
    tmdbGetRequests:tmdbReads,
    maximumSearchAttempts:FIVE_SEARCH_CAP,
    noAutomaticRetry:true,searchIntervalMs:minIntervalMs,
    dailyQuotaRemainingKnown:false,independentlyVerifiedDeOffers:0,
    directLinksPublished:0,catalogWrites:0,firestoreWrites:0,
    providerWrites:0,badgeWrites:0,privateArtifact:true,
    publicationPermitted:false,
  })
  // Keep the video details and scoring rows only in a private Actions artifact.
  for(const ref of plan.tmdbRefs){
    const one=await runTmdbFirstLinkPilot({
      publicIndex,seedRefs:[ref],limit:1,knownDeviceCandidates:[],
      knownVideoCandidatesByTmdbId:new Map(),
      searchesPerUncachedMovie:1,now:()=>now,
      tmdbGet:async(path,params)=>{
        if(++tmdbReads>3*FIVE_SEARCH_CAP)
          throw Error('G2_FIVE_SEARCH_TMDB_BUDGET_EXHAUSTED')
        return tmdbGet(path,params)
      },
      youtubeApi:async(path,params)=>{
        if(path==='search'){
          if(searches>=FIVE_SEARCH_CAP
            ||params?.regionCode!=='DE'||params?.type!=='video'
            ||params?.videoType!=='movie'||params?.maxResults>10)
            throw Error('G2_FIVE_SEARCH_REQUEST_NOT_ALLOWED')
          // No retries; Google 403/429 (or network failure) exits this loop.
          if(searches>0&&minIntervalMs>0)await wait(minIntervalMs)
          searches++
        }else if(path==='videos'){
          if(++videoLookups>FIVE_SEARCH_CAP)
            throw Error('G2_FIVE_SEARCH_VIDEO_BUDGET_EXHAUSTED')
        }else throw Error('G2_FIVE_SEARCH_ENDPOINT_FORBIDDEN')
        return youtubeApi(path,params)
      },
    })
    if(one.rows.length!==1||one.rows[0].tmdbId!==ref.tmdbId
      ||!noWrites(one.summary)
      ||one.summary.calls.youtubeSearches>1
      ||one.summary.calls.youtubeVideoLookups>1
      ||one.rows[0].publicationPermitted!==false
      ||one.rows[0].directPlaybackRoute!==null
      ||one.rows[0].reviewedVideoId!==null)
      throw Error('G2_FIVE_SEARCH_RESULT_NOT_SAFE')
    rows.push(one.rows[0])
    await onProgress({summary:safeTotals(),rows:[...rows]})
  }
  if(rows.length!==FIVE_SEARCH_CAP||searches>FIVE_SEARCH_CAP
    ||new Set(rows.map(r=>r.tmdbId)).size!==rows.length)
    throw Error('G2_FIVE_SEARCH_RECONCILIATION_FAILED')
  return {summary:safeTotals(),rows}
}

async function tmdbLive(path,params,token){
  if(!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path))
    throw Error('G2_FIVE_SEARCH_TMDB_PATH_FORBIDDEN')
  const url=new URL('https://api.themoviedb.org/3'+path)
  for(const [k,v] of Object.entries(params||{}))url.searchParams.set(k,String(v))
  const res=await fetch(url,{headers:{accept:'application/json',
    authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)})
  if(!res.ok)throw Error('G2_FIVE_SEARCH_TMDB_HTTP_'+res.status)
  return res.json()
}
export async function liveFiveSearchBatch({
  output=FIVE_SEARCH_OUTPUT,checkpointPath=FIVE_SEARCH_CHECKPOINT,
  token=process.env.TMDB_API_READ_TOKEN,youtubeKey,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)
    throw Error('G2_FIVE_SEARCH_RESEARCH_ONLY')
  const [checkpoint,publicIndex]=await Promise.all([
    readFile(checkpointPath,'utf8').then(JSON.parse),
    loadPublicMovieHubIndex(),
  ])
  planFiveYoutubeSearches({checkpoint,publicIndex}) // fail before Secret Manager
  if(typeof token!=='string'||token.length<15)
    throw Error('G2_FIVE_SEARCH_TMDB_TOKEN_MISSING')
  const key=youtubeKey||getSecret()
  await mkdir(output,{recursive:true})
  const onProgress=async partial=>{
    await writeFile(output+'/qa.private.json',
      JSON.stringify(partial,null,2)+'\n',{mode:0o600})
    await writeFile(output+'/summary.json',
      JSON.stringify({...partial.summary,complete:false},null,2)+'\n',{mode:0o600})
  }
  const result=await researchFiveYouTubeMovies({checkpoint,publicIndex,
    tmdbGet:(p,q)=>tmdbLive(p,q,token),
    youtubeApi:(p,q)=>youtubeGet(p,q,key),
    onProgress})
  await onProgress(result)
  await writeFile(output+'/summary.json',
    JSON.stringify({...result.summary,complete:true},null,2)+'\n',{mode:0o600})
  // No IDs, raw results, API keys or watch URLs in Actions logs.
  console.log(JSON.stringify({...result.summary,complete:true}))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  liveFiveSearchBatch().catch(e=>{
    // Failed Google requests remain spent pessimistically. Never retry.
    console.error('G2 FIVE SEARCH STOPPED: '+String(e?.message||'unknown').slice(0,180))
    process.exitCode=1
  })
}
