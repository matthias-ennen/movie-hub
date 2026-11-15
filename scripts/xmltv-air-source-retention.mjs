/** #336: reconcile validated AIR station catalogs across ordinary deployments.
 * A fresh station replaces its old generation. An absent station retains only
 * still-current, exact canonical broadcasts from its last valid generation. */
import { XMLTV_AIR_ROUTE_CANDIDATES, XMLTV_AIR_DEVICE_APPROVALS, isExactXmltvAirAiring } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { normalizePlaybackRoute } from '../src/sources/sourceAdapterContract.js'
import { canonicalXmltvMetadata } from './execute-title-priority-queue.mjs'
import { tvRuntimeTitleKey } from '../src/tv/tvRuntimePublication.js'
import { mergeTvAirings } from '../src/sources/mergeTvAirings.js'

const DAY=86400000
const maxRows=20000
const safeNumber=(v,min)=>Number.isSafeInteger(v)&&v>=min?v:null
const byId=new Map(XMLTV_AIR_ROUTE_CANDIDATES.map(row=>[row.providerId,row]))

function collect(files){
  if(!Array.isArray(files)||files.length>byId.size)throw new Error('Invalid XMLTV source generation')
  const result=new Map()
  for(const file of files){
    if(!byId.has(file?.providerId)||result.has(file.providerId)||file.directory!==file.providerId+'-live'||
      file.index?.providerId!==file.providerId||!Array.isArray(file.titles?.entries)||file.titles.entries.length>maxRows||
      !Number.isFinite(Date.parse(file.index.generatedAt))||typeof file.index.sourceGenerationId!=='string'||
      file.index.sourceGenerationId.length>200)throw new Error('Invalid XMLTV station generation')
    result.set(file.providerId,file)
  }
  return result
}

export function reconcileXmltvAirSources({freshFiles=[],retainedFiles=[],catalog,now=Date.now()}={}){
  if(!Array.isArray(catalog?.titles)||!Number.isFinite(now))throw new TypeError('Invalid canonical AIR context')
  const fresh=collect(freshFiles),retained=collect(retainedFiles)
  const canonical=new Map(),duplicates=new Set()
  for(const value of catalog.titles){
    const key=tvRuntimeTitleKey(value)
    if(!key)continue
    if(canonical.has(key))duplicates.add(key)
    else canonical.set(key,value)
  }
  const files=[],counts={freshStations:0,retainedStations:0,expiredAirings:0,missingCanonicalAirings:0,airings:0}
  let examined=0
  for(const [providerId,station] of byId){
    const source=fresh.get(providerId)||retained.get(providerId)
    if(!source)continue
    const generation=Date.parse(source.index.generatedAt)
    if(generation>now)throw new Error('Future XMLTV station generation')
    if(now-generation>14*DAY)continue
    const receipt=XMLTV_AIR_DEVICE_APPROVALS.find(row=>row.stationId===station.stationId&&row.device==='android'&&row.target===station.target&&row.result==='exact-channel-confirmed'&&row.viaMovieHub)
    if(!receipt||Date.parse(receipt.checkedAt)>now)throw new Error('Unapproved XMLTV station')
    const route=normalizePlaybackRoute({providerId,mode:'WEB_LINK',scope:'channel',target:station.target,
      geoRegion:'DE',requiresAuth:station.requiresAuth,requiresSubscription:station.requiresSubscription,verifiedAt:receipt.checkedAt})
    const entries=[]
    const keys=new Set()
    for(const entry of source.titles.entries){
      const key=tvRuntimeTitleKey(entry)
      if(!key||keys.has(key)||!Array.isArray(entry.airings)||!entry.airings.length||duplicates.has(key))throw new Error('Invalid XMLTV station title')
      keys.add(key)
      const [type,id]=key.split(':'),tmdbId=Number(id)
      const meta=canonicalXmltvMetadata(canonical.get(key),{key,type,tmdbId})
      const airings=[]
      for(const raw of entry.airings){
        if(++examined>maxRows*2)throw new Error('XMLTV source bounds exceeded')
        if(!isExactXmltvAirAiring(raw,providerId)||raw.type!==type||raw.tmdbId!==tmdbId||
          raw.providerIds?.length!==1||raw.providerIds[0]!==providerId)throw new Error('Invalid XMLTV station airing')
        const start=Date.parse(raw.startTime),stop=Date.parse(raw.stopTime)
        if(!Number.isFinite(start)||!Number.isFinite(stop)||stop<=start||start>=generation+14*DAY)throw new Error('Invalid XMLTV airing chronology')
        if(stop<=now){counts.expiredAirings++;continue}
        if(!meta){counts.missingCanonicalAirings++;continue}
        const episode=type==='series'&&raw.episode?{
          seasonNumber:safeNumber(raw.episode.seasonNumber,0),episodeNumber:safeNumber(raw.episode.episodeNumber,1),
          ...(raw.episode.conflict===true?{conflict:true}:{}),title:'',
        }:null
        airings.push({type,tmdbId,stationId:station.stationId,canonicalStationId:station.stationId,stationName:station.label,
          startTime:new Date(start).toISOString(),stopTime:new Date(stop).toISOString(),episode,
          providerIds:[providerId],providerStationIds:{[providerId]:station.stationId},playbackRoutes:[route]})
      }
      const merged=mergeTvAirings(airings)
      if(merged.length)entries.push({type,tmdbId,title:meta.title,tmdbProviderIds:[],airings:merged,nextAiring:merged[0]})
      counts.airings+=merged.length
    }
    if(entries.length){
      counts[fresh.has(providerId)?'freshStations':'retainedStations']++
      files.push({providerId,directory:providerId+'-live',titles:{entries},index:{providerId,
        generatedAt:source.index.generatedAt,sourceGenerationId:source.index.sourceGenerationId}})
    }
  }
  return {files,counts}
}
