import { describe,expect,it } from 'vitest'
import { auditJoynEpisodeConflicts } from '../scripts/joyn-episode-conflict-audit.mjs'

const now=Date.parse('2026-11-21T08:00:00Z')
const time=n=>new Date(now+n*60_000).toISOString()
const synopsis='Heidi entdeckt einen verletzten Adler neben der Scheune und versteckt das ängstliche Tier vor dem Großvater.'
const event=(start=20,description=synopsis)=>({titleRef:{mediaType:'movie',tmdbId:1},channelId:'kika',
  startAt:time(start),endAt:time(start+25),extensions:{joyn:{rawTitle:'Heidi',programId:`p${start}`,description}}})
const airing=(start=20,episodeNumber=1)=>({canonicalStationId:'kika',startTime:time(start),stopTime:time(start+25),seasonNumber:1,episodeNumber})
const series=(airings=[airing()])=>({type:'series',tmdbId:2,title:'Heidi',airings})
const episode=(episodeNumber,description)=>({tmdbId:10+episodeNumber,seriesTmdbId:2,seasonNumber:1,episodeNumber,description})
const shard=(episodes=[episode(1,synopsis),episode(2,'Peter wandert mit den Ziegen auf eine Alm.')])=>({kind:'series-season-shard',version:1,bucket:'02',entries:[{seriesTmdbId:2,seasonNumber:1,episodes}]})
function input({rows=[{event:event(),possibleSplit:false}],entries=[series()],metadata=shard()}={}){
  return {severeRows:rows,stationMapping:{entries:[{status:'matched',canonicalId:'kika'}]},now,
    waipuTitles:{kind:'waipu-live-titles',count:entries.length,entries},waipuIndex:{kind:'waipu-live-index',generatedAt:time(-2),counts:{titles:entries.length,broadcasts:entries.reduce((n,e)=>n+e.airings.length,0)}},
    readSeasonShard:async()=>metadata,programDiagnostics:new Map([['p20',{joynClassification:{type:'movie'}}]]),cachedProgramIds:new Set(['p20'])}
}
describe('Joyn severe runtime episode conflict shadow recheck',()=>{
  it('counts distinctive canonical evidence and original cache decisions, without mutating or exposing titles',async()=>{
    const data=input(),before=JSON.stringify(data.severeRows)
    const result=await auditJoynEpisodeConflicts(data)
    expect(result).toMatchObject({status:'ready',exactPeerSeries:1,strongDescription:1,uniqueStrongDescription:1,
      originalClassification:{movie:1,series:0,unknown:0},originalDecision:{cache:1,fresh:0,unavailable:0},uniqueStrongByOriginalDecision:{cache:1,fresh:0,unavailable:0}})
    expect(JSON.stringify(data.severeRows)).toBe(before)
    expect(JSON.stringify(result)).not.toContain('Heidi')
  })
  it('protects possible split films and refuses ambiguous slots or episode references',async()=>{
    expect(await auditJoynEpisodeConflicts(input({rows:[{event:event(),possibleSplit:true}]}))).toMatchObject({exactPeerSeries:1,possibleSplit:1,strongDescription:0})
    expect(await auditJoynEpisodeConflicts(input({entries:[series(),{...series(),tmdbId:3}]}))).toMatchObject({exactPeerSeries:0})
    expect(await auditJoynEpisodeConflicts(input({entries:[series([airing(),airing(20,2)])]}))).toMatchObject({missingOrAmbiguousEpisodeRef:1,uniqueStrongDescription:0})
    expect(await auditJoynEpisodeConflicts(input({rows:[{event:event(40)}]}))).toMatchObject({exactPeerSeries:0})
  })
  it('distinguishes unavailable, weak, and non-unique descriptions',async()=>{
    expect(await auditJoynEpisodeConflicts(input({metadata:null}))).toMatchObject({missingOrInvalidEpisodeMetadata:1,uniqueStrongDescription:0})
    expect(await auditJoynEpisodeConflicts(input({rows:[{event:event(20,'')}]}))).toMatchObject({missingDescription:1})
    expect(await auditJoynEpisodeConflicts(input({rows:[{event:event(20,'Unbekannte sehr kurze Beschreibung')}]}))).toMatchObject({weakDescription:1})
    expect(await auditJoynEpisodeConflicts(input({metadata:shard([episode(1,synopsis),episode(2,synopsis)])}))).toMatchObject({strongDescription:1,competingOrCloseDescription:1,uniqueStrongDescription:0})
    expect(await auditJoynEpisodeConflicts(input({metadata:shard([episode(1,synopsis)])}))).toMatchObject({competingOrCloseDescription:1,uniqueStrongDescription:0})
  })
  it('reads each required shard only once and refuses stale peer data',async()=>{
    const data=input({rows:[{event:event()},{event:event(80)}],entries:[series([airing(),airing(80)])]})
    let reads=0;data.readSeasonShard=async()=>{reads++;return shard()}
    expect(await auditJoynEpisodeConflicts(data)).toMatchObject({uniqueStrongDescription:2,originalDecision:{cache:1,fresh:0,unavailable:1}})
    expect(reads).toBe(1)
    data.waipuIndex.generatedAt=time(-800)
    expect(await auditJoynEpisodeConflicts(data)).toEqual({status:'unavailable'})
    expect(reads).toBe(1)
  })
})
