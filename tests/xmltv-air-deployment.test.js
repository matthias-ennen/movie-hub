import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareXmltvAirDeployment, verifyXmltvAirDeployment } from '../scripts/xmltv-air-deployment.mjs'
import { AIR_MANIFEST_PATH, AIR_HOST, buildXmltvAirPublication } from '../scripts/xmltv-air-publication.mjs'
import { planXmltvAirSourceFiles } from '../scripts/xmltv-air-release-plan.mjs'

const now=Date.parse('2026-11-16T00:00:00Z')
const catalog={titles:[{source:'tmdb',type:'movie',mediaType:'movie',tmdbId:42,title:'Canonical',metadataVersion:3,metadataComplete:true,collectionChecked:true,
  metadataChecks:{details:'present',artwork:'present',ageRating:'absent',credits:'present',keywords:'absent',videos:'absent',providers:'absent',collection:'absent'},tmdbProviderIds:[]}]}
const event={kind:'broadcast',titleRef:{mediaType:'movie',tmdbId:42},channelId:'zdf',channelName:'ZDF',startAt:'2026-11-16T19:00:00Z',endAt:'2026-11-16T21:00:00Z',
  sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ZDF.de|original text'}],extensions:{xmltv:{sourceStationId:'ZDF.de',timestampsExplicitlyZoned:true}}}
const freshFiles=planXmltvAirSourceFiles({confirmedEvents:[event],catalog,now}).files
const publication=()=>buildXmltvAirPublication({freshFiles,catalog,now})
const host=entries=>async url=>new Response(entries[url.slice(AIR_HOST.length+1)]??'',{status:Object.hasOwn(entries,url.slice(AIR_HOST.length+1))?200:404,headers:{'content-type':'application/json'}})
async function workspace(fn){
  const root=await mkdtemp(join(tmpdir(),'air-deploy-'))
  try{await mkdir(join(root,'public'));return await fn(root)}finally{await rm(root,{recursive:true,force:true})}
}
describe('AIR deployment boundary',()=>{
  it('seeds an empty manifest while disabled without any AIR files, API call or handoff',()=>workspace(async root=>{
    const result=await prepareXmltvAirDeployment({root,enabled:false,now,fetchImpl:()=>{throw Error('unexpected HTTP')}})
    expect(result.stations).toBe(0)
    const manifest=JSON.parse(await readFile(join(root,'public',AIR_MANIFEST_PATH),'utf8'))
    expect(manifest.stations).toEqual([])
    await cp(join(root,'public'),join(root,'dist'),{recursive:true})
    expect(await verifyXmltvAirDeployment({directory:join(root,'public'),dist:join(root,'dist'),prepared:true})).toEqual({stations:0})
  }))
  it('retains a valid available source on code-only deployment and verifies exact hosted files',()=>workspace(async root=>{
    await writeFile(join(root,'public/catalog.json'),JSON.stringify(catalog))
    const source=publication(),fetchImpl=host(source.entries)
    const result=await prepareXmltvAirDeployment({root,enabled:true,env:{},now:now+3600000,fetchImpl})
    expect(result.retainedStations).toBe(1)
    expect(result.freshStations).toBe(0)
    expect(await verifyXmltvAirDeployment({directory:join(root,'public'),fetchImpl})).toEqual({stations:1})
  }))
  it('blocks missing hosted data rather than generating an empty replacement',()=>workspace(async root=>{
    await writeFile(join(root,'public/catalog.json'),JSON.stringify(catalog))
    await expect(prepareXmltvAirDeployment({root,enabled:true,env:{},now,fetchImpl:host({})})).rejects.toThrow(/size/)
  }))
})
