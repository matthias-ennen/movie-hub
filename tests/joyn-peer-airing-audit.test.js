import {describe,it,expect} from 'vitest'
import {auditJoynWaipuPeerAirings} from '../scripts/joyn-peer-airing-audit.mjs'

const now=Date.parse('2026-11-18T08:00:00Z')
const time=(h,m=0)=>new Date(now+h*3600000+m*60000).toISOString()
const film=(id,title,station='zdf',offset=0,year=2000)=>({type:'movie',tmdbId:id,title,year,airings:[{stationId:station,startTime:time(1,offset),stopTime:time(2,offset)}]})
const row=(title,station='zdf',offset=0,classification={type:null})=>({title,channelId:station,startTime:time(1,offset),endTime:time(2,offset),joynClassification:classification})
const inputs=(rows,entries)=>({now,unresolvedPrograms:rows,stationMapping:{entries:[{status:'matched',canonicalId:'zdf'},{status:'matched',canonicalId:'ard'},{status:'unmatched',canonicalId:'wrong'}]},waipuIndex:{kind:'waipu-live-index',generatedAt:time(0),counts:{titles:entries.length,broadcasts:entries.reduce((n,e)=>n+e.airings.length,0)}},waipuTitles:{kind:'waipu-live-titles',count:entries.length,entries}})
describe('Joyn peer shadow audit',()=>{
  it('requires canonical station, same time and exact normalized title',()=>{
    const data=inputs([row('Ärger & Spaß','zdf',4),row('Other'),row('Ärger und Spaß','joyn.zdf'),row('Ärger und Spaß','zdf',6)], [film(1,'Ärger und Spaß')])
    const before=JSON.stringify(data)
    expect(auditJoynWaipuPeerAirings(data)).toMatchObject({status:'ready',unresolved:4,reviewedStation:3,stationUnavailable:1,timeOverlap:2,nonExactTitle:1,noTimeOverlap:1,candidateMovie:1,candidateUntyped:1})
    expect(JSON.stringify(data)).toBe(before)
  })
  it('does not output titles, identifiers or decisions and rejects incompatible types and known years',()=>{
    const data=inputs([row('PRIVATE_TITLE','zdf',0,{type:'series'}),row('PRIVATE_TITLE','zdf',0,{type:'movie',algolia:{type:'movie',reason:'validated_algolia_search',productionYear:2020}})], [film(1,'PRIVATE_TITLE')])
    const result=auditJoynWaipuPeerAirings(data)
    expect(result).toMatchObject({status:'ready',typeConflict:1,yearConflict:1,candidateMovie:0})
    expect(JSON.stringify(result)).not.toContain('PRIVATE_TITLE')
  })
  it('rejects ambiguous slot, stale generation and inconsistent counts',()=>{
    const data=inputs([row('Example')],[film(1,'Example'),film(2,'Example')])
    expect(auditJoynWaipuPeerAirings(data)).toMatchObject({ambiguousSlot:1,candidateMovie:0})
    expect(auditJoynWaipuPeerAirings({...data,waipuIndex:{...data.waipuIndex,generatedAt:time(-13)}})).toEqual({status:'unavailable'})
    expect(auditJoynWaipuPeerAirings({...data,waipuIndex:{...data.waipuIndex,counts:{titles:2,broadcasts:99}}})).toEqual({status:'unavailable'})
  })
})
