import { describe, it, expect, vi } from 'vitest'
import { createXmltvPeerAiringResolver, sameXmltvPeerBroadcast } from '../scripts/xmltv-peer-airing-resolver.mjs'
import { matchXmltvLocalCandidates } from '../scripts/xmltv-g1b-match-preview.mjs'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from '../src/sources/xmltv/xmltvStationMappings.js'

const now = Date.parse('2026-11-17T17:00:00Z')
const xml = '<tv><programme channel="ZDF.de" start="20261117190000 +0100" stop="20261117210000 +0100"><title>Testfilm</title><category>Drama</category></programme></tv>'
const row = parseXmltvCandidates(xml, { sourceId:'freeepg', stationMappings:XMLTV_REVIEWED_STATION_MAPPINGS, observedAt:new Date(now).toISOString() }).candidates[0]
const airing = {canonicalStationId:'zdf',startTime:row.startAt,stopTime:row.endAt}
const entry = {type:'movie',tmdbId:123,title:'Testfilm',year:2020,airings:[airing]}
const source = (entry,providerId='waipu')=>({providerId,entries:[entry]})
const resolver = (...sources)=>createXmltvPeerAiringResolver(sources,{now})

describe('#885 peer reconciliation, no search',()=>{
  it('recovers only untyped exact broadcast; never calls TMDB resolver',async()=>{
    const peer=resolver(source(entry),source(entry,'joyn'))
    const local=vi.fn(()=>[])
    const baseline=await matchXmltvLocalCandidates([row],{localCandidatesFor:local})
    expect(baseline.counts.accepted).toBe(0)
    const match=await matchXmltvLocalCandidates([row],{localCandidatesFor:local,peerAiringFor:peer.lookup})
    expect(local).not.toHaveBeenCalled()
    expect(match.confirmedEvents[0]).toMatchObject({titleRef:{mediaType:'movie',tmdbId:123},channelId:'zdf',startAt:row.startAt,endAt:row.endAt,matchReason:'confirmed-peer-same-broadcast-v1'})
    expect(match.confirmedEvents[0].sourceRefs).toEqual([row.sourceRef])
    expect(peer.counts()).toMatchObject({peerLookups:1,peerAcceptedMovie:1})
  })
  it('rejects other station, non-overlap, ambiguity and year mismatch',()=>{
    expect(resolver(source({...entry,airings:[{...airing,canonicalStationId:'ard'}]})).lookup(row)).toBeNull()
    expect(sameXmltvPeerBroadcast(row,{...airing,startTime:'2026-11-17T18:06:00Z'})).toBe(false)
    expect(sameXmltvPeerBroadcast(row,{...airing,stopTime:'2026-11-17T18:30:00Z'})).toBe(false)
    expect(resolver(source(entry),source({...entry,tmdbId:456},'joyn')).lookup(row)).toBeNull()
    expect(resolver(source(entry)).lookup({...row,productionYearEvidence:1990})).toBeNull()
    expect(resolver(source(entry),source({...entry,year:1990},'joyn')).lookup(row)).toBeNull()
    expect(resolver(source({...entry,title:'Other'})).lookup(row)).toBeNull()
  })
  it('does not override explicit type or contradictory labels, nor invent episode identity',async()=>{
    const peer=resolver(source({...entry,type:'series'}))
    const local=vi.fn(()=>[])
    const conflict={...row,categories:['Film','Serie']}
    const typed={...row,categories:['Film']}
    const result=await matchXmltvLocalCandidates([conflict,typed,row],{localCandidatesFor:local,peerAiringFor:peer.lookup})
    expect(result.counts.accepted).toBe(1)
    expect(result.confirmedEvents[0].titleRef).toEqual({mediaType:'series',tmdbId:123})
    expect(result.confirmedEvents[0].episode?.seasonNumber??null).toBeNull()
    expect(result.confirmedEvents[0].episode?.episodeNumber??null).toBeNull()
    expect(peer.counts().peerLookups).toBe(1)
    expect(local).toHaveBeenCalledTimes(1)
  })
})
