import { describe, expect, it } from 'vitest'
import { FEEDS } from '../scripts/probe-xmltv-feeds.mjs'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { xmltvStationRegistry } from '../src/sources/xmltv/xmltvStationMappings.js'
import { buildXmltvPrivateSourceGeneration } from '../src/sources/xmltv/xmltvPrivateStaging.js'
import { runXmltvA3StationExpansionPreview, isSafeXmltvA3StationExpansionReport } from '../scripts/xmltv-a3-station-expansion-preview.mjs'

const now = Date.parse('2026-11-16T12:00:00Z')
const registry = xmltvStationRegistry('expansion-preview')
const fixture = sourceId => '<tv>' + Object.keys(registry.mappings[sourceId]).map(raw =>
  '<channel id="'+raw+'"><display-name>Station</display-name></channel>'+
  '<programme channel="'+raw+'" start="20261116120000 +0000" stop="20261116140000 +0000"><title>Testfilm</title><category>Film</category></programme>'
).join('') + '</tv>'

describe('#838 A3 isolated 18-station real-chain rehearsal', () => {
  it('keeps production six and rejects untrusted station identities even in expansion QA', () => {
    expect(xmltvStationRegistry().stations).toHaveLength(6)
    expect(registry.stations).toHaveLength(18)
    expect(()=>xmltvStationRegistry('arbitrary')).toThrow()
    const parsed = parseXmltvCandidates(fixture('freeepg'), {
      sourceId:'freeepg', stationMappings:registry.mappings, observedAt:new Date(now).toISOString(), mappedOnly:true,
    })
    expect(buildXmltvPrivateSourceGeneration(parsed,{now}).stagedProgrammes).toBe(6)
    const staged = buildXmltvPrivateSourceGeneration(parsed,{now,stationSet:'expansion-preview'})
    expect(staged.stagedProgrammes).toBe(18)
    expect(staged.coverage.reviewedStations).toBe(18)
    expect(staged.stationCounts.arte).toBe(1)
    const forged={...parsed,candidates:[{...parsed.candidates.find(c=>c.canonicalStationId==='arte'),canonicalStationId:'zdf'}]}
    expect(buildXmltvPrivateSourceGeneration(forged,{now,stationSet:'expansion-preview'}).stagedProgrammes).toBe(0)
  })
  it('uses actual matcher and deduplicator across two feeds while tolerating an outage', async () => {
    const result = await runXmltvA3StationExpansionPreview({now,
      downloader: async url => {
        const feed=FEEDS.find(row=>row.url===url)
        if(feed.id==='epgshare01') throw new Error('private failure')
        return {xml:fixture(feed.id)}
      },
      localCandidatesFor: async ()=>[{type:'movie',tmdbId:1234,title:'Testfilm'}],
    })
    expect(result).toMatchObject({totalCandidates:36,totalMatched:36,uniqueAirings:18,
      existingUniqueAirings:6,expansionUniqueAirings:12,expansionWithAnyFutureData:12,
      expansionWithFiveDayCoverage:0,expansionWithMatches:12,realTmdbApiRequestsMade:0,
      productiveWrites:0,publishApproved:false})
    expect(isSafeXmltvA3StationExpansionReport(result)).toBe(true)
    expect(isSafeXmltvA3StationExpansionReport({...result,rawTitle:'secret'})).toBe(false)
    expect(JSON.stringify(result)).not.toContain('Testfilm')
  })
})
