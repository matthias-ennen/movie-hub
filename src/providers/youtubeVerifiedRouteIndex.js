import { normalizeSourceEnvelope } from '../sources/sourceAdapterContract.js'

export const YOUTUBE_VERIFIED_ROUTE_INDEX_KIND='moviehub-youtube-verified-title-routes'
export const YOUTUBE_VERIFIED_ROUTE_INDEX_VERSION=1
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/
const TYPE=new Set(['free','ads','flatrate','rent','buy'])
const MAX_AGE_DAYS=30
const referenceKey=(type,tmdbId)=>
  (type==='movie'||type==='series') && Number.isInteger(Number(tmdbId)) && Number(tmdbId)>0
    ? type+':'+Number(tmdbId):null
const watchUrl=id=>'https://www.youtube.com/watch?v='+id

/** Publish ONLY independently verified canonical YouTube availabilities.
 * Review-only candidates and playlist editorial offer hints never pass.
 */
export function buildYoutubeVerifiedRouteIndex(envelope=null,{
  now=new Date().toISOString(),
}={}){
  const ms=Date.parse(now)
  if(!Number.isFinite(ms))throw Error('YOUTUBE_INDEX_TIME_INVALID')
  const empty={schemaVersion:YOUTUBE_VERIFIED_ROUTE_INDEX_VERSION,
    kind:YOUTUBE_VERIFIED_ROUTE_INDEX_KIND,generatedAt:new Date(ms).toISOString(),
    providerId:'youtube',count:0,entries:[]}
  if(envelope===null)return empty
  const source=normalizeSourceEnvelope(envelope)
  if(source.sourceId!=='youtube'||source.sourceStatus!=='healthy'
    ||Date.parse(source.generatedAt)>ms+60000
    ||Date.parse(source.generatedAt)<ms-MAX_AGE_DAYS*86400000) {
    throw Error('YOUTUBE_VERIFIED_SOURCE_UNTRUSTED_OR_STALE')
  }
  const entries=new Map()
  for(const record of source.records){
    if(record.kind!=='availability' ||record.providerId!=='youtube'
      ||record.region!=='DE'||!TYPE.has(record.accessType)
      ||!record.validUntil||Date.parse(record.validUntil)<=ms
      ||record.matchReason!=='independently-verified-video-work-offer')continue
    const key=referenceKey(record.titleRef?.mediaType,record.titleRef?.tmdbId)
    const src=record.sourceRefs?.find(ref=>ref.sourceId==='youtube'
      && VIDEO_ID.test(String(ref.externalId||''))
      && Date.parse(ref.observedAt)<=ms+60000
      && (!ref.expiresAt||Date.parse(ref.expiresAt)>ms))
    const route=record.playbackRoutes?.find(r=>r.providerId==='youtube'
      && r.mode==='APP_DEEP_LINK' && r.scope==='title'
      && r.geoRegion==='DE' && r.target===watchUrl(src?.externalId)
      && Number.isFinite(Date.parse(r.verifiedAt))
      && Date.parse(r.verifiedAt)<=ms+60000
      && Date.parse(r.verifiedAt)>=ms-MAX_AGE_DAYS*86400000)
    if(!key||!src||!route)continue
    const value={
      key,tmdbId:record.titleRef.tmdbId,mediaType:record.titleRef.mediaType,
      verifiedVideoId:src.externalId,
      accessType:record.accessType,
      target:route.target,verifiedAt:route.verifiedAt,
      validUntil:record.validUntil,
    }
    const prior=entries.get(key)
    // One conflicting rendition is not proof of a deterministic best route.
    if(prior && prior.verifiedVideoId!==value.verifiedVideoId){
      entries.set(key,null)
      continue
    }
    if(!entries.has(key)) entries.set(key,value)
  }
  const safe=[...entries.values()].filter(Boolean)
    .sort((a,b)=>a.key.localeCompare(b.key))
  return {...empty,count:safe.length,entries:safe}
}
/** A verified link can only improve an EXISTING YouTube badge click.
 * Returning null intentionally retains the title-search fallback.
 */
export function selectYoutubeVerifiedTitleRoute(index,item,{
  now=Date.now(),hasYoutubeBadge=false,
}={}){
  if(!hasYoutubeBadge||index?.kind!==YOUTUBE_VERIFIED_ROUTE_INDEX_KIND
    ||index.schemaVersion!==YOUTUBE_VERIFIED_ROUTE_INDEX_VERSION
    ||index.providerId!=='youtube'||!Array.isArray(index.entries)
    ||index.count!==index.entries.length)return null
  const nowMs=Number(now)
  const key=referenceKey(item?.type,item?.tmdbId)
  if(!key||!Number.isFinite(nowMs))return null
  const matches=index.entries.filter(r=>r?.key===key)
  if(matches.length!==1)return null
  const e=matches[0]
  if(e.mediaType!==item.type||Number(e.tmdbId)!==Number(item.tmdbId)
    ||!TYPE.has(e.accessType)||!VIDEO_ID.test(String(e.verifiedVideoId))
    ||e.target!==watchUrl(e.verifiedVideoId)
    ||!Number.isFinite(Date.parse(e.verifiedAt))
    ||Date.parse(e.verifiedAt)>nowMs+60000
    ||Date.parse(e.verifiedAt)<nowMs-MAX_AGE_DAYS*86400000
    ||!Number.isFinite(Date.parse(e.validUntil))
    ||Date.parse(e.validUntil)<=nowMs)return null
  return {providerId:'youtube',mode:'APP_DEEP_LINK',
    scope:'title',target:e.target,verifiedAt:e.verifiedAt,geoRegion:'DE'}
}
