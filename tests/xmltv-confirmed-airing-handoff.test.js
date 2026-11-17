import { describe, expect, it } from 'vitest'
import { buildConfirmedAiringHandoff, readConfirmedAiringHandoff } from '../scripts/xmltv-confirmed-airing-handoff.mjs'

const now=Date.parse('2026-11-16T00:00:00Z')
const row={kind:'broadcast',titleRef:{mediaType:'series',tmdbId:42},channelId:'zdf',channelName:'ZDF',
  startAt:'2026-11-16T19:00:00Z',endAt:'2026-11-16T21:00:00Z',
  sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ZDF.de|PRIVATE TITLE'}],
  extensions:{xmltv:{sourceStationId:'ZDF.de',timestampsExplicitlyZoned:true,rawTitle:'PRIVATE TITLE'}},
  episode:{seasonNumber:2,episodeNumber:4,title:'PRIVATE EPISODE'}}

describe('XMLTV confirmed airing handoff',()=>{
  it('retains only typed identity, exact mapped sender and numeric episode evidence',()=>{
    const handoff=buildConfirmedAiringHandoff([row,row,{...row,titleRef:{mediaType:'movie',tmdbId:42}}],{now})
    expect(JSON.stringify(handoff)).not.toContain('PRIVATE')
    const read=readConfirmedAiringHandoff(handoff,{now})
    expect(read.titleRefs).toEqual([{type:'movie',tmdbId:42},{type:'series',tmdbId:42}])
    expect(read.events).toHaveLength(3)
    expect(read.events[0].episode).toEqual({seasonNumber:2,episodeNumber:4,conflict:false})
  })
  it('roundtrips both device-confirmed and provisionally accepted expansion routes',()=>{
    const arte={...row,channelId:'arte',channelName:'ARTE',titleRef:{mediaType:'movie',tmdbId:43},
      sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ARTE.de|PRIVATE FILM'}],
      extensions:{xmltv:{sourceStationId:'ARTE.de',timestampsExplicitlyZoned:true}},episode:null}
    const handoff=buildConfirmedAiringHandoff([row,arte],{now})
    expect(handoff.rows.map(x=>x.stationId)).toEqual(['zdf','arte'])
    expect(readConfirmedAiringHandoff(handoff,{now}).titleRefs).toEqual([{type:'movie',tmdbId:43},{type:'series',tmdbId:42}])
    expect(JSON.stringify(handoff)).not.toContain('PRIVATE')
    expect(()=>readConfirmedAiringHandoff({...handoff,rows:[{...handoff.rows[1],stationId:'zdf'}]},{now})).toThrow(/Invalid/)
    expect(buildConfirmedAiringHandoff([{...arte,sourceRefs:[]}],{now}).rows).toEqual([])
  })
  it('rejects unreviewed, mismatched or expired inputs before handoff',()=>{
    const payload=buildConfirmedAiringHandoff([{...row,channelId:'ard'},
      {...row,endAt:'2026-11-15T12:00:00Z'}, {...row,sourceRefs:[]}],{now})
    expect(readConfirmedAiringHandoff(payload,{now}).titleRefs).toEqual([])
  })
  it('refuses tampered raw fields, source identity and stale handoffs',()=>{
    const handoff=buildConfirmedAiringHandoff([row],{now})
    expect(()=>readConfirmedAiringHandoff({...handoff,rows:[{...handoff.rows[0],rawTitle:'bad'}]},{now})).toThrow(/Invalid/)
    expect(()=>readConfirmedAiringHandoff({...handoff,rows:[{...handoff.rows[0],rawStation:'RTL.de'}]},{now})).toThrow(/Invalid/)
    expect(()=>readConfirmedAiringHandoff(handoff,{now:now+86400001})).toThrow(/stale/)
  })
  it('filters broadcasts that ended between the two steps',()=>{
    const payload=buildConfirmedAiringHandoff([row],{now})
    expect(readConfirmedAiringHandoff(payload,{now:Date.parse('2026-11-16T22:00:00Z')}).events).toEqual([])
  })
})
