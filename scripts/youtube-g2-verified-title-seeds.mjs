/**
 * Positive independently verified YouTube offers -> existing canonical
 * TMDB title inventory. The YouTube adapter never publishes a second film
 * catalog. This file carries only titleRef identities, not playback routes,
 * not candidate-match guesses or user/profile data.
 */
import {normalizeSourceEnvelope} from '../src/sources/sourceAdapterContract.js'

export const YOUTUBE_VERIFIED_SEEDS_KIND='moviehub-youtube-verified-title-seeds'
export const YOUTUBE_VERIFIED_SEEDS_VERSION=1

export function buildYoutubeVerifiedTitleSeeds(sourceEnvelope,{
  now=new Date().toISOString(),
}={}){
  const timestamp=Date.parse(now)
  if(!Number.isFinite(timestamp))throw Error('YOUTUBE_VERIFIED_SEEDS_DATE_INVALID')
  const envelope=normalizeSourceEnvelope(sourceEnvelope)
  if(envelope.sourceId!=='youtube'||!['healthy','degraded'].includes(envelope.sourceStatus)
    ||Date.parse(envelope.generatedAt)>timestamp+60000
    ||Date.parse(envelope.generatedAt)<timestamp-86400000)
    throw Error('YOUTUBE_VERIFIED_SEEDS_SOURCE_STALE_OR_INVALID')
  const map=new Map()
  let ignoredSeries=0
  for(const record of envelope.records){
    if(record.kind!=='availability'||record.providerId!=='youtube'
      ||record.region!=='DE'||record.matchReason!=='independently-verified-video-work-offer'
      ||!record.validUntil||Date.parse(record.validUntil)<=timestamp
      ||!record.playbackRoutes.some(r=>r.providerId==='youtube'
        &&r.mode==='APP_DEEP_LINK'&&r.scope==='title'
        &&r.geoRegion==='DE'&&r.target?.startsWith('https://www.youtube.com/watch?v=')))continue
    if(record.titleRef.mediaType==='series'){ignoredSeries++;continue}
    if(record.titleRef.mediaType!=='movie')continue
    const tmdbId=Number(record.titleRef.tmdbId)
    if(!Number.isInteger(tmdbId)||tmdbId<=0)continue
    const key='movie:'+tmdbId
    if(!map.has(key)){
      map.set(key,{
        id:'tmdb-movie-'+tmdbId,tmdbId,type:'movie',
        source:'youtube-curated',
        verifiedYoutubeTitleSeed:true,
      })
    }
  }
  const entries=[...map.values()].sort((a,b)=>a.tmdbId-b.tmdbId)
  return {
    kind:YOUTUBE_VERIFIED_SEEDS_KIND,
    schemaVersion:YOUTUBE_VERIFIED_SEEDS_VERSION,
    sourceId:'youtube',
    generatedAt:new Date(timestamp).toISOString(),
    verifiedSourceGenerationId:envelope.sourceGenerationId,
    count:entries.length,
    deferredSeriesAvailabilities:ignoredSeries,
    entries,
  }
}

export function readVerifiedYoutubeTitleSeeds(input){
  if(input==null||Object.keys(input).length===0)return []
  if(input.kind!==YOUTUBE_VERIFIED_SEEDS_KIND
    ||input.schemaVersion!==YOUTUBE_VERIFIED_SEEDS_VERSION
    ||input.sourceId!=='youtube'
    ||!Array.isArray(input.entries)
    ||input.count!==input.entries.length||input.entries.length>500
    ||!Number.isFinite(Date.parse(input.generatedAt))
    ||!input.entries.every(e=>
      e.type==='movie' &&e.source==='youtube-curated'
      &&e.verifiedYoutubeTitleSeed===true
      &&Number.isInteger(e.tmdbId)&&e.tmdbId>0
      &&e.id==='tmdb-movie-'+e.tmdbId)
    ||new Set(input.entries.map(e=>e.tmdbId)).size!==input.entries.length){
    throw Error('YOUTUBE_VERIFIED_SEEDS_INVALID')
  }
  return input.entries
}
