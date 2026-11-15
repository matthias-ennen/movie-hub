import { describe, expect, it } from 'vitest'
import { planXmltvAirSourceFiles } from '../scripts/xmltv-air-release-plan.mjs'
import { reconcileXmltvAirSources } from '../scripts/xmltv-air-source-retention.mjs'

const now=Date.parse('2026-11-16T00:00:00Z')
const event=(id,startAt='2026-11-16T19:00:00Z',endAt='2026-11-16T21:00:00Z')=>({kind:'broadcast',titleRef:{mediaType:'movie',tmdbId:id},channelId:'zdf',channelName:'ZDF',startAt,endAt,
  sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ZDF.de|private source title'}],extensions:{xmltv:{sourceStationId:'ZDF.de',timestampsExplicitlyZoned:true}}})
const title=id=>({source:'tmdb',type:'movie',mediaType:'movie',tmdbId:id,title:'Canonical '+id,metadataVersion:3,metadataComplete:true,collectionChecked:true,
  metadataChecks:{details:'present',artwork:'present',ageRating:'absent',credits:'present',keywords:'absent',videos:'absent',providers:'absent',collection:'absent'},tmdbProviderIds:[]})
const catalog={titles:[title(42),title(43)]}
const old=()=>planXmltvAirSourceFiles({confirmedEvents:[event(42)],catalog,now}).files

describe('XMLTV station-generation retention',()=>{
  it('retains the valid station on a code-only deploy and updates only canonical title text',()=>{
    const files=old()
    const result=reconcileXmltvAirSources({retainedFiles:files,catalog:{titles:[{...title(42),title:'Updated canonical'}]},now:now+3600000})
    expect(result.counts).toMatchObject({retainedStations:1,freshStations:0,airings:1})
    expect(result.files[0].index).toEqual(files[0].index)
    expect(result.files[0].titles.entries[0].title).toBe('Updated canonical')
    expect(JSON.stringify(result)).not.toContain('private source title')
  })
  it('replaces a station with a fresh generation without resurrecting older airings',()=>{
    const freshFiles=planXmltvAirSourceFiles({confirmedEvents:[event(43)],catalog,now:now+3600000}).files
    const result=reconcileXmltvAirSources({freshFiles,retainedFiles:old(),catalog,now:now+3600000})
    expect(result.counts).toMatchObject({freshStations:1,retainedStations:0,airings:1})
    expect(result.files[0].titles.entries.map(x=>x.tmdbId)).toEqual([43])
  })
  it('removes expired or no-longer canonical broadcasts and does not renew the generation',()=>{
    const expired=reconcileXmltvAirSources({retainedFiles:old(),catalog,now:Date.parse('2026-11-16T22:00:00Z')})
    expect(expired.files).toEqual([])
    expect(expired.counts.expiredAirings).toBe(1)
    const missing=reconcileXmltvAirSources({retainedFiles:old(),catalog:{titles:[]},now})
    expect(missing.files).toEqual([])
    expect(missing.counts.missingCanonicalAirings).toBe(1)
  })
  it('rejects a substituted playback route or mixed typed identity',()=>{
    const files=old()
    files[0].titles.entries[0].airings[0].playbackRoutes[0]={...files[0].titles.entries[0].airings[0].playbackRoutes[0],target:'https://different.example'}
    expect(()=>reconcileXmltvAirSources({retainedFiles:files,catalog,now})).toThrow(/station airing/)
    const wrong=old();wrong[0].titles.entries[0].airings[0].tmdbId=43
    expect(()=>reconcileXmltvAirSources({retainedFiles:wrong,catalog,now})).toThrow(/station airing/)
  })
})
