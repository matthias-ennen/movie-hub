import { describe, expect, it } from 'vitest'
import { buildXmltvAirPublication, readXmltvAirPublication, fetchXmltvAirPublication, AIR_MANIFEST_PATH, AIR_HOST } from '../scripts/xmltv-air-publication.mjs'
import { planXmltvAirSourceFiles } from '../scripts/xmltv-air-release-plan.mjs'

const now=Date.parse('2026-11-16T00:00:00Z')
const catalog={titles:[{source:'tmdb',type:'movie',mediaType:'movie',tmdbId:42,title:'Canonical',metadataVersion:3,metadataComplete:true,collectionChecked:true,
  metadataChecks:{details:'present',artwork:'present',ageRating:'absent',credits:'present',keywords:'absent',videos:'absent',providers:'absent',collection:'absent'},tmdbProviderIds:[]}]}
const event={kind:'broadcast',titleRef:{mediaType:'movie',tmdbId:42},channelId:'zdf',channelName:'ZDF',startAt:'2026-11-16T19:00:00Z',endAt:'2026-11-16T21:00:00Z',
  sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ZDF.de|original text'}],extensions:{xmltv:{sourceStationId:'ZDF.de',timestampsExplicitlyZoned:true}}}
const freshFiles=planXmltvAirSourceFiles({confirmedEvents:[event],catalog,now}).files
const publication=()=>buildXmltvAirPublication({freshFiles,catalog,now})

describe('manifest-bound AIR publication',()=>{
  it('restores exact station files using only the reviewed paths and keeps the old generation',async()=>{
    const source=publication(),calls=[]
    const restored=await readXmltvAirPublication({read:async path=>{calls.push(path);return source.entries[path]??null}})
    expect(calls.sort()).toEqual([AIR_MANIFEST_PATH,'air-zdf-live/index.json','air-zdf-live/titles.json'].sort())
    const rebuilt=buildXmltvAirPublication({retainedFiles:restored.files,catalog,now:now+3600000})
    expect(rebuilt.entries).toEqual(source.entries)
    expect(JSON.stringify(source)).not.toContain('original text')
  })
  it('rejects broken station bytes or missing files instead of silently publishing an empty station',async()=>{
    const source=publication();source.entries['air-zdf-live/titles.json']+=' '
    await expect(readXmltvAirPublication({read:async path=>source.entries[path]??null})).rejects.toThrow(/station mismatch/)
    delete source.entries['air-zdf-live/titles.json']
    await expect(readXmltvAirPublication({read:async path=>source.entries[path]??null})).rejects.toThrow(/size/)
  })
  it('rejects unknown or repeated manifest providers before requesting their files',async()=>{
    const source=publication(),calls=[]
    source.manifest.stations[0].providerId='../../arbitrary'
    await expect(readXmltvAirPublication({read:async path=>{calls.push(path);return JSON.stringify(source.manifest)}})).rejects.toThrow(/manifest station/)
    expect(calls).toEqual([AIR_MANIFEST_PATH])
  })
  it('distinguishes a first-release 404 from a missing routine manifest and a legitimate empty generation',async()=>{
    const read=async()=>null
    expect(await readXmltvAirPublication({read,manifestMayBeAbsent:true})).toEqual({manifest:null,files:[]})
    await expect(readXmltvAirPublication({read})).rejects.toThrow(/size/)
    const empty=buildXmltvAirPublication({catalog,now})
    expect((await readXmltvAirPublication({read:async path=>empty.entries[path]})).files).toEqual([])
  })
  it('verifies hosted bytes and rejects an SPA HTML response in place of JSON',async()=>{
    const source=publication()
    const fetchImpl=async url=>new Response(source.entries[url.slice(AIR_HOST.length+1)],{headers:{'content-type':'application/json'}})
    expect((await fetchXmltvAirPublication({fetchImpl})).manifest).toEqual(source.manifest)
    await expect(fetchXmltvAirPublication({fetchImpl:async()=>new Response('<html>',{headers:{'content-type':'text/html'}})})).rejects.toThrow(/unavailable/)
  })
})
