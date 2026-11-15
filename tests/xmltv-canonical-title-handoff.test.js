import {describe,expect,it} from 'vitest'
import {deriveXmltvCanonicalTitleRefs,prepareXmltvCanonicalTitleDemand} from '../scripts/xmltv-canonical-title-handoff.mjs'
const now=Date.parse('2026-11-16T00:00:00Z')
const event=(id,mediaType='movie')=>({kind:'broadcast',titleRef:{tmdbId:id,mediaType},channelId:'zdf',channelName:'ZDF',
  startAt:'2026-11-16T19:00:00Z',endAt:'2026-11-16T21:00:00Z',
  sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ZDF.de|test'}],
  extensions:{xmltv:{sourceStationId:'ZDF.de',timestampsExplicitlyZoned:true,rawTitle:'PRIVATE'}}})
const completeMovie={source:'tmdb',type:'movie',tmdbId:2,title:'Existing canonical data',description:'Description',
  metadataVersion:3,metadataComplete:true,metadataUpdatedAt:'2026-11-15T00:00:00Z',collectionChecked:true,
  metadataChecks:{details:'present',artwork:'present',ageRating:'absent',credits:'present',keywords:'absent',videos:'absent',providers:'present',collection:'absent'}}
describe('XMLTV canonical handoff',()=>{
  it('only retains future, exact-route, deduplicated typed identities',()=>{
    const row=event(1)
    expect(deriveXmltvCanonicalTitleRefs([row,row,event(1,'series'),{...event(2),channelName:'Unknown'},
      {...event(3),endAt:'2026-11-15T20:00:00Z'}, {...event(4),sourceRefs:[]}],{now}))
      .toEqual([{type:'movie',tmdbId:1},{type:'series',tmdbId:1}])
  })
  it('reuses current complete canonical records and queues each other absent title exactly once',()=>{
    const result=prepareXmltvCanonicalTitleDemand([event(1),event(2),event(2),event(3,'series')],
      {titles:[{source:'tmdb',type:'movie',tmdbId:1,title:'Already catalogued'}]},
      {now,existingSources:[{providerId:'waipu',entries:[completeMovie]},{providerId:'joyn',entries:[completeMovie]}]})
    expect(result).toEqual({approvedUniqueTitles:3,missingApprovedUniqueTitles:2,reusableFromCurrentSources:1,fetchNeededFromCurrentSources:1})
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
  })
})
