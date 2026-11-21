import { describe,expect,it } from 'vitest'
import { auditJoynMovieRuntime } from '../scripts/joyn-runtime-conflict-audit.mjs'

const now=Date.parse('2026-11-21T08:00:00Z')
const time=n=>new Date(now+n*60_000).toISOString()
const event=(id,start,duration,desc='Description',station='zdf',type='movie')=>({
  titleRef:{mediaType:type,tmdbId:id},channelId:station,startAt:time(start),endAt:time(start+duration),
  extensions:{joyn:{rawTitle:'PRIVATE TITLE',programId:`${id}:${start}`,description:desc}},
})
const movie=(tmdbId,runtimeMinutes)=>({type:'movie',tmdbId,runtimeMinutes})
const audit=(records,titles,programDiagnostics=new Map())=>auditJoynMovieRuntime({envelope:{sourceId:'joyn',sourceStatus:'healthy',records},titles,programDiagnostics})
describe('Joyn read-only film runtime conflict audit',()=>{
  it('separates missing, ordinary, severe and invalid runtimes without changing data',()=>{
    const rows=[event(1,0,15),event(2,0,90),event(3,0,20),event(4,0,0),event(5,0,20),event(6,0,10,'x','ard','series')]
    const titles=[movie(1,110),movie(2,96),movie(3,null),movie(4,90),movie(5,20)]
    const before=JSON.stringify({rows,titles})
    const result=audit(rows,titles,new Map([['1:0',{decision:{source:'local'}}]]))
    expect(result).toMatchObject({status:'ready',movieAirings:5,runtimeKnown:4,runtimeMissing:1,invalidSlot:1,overrun5Minutes:2,severeRuntimeConflict:1,severeDistinctWorks:1,possibleAdjacentSplitAirings:0,severeByOriginalMatchSource:{local:1,searchAssisted:0,otherOrUnavailable:0}})
    expect(JSON.stringify({rows,titles})).toBe(before)
    expect(JSON.stringify(result)).not.toContain('PRIVATE TITLE')
  })
  it('separates possible contiguous splits from recurring short slots with distinct descriptions',()=>{
    const desc=n=>`An independently distinct programme synopsis for part number ${n}.`
    const rows=[event(1,0,50,desc(0)),event(1,51,50,desc(1)),event(2,200,15,desc(2)),event(2,300,15,desc(3)),event(2,400,15,desc(4)),event(2,500,15,desc(4))]
    expect(audit(rows,[movie(1,100),movie(2,100)])).toMatchObject({severeRuntimeConflict:6,severeDistinctWorks:2,possibleAdjacentSplitAirings:2,recurringDistinctDescriptionAirings:4})
  })
  it('never combines overlapping slots or slots across stations and refuses missing catalog identities',()=>{
    const rows=[event(1,0,50),event(1,40,50),event(1,95,50,'x','ard')]
    expect(audit(rows,[movie(1,100)])).toMatchObject({severeRuntimeConflict:3,possibleAdjacentSplitAirings:0})
    expect(audit(rows,[])).toEqual({status:'unavailable'})
    expect(audit(rows,[movie(1,100),movie(1,95)])).toEqual({status:'unavailable'})
  })
})
