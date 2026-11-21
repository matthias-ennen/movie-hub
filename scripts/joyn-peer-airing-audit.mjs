/** #885: counts-only, same-broadcast Joyn/Waipu shadow diagnostic.
 * Never changes a matcher decision, cache, title, episode or playback route.
 */
import { exactTitleKey } from './tmdb-title-evidence.mjs'

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

export function buildJoynWaipuPeerIndex({stationMapping,waipuTitles,waipuIndex,now=Date.now()}={}){
  if(!Array.isArray(stationMapping?.entries)||stationMapping.entries.length>1000||
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
    const aliases=new Set([entry?.title,entry?.originalTitle].map(exactTitleKey).filter(Boolean))
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
      buckets.get(bucket).push({...t,type,tmdbId,aliases,year:year(entry.year),
        seasonNumber:airing.seasonNumber,episodeNumber:airing.episodeNumber})
    }
  }
  if(airings!==waipuIndex.counts?.broadcasts)return {status:'unavailable'}
  return {status:'ready',stations,find(station,start,end){
    const t=timing(start,end)
    if(!t||t.end<=now||!stations.has(station))return []
    const buckets=indexed.get(station),bucket=Math.floor(t.start/WINDOW)
    return [-1,0,1].flatMap(delta=>buckets?.get(bucket+delta)??[]).filter(p=>overlaps(t,p))
  }}
}

export function auditJoynWaipuPeerAirings({unresolvedPrograms,matchedPrograms=[],stationMapping,waipuTitles,waipuIndex,now=Date.now()}={}){
  if(!Array.isArray(unresolvedPrograms)||unresolvedPrograms.length>200000||
    !Array.isArray(matchedPrograms)||unresolvedPrograms.length+matchedPrograms.length>200000)throw new Error('JOYN_PEER_AUDIT_INPUT')
  const index=buildJoynWaipuPeerIndex({stationMapping,waipuTitles,waipuIndex,now})
  if(index.status!=='ready')return {status:'unavailable'}
  const {stations}=index
  const counts={unresolved:unresolvedPrograms.length,untyped:0,reviewedStation:0,
    stationUnavailable:0,invalidTimingOrTitle:0,noTimeOverlap:0,timeOverlap:0,ambiguousSlot:0,
    typeConflict:0,yearConflict:0,nonExactTitle:0,candidateMovie:0,candidateSeries:0,candidateUntyped:0,
    candidateWithLocalAgreement:0,candidateWithCompetingLocalIdentity:0,candidateWithoutLocalExact:0}
  // Same selection predicates for known and unknown identities. Positive
  // agreement is a consistency check, not an independent ground-truth proof.
  const reference={total:matchedPrograms.length,reviewedStation:0,stationUnavailable:0,invalidTimingOrTitle:0,
    noTimeOverlap:0,timeOverlap:0,ambiguousSlot:0,typeConflict:0,yearConflict:0,nonExactTitle:0,
    eligible:0,agree:0,disagree:0,invalidKnownIdentity:0}
  function select(row,result){
    const classification=row?.joynClassification??{},type=typeOf(classification.type)
    // Original Joyn diagnostic.channelId is the reviewed canonical station ID if mapped.
    if(!stations.has(row?.channelId)){result.stationUnavailable++;return null}
    result.reviewedStation++
    const t=timing(row.startTime,row.endTime),title=exactTitleKey(row.title)
    if(!t||t.end<=now||!title){result.invalidTimingOrTitle++;return null}
    const matches=index.find(row.channelId,row.startTime,row.endTime)
    if(!matches.length){result.noTimeOverlap++;return null}
    result.timeOverlap++
    if(new Set(matches.map(idOf)).size!==1){result.ambiguousSlot++;return null}
    const exact=matches.filter(p=>p.aliases.has(title))
    if(!exact.length){result.nonExactTitle++;return null}
    const peer=exact[0]
    if(validType(type)&&type!==peer.type){result.typeConflict++;return null}
    const years=exact.map(p=>p.year).filter(Boolean),requestedYears=trustedProductionYears(classification)
    if(peer.type==='movie'&&((years.length>1&&Math.max(...years)-Math.min(...years)>1)||
      requestedYears.some(y=>years.some(p=>Math.abs(p-y)>1)))){result.yearConflict++;return null}
    return peer
  }
  for(const row of unresolvedPrograms){
    const type=typeOf(row?.joynClassification?.type)
    if(!validType(type))counts.untyped++
    const peer=select(row,counts)
    if(!peer)continue
    counts[peer.type==='movie'?'candidateMovie':'candidateSeries']++
    if(!validType(type))counts.candidateUntyped++
    const title=exactTitleKey(row.title)
    const localExact=(Array.isArray(row.localCandidates)?row.localCandidates:[]).filter(c=>
      validType(typeOf(c?.type))&&Number.isSafeInteger(c.tmdbId)&&c.tmdbId>0&&
      [c.title,c.originalTitle].map(exactTitleKey).includes(title))
    const keys=new Set(localExact.map(c=>idOf({...c,type:typeOf(c.type)})))
    if([...keys].some(k=>k!==idOf(peer)))counts.candidateWithCompetingLocalIdentity++
    else if(keys.has(idOf(peer)))counts.candidateWithLocalAgreement++
    else counts.candidateWithoutLocalExact++
  }
  for(const row of matchedPrograms){
    const known=row?.decision?.match, type=typeOf(known?.type)
    if(row?.decision?.status!=='matched'||!validType(type)||!Number.isSafeInteger(known.tmdbId)||known.tmdbId<=0){reference.invalidKnownIdentity++;continue}
    const peer=select(row,reference)
    if(!peer)continue
    reference.eligible++
    if(idOf({...known,type})===idOf(peer))reference.agree++
    else reference.disagree++
  }
  return {status:'ready',...counts,positiveReference:reference}
}
