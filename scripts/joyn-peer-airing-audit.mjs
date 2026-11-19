/** #885: counts-only, same-broadcast Joyn/Waipu shadow diagnostic.
 * Never changes a matcher decision, cache, title, episode or playback route.
 */
import { normalizeWaipuText } from './waipu-program-classifier.mjs'

const WINDOW=5*60_000
const MAX_AGE=12*60*60_000
const typeOf=v=>v==='tv'?'series':v
const validType=v=>v==='movie'||v==='series'
const timestamp=v=>typeof v==='string'?Date.parse(v):NaN
const year=v=>Number.isInteger(v)&&v>=1888&&v<=2100?v:null
const idOf=v=>v.type+':'+v.tmdbId

function overlaps(a,b){
  return Math.abs(a.start-b.start)<=WINDOW &&
    Math.min(a.end,b.end)-Math.max(a.start,b.start)>=0.8*Math.max(a.end-a.start,b.end-b.start)
}
function timing(start,end){
  const a=timestamp(start),b=timestamp(end)
  return Number.isFinite(a)&&Number.isFinite(b)&&b>a?{start:a,end:b}:null
}
function trustedProductionYears(classification){
  return [classification?.algoliaBase,classification?.algolia]
    .filter(r=>r?.reason==='validated_algolia_search'&&r.type===classification.type)
    .map(r=>year(r.productionYear)).filter(Boolean)
}

export function auditJoynWaipuPeerAirings({unresolvedPrograms,stationMapping,waipuTitles,waipuIndex,now=Date.now()}={}){
  if(!Array.isArray(unresolvedPrograms)||unresolvedPrograms.length>200000||
    !Array.isArray(stationMapping?.entries)||stationMapping.entries.length>1000||
    !Number.isFinite(now))throw new Error('JOYN_PEER_AUDIT_INPUT')
  const observedAt=timestamp(waipuIndex?.generatedAt)
  if(waipuTitles?.kind!=='waipu-live-titles'||waipuIndex?.kind!=='waipu-live-index'||
    !Number.isFinite(observedAt)||observedAt>now||now-observedAt>=MAX_AGE||
    !Array.isArray(waipuTitles.entries)||!waipuTitles.entries.length||waipuTitles.entries.length>100000||
    waipuTitles.count!==waipuTitles.entries.length||waipuIndex.counts?.titles!==waipuTitles.entries.length)
    return {status:'unavailable'}
  const stations=new Set(stationMapping.entries.filter(s=>s.status==='matched'&&typeof s.canonicalId==='string'&&s.canonicalId).map(s=>s.canonicalId))
  const indexed=new Map()
  let airings=0
  for(const entry of waipuTitles.entries){
    const type=typeOf(entry?.type),tmdbId=entry?.tmdbId
    const aliases=new Set([entry?.title,entry?.originalTitle].map(normalizeWaipuText).filter(Boolean))
    if(!validType(type)||!Number.isSafeInteger(tmdbId)||tmdbId<=0||!aliases.size||!Array.isArray(entry.airings))
      return {status:'unavailable'}
    airings+=entry.airings.length
    if(airings>250000)return {status:'unavailable'}
    for(const airing of entry.airings){
      const t=timing(airing.startTime,airing.stopTime),station=airing.canonicalStationId||airing.stationId
      if(!t||typeof station!=='string'||!station)return {status:'unavailable'}
      if(!stations.has(station)||t.end<=now)continue
      const bucket=Math.floor(t.start/WINDOW)
      if(!indexed.has(station))indexed.set(station,new Map())
      const buckets=indexed.get(station)
      if(!buckets.has(bucket))buckets.set(bucket,[])
      buckets.get(bucket).push({...t,type,tmdbId,aliases,year:year(entry.year)})
    }
  }
  if(airings!==waipuIndex.counts?.broadcasts)return {status:'unavailable'}
  const counts={unresolved:unresolvedPrograms.length,untyped:0,reviewedStation:0,
    stationUnavailable:0,invalidTimingOrTitle:0,noTimeOverlap:0,timeOverlap:0,ambiguousSlot:0,
    typeConflict:0,yearConflict:0,nonExactTitle:0,candidateMovie:0,candidateSeries:0,candidateUntyped:0}
  for(const row of unresolvedPrograms){
    const classification=row?.joynClassification??{},type=typeOf(classification.type)
    if(!validType(type))counts.untyped++
    // Original Joyn diagnostic.channelId is the reviewed canonical station ID if mapped.
    if(!stations.has(row?.channelId)){counts.stationUnavailable++;continue}
    counts.reviewedStation++
    const t=timing(row.startTime,row.endTime),title=normalizeWaipuText(row.title)
    if(!t||t.end<=now||!title){counts.invalidTimingOrTitle++;continue}
    const buckets=indexed.get(row.channelId),bucket=Math.floor(t.start/WINDOW)
    const matches=[-1,0,1].flatMap(delta=>buckets?.get(bucket+delta)??[]).filter(p=>overlaps(t,p))
    if(!matches.length){counts.noTimeOverlap++;continue}
    counts.timeOverlap++
    if(new Set(matches.map(idOf)).size!==1){counts.ambiguousSlot++;continue}
    const exact=matches.filter(p=>p.aliases.has(title))
    if(!exact.length){counts.nonExactTitle++;continue}
    const peer=exact[0]
    if(validType(type)&&type!==peer.type){counts.typeConflict++;continue}
    const years=exact.map(p=>p.year).filter(Boolean),requestedYears=trustedProductionYears(classification)
    if(peer.type==='movie'&&((years.length>1&&Math.max(...years)-Math.min(...years)>1)||
      requestedYears.some(y=>years.some(p=>Math.abs(p-y)>1)))){counts.yearConflict++;continue}
    counts[peer.type==='movie'?'candidateMovie':'candidateSeries']++
    if(!validType(type))counts.candidateUntyped++
  }
  return {status:'ready',...counts}
}
