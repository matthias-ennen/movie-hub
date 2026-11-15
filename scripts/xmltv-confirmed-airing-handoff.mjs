/** #336: minimal runner-local verified XMLTV -> canonical queue / AIR handoff.
 * Never includes feed titles, descriptions, raw programme IDs or raw XML. */
import { createHash } from 'node:crypto'
import { createXmltvAirRouteRegistry, XMLTV_AIR_DEVICE_APPROVALS } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { reviewedXmltvStation } from '../src/sources/xmltv/xmltvStationMappings.js'
import { deriveXmltvCanonicalTitleRefs } from './xmltv-canonical-title-handoff.mjs'

const maxRows=20000
const day=86400000
const objectKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join('|')===[...keys].sort().join('|')
const validNumber=(value,minimum)=>Number.isSafeInteger(value)&&value>=minimum

/** Project only evidence required for subsequent exact station checks. */
export function buildConfirmedAiringHandoff(events,{now=Date.now()}={}) {
  if(!Array.isArray(events)||events.length>maxRows||!Number.isFinite(now)) throw new TypeError('Invalid XMLTV handoff input')
  const registry=createXmltvAirRouteRegistry({deviceReceipts:XMLTV_AIR_DEVICE_APPROVALS,now})
  const rows=[]
  for(const event of events){
    const start=Date.parse(event?.startAt),end=Date.parse(event?.endAt)
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end<=now||start>=now+14*day||
      registry.fieldsForEvent(event).providerIds.length!==1||!validNumber(event.titleRef.tmdbId,1)) continue
    const rawStation=event.extensions.xmltv.sourceStationId
    const ref=event.sourceRefs.find(r=>typeof r?.sourceId==='string'&&r.sourceId.startsWith('xmltv:')&&
      typeof r.externalId==='string'&&r.externalId.startsWith(rawStation+'|')&&
      reviewedXmltvStation(r.sourceId.slice(6),rawStation)?.stationId===event.channelId)
    if(!ref) continue
    const episode=event.titleRef.mediaType==='series'&&event.episode?{
      seasonNumber:validNumber(event.episode.seasonNumber,0)?event.episode.seasonNumber:null,
      episodeNumber:validNumber(event.episode.episodeNumber,1)?event.episode.episodeNumber:null,
      conflict:event.episode.conflict===true,
    }:null
    rows.push({type:event.titleRef.mediaType,tmdbId:event.titleRef.tmdbId,stationId:event.channelId,
      sourceId:ref.sourceId.slice(6),rawStation,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),
      evidenceDigest:createHash('sha256').update(ref.externalId).digest('hex'),episode})
  }
  return {kind:'xmltv-confirmed-airing-handoff',version:1,generatedAt:new Date(now).toISOString(),rows}
}

/** Read only the minimal exact same-run projection; independently re-check
 * route and station evidence. Cannot treat a different source or type as valid.
 * Caller must still enforce the private file and current workflow identity. */
export function readConfirmedAiringHandoff(payload,{now=Date.now()}={}){
  if(!Number.isFinite(now)||!objectKeys(payload,['kind','version','generatedAt','rows'])||
    payload.kind!=='xmltv-confirmed-airing-handoff'||payload.version!==1||!Array.isArray(payload.rows)||payload.rows.length>maxRows||
    !Number.isFinite(Date.parse(payload.generatedAt))||Date.parse(payload.generatedAt)>now||now-Date.parse(payload.generatedAt)>24*60*60*1000)
    throw new Error('Invalid or stale XMLTV handoff')
  const registry=createXmltvAirRouteRegistry({deviceReceipts:XMLTV_AIR_DEVICE_APPROVALS,now})
  const events=[]
  for(const row of payload.rows){
    if(!objectKeys(row,['type','tmdbId','stationId','sourceId','rawStation','startAt','endAt','evidenceDigest','episode'])||
      !['movie','series'].includes(row.type)||!validNumber(row.tmdbId,1)||!/^[a-f0-9]{64}$/.test(row.evidenceDigest)||
      typeof row.sourceId!=='string'||typeof row.rawStation!=='string'||
      (row.episode!==null&&(row.type!=='series'||!objectKeys(row.episode,['seasonNumber','episodeNumber','conflict'])||
        typeof row.episode.conflict!=='boolean'||(row.episode.seasonNumber!==null&&!validNumber(row.episode.seasonNumber,0))||
        (row.episode.episodeNumber!==null&&!validNumber(row.episode.episodeNumber,1))))) throw new Error('Invalid XMLTV handoff row')
    const station=reviewedXmltvStation(row.sourceId,row.rawStation)
    const start=Date.parse(row.startAt),end=Date.parse(row.endAt)
    if(!station||station.stationId!==row.stationId||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
      start>=Date.parse(payload.generatedAt)+14*day) throw new Error('Invalid XMLTV handoff evidence')
    const event={kind:'broadcast',titleRef:{mediaType:row.type,tmdbId:row.tmdbId},channelId:station.stationId,
      channelName:station.stationName,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),episode:row.episode,
      sourceRefs:[{sourceId:'xmltv:'+row.sourceId,externalId:row.rawStation+'|handoff-sha256:'+row.evidenceDigest}],
      extensions:{xmltv:{sourceStationId:row.rawStation,timestampsExplicitlyZoned:true}}}
    if(registry.fieldsForEvent(event).providerIds.length!==1) throw new Error('Invalid XMLTV handoff route')
    if(end>now) events.push(event)
  }
  return {events,titleRefs:deriveXmltvCanonicalTitleRefs(events,{now})}
}
