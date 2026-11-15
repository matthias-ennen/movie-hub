/** #336: manifest-bound station generations for restore and publication checks.
 * Only fixed, reviewed station paths are ever read. The release flag remains
 * independent of this transport and its tests. */
import { createHash } from 'node:crypto'
import { XMLTV_AIR_ROUTE_CANDIDATES } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { reconcileXmltvAirSources } from './xmltv-air-source-retention.mjs'

export const AIR_MANIFEST_PATH='xmltv-air/index.json'
export const AIR_HOST='https://movie-hub-62459.web.app'
const ids=new Set(XMLTV_AIR_ROUTE_CANDIDATES.map(x=>x.providerId))
const MAX_FILE=16*1024*1024
const MAX_MANIFEST=32*1024
const hash=value=>createHash('sha256').update(value).digest('hex')
const serialize=value=>JSON.stringify(value)+'\n'
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===keys.sort().join('|')
const validDigest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
function parseBytes(bytes,max){
  if(typeof bytes!=='string'||Buffer.byteLength(bytes)<1||Buffer.byteLength(bytes)>max)throw new Error('Invalid AIR publication size')
  return JSON.parse(bytes)
}

export function buildXmltvAirPublication(input){
  const {files,counts}=reconcileXmltvAirSources(input)
  const entries={}
  const stations=files.map(file=>{
    const index=serialize(file.index),titles=serialize(file.titles)
    if(Buffer.byteLength(titles)>MAX_FILE)throw new Error('AIR station publication exceeds size limit')
    entries[file.directory+'/index.json']=index
    entries[file.directory+'/titles.json']=titles
    return {providerId:file.providerId,indexSha256:hash(index),titlesSha256:hash(titles)}
  })
  const manifest={kind:'xmltv-air-publication',schemaVersion:1,stations}
  entries[AIR_MANIFEST_PATH]=serialize(manifest)
  return {entries,manifest,counts}
}

export function parseXmltvAirManifest(bytes){
  const manifest=parseBytes(bytes,MAX_MANIFEST)
  if(!exactKeys(manifest,['kind','schemaVersion','stations'])||manifest.kind!=='xmltv-air-publication'||manifest.schemaVersion!==1||
    !Array.isArray(manifest.stations)||manifest.stations.length>ids.size)throw new Error('Invalid AIR publication manifest')
  const seen=new Set()
  for(const row of manifest.stations){
    if(!exactKeys(row,['providerId','indexSha256','titlesSha256'])||!ids.has(row.providerId)||seen.has(row.providerId)||
      !validDigest(row.indexSha256)||!validDigest(row.titlesSha256))throw new Error('Invalid AIR manifest station')
    seen.add(row.providerId)
  }
  return manifest
}

/** A missing or broken station is not an empty generation. Reject that
 * restore so callers can prevent destructive deployment. A manifest 404 is
 * only allowed on explicit first release, never on a routine deployment. */
export async function readXmltvAirPublication({read,manifestMayBeAbsent=false}={}){
  const bytes=await read(AIR_MANIFEST_PATH,MAX_MANIFEST)
  if(bytes===null&&manifestMayBeAbsent)return {manifest:null,files:[]}
  const manifest=parseXmltvAirManifest(bytes)
  const files=await Promise.all(manifest.stations.map(async row=>{
    const directory=row.providerId+'-live'
    const [indexBytes,titlesBytes]=await Promise.all([read(directory+'/index.json',MAX_MANIFEST),read(directory+'/titles.json',MAX_FILE)])
    const index=parseBytes(indexBytes,MAX_MANIFEST),titles=parseBytes(titlesBytes,MAX_FILE)
    if(hash(indexBytes)!==row.indexSha256||hash(titlesBytes)!==row.titlesSha256||index?.providerId!==row.providerId||!Array.isArray(titles?.entries))
      throw new Error('AIR publication station mismatch')
    return {providerId:row.providerId,directory,index,titles}
  }))
  return {manifest,files}
}

export async function fetchXmltvAirPublication({fetchImpl=fetch,manifestMayBeAbsent=false}={}){
  return readXmltvAirPublication({manifestMayBeAbsent,read:async(path,max)=>{
    const response=await fetchImpl(AIR_HOST+'/'+path,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000),headers:{accept:'application/json'}})
    if(response.status===404)return null
    if(!response.ok||!/^application\/json\b/i.test(response.headers.get('content-type')||'')||Number(response.headers.get('content-length')||0)>max)
      throw new Error('AIR hosted publication unavailable')
    const reader=response.body?.getReader()
    if(!reader)throw new Error('AIR hosted publication has no body')
    const chunks=[];let size=0
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new Error('AIR hosted publication exceeds size limit');chunks.push(Buffer.from(value))}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
    return Buffer.concat(chunks).toString('utf8')
  }})
}
