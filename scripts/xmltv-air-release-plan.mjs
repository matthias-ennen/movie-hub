/** #336: plan the exact AIR source files from the already enriched canonical
 * catalog. Private only; never writes files or enables public discovery. */
import { buildPrivateXmltvAirRuntimePreview } from './xmltv-g3-private-air-runtime-preview.mjs'
import { XMLTV_AIR_DIRECT_LINK_APPROVALS, XMLTV_AIR_DEVICE_APPROVALS, createXmltvAirRouteRegistry } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { canonicalXmltvMetadata } from './execute-title-priority-queue.mjs'
import { tvRuntimeTitleKey } from '../src/tv/tvRuntimePublication.js'

export function planXmltvAirSourceFiles({ confirmedEvents, catalog, now=Date.now() }={}) {
  if (!Array.isArray(confirmedEvents) || confirmedEvents.length>20000 ||
      !Array.isArray(catalog?.titles) || !Number.isFinite(now)) throw new TypeError('Invalid XMLTV release input')
  const registry=createXmltvAirRouteRegistry({deviceReceipts:XMLTV_AIR_DEVICE_APPROVALS,directLinkApprovals:XMLTV_AIR_DIRECT_LINK_APPROVALS,now})
  const events=confirmedEvents.filter(event=>{
    const start=Date.parse(event?.startAt), end=Date.parse(event?.endAt)
    return Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end>now&&start<now+14*86400000&&
      registry.fieldsForEvent(event).providerIds.length===1
  })
  const needed=new Set(events.map(event=>tvRuntimeTitleKey(event.titleRef)))
  const complete=new Map(), seen=new Set()
  for(const value of catalog.titles){
    const key=tvRuntimeTitleKey(value)
    if(!needed.has(key)) continue
    if(seen.has(key)) throw new Error('Duplicate XMLTV canonical catalog identity')
    seen.add(key)
    const [type,id]=key.split(':')
    const safe=canonicalXmltvMetadata(value,{key,type,tmdbId:Number(id)})
    if(safe) complete.set(key,safe)
  }
  // XMLTV episode labels are original feed text, not TMDB metadata. Only
  // numeric evidence and conflict state may enter the source-file plan; the
  // existing season resolver can independently supply canonical episode names.
  const safeEvents=events.map(event=>{
    const episode=event.episode
    const validNumber=(value,minimum)=>Number.isSafeInteger(value)&&value>=minimum?value:null
    return {...event,episode:episode?{
      seasonNumber:validNumber(episode.seasonNumber,0),
      episodeNumber:validNumber(episode.episodeNumber,1),
      ...(episode.conflict===true?{conflict:true}:{}),
    }:null}
  })
  const preview=buildPrivateXmltvAirRuntimePreview({confirmedEvents:safeEvents,
    catalog:{titles:[...complete.values()]},now,fieldsForEvent:registry.fieldsForEvent})
  const files=preview.sourceCatalogs.map(({providerId,generatedAt,sourceGenerationId,entries})=>({
    providerId, directory:providerId+'-live',
    titles:{entries}, index:{providerId,generatedAt,sourceGenerationId},
  }))
  return {files, counts:{received:confirmedEvents.length,eligible:events.length,
    completeUniqueTitles:complete.size,pendingUniqueTitles:needed.size-complete.size,
    projected:preview.counts.projected,unresolved:preview.counts.missingCatalogTitle,
    deduplicated:preview.counts.deduplicated}}
}
